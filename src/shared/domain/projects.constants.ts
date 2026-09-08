import type {
  DistributionDetails,
  MarketingAsset,
  MarketingAssetKindDefinition,
  MarketingPlan,
  ProjectRecord,
  ProjectStageDefinition,
  ReadinessRequirement,
  ScanState
} from './projects'

/**
 * Zod-free half of the projects domain — see boot.constants.ts for why the
 * split exists. The renderer needs the stage table, the platform table and the
 * readiness rules as *values*; it never needs the validators, which run once at
 * the IPC boundary in the main process.
 */

// ------------------------------------------------------------------- stages

/**
 * The production pipeline. Order is meaningful: it drives the board columns,
 * the stage meter and the directional stage-change affordances.
 *
 * `shelved` sits outside the pipeline deliberately. A parked idea is not "less
 * far along" than an idea — it is out of the flow entirely, and folding it into
 * the linear order would make progress readouts lie.
 */
export const PROJECT_STAGE_IDS = [
  'idea',
  'sketch',
  'arrangement',
  'mix',
  'master',
  'ready',
  'scheduled',
  'released',
  'shelved'
] as const

export type ProjectStage = (typeof PROJECT_STAGE_IDS)[number]

export const PROJECT_STAGES: readonly ProjectStageDefinition[] = [
  {
    id: 'idea',
    label: 'IDEA',
    purpose: 'A loop, a sample, a direction. Nothing committed yet.',
    order: 0
  },
  {
    id: 'sketch',
    label: 'SKETCH',
    purpose: 'The core sections exist. Structure is still open.',
    order: 1
  },
  {
    id: 'arrangement',
    label: 'ARRANGEMENT',
    purpose: 'Full-length arrangement committed end to end.',
    order: 2
  },
  {
    id: 'mix',
    label: 'MIX',
    purpose: 'Balance, processing and automation being resolved.',
    order: 3
  },
  {
    id: 'master',
    label: 'MASTER',
    purpose: 'Mixdown bounced; mastering passes in progress.',
    order: 4
  },
  {
    id: 'ready',
    label: 'READY FOR RELEASE',
    purpose: 'Final master, artwork and canvas selected; metadata complete.',
    order: 5,
    requiresPackage: true
  },
  {
    id: 'scheduled',
    label: 'SCHEDULED',
    purpose: 'Release date set and promotional plan in motion.',
    order: 6,
    requiresPackage: true,
    requiresPlan: true
  },
  {
    id: 'released',
    label: 'RELEASED',
    purpose: 'Live on the platforms. Links recorded.',
    order: 7,
    requiresPackage: true,
    requiresPlan: true,
    terminal: true
  },
  {
    id: 'shelved',
    label: 'SHELVED',
    purpose: 'Parked indefinitely. Kept for parts, not for release.',
    order: 8,
    offPipeline: true,
    terminal: true
  }
] as const

/** Stages that form the linear pipeline, in order. Excludes `shelved`. */
export const PIPELINE_STAGES: readonly ProjectStageDefinition[] = PROJECT_STAGES.filter(
  (stage) => !stage.offPipeline
)

export function getStage(id: ProjectStage): ProjectStageDefinition {
  const stage = PROJECT_STAGES.find((entry) => entry.id === id)
  if (!stage) throw new Error(`Unknown project stage: ${id}`)
  return stage
}

/**
 * Progress through the pipeline as a 0..1 ratio, for the stage meter.
 * Off-pipeline stages return 0 rather than a misleading position.
 */
export function stageProgress(id: ProjectStage): number {
  const stage = getStage(id)
  if (stage.offPipeline) return 0
  return stage.order / (PIPELINE_STAGES.length - 1)
}

/** The next stage along the pipeline, or `null` at the end. */
export function nextStage(id: ProjectStage): ProjectStage | null {
  const stage = getStage(id)
  if (stage.offPipeline) return 'idea'
  return PIPELINE_STAGES[stage.order + 1]?.id ?? null
}

/** The previous stage along the pipeline, or `null` at the start. */
export function previousStage(id: ProjectStage): ProjectStage | null {
  const stage = getStage(id)
  if (stage.offPipeline || stage.order === 0) return null
  return PIPELINE_STAGES[stage.order - 1]?.id ?? null
}

// ------------------------------------------------------------------- views

/**
 * `board` is the pipeline kanban. There is deliberately no calendar view here —
 * scheduling lives in its own department so one project's dates can be seen
 * alongside every other project's.
 */
export const PROJECT_VIEW_MODES = ['list', 'grid', 'board'] as const
export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number]

export const PROJECT_VIEW_LABEL: Record<ProjectViewMode, string> = {
  list: 'LIST',
  grid: 'GRID',
  board: 'BOARD'
}

