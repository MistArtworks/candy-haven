import { z } from 'zod'
import { DEFAULT_FOLDER_COLOUR, MAX_FOLDER_NAME_LENGTH, isHexColour } from './stacks.constants'
import {
  MASTER_PICKS,
  PROJECT_CATEGORIES,
  PROJECT_SORT_MODES,
  PROJECT_STAGE_IDS,
  PROJECT_VIEW_MODES,
  type ProjectStage
} from './projects.constants'

/**
 * Schema half of the projects domain.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. Runtime values the renderer needs — the stage table, the category
 * table, the readiness rules, date arithmetic — live in projects.constants.ts
 * so importing them does not drag zod into the renderer bundle.
 */

export type {
  MasterPick,
  MediaKind,
  ProjectCategory,
  ProjectSortMode,
  ProjectStage,
  ProjectViewMode,
  ScaffoldFolder
} from './projects.constants'

export {
  ABLETON_SET_EXTENSIONS,
  ALS_MAX_DECOMPRESSED_BYTES,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MASTER_PICKS,
  MASTER_PICK_HINT,
  MASTER_PICK_LABEL,
  PIPELINE_STAGES,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_PURPOSE,
  PROJECT_SCAFFOLD_FOLDERS,
  PROJECT_SORT_LABEL,
  PROJECT_SORT_MODES,
  PROJECT_STAGES,
  PROJECT_STAGE_IDS,
  PROJECT_VIEW_LABEL,
  PROJECT_VIEW_MODES,
  SCAFFOLD_FOLDER_PURPOSE,
  SCAN_LOG_LIMIT,
  VIDEO_EXTENSIONS,
  VOLUME_BOUND_CATEGORIES,
  classifyExtension,
  createEmptyScanState,
  daysBetweenIsoDates,
  evaluateReadiness,
  getStage,
  isReleaseReady,
  nextStage,
  previousStage,
  requiresVolume,
  shiftIsoDate,
  stageProgress,
  toIsoDate
} from './projects.constants'

// ------------------------------------------------------------ table shapes
// Interfaces consumed by the constants module. Declared here so the two halves
// of the domain describe one model rather than two that happen to agree.

export interface ProjectStageDefinition {
  id: ProjectStage
  /** Uppercase institutional label used on badges and board columns. */
  label: string
  /** Plain description of what being in this stage actually means. */
  purpose: string
  /** Position in the pipeline; also the board column order. */
  order: number
  /** Sits outside the linear pipeline (a parking state). */
  offPipeline?: boolean
  /** No stage follows this one. */
  terminal?: boolean
  /** A final mix and master must be selected to enter this stage. */
  requiresMaster?: boolean
}

export interface ReadinessRequirement {
  id: string
  label: string
  met: boolean
  hint?: string
}

// ------------------------------------------------------------------ schemas

export const ProjectStageSchema = z.enum(PROJECT_STAGE_IDS)
export const ProjectViewModeSchema = z.enum(PROJECT_VIEW_MODES)
export const ProjectSortModeSchema = z.enum(PROJECT_SORT_MODES)
export const ProjectCategorySchema = z.enum(PROJECT_CATEGORIES)
export const MasterPickSchema = z.enum(MASTER_PICKS)

/** `YYYY-MM-DD`. See projects.constants.ts for why dates are not instants. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1),
  denominator: z.number().int().min(1)
})
export type TimeSignature = z.infer<typeof TimeSignatureSchema>

export const MusicalKeySchema = z.object({
  /** Root note name, e.g. `F#`. */
  root: z.string(),
  /** Scale name as Live reports it, e.g. `Minor`. */
  scale: z.string()
})
export type MusicalKey = z.infer<typeof MusicalKeySchema>

/**
 * What was read out of a `.als` file.
 *
 * An `.als` is gzipped XML, so all of this is genuinely present in the file
 * rather than inferred. `parseError` is carried rather than thrown: one
 * unreadable set — a corrupt save, or a Live version that moved an element —
 * must not cost the operator the rest of the scan.
 *
 * **Every field added here must carry a `.default()`.** Analyses are persisted,
 * so a record written by an earlier build is missing whatever was added since.
 * Because the IPC router validates handler *output*, a field without a default
 * makes `projects:get` fail for every stored record — which presents as the
 * dossier refusing to open at all, with the reason only visible in the log.
 * That happened once, for `inKey`. Defaults let an old record parse and heal on
 * the next scan instead.
 */
