import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { AbletonAnalysis, MusicalKey, TimeSignature } from '@shared/domain/projects'
import { ALS_MAX_DECOMPRESSED_BYTES, AUDIO_EXTENSIONS } from '@shared/domain/projects.constants'
import { getLogger } from '@main/core/logger'

const logger = getLogger('projects:als')

/**
 * Reader for Ableton Live set files.
 *
 * An `.als` is a gzipped XML document, so everything below is read out of the
 * file rather than guessed at. Live's schema shifts between versions, so this
 * extracts by locating known elements instead of parsing to a full DOM: a 30 MB
 * set would cost far more to build a tree for than to scan, and an unrecognised
 * element in a future Live version degrades one field rather than failing the
 * whole read.
 *
 * Nothing here throws for a malformed set. A corrupt save must not cost the
 * operator the rest of the scan, so failures are returned on the analysis as
 * `parseError` and the set is still registered.
 *
 * Two things about the format matter enough to state, because getting either
 * wrong produces confidently wrong output rather than no output:
 *
 * 1. Element *names* are not unique and bounded look-ahead is not enough. A
 *    `<Vst3PluginInfo>` carries its plugin name after an embedded preset blob
 *    that can be megabytes long, and `<Name>` appears dozens of times in
 *    between. Values that belong to a specific element are therefore located
 *    by tab-indentation depth — see `directChildValue`.
 * 2. Live 12 renamed and re-shaped several elements: the master track is
 *    `<MainTrack>`, track tags carry extra attributes so `Id="n">` no longer
 *    terminates them, and the song key is a numeric pair rather than a string.
 *    Older names are still accepted where they existed.
 */

/** Semitone offset from C, as Live stores the song's root note. */
const ROOT_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const ROOT_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/**
 * Live stores the song's scale as an index into its own mode list, not as a
 * name, so the list has to be mirrored here.
 *
 * Verified against real sets for `Major` and `Minor`, which is what nearly
 * every project uses. The remainder follows Live 12's scale ordering. An index
 * past the end of this table degrades to the root note alone rather than to a
 * confidently wrong mode name.
 */
const SCALE_NAMES = [
  'Major',
  'Minor',
  'Dorian',
  'Mixolydian',
  'Lydian',
  'Phrygian',
  'Locrian',
  'Whole Tone',
  'Half-whole Dim.',
  'Whole-half Dim.',
  'Minor Blues',
  'Minor Pentatonic',
  'Major Pentatonic',
  'Harmonic Minor',
  'Harmonic Major',
  'Dorian #4',
  'Phrygian Dominant',
  'Melodic Minor',
  'Lydian Augmented',
  'Lydian Dominant',
  'Super Locrian',
  '8-Tone Spanish',
  'Bhairav',
  'Hungarian Minor',
  'Hirajoshi',
  'In-Sen',
  'Iwato',
  'Kumoi',
  'Pelog Selisir',
  'Pelog Tembung',
  'Messiaen 3',
  'Messiaen 4',
  'Messiaen 5',
  'Messiaen 6',
  'Messiaen 7'
] as const

const GZIP_MAGIC = [0x1f, 0x8b]

/** Window used only where the value provably sits beside its element. */
const NEARBY = 4000

export interface AlsReadOptions {
  /**
   * Resolves whether a referenced file exists. Injected rather than called
   * directly so one cache can be shared across every set in a scan — the same
   * sample library path is referenced by hundreds of sets.
   */
  sampleExists: (path: string) => Promise<boolean>
}

