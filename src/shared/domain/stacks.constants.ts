import type { FolderSwatch } from './stacks'

/**
 * Zod-free half of the stacks domain — see projects.constants.ts for why the
 * split exists. The renderer needs the swatch table, the lens table and the
 * folder-kind rules as *values*; it never needs the validators, which run once
 * at the IPC boundary in the main process.
 */

// -------------------------------------------------------------------- lenses

/**
 * The ways into the register.
 *
 * `stacks` is the only lens that browses folders the operator built. The rest
 * are projections over records the register already holds — which means a
 * project can never be filed in two contradictory places, as a second
 * hand-built tree would permit.
 *
 * Ordered widest-first: `all` is everything, then the ways of narrowing it.
 * `stacks` and `unfiled` sit adjacent because they are a pair — one is what has
 * been organised, the other is what has not, and the work is moving things from
 * the second to the first. `bin` is last, being where things go to stop being
 * part of the register.
 *
 * The department still *opens* on `stacks` rather than on the first entry: the
 * shelves are what the ARCHIVE is for, and a flat list of everything is a
 * reference rather than a place to work.
 *
 * It replaced a `loose` lens that selected projects belonging to no *volume*.
 * That was redundant — the category chips already express "everything that is
 * not an album track" — whereas "not on a shelf" cannot be expressed any other
 * way, and is the question the operator actually asks.
 */
export const ARCHIVE_LENSES = ['all', 'stacks', 'unfiled', 'volumes', 'releases', 'bin'] as const
export type ArchiveLens = (typeof ARCHIVE_LENSES)[number]

export const ARCHIVE_LENS_LABEL: Record<ArchiveLens, string> = {
  stacks: 'GENRES',
  unfiled: 'UNFILED',
  volumes: 'VOLUMES',
  releases: 'RELEASES',
  all: 'ALL',
  bin: 'BIN'
}

export const ARCHIVE_LENS_PURPOSE: Record<ArchiveLens, string> = {
  stacks: 'Genres, folders and the projects filed on them.',
  unfiled: 'Everything found on disk that is not on a shelf yet.',
  volumes: 'Albums, EPs and compilations, and the tracks bound into each.',
  releases: 'What is going out, and the files that go with it.',
  all: 'The whole register, flat.',
  bin: 'Deleted projects, kept until you empty them.'
}

/** True for the one lens that browses folders rather than filtering the register. */
export function isFolderLens(lens: ArchiveLens): boolean {
  return lens === 'stacks'
}

// -------------------------------------------------------------- folder kinds

/**
 * What a folder *is* at a given position in the tree.
 *
 * Derived from depth rather than stored, and that is the whole design: moving a
 * folder changes what it is, and a stored `kind` would sooner or later disagree
 * with where the folder actually sits. Depth is the truth; everything else
 * reads it.
 *
 * Two kinds, not three. An earlier build named depth 1 a SUB-GENRE and required
 * every project to sit in one; that was dropped as needless ceremony. A folder
 * below a genre is just a folder now, and the operator subdivides — or does
 * not — as the work actually warrants.
 *
 * Note this is a *naming* distinction only: nothing behaves differently at one
 * depth versus another. Any folder may hold projects and any folder may hold
 * more folders.
 */
export const FOLDER_KINDS = ['genre', 'folder'] as const
export type FolderKind = (typeof FOLDER_KINDS)[number]

export const FOLDER_KIND_LABEL: Record<FolderKind, string> = {
  genre: 'GENRE',
  folder: 'FOLDER'
}

/** Depth 0 is a genre; everything below it is the operator's own structure. */
export function folderKindAtDepth(depth: number): FolderKind {
  return depth <= 0 ? 'genre' : 'folder'
}

// ------------------------------------------------------------------ swatches

/**
 * The folder palette — presets, not a fence.
 *
 * Every value is lifted verbatim from styles/base/_theme.scss, so a one-click
 * choice always lands in the world's concrete → brass → gold → crimson range.
 * A colour the operator picks by hand is stored exactly as picked and is not
 * pulled toward these; see the note on `isHexColour` below.
 */
export const FOLDER_SWATCHES: readonly FolderSwatch[] = [
  { id: 'concrete', label: 'Concrete', hex: '#554e42' },
  { id: 'ash', label: 'Ash', hex: '#6f6656' },
  { id: 'stone', label: 'Stone', hex: '#8a8071' },
  { id: 'brass', label: 'Brass', hex: '#45351f' },
  { id: 'bronze', label: 'Bronze', hex: '#5e472c' },
  { id: 'gold', label: 'Gold', hex: '#976b30' },
  { id: 'amber', label: 'Amber', hex: '#b98b47' },
  { id: 'sun', label: 'Sun', hex: '#d2a961' },
  { id: 'wheat', label: 'Wheat', hex: '#e3c286' },
  { id: 'alabaster', label: 'Alabaster', hex: '#b69e7c' },
  { id: 'bone', label: 'Bone', hex: '#ddcfb2' },
  { id: 'ember', label: 'Ember', hex: '#5e1a16' },
  { id: 'rust', label: 'Rust', hex: '#7a1e1a' },
  { id: 'crimson', label: 'Crimson', hex: '#a32b23' },
  { id: 'flare', label: 'Flare', hex: '#c4453a' }
] as const

/** Ash — the neutral structural grey. What a folder is until the operator says otherwise. */
export const DEFAULT_FOLDER_COLOUR = '#6f6656'

export const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/

