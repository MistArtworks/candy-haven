import type {
  ProjectRecord,
  ProjectStageDefinition,
  ReadinessRequirement,
  ScanState
} from './projects'

/**
 * Zod-free half of the projects domain — see boot.constants.ts for why the
 * split exists. The renderer needs the stage table, the category table and the
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
  /*
   * The gate into the catalogue, and no longer the end of the pipeline.
   *
   * This is the stage that makes a project linkable in DISCOGRAPHY — the
   * department's project picker offers exactly this stage and the one after
   * it, because a track on a release is finished work.
   *
   * **`requiresMaster` deliberately does not sit here**, and where it sits
   * instead is the whole point. It moved one stage later, onto `released`.
   *
   * Gating TRACK READY on a final master deadlocks the arrangement: this stage
   * is what makes a project linkable, so requiring a file here while the file
   * could only be chosen from a linked release means needing a release to get
   * a master and a master to get a release. Gating RELEASED does not, because
   * by then the project is already linkable and the pick has somewhere to
   * happen — the dossier's own FINAL MASTER panel, live from this stage on.
   *
   * So TRACK READY stays what every other stage here is: the operator's own
   * statement about the work, not a claim the app audits.
   */
  {
    id: 'ready',
    label: 'TRACK READY',
    purpose: 'Finished, and ready to be put out. Linkable in DISCOGRAPHY.',
    order: 5
  },
  /*
   * Out in the world, and the one stage this application audits.
   *
   * `requiresMaster` means a project cannot claim to be released until
   * `masters.final` names the bounce that went out. That is not bookkeeping:
   * the catalogue's entire purpose is to be able to answer "which file was
   * that", and a release whose source nobody recorded is the one question the
   * archive exists to stop being unanswerable.
   *
   * Usually not set by hand. DISCOGRAPHY writes it: flipping a release to
   * RELEASED moves every project linked to one of its tracks here, with a
   * history note naming the release, and moving that release back returns them
   * to TRACK READY. See `reconcileLinkedStages` in the discography service —
   * which refuses the status flip outright if any linked project has no final
   * master, rather than leaving the two records disagreeing.
   *
   * Still settable directly, because a back catalogue that predates this
   * application has no entry to be moved by — and refusing the operator the
   * stage that describes their own released work would be absurd. The gate
   * applies to that path too.
   */
  {
    id: 'released',
    label: 'RELEASED',
    purpose: 'Out in the world. Needs the final master named.',
    order: 6,
    requiresMaster: true,
    terminal: true
  },
  {
    id: 'shelved',
    label: 'SHELVED',
    purpose: 'Parked indefinitely. Kept for parts, not for release.',
    order: 7,
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

// --------------------------------------------------------------- categories

/**
 * What a project *is*.
 *
 * Three of these — `album`, `ep`, `compilation` — describe something larger
 * than one set, so choosing them is only half a statement: the project must
 * also be attached to a VOLUME of the same kind, which is the object that says
 * *which* album it belongs to. See volumes.constants.ts. The remaining four
 * stand alone and need nothing further.
 */
export const PROJECT_CATEGORIES = [
  'single',
  'ep',
  'album',
  'compilation',
  'remix',
  'bootleg',
  'experimental',
  'beat-battle'
] as const

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]

export const PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = {
  single: 'SINGLE',
  ep: 'EP',
  album: 'ALBUM',
  compilation: 'COMPILATION',
  remix: 'REMIX',
  bootleg: 'BOOTLEG',
  experimental: 'EXPERIMENTAL',
  'beat-battle': 'BEAT BATTLE'
}

export const PROJECT_CATEGORY_PURPOSE: Record<ProjectCategory, string> = {
  single: 'Stands alone. The default for anything not part of a larger work.',
  ep: 'One track of an EP.',
  album: 'One track of an album.',
  compilation: 'One track of a compilation.',
  remix: 'Somebody else’s work, rebuilt — or yours, rebuilt by somebody else.',
  bootleg: 'An unofficial edit or flip. Stands alone.',
  experimental: 'A test, a study, a technique. Not aimed at release.',
  'beat-battle': 'Made to a brief, against a clock.'
}

/*
 * The volume invariant is gone, and its absence is the point.
 *
 * `VOLUME_BOUND_CATEGORIES` and `requiresVolume()` enforced that a project
 * categorised `album`, `ep` or `compilation` was attached to a volume of that
 * same kind, reconciled in the service so the two could not disagree.
 *
 * There is nothing left to reconcile against. Volumes became the DISCOGRAPHY
 * (decision D2), and a release's tracklist lives on the *release* because a
 * track need not have a project at all — so a project can no longer see what
 * it is a track of, and an invariant it cannot evaluate is not an invariant.
 *
 * Category therefore becomes what it always read as: the operator's own label
 * on the work. Nothing enforces it against the catalogue, and nothing should
 * — a project can legitimately be categorised `album` for a year before the
 * album it belongs to has an entry.
 */

// ------------------------------------------------------------------ masters