export async function readAbletonSet(
  filePath: string,
  projectDirectory: string,
  options: AlsReadOptions
): Promise<AbletonAnalysis> {
  const analysis = emptyAnalysis()

  let xml: string
  try {
    xml = await decodeSet(filePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Could not read ${filePath}: ${message}`)
    return { ...analysis, parseError: message }
  }

  try {
    const rootAttributes = xml.slice(0, 1024)
    analysis.creator = attribute(rootAttributes, 'Creator')
    analysis.version = attribute(rootAttributes, 'MinorVersion')

    analysis.tempo = readTempo(xml)
    analysis.timeSignature = readTimeSignature(xml)

    const key = readKey(xml)
    analysis.key = key.key
    analysis.inKey = key.inKey

    const tracks = readTracks(xml)
    analysis.trackCounts = tracks.counts
    analysis.trackNames = tracks.names
    analysis.sceneCount = readSceneCount(xml)

    const beats = readArrangementBeats(xml)
    analysis.arrangementBeats = beats
    analysis.arrangementSeconds =
      beats !== null && analysis.tempo && analysis.tempo > 0
        ? Math.round((beats / analysis.tempo) * 60)
        : null

    analysis.plugins = readPlugins(xml)

    const samples = readSampleReferences(xml, projectDirectory)
    analysis.sampleCount = samples.length

    const resolved: string[] = []
    const missing: string[] = []

    for (const sample of samples) {
      // A set that has been moved between machines keeps stale absolute paths
      // but still resolves through its project-relative one — which is exactly
      // what Live itself does. Reporting those as missing would flag hundreds
      // of perfectly present files.
      let found: string | null = null
      for (const candidate of sample.candidates) {
        if (await options.sampleExists(candidate)) {
          found = candidate
          break
        }
      }

      // The location that resolved is recorded, so a later scan can re-check it
      // without decompressing this set again.
      resolved.push(found ?? sample.display)
      if (!found) missing.push(sample.display)
    }

    analysis.samplePaths = resolved
    analysis.missingSamples = missing
  } catch (error) {
    // A partially-populated analysis is more useful than none: whatever was
    // read before the failure is kept and the reason is carried with it.
    analysis.parseError = error instanceof Error ? error.message : String(error)
    logger.warn(`Partial read of ${filePath}: ${analysis.parseError}`)
  }

  return analysis
}

/**
 * Re-checks a stored analysis against the disk without re-reading the set.
 *
 * Used when a scan reuses a cached analysis. Everything else in the analysis is
 * a property of the `.als` file and cannot have changed while its modification
 * time and size did not — but whether a referenced sample still exists is a
 * property of the filesystem, so it is the one field re-verified every scan.
 */
export async function reverifySamples(
  analysis: AbletonAnalysis,
  options: AlsReadOptions
): Promise<AbletonAnalysis> {
  if (analysis.samplePaths.length === 0) return analysis

  const missing: string[] = []
  for (const path of analysis.samplePaths) {
    if (!(await options.sampleExists(path))) missing.push(path)
  }

  // Preserve object identity when nothing moved, so an unchanged scan produces
  // an unchanged document and Mongo has nothing to write.
  if (
    missing.length === analysis.missingSamples.length &&
    missing.every((path, index) => path === analysis.missingSamples[index])
  ) {
    return analysis
  }

  return { ...analysis, missingSamples: missing }
}

// -------------------------------------------------------------------- decode

async function decodeSet(filePath: string): Promise<string> {
  const raw = await readFile(filePath)

  // Live always gzips, but a set recovered by hand may not be; falling back to
  // a plain read costs nothing and salvages those.
  const gzipped = raw.length > 2 && raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1]
  const buffer = gzipped ? gunzipSync(raw, { maxOutputLength: ALS_MAX_DECOMPRESSED_BYTES }) : raw

  if (buffer.length > ALS_MAX_DECOMPRESSED_BYTES) {
    throw new Error('Set exceeds the maximum size this reader will decompress.')
  }

  return buffer.toString('utf8')
}

// ------------------------------------------------------- structural lookup

/**
 * Reads a value that belongs to one specific element, identified by nesting
 * depth rather than by proximity.
 *
 * Live indents with tabs, so an element's descendants are the lines at a known
 * number of tabs deeper, up to the first line at the element's own depth or
 * shallower — which is its closing tag or a sibling. This is what makes plugin
 * names readable at all: the name of a `<Vst3PluginInfo>` follows an embedded
 * preset that can run to megabytes, with dozens of unrelated `<Name>` elements
 * inside it, so any bounded look-ahead returns the wrong one.
 *
 * Only direct children are needed: this exists for plugin names, which is the
 * one value in the format that no proximity rule can locate correctly.
 */
function directChildValue(xml: string, openIndex: number, childName: string): string | null {
  const lineStart = xml.lastIndexOf('\n', openIndex) + 1
  const indent = xml.slice(lineStart, openIndex)

  // Not at the start of an indented line — the depth trick does not apply.
  if (indent.length === 0 || /[^\t]/.test(indent)) return null

  const rest = xml.slice(openIndex)

  /*
   * Both patterns match on an explicit newline rather than with `^` and the
   * multiline flag. `rest` begins part-way through the parent's own line, so
   * `^` would also match at offset zero — which made the boundary below fire
   * immediately every time and silently returned null for everything.
   */
  const child = new RegExp(`\\n\\t{${indent.length + 1}}<${childName} Value="([^"]*)"`).exec(rest)
  if (!child) return null

  // Anything at the parent's depth or shallower ends the element. If such a
  // line comes first, the candidate belonged to a later sibling.
  const boundary = new RegExp(`\\n\\t{0,${indent.length}}<`).exec(rest)
  if (boundary && boundary.index < child.index) return null

  return decodeEntities(child[1])
}