export const AbletonAnalysisSchema = z.object({
  /** e.g. `Ableton Live 12.1.10`. */
  creator: z.string().nullable().default(null),
  /** Schema version string from the root element. */
  version: z.string().nullable().default(null),
  tempo: z.number().nullable().default(null),
  timeSignature: TimeSignatureSchema.nullable().default(null),
  /** Live's song key. Absent for sets saved before Live 12 introduced one. */
  key: MusicalKeySchema.nullable().default(null),
  /** Whether Live's "In Key" filter is engaged for the set. */
  inKey: z.boolean().default(false),
  trackCounts: z
    .object({
      midi: z.number().int().min(0),
      audio: z.number().int().min(0),
      group: z.number().int().min(0),
      return: z.number().int().min(0),
      total: z.number().int().min(0)
    })
    .prefault({ midi: 0, audio: 0, group: 0, return: 0, total: 0 }),
  trackNames: z.array(z.string()).default([]),
  sceneCount: z.number().int().min(0).default(0),
  /** Furthest clip end in the arrangement, in beats. */
  arrangementBeats: z.number().nullable().default(null),
  /** `arrangementBeats` converted at the set's tempo. Estimated, not exact. */
  arrangementSeconds: z.number().nullable().default(null),
  /** Third-party plugin names (VST2 filenames, VST3 names). */
  plugins: z.array(z.string()).default([]),
  /** Distinct sample files referenced by the set. */
  sampleCount: z.number().int().min(0).default(0),
  /**
   * Where each referenced sample resolved to when the set was last read.
   *
   * Retained so a cached analysis can have its sample list re-checked against
   * the disk without decompressing the set again — whether a file still exists
   * is the one part of this analysis that depends on the world outside the
   * `.als`, so it is the one part that must be re-verified on every scan.
   */
  samplePaths: z.array(z.string()).default([]),
  /** Entries from `samplePaths` that no longer exist on disk. */
  missingSamples: z.array(z.string()).default([]),
  parsedAt: z.number().default(0),
  parseError: z.string().nullable().default(null)
})
export type AbletonAnalysis = z.infer<typeof AbletonAnalysisSchema>

export const AbletonSetSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().min(0),
  modifiedAt: z.number(),
  /** The set treated as the project's current working version. */
  isPrimary: z.boolean(),
  analysis: AbletonAnalysisSchema.nullable()
})
export type AbletonSet = z.infer<typeof AbletonSetSchema>

/** A dated `.als` from the project's `Backup/` folder. */
export const SetRevisionSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().min(0),
  modifiedAt: z.number()
})
export type SetRevision = z.infer<typeof SetRevisionSchema>

export const MediaFileSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  /** Path relative to the project folder, for readable listings. */
  relativePath: z.string(),
  sizeBytes: z.number().min(0),
  modifiedAt: z.number()
})
export type MediaFile = z.infer<typeof MediaFileSchema>

export const ProjectNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Pinned notes surface on the project card in every view. */
  pinned: z.boolean()
})
export type ProjectNote = z.infer<typeof ProjectNoteSchema>

export const StageEventSchema = z.object({
  stage: ProjectStageSchema,
  at: z.number(),
  note: z.string().nullable()
})
export type StageEvent = z.infer<typeof StageEventSchema>

/**
 * The two audio picks the operator makes from the project's own bounces.
 *
 * Absolute paths, so a selection survives a rescan. See `MASTER_PICKS` for why
 * these live on the project rather than on a release.
 */
export const MasterSelectionSchema = z.object({
  prefinal: z.string().nullable().default(null),
  final: z.string().nullable().default(null)
})
export type MasterSelection = z.infer<typeof MasterSelectionSchema>

/**
 * A project as the registry holds it.
 *
 * Fields divide into two groups with different owners, and the distinction
 * matters when writing: everything under `discovered` belongs to the scanner
 * and is overwritten wholesale on every rescan, while the operator's own work —
 * stage, notes, tags, category, colour, master picks — is never touched by a
 * scan.
 */