export const PROJECT_SORT_MODES = ['recent', 'name', 'stage', 'revisions', 'size'] as const
export type ProjectSortMode = (typeof PROJECT_SORT_MODES)[number]

export const PROJECT_SORT_LABEL: Record<ProjectSortMode, string> = {
  recent: 'LAST TOUCHED',
  name: 'NAME',
  stage: 'STAGE',
  revisions: 'REVISIONS',
  size: 'SIZE'
}

// ------------------------------------------------------------- file classes

/**
 * Extensions are matched lowercase, with the leading dot. Kept as arrays rather
 * than a regex so the scanner and the renderer can both reason about them —
 * the renderer uses them to label attachments the operator picks by hand.
 */
export const ABLETON_SET_EXTENSIONS = ['.als'] as const

export const AUDIO_EXTENSIONS = [
  '.wav',
  '.aif',
  '.aiff',
  '.flac',
  '.mp3',
  '.m4a',
  '.ogg',
  '.opus',
  '.wma',
  '.alac'
] as const

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'] as const

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm'] as const

/** Directory names never worth walking into. */
export const SCAN_IGNORED_DIRECTORIES = [
  'backup',
  'ableton project info',
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git'
] as const

/** Guards against a mis-selected root (a drive letter) walking the whole disk. */
export const SCAN_MAX_DEPTH = 10

/** Decompressed `.als` XML above this size is indexed by name only. */
export const ALS_MAX_DECOMPRESSED_BYTES = 192 * 1024 * 1024

export type MediaKind = 'set' | 'audio' | 'image' | 'video' | 'other'

export function classifyExtension(fileName: string): MediaKind {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return 'other'
  const ext = fileName.slice(dot).toLowerCase()

  if ((ABLETON_SET_EXTENSIONS as readonly string[]).includes(ext)) return 'set'
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio'
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image'
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video'
  return 'other'
}

// ------------------------------------------------------------- distribution

export const DISTRIBUTION_PLATFORM_IDS = [
  'spotify',
  'apple-music',
  'youtube-music',
  'youtube',
  'soundcloud',
  'bandcamp',
  'tidal',
  'deezer',
  'amazon-music',
  'beatport',
  'audiomack',
  'pandora',
  'shazam',
  'instagram',
  'tiktok',
  'other'
] as const

export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORM_IDS)[number]

export const DISTRIBUTION_PLATFORM_LABEL: Record<DistributionPlatform, string> = {
  spotify: 'SPOTIFY',
  'apple-music': 'APPLE MUSIC',
  'youtube-music': 'YOUTUBE MUSIC',
  youtube: 'YOUTUBE',
  soundcloud: 'SOUNDCLOUD',
  bandcamp: 'BANDCAMP',
  tidal: 'TIDAL',
  deezer: 'DEEZER',
  'amazon-music': 'AMAZON MUSIC',
  beatport: 'BEATPORT',
  audiomack: 'AUDIOMACK',
  pandora: 'PANDORA',
  shazam: 'SHAZAM',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  other: 'OTHER'
}

/** The subset offered first — everything else is behind "more platforms". */
export const PRIMARY_PLATFORMS: readonly DistributionPlatform[] = [
  'spotify',
  'apple-music',
  'youtube-music',
  'soundcloud',
  'bandcamp',
  'tidal'
]

export const RELEASE_KINDS = ['single', 'ep', 'album', 'remix', 'collaboration'] as const
export type ReleaseKind = (typeof RELEASE_KINDS)[number]

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  single: 'SINGLE',
  ep: 'EP',
  album: 'ALBUM',
  remix: 'REMIX',
  collaboration: 'COLLABORATION'
}

/** Deliverables the operator selects from the project's own discovered files. */
export const DELIVERABLE_KINDS = ['master', 'cover', 'canvas'] as const
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]

export const DELIVERABLE_LABEL: Record<DeliverableKind, string> = {
  master: 'FINAL MASTER',
  cover: 'COVER ART',
  canvas: 'CANVAS'
}

export const DELIVERABLE_HINT: Record<DeliverableKind, string> = {
  master: 'The exact audio file that ships. Pick from the bounces found in this project.',
  cover: 'Square artwork, 3000×3000 or larger.',
  canvas: 'Looping vertical video, 9:16, 3–8 seconds.'
}

// -------------------------------------------------------------- marketing

export const MARKETING_ASSET_KIND_IDS = [
  'release-date-reveal',
  'artwork-reveal',
  'promo-video',
  'social-post',
  'pre-release',
  'release-day-video'
] as const

export type MarketingAssetKind = (typeof MARKETING_ASSET_KIND_IDS)[number]