// ------------------------------------------------------------------ readers

function readTempo(xml: string): number | null {
  // Live 12 calls the master track <MainTrack>; older versions <MasterTrack>.
  // Both carry attributes, so the tag cannot be matched as a bare string.
  const master = xml.search(/<(?:MainTrack|MasterTrack)\b[^>]*>/)

  const read = (from: number): number | null => {
    const index = xml.indexOf('<Tempo>', from)
    if (index < 0) return null
    const manual = /<Manual Value="([\d.]+)"/.exec(xml.slice(index, index + NEARBY))
    return manual ? Number(manual[1]) : null
  }

  // Anchored first, then anywhere: an automated tempo also writes an envelope,
  // but Manual stays the set-wide value Live shows in the transport.
  const tempo = (master >= 0 ? read(master) : null) ?? read(0)
  if (tempo === null || !Number.isFinite(tempo)) return null

  // Live's own range. Outside it, the wrong element matched.
  return tempo >= 20 && tempo <= 999 ? round(tempo, 3) : null
}

function readTimeSignature(xml: string): TimeSignature | null {
  const index = xml.indexOf('<TimeSignature>')
  if (index < 0) return null

  const window = xml.slice(index, index + NEARBY)
  const numerator = /<Numerator Value="(\d+)"/.exec(window)
  const denominator = /<Denominator Value="(\d+)"/.exec(window)
  if (!numerator || !denominator) return null

  return { numerator: Number(numerator[1]), denominator: Number(denominator[1]) }
}

/**
 * Reads the song key.
 *
 * Every MIDI clip carries its own `<ScaleInformation>`, so a large set contains
 * hundreds of them and taking the first match reads an arbitrary clip's scale.
 * The set-level one — the key Live shows in its control bar — is written after
 * `</Tracks>`, beside `<InKey>`.
 *
 * The element names are `<Root>` and `<Name>`, not `<RootNote>`, and `Name` is
 * a numeric *index* into Live's scale list rather than a string; read as a
 * string it yields a key like "C 1". Sets saved before Live 12 have no scale at
 * all, which is why this returns null rather than defaulting to C Major.
 */
function readKey(xml: string): { key: MusicalKey | null; inKey: boolean } {
  const tracksEnd = xml.lastIndexOf('</Tracks>')
  const from = tracksEnd < 0 ? 0 : tracksEnd

  const index = xml.indexOf('<ScaleInformation>', from)
  if (index < 0) return { key: null, inKey: false }

  const scope = xml.slice(index, index + 400)
  const inKey = /<InKey Value="true"/.test(xml.slice(index, index + 800))

  const root = /<Root Value="(-?\d+)"/.exec(scope)
  if (!root) return { key: null, inKey }

  const preferFlat = /<PreferFlatRootNote Value="true"/.test(xml.slice(from))
  const semitone = ((Number(root[1]) % 12) + 12) % 12
  const rootName = (preferFlat ? ROOT_FLAT : ROOT_SHARP)[semitone]
  if (!rootName) return { key: null, inKey }

  // An unrecognised index degrades to the root note alone. Guessing a mode
  // name would put a confidently wrong key on the project.
  const scaleIndex = /<Name Value="(-?\d+)"/.exec(scope)
  const scale = scaleIndex ? (SCALE_NAMES[Number(scaleIndex[1])] ?? '') : ''

  return { key: { root: rootName, scale }, inKey }
}

interface TrackReadout {
  counts: AbletonAnalysis['trackCounts']
  names: string[]
}

function readTracks(xml: string): TrackReadout {
  const counts = { midi: 0, audio: 0, group: 0, return: 0, total: 0 }
  const names: string[] = []

  /*
   * One pass over a combined pattern rather than a query per track, and rather
   * than a depth lookup: the matches arrive in document order, so the first
   * <EffectiveName> after a track's opening tag is that track's name.
   *
   * The `\b` matters — Live 12 track tags carry SelectedToolPanel and friends,
   * so `Id="n">` no longer terminates them and an exact-tag match finds nothing.
   */
  const pattern = /<(MidiTrack|AudioTrack|GroupTrack|ReturnTrack)\b|<EffectiveName Value="([^"]*)"/g

  const kindOf: Record<string, keyof Omit<TrackReadout['counts'], 'total'>> = {
    MidiTrack: 'midi',
    AudioTrack: 'audio',
    GroupTrack: 'group',
    ReturnTrack: 'return'
  }

  let pending: string | null = null

  for (const match of xml.matchAll(pattern)) {
    const [, tag, name] = match

    if (tag) {
      const kind = kindOf[tag]
      if (kind) counts[kind] += 1
      // A track opened before the previous one was named only happens on a
      // malformed set; the unnamed one is still counted above.
      pending = tag
      continue
    }

    if (pending && name !== undefined) {
      names.push(decodeEntities(name) || '(unnamed)')
      pending = null
    }
  }

  counts.total = counts.midi + counts.audio + counts.group + counts.return
  return { counts, names }
}

