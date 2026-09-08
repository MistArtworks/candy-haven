import { z } from 'zod'
import {
  DELIVERABLE_KINDS,
  DISTRIBUTION_PLATFORM_IDS,
  MARKETING_ASSET_KIND_IDS,
  MARKETING_ASSET_STATUSES,
  PROJECT_SORT_MODES,
  PROJECT_STAGE_IDS,
  PROJECT_VIEW_MODES,
  RELEASE_KINDS,
  type MarketingAssetKind,
  type ProjectStage
} from './projects.constants'

/**
 * Schema half of the projects domain.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. Runtime values the renderer needs — the stage table, platform
 * labels, readiness rules, date arithmetic — live in projects.constants.ts so
 * importing them does not drag zod into the renderer bundle.
 */

export type {
  DeliverableKind,
  DistributionPlatform,
  MarketingAssetKind,
  MarketingAssetStatus,
  MediaKind,
  ProjectSortMode,
  ProjectStage,
  ProjectViewMode,
  ReleaseKind
} from './projects.constants'

export {
  ABLETON_SET_EXTENSIONS,
  AUDIO_EXTENSIONS,
  DELIVERABLE_HINT,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABEL,
  DISTRIBUTION_PLATFORM_IDS,
  DISTRIBUTION_PLATFORM_LABEL,
  IMAGE_EXTENSIONS,
  MARKETING_ASSET_KINDS,
  MARKETING_ASSET_KIND_IDS,
  MARKETING_ASSET_STATUSES,
  MARKETING_STATUS_LABEL,
  PIPELINE_STAGES,
  PRIMARY_PLATFORMS,
  PROJECT_SORT_LABEL,
  PROJECT_SORT_MODES,
  PROJECT_STAGES,
  PROJECT_STAGE_IDS,
  PROJECT_VIEW_LABEL,
  PROJECT_VIEW_MODES,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  SCAN_LOG_LIMIT,
  VIDEO_EXTENSIONS,
  classifyExtension,
  createDefaultDistribution,
  createDefaultMarketingPlan,
  createEmptyScanState,
  daysBetweenIsoDates,
  describeOffset,
  evaluateReadiness,
  getMarketingKind,
  getStage,
  isMarketingAssetSettled,
  isMarketingPlanComplete,
  isReleaseReady,
  marketingShortfall,
  nextStage,
  previousStage,
  rescheduleMarketingPlan,
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
  /** The distribution package must be complete to enter this stage. */
  requiresPackage?: boolean
  /** The promotional plan must be complete to enter this stage. */
  requiresPlan?: boolean
}