export const ProjectRecordSchema = z.object({
  id: z.string(),
  /** Absolute path of the project folder. Unique. */
  path: z.string(),
  /** Folder name with Ableton's ` Project` suffix removed. */
  name: z.string(),
  folderName: z.string(),
  stage: ProjectStageSchema,
  stageHistory: z.array(StageEventSchema),
  tags: z.array(z.string()),
  favourite: z.boolean(),
  notes: z.array(ProjectNoteSchema),

  /** What this project is. See PROJECT_CATEGORIES. */
  category: ProjectCategorySchema.default('single'),
  /**
   * The volume this project is a track of, or null when it stands alone.
   *
   * Membership is held here rather than as an ordered id array on the volume,
   * so there is one place to look and nothing to keep in step. A volume's track
   * list is "the projects pointing at it, sorted by `trackNumber`".
   */
  volumeId: z.string().nullable().default(null),
  /** Position within the volume. Null while unset; ties break on name. */
  trackNumber: z.number().int().min(0).nullable().default(null),

  /** Operator-set tile colour. Stored exactly as picked — see stacks.constants.ts. */
  colour: z.string().default(DEFAULT_FOLDER_COLOUR),
  masters: MasterSelectionSchema.prefault({}),

  /**
   * The stacks folder this project is filed in, or null for unfiled.
   *
   * Operator-owned despite describing a location on disk, so it is absent from
   * `discoveredFields()` and a rescan cannot clear it. The scan does *recompute*
   * it from the project's path afterwards, which is what keeps the app in step
   * with a folder the operator dragged around in Explorer.
   */
  folderId: z.string().nullable().default(null),

  // -------------------------------------------------------------- discovered
  sets: z.array(AbletonSetSchema),
  revisions: z.array(SetRevisionSchema),
  /**
   * Candidate deliverables — audio outside the project's `Samples/` folder.
   * Imported samples are counted in `sampleFileCount` instead, so the master
   * picker lists the handful of bounces rather than thousands of sources.
   */
  audio: z.array(MediaFileSchema),
  images: z.array(MediaFileSchema),
  videos: z.array(MediaFileSchema),
  sampleFileCount: z.number().int().min(0),
  sizeBytes: z.number().min(0),
  /** Union of missing samples across every set in the project. */
  missingSamples: z.array(z.string()),
  /** Most recent mtime of any `.als` in the project — "last touched". */
  lastTouchedAt: z.number(),
  scannedAt: z.number(),
  /** True when the folder has disappeared since the last successful scan. */
  missing: z.boolean(),

  /**
   * When the operator deleted this project, or null while it is live.
   *
   * A deleted project keeps its whole record. That is the point of an archive-
   * owned recycle bin over the operating system's: restoring has to put the
   * folder back where it came from, and only the record remembers where that
   * was. See `trashedFrom`.
   */
  trashedAt: z.number().nullable().default(null),
  /** The path the project occupied before it was moved into the bin. */
  trashedFrom: z.string().nullable().default(null),

  createdAt: z.number(),
  updatedAt: z.number()
})
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>

/**
 * The reduced shape the register views render.
 *
 * List, grid and board only need identity, position and a few figures. Shipping
 * full records — every track name, plugin and sample path — would move
 * megabytes across IPC to draw a list of cards.
 */
export const ProjectSummarySchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  stage: ProjectStageSchema,
  tags: z.array(z.string()),
  favourite: z.boolean(),
  colour: z.string().default(DEFAULT_FOLDER_COLOUR),
  /** Which stacks folder holds this project, for the folder browser. */
  folderId: z.string().nullable().default(null),
  category: ProjectCategorySchema.default('single'),
  volumeId: z.string().nullable().default(null),
  trackNumber: z.number().int().min(0).nullable().default(null),
  tempo: z.number().nullable(),
  key: MusicalKeySchema.nullable(),
  trackCount: z.number().int().min(0),
  setCount: z.number().int().min(0),
  revisionCount: z.number().int().min(0),
  audioCount: z.number().int().min(0),
  sizeBytes: z.number().min(0),
  missingSampleCount: z.number().int().min(0),
  /** First image in the project, for the grid thumbnail. */
  coverPath: z.string().nullable(),
  /** First pinned note, shown inline on cards. */
  pinnedNote: z.string().nullable(),
  /** True once a final mix and master has been chosen. */
  hasFinalMaster: z.boolean().default(false),
  /** Readiness requirements met / total. */
  readiness: z.object({ met: z.number().int().min(0), total: z.number().int().min(0) }),
  lastTouchedAt: z.number(),
  updatedAt: z.number(),
  missing: z.boolean(),
  trashedAt: z.number().nullable().default(null),
  /** Where it will go back to if restored. Shown in the bin so the row explains itself. */
  trashedFrom: z.string().nullable().default(null)
})
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

// --------------------------------------------------------------------- scan

export const ScanPhaseSchema = z.enum([
  'idle',
  'walking',
  'analysing',
  'persisting',
  'done',
  'error'
])
export type ScanPhase = z.infer<typeof ScanPhaseSchema>