function readSceneCount(xml: string): number {
  const start = xml.indexOf('<Scenes>')
  if (start < 0) return 0

  const end = xml.indexOf('</Scenes>', start)
  if (end < 0) return 0

  // `\b` keeps this from matching <Scenes> itself.
  return [...xml.slice(start, end).matchAll(/<Scene\b[^>]*>/g)].length
}

function readArrangementBeats(xml: string): number | null {
  // Live records no arrangement length directly. The furthest clip end is the
  // closest honest proxy, and it is reported as an estimate for that reason.
  let furthest = 0

  for (const match of xml.matchAll(/<CurrentEnd Value="(-?[\d.]+)"/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > furthest) furthest = value
  }

  return furthest > 0 ? round(furthest, 2) : null
}

function readPlugins(xml: string): string[] {
  const found = new Set<string>()

  // VST3 exposes <Name>; VST2 a display name with the binary as a fallback.
  // Both are read as direct children — see directChildValue for why proximity
  // is not usable here.
  for (const match of xml.matchAll(/<Vst3PluginInfo\b/g)) {
    const name = directChildValue(xml, match.index ?? 0, 'Name')
    if (name) found.add(name)
  }

  for (const match of xml.matchAll(/<VstPluginInfo\b/g)) {
    const index = match.index ?? 0
    const name =
      directChildValue(xml, index, 'PlugName') ?? directChildValue(xml, index, 'FileName')
    // Strip the binary extension so "Serum_x64.dll" reads as "Serum_x64".
    if (name) found.add(name.replace(/\.(dll|vst3|vst)$/i, ''))
  }

  return [...found].sort((a, b) => a.localeCompare(b))
}

const AUDIO_EXTENSION_SET = new Set<string>(AUDIO_EXTENSIONS)

interface SampleReference {
  /** Path shown to the operator when the file cannot be found. */
  display: string
  /** Every location the file might legitimately be, in preference order. */
  candidates: string[]
}

function readSampleReferences(xml: string, projectDirectory: string): SampleReference[] {
  const byKey = new Map<string, SampleReference>()

  for (const match of xml.matchAll(/<FileRef>([\s\S]{0,6000}?)<\/FileRef>/g)) {
    const block = match[1]

    const absolute = decodeEntities(valueOf(block, 'Path') ?? '')
    const relative = decodeEntities(valueOf(block, 'RelativePath') ?? '')
    const name = decodeEntities(valueOf(block, 'Name') ?? '')

    const candidates: string[] = []
    // Project-relative first. Live resolves that way too, and a set carried
    // between machines keeps an absolute path that points at the old disk.
    if (relative) candidates.push(resolve(join(projectDirectory, relative.split('/').join(sep))))
    if (absolute && isAbsolute(absolute)) candidates.push(resolve(absolute))
    if (!candidates.length && name) candidates.push(resolve(join(projectDirectory, name)))

    if (candidates.length === 0) continue

    // FileRef also carries preset, device and video references; only audio is
    // a sample.
    const probe = candidates[0]
    const dot = probe.lastIndexOf('.')
    if (dot <= 0) continue
    if (!AUDIO_EXTENSION_SET.has(probe.slice(dot).toLowerCase())) continue

    const key = probe.toLowerCase()
    if (!byKey.has(key)) {
      byKey.set(key, { display: absolute || candidates[0], candidates })
    }
  }

  return [...byKey.values()]
}

// ------------------------------------------------------------------- helpers

function valueOf(block: string, element: string): string | null {
  const match = new RegExp(`<${element} Value="([^"]*)"`).exec(block)
  return match ? match[1] : null
}

function attribute(block: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(block)
  return match ? decodeEntities(match[1]) : null
}

/** XML attribute values arrive escaped; paths and names must be restored. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function emptyAnalysis(): AbletonAnalysis {
  return {
    creator: null,
    version: null,
    tempo: null,
    timeSignature: null,
    key: null,
    inKey: false,
    trackCounts: { midi: 0, audio: 0, group: 0, return: 0, total: 0 },
    trackNames: [],
    sceneCount: 0,
    arrangementBeats: null,
    arrangementSeconds: null,
    plugins: [],
    sampleCount: 0,
    samplePaths: [],
    missingSamples: [],
    parsedAt: Date.now(),
    parseError: null
  }
}
