import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import type {
  AbletonAnalysis,
  AbletonSet,
  MediaFile,
  SetRevision,
  UnlinkedMedia
} from '@shared/domain/projects'
import {
  SCAN_IGNORED_DIRECTORIES,
  SCAN_MAX_DEPTH,
  classifyExtension
} from '@shared/domain/projects.constants'
import { mapWithConcurrency } from '@main/core/async'
import { getLogger } from '@main/core/logger'
import { readAbletonSet, reverifySamples } from './als-reader'

const logger = getLogger('projects:scanner')

/**
 * Filesystem scanner for the project registry.
 *
 * A project is any folder that *directly* contains at least one `.als`. That is
 * Ableton's own convention — a "Project" folder holds the sets plus `Samples/`
 * and `Backup/` — and it means the operator can point this at a whole drive of
 * differently-organised work without configuring anything per project.
 *
 * Discovery stops descending once a project folder is found. Sets are never
 * nested inside other projects in Live's layout, and stopping there is what
 * keeps a scan of a large sample library from taking minutes.
 */

const IGNORED = new Set<string>(SCAN_IGNORED_DIRECTORIES)

/** Bounded so one pathological folder cannot produce a multi-megabyte record. */
const MAX_LISTED_FILES = 400

/** Decompressing sets is CPU-bound; four at a time saturates without stalling. */
const SET_PARSE_CONCURRENCY = 4

export interface ScannedProject {
  path: string
  folderName: string
  name: string
  sets: AbletonSet[]
  revisions: SetRevision[]
  /** Candidate deliverables — audio outside `Samples/`. See `inventory`. */
  audio: MediaFile[]
  images: MediaFile[]
  videos: MediaFile[]
  sizeBytes: number
  sampleFileCount: number
  missingSamples: string[]
  lastTouchedAt: number
}

export interface ScanProgress {
  currentPath: string
  directoriesVisited: number
  filesSeen: number
  projectsFound: number
}

export interface ScanOptions {
  onProgress?: (progress: ScanProgress) => void
  onWarning?: (message: string) => void
  /**
   * Reports the transition from walking the tree to reading the sets found.
   *
   * The two halves have very different costs — the walk is milliseconds, the
   * reads are seconds on a cold scan — so collapsing them into one label would
   * make the readout claim it was still listing directories while it was in
   * fact decompressing a 30 MB document.
   */
  onPhase?: (phase: 'walking' | 'analysing') => void
  signal?: AbortSignal
  /**
   * Returns the stored analysis for a set that has not changed since it was
   * last read, or null to read it afresh.
   *
   * This is what makes re-indexing cheap enough to do on every launch.
   * Measured on the development library, walking the tree and stat-ing every
   * file costs ~28 ms, while decompressing 25 sets costs ~1.4 s and puts
   * ~400 MB of XML through the reader. The walk is therefore always performed
   * — so additions, deletions and moves are still exact — and only the
   * expensive per-set read is skipped.
   */
  reuseAnalysis?: (set: {
    path: string
    modifiedAt: number
    sizeBytes: number
  }) => AbletonAnalysis | null
}

export interface ScanResult {
  projects: ScannedProject[]
  unlinked: UnlinkedMedia[]
  directoriesVisited: number
  filesSeen: number
  /** Sets decompressed and read during this scan. */
  setsParsed: number
  /** Sets served from a stored analysis because the file had not changed. */
  setsReused: number
}

interface WalkContext {
  projectDirectories: string[]
  unlinked: UnlinkedMedia[]
  directoriesVisited: number
  filesSeen: number
  /** Guards against symlink loops and roots that overlap one another. */
  visited: Set<string>
  options: ScanOptions
}