export interface MarketingAssetKindDefinition {
  id: MarketingAssetKind
  label: string
  purpose: string
  /** Deliverables of this kind owed before the plan is complete. */
  required: number
  /** Default schedule position relative to release day; negative is before. */
  offsetDays: number
  /** Days between successive deliverables of a repeatable kind. */
  stepDays: number
  repeatable: boolean
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
export const DistributionPlatformSchema = z.enum(DISTRIBUTION_PLATFORM_IDS)
export const ReleaseKindSchema = z.enum(RELEASE_KINDS)
export const DeliverableKindSchema = z.enum(DELIVERABLE_KINDS)
export const MarketingAssetKindSchema = z.enum(MARKETING_ASSET_KIND_IDS)
export const MarketingAssetStatusSchema = z.enum(MARKETING_ASSET_STATUSES)

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
 * The three files that actually ship, chosen by the operator from what the scan
 * found. Stored as absolute paths so a selection survives a rescan.
 */
export const DeliverableSelectionSchema = z.object({
  master: z.string().nullable(),
  cover: z.string().nullable(),
  canvas: z.string().nullable()
})
export type DeliverableSelection = z.infer<typeof DeliverableSelectionSchema>

/**
 * A live platform link, entered by hand after release.
 *
 * Manual entry is the current design: one aggregator link that resolves every
 * platform automatically is a later change, and until then a fabricated link is
 * worse than a missing one.
 */
export const LiveLinkSchema = z.object({
  platform: DistributionPlatformSchema,
  /** Free-text label, used when `platform` is `other`. */
  label: z.string(),
  url: z.string(),
  addedAt: z.number()
})
export type LiveLink = z.infer<typeof LiveLinkSchema>

export const DistributionDetailsSchema = z.object({
  title: z.string(),
  primaryArtist: z.string(),
  featuring: z.array(z.string()),
  releaseKind: ReleaseKindSchema,
  releaseDate: IsoDateSchema.nullable(),
  genre: z.string(),
  subGenre: z.string(),
  mood: z.string(),
  language: z.string(),
  explicit: z.boolean(),
  isrc: z.string(),
  upc: z.string(),
  label: z.string(),
  copyright: z.string(),
  credits: z.string(),
  lyrics: z.string(),
  /** Where the release is being submitted. */
  targetPlatforms: z.array(DistributionPlatformSchema),
  /** Where it actually landed, once live. */
  liveLinks: z.array(LiveLinkSchema)
})
export type DistributionDetails = z.infer<typeof DistributionDetailsSchema>

export const MarketingAssetSchema = z.object({
  id: z.string(),
  kind: MarketingAssetKindSchema,
  title: z.string(),
  status: MarketingAssetStatusSchema,
  /** The date this goes out. Read by the scheduling department. */
  scheduledFor: IsoDateSchema.nullable(),
  /** The finished file, once it exists. */
  assetPath: z.string().nullable(),
  /** Where this particular piece is going. */
  platforms: z.array(DistributionPlatformSchema),
  notes: z.string()
})
export type MarketingAsset = z.infer<typeof MarketingAssetSchema>

export const MarketingPlanSchema = z.object({
  assets: z.array(MarketingAssetSchema),
  notes: z.string(),
  startedAt: z.number()
})
export type MarketingPlan = z.infer<typeof MarketingPlanSchema>

/**
 * A project as the registry holds it.
 *
 * Fields divide into two groups with different owners, and the distinction
 * matters when writing: everything under `discovered` belongs to the scanner
 * and is overwritten wholesale on every rescan, while the operator's own work —
 * stage, notes, tags, deliverable selections, distribution, marketing — is
 * never touched by a scan.
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
  deliverables: DeliverableSelectionSchema,
  distribution: DistributionDetailsSchema,
  /** Created when the project first reaches READY FOR RELEASE. */
  marketing: MarketingPlanSchema.nullable(),

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
  title: z.string(),
  primaryArtist: z.string(),
  releaseKind: ReleaseKindSchema,
  releaseDate: IsoDateSchema.nullable(),
  tempo: z.number().nullable(),
  key: MusicalKeySchema.nullable(),
  trackCount: z.number().int().min(0),
  setCount: z.number().int().min(0),
  revisionCount: z.number().int().min(0),
  audioCount: z.number().int().min(0),
  sizeBytes: z.number().min(0),
  missingSampleCount: z.number().int().min(0),
  /** Chosen cover art, for the grid thumbnail. */
  coverPath: z.string().nullable(),
  /** First pinned note, shown inline on cards. */
  pinnedNote: z.string().nullable(),
  /** Readiness requirements met / total. */
  readiness: z.object({ met: z.number().int().min(0), total: z.number().int().min(0) }),
  /** Marketing deliverables settled / required, or null with no plan. */
  marketing: z
    .object({ settled: z.number().int().min(0), required: z.number().int().min(0) })
    .nullable(),
  liveLinkCount: z.number().int().min(0),
  lastTouchedAt: z.number(),
  updatedAt: z.number(),
  missing: z.boolean()
})
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

/**
 * Audio found in the scanned roots that does not belong to any project folder —
 * loose bounces, references, stems exported elsewhere. Surfaced rather than
 * discarded so nothing the operator has made goes uncatalogued.
 */
export const UnlinkedMediaSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  directory: z.string(),
  sizeBytes: z.number().min(0),
  modifiedAt: z.number()
})
export type UnlinkedMedia = z.infer<typeof UnlinkedMediaSchema>

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

// -------------------------------------------------------------------- patches

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
  deliverables: DeliverableSelectionSchema.partial().optional(),
  distribution: DistributionDetailsSchema.partial().optional(),
  marketing: MarketingPlanSchema.nullable().optional(),
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
  /** Matched against name, title, artist and tags. */
  search: z.string().optional(),
  stages: z.array(ProjectStageSchema).optional(),
  tags: z.array(z.string()).optional(),
  favouritesOnly: z.boolean().optional(),
  sort: ProjectSortModeSchema.optional(),
  /** Include projects whose folder has disappeared. Off by default. */
  includeMissing: z.boolean().optional()
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
  unlinkedCount: z.number().int().min(0),
  roots: z.array(z.string())
})
export type ProjectRegistry = z.infer<typeof ProjectRegistrySchema>