export const ScanLogEntrySchema = z.object({
  at: z.number(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string()
})
export type ScanLogEntry = z.infer<typeof ScanLogEntrySchema>

/**
 * Observable state of a scan. Pushed to the renderer as it progresses, and the
 * rolling log rides along on the state — as with the boot snapshot — so a view
 * that subscribes late still receives the full history in one payload.
 */
export const ScanStateSchema = z.object({
  phase: ScanPhaseSchema,
  roots: z.array(z.string()),
  currentPath: z.string().nullable(),
  directoriesVisited: z.number().int().min(0),
  filesSeen: z.number().int().min(0),
  projectsFound: z.number().int().min(0),
  /** Sets decompressed and read during this scan. */
  setsParsed: z.number().int().min(0),
  /** Sets served from the stored analysis because the file had not changed. */
  setsReused: z.number().int().min(0),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
  log: z.array(ScanLogEntrySchema)
})
export type ScanState = z.infer<typeof ScanStateSchema>

// ------------------------------------------------------------------ drafts

/** Colour input accepted from the renderer, checked before it is stored. */
const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

/**
 * A project to be provisioned.
 *
 * `folderId` is required and not nullable: a project is *created into* a shelf,
 * unlike an existing one discovered by the scan, which may legitimately be
 * unfiled. The service refuses a genre — projects live at depth 1 or below.
 */
export const ProjectDraftSchema = z.object({
  folderId: z.string(),
  name: z.string().max(MAX_FOLDER_NAME_LENGTH),
  category: ProjectCategorySchema.default('single'),
  /** Required by the service when the category is one of the volume-bound three. */
  volumeId: z.string().nullable().default(null),
  colour: ColourSchema.optional()
})
export type ProjectDraft = z.infer<typeof ProjectDraftSchema>

// ------------------------------------------------------------------ patches

/**
 * Operator-authored fields only.
 *
 * Discovered fields are deliberately absent: the scanner owns them, and
 * accepting them here would let the UI write values that the next scan would
 * silently contradict.
 */
export const ProjectPatchSchema = z.object({
  stage: ProjectStageSchema.optional(),
  /** Recorded against the stage change in the project's history. */
  stageNote: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favourite: z.boolean().optional(),
  colour: ColourSchema.optional(),
  category: ProjectCategorySchema.optional(),
  /**
   * Re-attaches the project to a volume, or detaches it with `null`.
   *
   * Validated against `category` in the service: the two are one statement, and
   * a patch that sets only one of them has the other adjusted to agree rather
   * than being refused.
   */
  volumeId: z.string().nullable().optional(),
  trackNumber: z.number().int().min(0).nullable().optional(),
  masters: MasterSelectionSchema.partial().optional(),
  /** Which set to treat as the project's current working version. */
  primarySetPath: z.string().optional()
})
export type ProjectPatch = z.infer<typeof ProjectPatchSchema>

export const NoteDraftSchema = z.object({
  body: z.string(),
  pinned: z.boolean().optional()
})
export type NoteDraft = z.infer<typeof NoteDraftSchema>

export const ProjectQuerySchema = z.object({
  /** Matched against name and tags. */
  search: z.string().optional(),
  stages: z.array(ProjectStageSchema).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(ProjectCategorySchema).optional(),
  favouritesOnly: z.boolean().optional(),
  sort: ProjectSortModeSchema.optional(),
  /** Include projects whose folder has disappeared. Off by default. */
  includeMissing: z.boolean().optional(),
  /**
   * Select deleted projects instead of live ones.
   *
   * A plain boolean rather than a tri-state, because there is no useful query
   * that wants both at once: the bin is a place you go, not a filter you relax.
   * Absent or false means live projects only, which is what every other view
   * asks for without having to say so.
   */
  trashed: z.boolean().optional(),
  /**
   * Restrict to one stacks folder.
   *
   * Three states, not two: absent means "do not filter at all", a string means
   * that folder, and `null` means the unfiled projects — which is what the
   * UNFILED panel shows.
   */
  folderId: z.string().nullable().optional(),
  /**
   * Restrict to one volume. Same three states as `folderId`: `null` is the
   * LOOSE lens — everything belonging to no volume at all.
   */
  volumeId: z.string().nullable().optional()
})
export type ProjectQuery = z.infer<typeof ProjectQuerySchema>

/** Everything the ARCHIVE page needs for its initial render. */
export const ProjectRegistrySchema = z.object({
  projects: z.array(ProjectSummarySchema),
  scan: ScanStateSchema,
  /** Distinct tags across the registry, for the filter row. */
  tags: z.array(z.string()),
  /** Per-stage counts, including stages with none — the board needs empties. */
  stageCounts: z.record(ProjectStageSchema, z.number().int().min(0)),
  /** Per-category counts, for the chip row. */
  categoryCounts: z.record(ProjectCategorySchema, z.number().int().min(0)),
  /** Projects filed nowhere, for the UNORGANISED panel's badge. */
  unfiledCount: z.number().int().min(0),
  /** Projects in the recycle bin, for its lens badge. */
  trashedCount: z.number().int().min(0),
  roots: z.array(z.string())
})
export type ProjectRegistry = z.infer<typeof ProjectRegistrySchema>