export async function scanRoots(
  roots: readonly string[],
  options: ScanOptions = {}
): Promise<ScanResult> {
  const context: WalkContext = {
    projectDirectories: [],
    unlinked: [],
    directoriesVisited: 0,
    filesSeen: 0,
    visited: new Set(),
    options
  }

  for (const root of roots) {
    throwIfAborted(options.signal)
    try {
      const info = await stat(root)
      if (!info.isDirectory()) {
        options.onWarning?.(`Skipped ${root} — not a directory.`)
        continue
      }
    } catch {
      options.onWarning?.(`Skipped ${root} — unreachable.`)
      continue
    }

    await walk(root, 0, context)
  }

  // Sample-existence checks dominate set analysis: a shared library path is
  // referenced by nearly every set, so one cache across the whole scan turns
  // thousands of stat calls into a few hundred.
  const existenceCache = new Map<string, boolean>()
  const sampleExists = async (path: string): Promise<boolean> => {
    const cached = existenceCache.get(path)
    if (cached !== undefined) return cached

    let exists = false
    try {
      await stat(path)
      exists = true
    } catch {
      exists = false
    }
    existenceCache.set(path, exists)
    return exists
  }

  const projects: ScannedProject[] = []
  const stats: SetStats = { parsed: 0, reused: 0 }

  if (context.projectDirectories.length > 0) options.onPhase?.('analysing')

  for (const directory of context.projectDirectories) {
    throwIfAborted(options.signal)
    options.onProgress?.({
      currentPath: directory,
      directoriesVisited: context.directoriesVisited,
      filesSeen: context.filesSeen,
      projectsFound: projects.length
    })

    try {
      projects.push(await inventory(directory, sampleExists, options, stats))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      options.onWarning?.(`Could not index ${basename(directory)}: ${message}`)
      logger.warn(`Inventory failed for ${directory}`, error)
    }
  }

  return {
    projects,
    unlinked: context.unlinked,
    directoriesVisited: context.directoriesVisited,
    filesSeen: context.filesSeen,
    setsParsed: stats.parsed,
    setsReused: stats.reused
  }
}

/**
 * Produces a set's analysis, reusing the stored one when the file is untouched.
 *
 * A cached analysis still has its sample list re-checked against the disk:
 * every other field is a property of the `.als` itself and cannot have changed
 * while its modification time and size did not, but whether a referenced
 * sample still exists is not.
 */
async function analyseSet(
  entry: { path: string; modifiedAt: number; sizeBytes: number },
  directory: string,
  sampleExists: (path: string) => Promise<boolean>,
  options: ScanOptions,
  stats: SetStats
): Promise<AbletonAnalysis> {
  const cached = options.reuseAnalysis?.(entry) ?? null

  if (cached) {
    stats.reused += 1
    return reverifySamples(cached, { sampleExists })
  }

  stats.parsed += 1
  return readAbletonSet(entry.path, directory, { sampleExists })
}

// --------------------------------------------------------------------- walk

async function walk(directory: string, depth: number, context: WalkContext): Promise<void> {
  throwIfAborted(context.options.signal)

  if (depth > SCAN_MAX_DEPTH) return

  const key = directory.toLowerCase()
  if (context.visited.has(key)) return
  context.visited.add(key)

  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    context.options.onWarning?.(`Could not read ${directory}: ${message}`)
    return
  }

  context.directoriesVisited += 1
  context.options.onProgress?.({
    currentPath: directory,
    directoriesVisited: context.directoriesVisited,
    filesSeen: context.filesSeen,
    projectsFound: context.projectDirectories.length
  })

  const files = entries.filter((entry) => entry.isFile())
  const directories = entries.filter(
    (entry) => entry.isDirectory() && !IGNORED.has(entry.name.toLowerCase())
  )

  context.filesSeen += files.length

  if (files.some((entry) => classifyExtension(entry.name) === 'set')) {
    context.projectDirectories.push(directory)
    return
  }

  // Loose audio outside any project folder is still the operator's work, so it
  // is recorded rather than dropped — they can attach it to a project later.
  for (const entry of files) {
    if (classifyExtension(entry.name) !== 'audio') continue

    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      context.unlinked.push({
        path,
        fileName: entry.name,
        directory,
        sizeBytes: info.size,
        modifiedAt: info.mtimeMs
      })
    } catch {
      // Vanished between readdir and stat; nothing worth reporting.
    }
  }

  for (const entry of directories) {
    await walk(join(directory, entry.name), depth + 1, context)
  }
}

// ----------------------------------------------------------------- inventory

interface SetStats {
  parsed: number
  reused: number
}