/**
 * The promotional deliverables a release needs before it ships.
 *
 * `offsetDays` is negative for "before the release date" and drives the default
 * schedule. Nothing here is enforced as a date — the operator sets real dates —
 * but seeding sensible offsets means a fresh plan is already in a workable
 * order instead of nine undated rows.
 */
export const MARKETING_ASSET_KINDS: readonly MarketingAssetKindDefinition[] = [
  {
    id: 'release-date-reveal',
    label: 'RELEASE DATE REVEAL',
    purpose: 'Announces the date. The first public signal.',
    required: 1,
    offsetDays: -21,
    stepDays: 0,
    repeatable: false
  },
  {
    id: 'artwork-reveal',
    label: 'ARTWORK REVEAL',
    purpose: 'Cover art unveiled on its own, ahead of the audio.',
    required: 1,
    offsetDays: -14,
    stepDays: 0,
    repeatable: false
  },
  {
    id: 'promo-video',
    label: 'PROMOTION VIDEO',
    purpose: 'Short-form video built around a section of the track.',
    required: 3,
    offsetDays: -10,
    // Spaced so the three required videos do not land on the same day.
    stepDays: 3,
    repeatable: true
  },
  {
    id: 'social-post',
    label: 'SOCIAL CONTENT',
    purpose: 'Stills, quotes, process shots — the connective promotional tissue.',
    required: 1,
    offsetDays: -5,
    stepDays: 2,
    repeatable: true
  },
  {
    id: 'pre-release',
    label: 'PRE-RELEASE',
    purpose: 'Out tomorrow. Posted the day before release.',
    required: 1,
    offsetDays: -1,
    stepDays: 0,
    repeatable: false
  },
  {
    id: 'release-day-video',
    label: 'RELEASE DAY VIDEO',
    purpose: 'It is out. Posted on release day itself.',
    required: 1,
    offsetDays: 0,
    stepDays: 0,
    repeatable: false
  }
] as const

export function getMarketingKind(id: MarketingAssetKind): MarketingAssetKindDefinition {
  const kind = MARKETING_ASSET_KINDS.find((entry) => entry.id === id)
  if (!kind) throw new Error(`Unknown marketing asset kind: ${id}`)
  return kind
}

export const MARKETING_ASSET_STATUSES = [
  'planned',
  'in-progress',
  'ready',
  'scheduled',
  'published'
] as const

export type MarketingAssetStatus = (typeof MARKETING_ASSET_STATUSES)[number]

export const MARKETING_STATUS_LABEL: Record<MarketingAssetStatus, string> = {
  planned: 'PLANNED',
  'in-progress': 'IN PROGRESS',
  ready: 'READY',
  scheduled: 'SCHEDULED',
  published: 'PUBLISHED'
}

/** A deliverable counts as done once it is ready to go out or already has. */
export function isMarketingAssetSettled(status: MarketingAssetStatus): boolean {
  return status === 'ready' || status === 'scheduled' || status === 'published'
}

/**
 * Builds the required deliverable set. Called when a project first reaches
 * READY FOR RELEASE, so the plan appears already populated with what is owed
 * rather than as an empty list the operator has to remember to fill.
 */
export function createDefaultMarketingPlan(releaseDate: string | null = null): MarketingPlan {
  const assets: MarketingAsset[] = []

  for (const kind of MARKETING_ASSET_KINDS) {
    for (let index = 0; index < kind.required; index += 1) {
      const offset = kind.offsetDays + index * kind.stepDays
      assets.push({
        id: `${kind.id}-${index + 1}`,
        kind: kind.id,
        title: kind.required > 1 ? `${kind.label} ${index + 1}` : kind.label,
        status: 'planned',
        scheduledFor: releaseDate ? shiftIsoDate(releaseDate, offset) : null,
        assetPath: null,
        platforms: [],
        notes: ''
      })
    }
  }

  return { assets, notes: '', startedAt: Date.now() }
}

/**
 * Re-dates every unpublished deliverable against a new release date, keeping
 * each one's original distance from release. Used when the operator moves a
 * release: the plan should follow the date, not be rebuilt by hand.
 */
export function rescheduleMarketingPlan(
  plan: MarketingPlan,
  releaseDate: string,
  previousReleaseDate: string | null
): MarketingPlan {
  return {
    ...plan,
    assets: plan.assets.map((asset) => {
      if (asset.status === 'published') return asset

      // Preserve a hand-set distance from release where one can be derived;
      // otherwise fall back to the kind's default offset.
      const offset =
        asset.scheduledFor && previousReleaseDate
          ? daysBetweenIsoDates(previousReleaseDate, asset.scheduledFor)
          : defaultOffsetFor(plan, asset)

      return { ...asset, scheduledFor: shiftIsoDate(releaseDate, offset) }
    })
  }
}

