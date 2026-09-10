import { z } from 'zod'
import { DEFAULT_FOLDER_COLOUR, MAX_FOLDER_NAME_LENGTH, isHexColour } from './stacks.constants'

/**
 * Schema half of the stacks domain — the ARCHIVE's shelving.
 *
 * A folder here is a *real directory on disk*, not a label. Filing a project
 * moves its whole Ableton project folder into that directory, which is why the
 * record carries an absolute `path` alongside the tree structure: the database
 * describes something that exists in Explorer, and the two are kept in step by
 * the scan.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. Runtime values the renderer needs — the swatch table, the lens
 * table, the folder-kind rules, the name rules — live in stacks.constants.ts so
 * importing them does not drag zod into the renderer bundle.
 */

export type { ArchiveLens, FolderKind } from './stacks.constants'

export {
  ARCHIVE_LENSES,
  ARCHIVE_LENS_LABEL,
  ARCHIVE_LENS_PURPOSE,
  DEFAULT_FOLDER_COLOUR,
  FOLDER_KINDS,
  FOLDER_KIND_LABEL,
  FOLDER_SWATCHES,
  HEX_PATTERN,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  RECYCLE_BIN_DIRECTORY_NAME,
  RELEASES_DIRECTORY_NAME,
  RESERVED_WRAPPER_DIRECTORIES,
  WRAPPER_DIRECTORY_NAME,
  folderKindAtDepth,
  isFolderLens,
  isHexColour,
  normaliseHex,
  validateFolderName
} from './stacks.constants'

// ------------------------------------------------------------ table shapes

/** One entry in the predefined folder palette. Consumed by the constants module. */
export interface FolderSwatch {
  id: string
  label: string
  /** Lowercase `#rrggbb`, lifted from the theme's material ramps. */
  hex: string
}

// ----------------------------------------------------------------- schemas

/** Colour input accepted from the renderer, checked but never rewritten. */
const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

/**
 * A folder in the filing tree.
 *
 * **Every field carries a `.default()`**, for the reason recorded at length on
 * `AbletonAnalysisSchema` in projects.ts: the IPC router validates handler
 * *output*, so a document written by an earlier build that is missing a field
 * added since would make the whole channel fail rather than one record.
 */