/**
 * How the operator classifies the audio their project produced.
 *
 * Every bounce stays loose in the project folder; what gives one meaning is a
 * mark made here, against the audio the scanner already found. This replaced
 * six scaffold folders — WIPS, MIX & MASTER and the rest — which sorted the
 * same files by location and which nothing in the app ever read. Classifying
 * by declaration rather than by which directory a file was dragged into is the
 * one arrangement that cannot drift out of step with what the operator meant.
 *
 * WIP and MASTER are mutually exclusive: a file is an in-progress bounce or a
 * finished master, and something claiming to be both makes neither list worth
 * reading. The final is not a third bucket but a single designation on top, and
 * it may point at any audio file in the project — including one already marked.
 */
export const AUDIO_MARKS = ['wip', 'mix', 'master'] as const
export type AudioMark = (typeof AUDIO_MARKS)[number]

/**
 * Whether the dossier asks which bounce is the finished master at this stage.
 *
 * True from TRACK READY on. Before that there is nothing to answer — the
 * finished bounce does not exist at MIX, and asking would put a permanently
 * empty panel on every project in the department, which is the clutter the
 * dossier has been cut back twice to avoid.
 *
 * Deliberately the same set as `LINKABLE_PROJECT_STAGES`, and not expressed in
 * terms of it. They agree because both mean "the work is finished", but they
 * answer different questions — one gates the catalogue, one draws a panel —
 * and tying the ARCHIVE's layout to a DISCOGRAPHY constant would make a change
 * to either silently move the other.
 */
export function namesMaster(stage: ProjectStage): boolean {
  const definition = getStage(stage)
  return !definition.offPipeline && definition.order >= getStage('ready').order
}

/*
 * The vocabulary around these marks has gone, and the marks themselves stay.
 *
 * `AUDIO_MARK_LABEL`, `AUDIO_MARK_HINT`, `AUDIO_MARK_STAGE`, `marksAudio` and
 * `FINAL_SOURCE_MARKS` existed only to draw the dossier's MIX AND MASTER
 * panel, which has been removed: the operator no longer classifies bounces or
 * promotes one of them, because the file that ships is now picked on the
 * DISCOGRAPHY track that ships it.
 *
 * `AUDIO_MARKS` and `MasterSelectionSchema` are **not** deleted. Every mark
 * the operator has already made is still in the database, and deleting the
 * type that describes it would turn that data into three anonymous string
 * arrays. A respecified master workflow reads it back; nothing is lost in the
 * meantime.
 */

// ------------------------------------------------------------------- views

/**
 * How whatever is in scope gets drawn.
 *
 * `grid` is the icons view, and in the STACKS lens it is the one that matters:
 * there it draws folders and projects into a *single* tile grid, the way a file
 * browser does, rather than tiles above a table. Projects are objects you open,
 * not rows you scan, and the operator asked for them to look like it.
 *
 * `board` is the pipeline kanban. There is deliberately no calendar view here —
 * a project's dates belong to its release, not to the register.
 */
export const PROJECT_VIEW_MODES = ['list', 'grid', 'board'] as const
export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number]

export const PROJECT_VIEW_LABEL: Record<ProjectViewMode, string> = {
  list: 'LIST',
  grid: 'ICONS',
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

// -------------------------------------------------------------- readiness

/**
 * What a project owes before it can be called ready.
 *
 * Returned as data rather than a boolean so the UI can show *which* item is
 * missing. An honest checklist is more useful than a disabled button.
 *
 * Much shorter than it used to be, and deliberately so: this list once checked
 * ISRCs, copyright lines and target platforms, all of which now belong to a
 * release rather than to the project that feeds it. What remains is the set of
 * things that are true of the *work* — it has a final master, and if it claims
 * to be part of something larger, that something exists.
 */
export function evaluateReadiness(project: ProjectRecord): ReadinessRequirement[] {
  return [
    {
      id: 'filed',
      label: 'Filed on a shelf',
      met: project.folderId !== null,
      hint: 'Drag it onto a shelf, or right-click and choose where it belongs.'
    }
    /*
     * A second requirement stood here: a final mix and master had to be
     * selected. It has gone with the pick itself, which now lives on the
     * DISCOGRAPHY track — see the note on the `ready` stage above for why
     * keeping it would have deadlocked the catalogue.
     *
     * Being filed is the only thing left that the *work* owes, and it earns
     * its place: an unfiled project is one the operator cannot find twice.
     */
    /*
     * There used to be a third requirement here: a track categorised as part
     * of a larger work had to name which volume. It is gone with volumes.
     *
     * Nothing replaces it, deliberately. Appearing in the DISCOGRAPHY is not
     * a condition of a track being *finished* — a master is finished the
     * moment it is chosen, and whether a label has scheduled it is a fact
     * about the release, which has its own status for exactly that. Gating
     * TRACK READY on a catalogue entry would make the pipeline wait on
     * somebody else's calendar.
     */
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

// ---------------------------------------------------------------- factories

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