function defaultOffsetFor(plan: MarketingPlan, asset: MarketingAsset): number {
  const kind = getMarketingKind(asset.kind)
  const index = plan.assets.filter((entry) => entry.kind === asset.kind).indexOf(asset)
  return kind.offsetDays + Math.max(index, 0) * kind.stepDays
}

/** Deliverables still owed, per kind, for the plan-completion readout. */
export function marketingShortfall(
  plan: MarketingPlan
): { kind: MarketingAssetKind; owed: number }[] {
  return MARKETING_ASSET_KINDS.map((kind) => {
    const settled = plan.assets.filter(
      (asset) => asset.kind === kind.id && isMarketingAssetSettled(asset.status)
    ).length
    return { kind: kind.id, owed: Math.max(kind.required - settled, 0) }
  }).filter((entry) => entry.owed > 0)
}

export function isMarketingPlanComplete(plan: MarketingPlan | null): boolean {
  if (!plan) return false
  return marketingShortfall(plan).length === 0
}

// -------------------------------------------------------------- readiness

/**
 * What a project owes before it can be called ready.
 *
 * Returned as data rather than a boolean so the UI can show *which* item is
 * missing. An honest checklist is more useful than a disabled button.
 */
export function evaluateReadiness(project: ProjectRecord): ReadinessRequirement[] {
  const { distribution, deliverables } = project

  return [
    {
      id: 'master',
      label: 'Final master selected',
      met: deliverables.master !== null,
      hint: 'Choose the exact audio file that ships from the bounces in this project.'
    },
    {
      id: 'cover',
      label: 'Cover art selected',
      met: deliverables.cover !== null,
      hint: 'Square artwork, 3000×3000 or larger.'
    },
    {
      id: 'canvas',
      label: 'Canvas selected',
      met: deliverables.canvas !== null,
      hint: 'Looping 9:16 video, 3–8 seconds.'
    },
    {
      id: 'title',
      label: 'Release title and primary artist',
      met: distribution.title.trim().length > 0 && distribution.primaryArtist.trim().length > 0
    },
    {
      id: 'genre',
      label: 'Genre recorded',
      met: distribution.genre.trim().length > 0
    },
    {
      id: 'credits',
      label: 'Copyright and credit lines',
      met: distribution.copyright.trim().length > 0
    },
    {
      id: 'platforms',
      label: 'At least one target platform',
      met: distribution.targetPlatforms.length > 0
    },
    {
      id: 'date',
      label: 'Release date set',
      met: distribution.releaseDate !== null
    }
  ]
}

export function isReleaseReady(project: ProjectRecord): boolean {
  return evaluateReadiness(project).every((requirement) => requirement.met)
}

// ------------------------------------------------------------------ dates

/**
 * Dates are handled as plain `YYYY-MM-DD` strings throughout.
 *
 * A release date is a calendar date, not an instant: a track out on the 14th is
 * out on the 14th regardless of where the operator is. Storing these as `Date`
 * would drag them across a day boundary the moment a timezone changed, so the
 * arithmetic below works in UTC on date-only values.
 */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return toIsoDate(parsed)
}

export function daysBetweenIsoDates(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** `-3` → `3 DAYS BEFORE`, `0` → `RELEASE DAY`. */
export function describeOffset(days: number): string {
  if (days === 0) return 'RELEASE DAY'
  const magnitude = Math.abs(days)
  const unit = magnitude === 1 ? 'DAY' : 'DAYS'
  return days < 0 ? `${magnitude} ${unit} BEFORE` : `${magnitude} ${unit} AFTER`
}

// ------------------------------------------------------------------ factories

export function createDefaultDistribution(name: string): DistributionDetails {
  return {
    title: name,
    primaryArtist: '',
    featuring: [],
    releaseKind: 'single',
    releaseDate: null,
    genre: '',
    subGenre: '',
    mood: '',
    language: 'en',
    explicit: false,
    isrc: '',
    upc: '',
    label: '',
    copyright: '',
    credits: '',
    lyrics: '',
    targetPlatforms: [],
    liveLinks: []
  }
}

export function createEmptyScanState(): ScanState {
  return {
    phase: 'idle',
    roots: [],
    currentPath: null,
    directoriesVisited: 0,
    filesSeen: 0,
    projectsFound: 0,
    setsParsed: 0,
    setsReused: 0,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    error: null,
    log: []
  }
}

/** Maximum scan log entries retained and shipped with each progress event. */
export const SCAN_LOG_LIMIT = 120