async function inventory(
  directory: string,
  sampleExists: (path: string) => Promise<boolean>,
  options: ScanOptions,
  stats: SetStats
): Promise<ScannedProject> {
  const folderName = basename(directory)
  const setPaths: { path: string; sizeBytes: number; modifiedAt: number }[] = []
  const revisions: SetRevision[] = []
  const audio: MediaFile[] = []
  const images: MediaFile[] = []
  const videos: MediaFile[] = []

  let sizeBytes = 0
  let sampleFileCount = 0

  const collect = async (current: string, depth: number, insideSamples: boolean): Promise<void> => {
    if (depth > SCAN_MAX_DEPTH) return

    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const path = join(current, entry.name)

      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase()

        // Backup/ is Live's own revision history — indexed as revisions rather
        // than walked as content.
        if (lower === 'backup') {
          await collectRevisions(path, revisions)
          continue
        }
        if (lower === 'ableton project info') continue

        await collect(path, depth + 1, insideSamples || lower === 'samples')
        continue
      }

      if (!entry.isFile()) continue

      let info: Awaited<ReturnType<typeof stat>>
      try {
        info = await stat(path)
      } catch {
        continue
      }

      sizeBytes += info.size

      const file: MediaFile = {
        path,
        fileName: entry.name,
        relativePath: relative(directory, path).split(sep).join('/'),
        sizeBytes: info.size,
        modifiedAt: info.mtimeMs
      }

      switch (classifyExtension(entry.name)) {
        case 'set':
          // Only sets in the project root are working versions; anything deeper
          // is a template or an imported set, not this project's current state.
          if (current === directory) {
            setPaths.push({ path, sizeBytes: info.size, modifiedAt: info.mtimeMs })
          }
          break
        case 'audio':
          // Audio under Samples/ is source material, not a deliverable. Keeping
          // it out of the list is what makes the master picker usable — a
          // sample-heavy project has thousands of these and one bounce.
          if (insideSamples) sampleFileCount += 1
          else if (audio.length < MAX_LISTED_FILES) audio.push(file)
          break
        case 'image':
          if (images.length < MAX_LISTED_FILES) images.push(file)
          break
        case 'video':
          if (videos.length < MAX_LISTED_FILES) videos.push(file)
          break
        default:
          break
      }
    }
  }

  await collect(directory, 0, false)

  // Newest set is the working version; the rest are alternates the operator can
  // promote by hand.
  setPaths.sort((a, b) => b.modifiedAt - a.modifiedAt)

  const sets = await mapWithConcurrency(
    setPaths,
    SET_PARSE_CONCURRENCY,
    async (entry, index): Promise<AbletonSet> => ({
      path: entry.path,
      fileName: basename(entry.path),
      sizeBytes: entry.sizeBytes,
      modifiedAt: entry.modifiedAt,
      isPrimary: index === 0,
      analysis: await analyseSet(entry, directory, sampleExists, options, stats)
    })
  )

  const missingSamples = [
    ...new Set(sets.flatMap((set) => set.analysis?.missingSamples ?? []))
  ].sort((a, b) => a.localeCompare(b))

  audio.sort((a, b) => b.modifiedAt - a.modifiedAt)
  images.sort((a, b) => b.modifiedAt - a.modifiedAt)
  videos.sort((a, b) => b.modifiedAt - a.modifiedAt)
  revisions.sort((a, b) => b.modifiedAt - a.modifiedAt)

  return {
    path: directory,
    folderName,
    name: cleanProjectName(folderName),
    sets,
    revisions,
    audio,
    images,
    videos,
    sizeBytes,
    sampleFileCount,
    missingSamples,
    lastTouchedAt: sets[0]?.modifiedAt ?? 0
  }
}

async function collectRevisions(directory: string, into: SetRevision[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isFile() || classifyExtension(entry.name) !== 'set') continue
    if (into.length >= MAX_LISTED_FILES) break

    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      into.push({ path, fileName: entry.name, sizeBytes: info.size, modifiedAt: info.mtimeMs })
    } catch {
      // Backup files are volatile; a vanished one is not an error.
    }
  }
}

/** `Midnight Signal Project` -> `Midnight Signal`. */
export function cleanProjectName(folderName: string): string {
  return folderName.replace(/\s+project$/i, '').trim() || folderName
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError')
}