export const ArchiveFolderSchema = z.object({
  id: z.string(),
  /** Parent folder, or null for a folder sitting directly in the wrapper. */
  parentId: z.string().nullable().default(null),
  name: z.string().max(MAX_FOLDER_NAME_LENGTH),
  /** Absolute path of the real directory this record describes. */
  path: z.string(),
  /** Six-digit hex, exactly as the operator chose it. */
  colour: z.string().default(DEFAULT_FOLDER_COLOUR),
  /** Operator ordering among its siblings. Ties break on name. */
  order: z.number().int().default(0),
  favourite: z.boolean().default(false),
  /**
   * When the operator deleted this folder, or null while it is live.
   *
   * A deleted folder keeps its record and its whole subtree — descendant
   * folders and every project filed under them are trashed with it, and its
   * directory moves into the recycle bin intact. Restoring is therefore one
   * action rather than rebuilding a genre and re-filing its contents.
   */
  trashedAt: z.number().nullable().default(null),
  /** The path the folder occupied before it was moved into the bin. */
  trashedFrom: z.string().nullable().default(null),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type ArchiveFolder = z.infer<typeof ArchiveFolderSchema>

export const FolderDraftSchema = z.object({
  parentId: z.string().nullable(),
  name: z.string(),
  /** Omitted takes the default swatch rather than an absent colour. */
  colour: ColourSchema.optional()
})
export type FolderDraft = z.infer<typeof FolderDraftSchema>

/**
 * Operator edits to a folder.
 *
 * `name` and `parentId` both move the directory on disk; `colour`, `order` and
 * `favourite` are record-only. They share one patch because the dialog can
 * change several at once, and doing it in a single transition keeps the disk
 * and the record from diverging halfway through.
 */
export const FolderPatchSchema = z.object({
  name: z.string().optional(),
  colour: ColourSchema.optional(),
  /** Re-parents the folder. `null` moves it to the top of the tree. */
  parentId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  favourite: z.boolean().optional()
})
export type FolderPatch = z.infer<typeof FolderPatchSchema>

// -------------------------------------------------------------------- setup

/**
 * Whether the department can be used at all.
 *
 * The ARCHIVE now *makes* structure rather than discovering it, so it cannot
 * open onto a register the way it used to: without a root there is nowhere to
 * build, and without a template there is nothing to build from. This is what
 * the setup gate reads, and it is deliberately three separate booleans rather
 * than one `ready` flag — the gate tells the operator which of the two is
 * missing, and "the root is set but the directory has gone" is a third state
 * that needs saying out loud rather than being reported as "not set up".
 */
export const ArchiveSetupStateSchema = z.object({
  /** The chosen root. Null when the operator has never picked one. */
  filingRoot: z.string().nullable(),
  /** True when `filingRoot` is set and the directory is actually present. */
  rootPresent: z.boolean(),
  /** `<filingRoot>/Candy Haven`. Null whenever `filingRoot` is. */
  wrapper: z.string().nullable(),
  /** True once the wrapper and the directories it owns all exist. */
  wrapperReady: z.boolean(),
  /** `<wrapper>/RECYCLE BIN`. Null whenever `filingRoot` is. */
  recycleBin: z.string().nullable(),
  /** The template `.als` copied into every new project. */
  templatePath: z.string().nullable(),
  /** True when the template is set and the file is actually present. */
  templatePresent: z.boolean(),
  /** Extra locations scanned for stray sets. Never written to. */
  satelliteRoots: z.array(z.string()),
  /**
   * Where the archive would go if the operator does not say otherwise.
   *
   * Resolved in main from the OS music folder, because the renderer cannot ask
   * Electron for it. Carried on the setup state rather than fetched separately
   * so the gate has an answer on its first render and never shows an empty
   * field it then fills in.
   */
  suggestedRoot: z.string(),
  /** Every gate satisfied; the department is usable. */
  ready: z.boolean()
})
export type ArchiveSetupState = z.infer<typeof ArchiveSetupStateSchema>

/**
 * What the setup gate submits.
 *
 * One call rather than three settings writes, because provisioning the wrapper
 * depends on the root and there is no useful intermediate state where some are
 * saved and the rest are not.
 */
export const ArchiveSetupDraftSchema = z.object({
  /** Where `Candy Haven` is created. Nothing else is written here. */
  filingRoot: z.string(),
  templatePath: z.string(),
  /**
   * Where the operator's existing projects already live.
   *
   * Optional, and separate from the filing root for the reason that motivated
   * moving the archive to the music folder in the first place: the place the
   * app *builds* and the places work *already is* are usually different disks,
   * and conflating them forced the archive to be created inside whatever
   * directory happened to hold the projects.
   */
  sourceRoots: z.array(z.string()).default([])
})
export type ArchiveSetupDraft = z.infer<typeof ArchiveSetupDraftSchema>

/**
 * The whole tree, as every mutation returns it.
 *
 * Partial updates are deliberately not offered: renaming one folder rewrites
 * the path of every descendant and re-parenting changes counts several levels
 * away, so a response carrying only the changed row would leave the page to
 * re-derive what the main process already knows. The rite's and THE CONCORD's
 * channels are shaped the same way, for the same reason.
 */
export const StacksTreeSchema = z.object({
  folders: z.array(ArchiveFolderSchema),
  setup: ArchiveSetupStateSchema,
  /**
   * Depth of each folder, keyed by id.
   *
   * Carried rather than left to the renderer because depth decides what a
   * folder *is* — a genre at the top, a plain folder below — which decides
   * which mark its tile draws. Main has already walked the tree to build this
   * payload, so it answers rather than making the renderer re-derive it.
   */
  depths: z.record(z.string(), z.number().int().min(0)),
  /**
   * Projects filed directly in each folder, keyed by folder id.
   *
   * Carried on the tree so a tile can show its count without the page fetching
   * a registry query per folder.
   */
  counts: z.record(z.string(), z.number().int().min(0)),
  /** Projects filed nowhere, for the UNFILED panel. */
  unfiledCount: z.number().int().min(0),
  /**
   * Folders sitting in the recycle bin.
   *
   * Carried on the tree rather than fetched separately because the BIN lens
   * draws them beside the trashed projects, and both come from one read.
   */
  trashed: z.array(ArchiveFolderSchema)
})
export type StacksTree = z.infer<typeof StacksTreeSchema>