/**
 * Whether the value is a well-formed six-digit hex colour.
 *
 * This is the *entire* check applied to a colour on its way in, and that is a
 * deliberate reversal. An earlier build ran every custom colour through a
 * `clampToPalette` that folded out-of-band hues into the crimson-to-gold range
 * and capped saturation, on the reasoning that the world brief permits no sixth
 * colour. It was removed on the operator's instruction, and the instruction is
 * right: these swatches are a personal index of a personal library, and an
 * index that quietly rewrites its own keys is worse than one that admits a
 * green. The presets above remain the one-click answer for anyone who wants the
 * house palette.
 *
 * The brief still governs the *chrome*. Crimson remains the only saturated
 * colour the application itself draws with; this licence covers operator-
 * assigned tile colours and nothing else.
 */
export function isHexColour(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

/**
 * Normalises to lowercase `#rrggbb`, so two spellings of one colour compare
 * equal. Not a filter — `#FFAA00` and `#ffaa00` are the same colour.
 */
export function normaliseHex(value: string): string {
  const match = HEX_PATTERN.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : DEFAULT_FOLDER_COLOUR
}

// -------------------------------------------------------------------- filing

/**
 * The directory the app creates inside the filing root to hold the tree.
 *
 * Everything the app made lives under one name, so the operator's existing
 * folders are never intermixed with ours and undoing the whole feature is a
 * single deletion in Explorer.
 */
export const WRAPPER_DIRECTORY_NAME = 'Candy Haven'

/**
 * The one directory inside the wrapper that is not a genre.
 *
 * Created alongside the wrapper and reserved by name, so the tree cannot grow a
 * genre that collides with it and the scan can skip it wholesale — it holds
 * copies of finished files, never projects.
 */
export const RELEASES_DIRECTORY_NAME = 'RELEASES'

/**
 * The archive's own recycle bin, inside the wrapper.
 *
 * Deleting a project moves its folder here rather than to the operating
 * system's bin. The reason is retrieval: Windows' Recycle Bin cannot be browsed
 * from inside this application, so "restore that project" would mean explaining
 * to the operator where to click in Explorer and hoping the folder had not been
 * emptied. A bin the archive owns can be listed, searched and restored from in
 * the same interface that did the deleting.
 *
 * It sits beside RELEASES and is reserved by name for the same reasons: the
 * tree cannot grow a genre that collides with it, and the scan skips it
 * wholesale — a deleted project must not reappear in the register as a live
 * one on the next launch.
 */
export const RECYCLE_BIN_DIRECTORY_NAME = 'RECYCLE BIN'

/** Directories inside the wrapper that the app owns and a genre may not shadow. */
export const RESERVED_WRAPPER_DIRECTORIES: readonly string[] = [
  RELEASES_DIRECTORY_NAME,
  RECYCLE_BIN_DIRECTORY_NAME
]

export const MAX_FOLDER_NAME_LENGTH = 64

/**
 * How deep the tree may go.
 *
 * A genre and a couple of levels of the operator's own devising is the real
 * use; the limit exists so a path cannot be driven past Windows' own length
 * ceiling by nesting.
 */
export const MAX_FOLDER_DEPTH = 6

/** Device names Windows refuses as directory names regardless of extension. */
const RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
])

const ILLEGAL_NAME_CHARACTERS = /[\\/:*?"<>|]/

/**
 * Written as a scan rather than a regex character class.
 *
 * A control-character range in a literal is both unreadable and a lint
 * violation that has to be suppressed; comparing code points says the same
 * thing plainly.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)
    if (code !== undefined && code < 0x20) return true
  }
  return false
}

export interface FolderNameVerdict {
  ok: boolean
  /** Why the name was refused. Null when it was accepted. */
  reason: string | null
}

/**
 * Whether a name can be used for a folder or a project, with the reason if not.
 *
 * Lives in the shared domain rather than only in main so a dialog can refuse
 * before a round trip, and the service can refuse again on the way in — the
 * renderer is not trusted to have asked.
 *
 * `topLevel` tightens the check for a folder sitting directly in the wrapper,
 * where the two names the app owns would collide.
 */
export function validateFolderName(name: string, topLevel = false): FolderNameVerdict {
  const trimmed = name.trim()

  if (trimmed.length === 0) return { ok: false, reason: 'A folder needs a name.' }
  if (trimmed.length > MAX_FOLDER_NAME_LENGTH) {
    return { ok: false, reason: `Keep the name under ${MAX_FOLDER_NAME_LENGTH} characters.` }
  }
  if (ILLEGAL_NAME_CHARACTERS.test(trimmed) || hasControlCharacter(trimmed)) {
    return { ok: false, reason: 'A name cannot contain \\ / : * ? " < > or |.' }
  }
  if (trimmed === '.' || trimmed === '..') {
    return { ok: false, reason: 'That name is reserved by the filesystem.' }
  }
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) {
    return { ok: false, reason: 'A name cannot end with a dot or a space.' }
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase().split('.')[0])) {
    return { ok: false, reason: `${trimmed} is a reserved device name on Windows.` }
  }
  if (trimmed.toLowerCase() === WRAPPER_DIRECTORY_NAME.toLowerCase()) {
    return { ok: false, reason: `${WRAPPER_DIRECTORY_NAME} is the name of the filing root itself.` }
  }
  if (topLevel) {
    const reserved = RESERVED_WRAPPER_DIRECTORIES.find(
      (name) => name.toLowerCase() === trimmed.toLowerCase()
    )
    if (reserved) {
      return { ok: false, reason: `${reserved} is a folder the archive keeps for itself.` }
    }
  }

  return { ok: true, reason: null }
}
