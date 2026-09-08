import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { nativeImage } from 'electron'
import type { AnyBulkWriteOperation } from 'mongodb'
import type {
  AbletonAnalysis,
  MarketingAsset,
  MarketingPlan,
  NoteDraft,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ProjectStage,
  ProjectSummary,
  ScanLogEntry,
  ScanState,
  UnlinkedMedia
} from '@shared/domain/projects'
import {
  PROJECT_STAGE_IDS,
  SCAN_LOG_LIMIT,
  createDefaultDistribution,
  createDefaultMarketingPlan,
  createEmptyScanState,
  evaluateReadiness,
  getMarketingKind,
  getStage,
  isMarketingAssetSettled,
  isReleaseReady,
  rescheduleMarketingPlan
} from '@shared/domain/projects.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { TypedEmitter } from '@main/core/emitter'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import { ProjectsRepository, type ProjectDocument } from './projects.repository'
import { cleanProjectName, scanRoots, type ScannedProject } from './scanner'

const logger = getLogger('projects')

/** Progress events are coalesced to this cadence so a scan cannot flood IPC. */
const PROGRESS_INTERVAL_MS = 120

/** Thumbnails are decoded on demand and cached; bounded to keep memory flat. */
const THUMBNAIL_CACHE_LIMIT = 240

interface ProjectsEvents {
  scan: ScanState
}

/**
 * Owns the project registry: what exists on disk, what the operator has said
 * about it, and where each project sits in the production pipeline.
 *
 * The central rule here is the ownership split. The scanner owns everything
 * discovered from the filesystem and overwrites it on every rescan. The
 * operator owns stage, notes, tags, deliverable selections, distribution
 * metadata and the promotional plan, and a scan never touches those — a rescan
 * after moving a sample must not be able to lose a release's metadata.
 */
export class ProjectsService extends TypedEmitter<ProjectsEvents> {
  private scanState: ScanState = createEmptyScanState()
  private inFlight: AbortController | null = null
  private lastProgressAt = 0
  private readonly thumbnails = new Map<string, { modifiedAt: number; dataUrl: string }>()

  constructor(private readonly archive: ArchiveService) {
    super()
  }

  get scan(): ScanState {
    return this.scanState
  }

  private get repository(): ProjectsRepository {
    return new ProjectsRepository(this.archive.getDb())
  }

  // ------------------------------------------------------------------ reading

  async getRegistry(query: ProjectQuery = {}): Promise<ProjectRegistry> {
    const repository = this.repository
    const records = await repository.listAll()

    const stageCounts = Object.fromEntries(PROJECT_STAGE_IDS.map((stage) => [stage, 0])) as Record<
      ProjectStage,
      number
    >

    const tags = new Set<string>()

    for (const record of records) {
      // Counts describe the whole registry, not the filtered view — the board
      // column headers should not change as the operator types in the search.
      stageCounts[record.stage] += 1
      for (const tag of record.tags) tags.add(tag)
    }

    const projects = sortSummaries(
      records.filter((record) => matches(record, query)).map(toSummary),
      query.sort ?? 'recent'
    )

    return {
      projects,
      scan: this.scanState,
      tags: [...tags].sort((a, b) => a.localeCompare(b)),
      stageCounts,
      unlinkedCount: await repository.countUnlinked(),
      roots: this.scanState.roots
    }
  }

  async get(id: string): Promise<ProjectRecord> {
    const record = await this.repository.findById(id)
    if (!record) {
      throw new AppError('That project is no longer in the registry.', {
        code: ErrorCode.NotFound,
        hint: 'Run a scan to re-index the configured roots.',
        recoverable: true
      })
    }
    return record
  }

  listUnlinked(limit = 200): Promise<UnlinkedMedia[]> {
    return this.repository.listUnlinked(limit)
  }

  // -------------------------------------------------------------------- scan

  /**
   * Indexes the configured roots.
   *
   * Cheap enough to run on every launch because it is incremental. The
   * directory walk is always performed in full, so additions, deletions,
   * renames and moves are exact — that part costs tens of milliseconds. What
   * is skipped is the expensive half: a set whose modification time and size
   * are unchanged is served from its stored analysis instead of being
   * decompressed and re-read, which on the development library is the
   * difference between ~1.4 s and ~30 ms.
   *
   * There is deliberately no filesystem watcher. Live rewrites its set file on
   * every save, so a watcher would re-read a 30 MB XML document every few
   * minutes while the operator is working — the exact moment the machine is
   * needed elsewhere.
   *
   * `force` re-reads every set regardless, for when the reader itself has
   * changed and cached analyses were produced by an older version of it.
   */
  async runScan(roots: readonly string[], force = false): Promise<ScanState> {
    if (this.inFlight) {
      throw new AppError('A scan is already running.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (roots.length === 0) {
      throw new AppError('No project roots are configured.', {
        code: ErrorCode.Validation,
        hint: 'Add at least one Ableton project directory in Regulation.',
        recoverable: false
      })
    }

    // Fail before walking the disk rather than after, so a scan that cannot be
    // persisted does not cost the operator minutes first.
    const repository = this.repository
    const controller = new AbortController()
    this.inFlight = controller

    const startedAt = Date.now()
    this.scanState = {
      ...createEmptyScanState(),
      phase: 'walking',
      roots: [...roots],
      startedAt
    }
    this.log('info', `Scanning ${roots.length} root${roots.length === 1 ? '' : 's'}`)

    try {
      /*
       * The registry is loaded once and used for two things: the analysis cache
       * below, and reconciliation afterwards. Reading it twice would be the
       * only remaining per-scan cost worth naming.
       */
      const existing = await repository.listAll()
      const cache = force ? null : buildAnalysisCache(existing)

      const result = await scanRoots(roots, {
        signal: controller.signal,
        onPhase: (phase) => this.patch({ phase }),
        reuseAnalysis: cache
          ? (set) => {
              const stored = cache.get(set.path.toLowerCase())
              if (!stored) return null
              // Modification time *and* size: a save that happens to land on
              // the same millisecond almost never lands on the same byte count.
              const unchanged =
                stored.modifiedAt === set.modifiedAt && stored.sizeBytes === set.sizeBytes
              return unchanged ? stored.analysis : null
            }
          : undefined,
        onWarning: (message) => this.log('warn', message),
        onProgress: (progress) => {
          this.patch(
            {
              currentPath: progress.currentPath,
              directoriesVisited: progress.directoriesVisited,
              filesSeen: progress.filesSeen,
              projectsFound: progress.projectsFound
            },
            { throttle: true }
          )
        }
      })

      this.patch({
        phase: 'persisting',
        currentPath: null,
        directoriesVisited: result.directoriesVisited,
        filesSeen: result.filesSeen,
        projectsFound: result.projects.length,
        setsParsed: result.setsParsed,
        setsReused: result.setsReused
      })

      const reconciled = await this.reconcile(repository, existing, result.projects, roots)
      await repository.replaceUnlinked(result.unlinked)

      this.log(
        'info',
        `${reconciled.created} new, ${reconciled.updated} updated, ${reconciled.missing} missing, ` +
          `${result.unlinked.length} unlinked audio file${result.unlinked.length === 1 ? '' : 's'}`
      )
      this.log(
        'info',
        `${result.setsParsed} set${result.setsParsed === 1 ? '' : 's'} read, ` +
          `${result.setsReused} unchanged`
      )

      const finishedAt = Date.now()
      this.patch({
        phase: 'done',
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: null
      })
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError'
      const message = cancelled
        ? 'Scan cancelled.'
        : error instanceof Error
          ? error.message
          : String(error)

      this.log(cancelled ? 'warn' : 'error', message)
      const finishedAt = Date.now()
      this.patch({
        phase: cancelled ? 'idle' : 'error',
        currentPath: null,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: cancelled ? null : message
      })

      if (!cancelled) logger.error('Scan failed', error)
    } finally {
      this.inFlight = null
    }

    return this.scanState
  }

  cancelScan(): ScanState {
    this.inFlight?.abort()
    return this.scanState
  }

  /**
   * Merges a scan result into the registry.
   *
   * Three cases, in priority order: a folder already registered at that path is
   * updated in place; a folder that looks like a registered project which has
   * moved is relinked to its existing record, carrying the operator's work
   * with it; anything else is a new project.
   */
  private async reconcile(
    repository: ProjectsRepository,
    existing: readonly ProjectRecord[],
    scanned: readonly ScannedProject[],
    roots: readonly string[]
  ): Promise<{ created: number; updated: number; missing: number }> {
    const byPath = new Map(existing.map((record) => [record.path.toLowerCase(), record]))
    const scannedPaths = new Set(scanned.map((project) => project.path.toLowerCase()))
    const seenIds = new Set<string>()
    const operations: AnyBulkWriteOperation<ProjectDocument>[] = []

    let created = 0
    let updated = 0

    for (const project of scanned) {
      const now = Date.now()
      const match =
        byPath.get(project.path.toLowerCase()) ??
        findRelinked(project, existing, seenIds, scannedPaths)

      if (match) {
        seenIds.add(match.id)
        if (match.path.toLowerCase() !== project.path.toLowerCase()) {
          this.log('info', `Relinked ${match.name} to ${project.path}`)
        }

        operations.push({
          updateOne: {
            filter: { _id: match.id },
            update: { $set: { ...discoveredFields(project, now), path: project.path } }
          }
        })
        updated += 1
        continue
      }

      const record = this.createRecord(project, now)
      const { id, ...document } = record
      operations.push({ insertOne: { document: { _id: id, ...document } } })
      created += 1
    }

    /*
     * Only projects that live under a root we just walked can be declared
     * missing. Without that restriction, removing a root from settings would
     * mark every project it contained as gone — which reads as data loss to the
     * operator even though the records are intact.
     */
    const walkedRoots = roots.map((root) => root.toLowerCase())
    const missingRecords = existing.filter(
      (record) =>
        !seenIds.has(record.id) &&
        !record.missing &&
        walkedRoots.some((root) => record.path.toLowerCase().startsWith(root))
    )

    for (const record of missingRecords) {
      operations.push({
        updateOne: {
          filter: { _id: record.id },
          update: { $set: { missing: true, updatedAt: Date.now() } }
        }
      })
      this.log('warn', `${record.name} no longer exists at ${record.path}`)
    }

    await repository.writeMany(operations)
    return { created, updated, missing: missingRecords.length }
  }

  private createRecord(project: ScannedProject, now: number): ProjectRecord {
    return {
      id: randomUUID(),
      stage: 'idea',
      stageHistory: [{ stage: 'idea', at: now, note: 'Registered by scan' }],
      tags: [],
      favourite: false,
      notes: [],
      deliverables: { master: null, cover: null, canvas: null },
      distribution: createDefaultDistribution(project.name),
      marketing: null,
      createdAt: now,
      ...discoveredFields(project, now),
      path: project.path
    }
  }

  // ------------------------------------------------------------------ writing

  /**
   * Applies an operator edit.
   *
   * Read-modify-write rather than a targeted `$set`, because several of these
   * fields interact: a stage change is gated on readiness, reaching READY
   * seeds the promotional plan, and moving the release date re-dates every
   * unpublished deliverable. Expressing that as one transition over a whole
   * record keeps those rules in one readable place, and the registry is small
   * enough that the extra read costs nothing.
   */
  async patchProject(id: string, patch: ProjectPatch): Promise<ProjectRecord> {
    const current = await this.get(id)
    let next: ProjectRecord = { ...current, updatedAt: Date.now() }

    if (patch.tags) next.tags = normaliseTags(patch.tags)
    if (patch.favourite !== undefined) next.favourite = patch.favourite

    if (patch.deliverables) {
      next.deliverables = { ...next.deliverables, ...patch.deliverables }
    }

    if (patch.primarySetPath) {
      const known = next.sets.some((set) => set.path === patch.primarySetPath)
      if (!known) {
        throw new AppError('That set does not belong to this project.', {
          code: ErrorCode.Validation,
          recoverable: false
        })
      }
      next.sets = next.sets.map((set) => ({ ...set, isPrimary: set.path === patch.primarySetPath }))
    }

    if (patch.distribution) {
      const previousReleaseDate = next.distribution.releaseDate
      next.distribution = { ...next.distribution, ...patch.distribution }

      const nextReleaseDate = next.distribution.releaseDate
      if (nextReleaseDate && nextReleaseDate !== previousReleaseDate && next.marketing) {
        // The plan follows the release date. Rebuilding it by hand after a date
        // move is exactly the kind of bookkeeping this section exists to remove.
        next.marketing = rescheduleMarketingPlan(
          next.marketing,
          nextReleaseDate,
          previousReleaseDate
        )
      }
    }

    if (patch.marketing !== undefined) next.marketing = patch.marketing

    if (patch.stage && patch.stage !== next.stage) {
      next = this.applyStageChange(next, patch.stage, patch.stageNote ?? null)
    }

    next = seedMarketingPlan(next)

    await this.repository.replace(next)
    return next
  }

  /**
   * Enforces the gates on entering a stage.
   *
   * READY is deliberately open: it is where the distribution package gets
   * filled in, so requiring the package to enter it would be circular. SCHEDULED
   * and RELEASED are closed until the package is complete — a release with no
   * master or no date is not schedulable, and letting it through would mean the
   * pipeline no longer describes reality.
   */
  private applyStageChange(
    record: ProjectRecord,
    stage: ProjectStage,
    note: string | null
  ): ProjectRecord {
    const definition = getStage(stage)

    if ((stage === 'scheduled' || stage === 'released') && !isReleaseReady(record)) {
      const outstanding = evaluateReadiness(record).filter((requirement) => !requirement.met)
      throw new AppError(`${definition.label} needs the distribution package completed first.`, {
        code: ErrorCode.Validation,
        hint: `Outstanding: ${outstanding.map((item) => item.label).join(', ')}.`,
        recoverable: false
      })
    }

    return {
      ...record,
      stage,
      stageHistory: [...record.stageHistory, { stage, at: Date.now(), note }]
    }
  }

  // -------------------------------------------------------------------- notes

  async addNote(id: string, draft: NoteDraft): Promise<ProjectRecord> {
    const body = draft.body.trim()
    if (!body) {
      throw new AppError('A note needs some text.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const record = await this.get(id)
    const now = Date.now()
    const next: ProjectRecord = {
      ...record,
      updatedAt: now,
      notes: [
        { id: randomUUID(), body, pinned: draft.pinned ?? false, createdAt: now, updatedAt: now },
        ...record.notes
      ]
    }

    await this.repository.replace(next)
    return next
  }

  async updateNote(id: string, noteId: string, draft: NoteDraft): Promise<ProjectRecord> {
    const record = await this.get(id)
    if (!record.notes.some((note) => note.id === noteId)) {
      throw new AppError('That note no longer exists.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    const now = Date.now()
    const next: ProjectRecord = {
      ...record,
      updatedAt: now,
      notes: record.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              body: draft.body,
              pinned: draft.pinned ?? note.pinned,
              updatedAt: now
            }
          : note
      )
    }

    await this.repository.replace(next)
    return next
  }

  async deleteNote(id: string, noteId: string): Promise<ProjectRecord> {
    const record = await this.get(id)
    const next: ProjectRecord = {
      ...record,
      updatedAt: Date.now(),
      notes: record.notes.filter((note) => note.id !== noteId)
    }

    await this.repository.replace(next)
    return next
  }

  // ---------------------------------------------------------------- marketing

  async upsertMarketingAsset(id: string, asset: MarketingAsset): Promise<ProjectRecord> {
    const record = await this.get(id)
    const plan: MarketingPlan =
      record.marketing ?? createDefaultMarketingPlan(record.distribution.releaseDate)

    const exists = plan.assets.some((entry) => entry.id === asset.id)
    const next: ProjectRecord = {
      ...record,
      updatedAt: Date.now(),
      marketing: {
        ...plan,
        assets: exists
          ? plan.assets.map((entry) => (entry.id === asset.id ? asset : entry))
          : [...plan.assets, asset]
      }
    }

    await this.repository.replace(next)
    return next
  }

  /**
   * Adds another deliverable of a repeatable kind.
   *
   * The id is derived from the count rather than a UUID so the plan reads as
   * "PROMOTION VIDEO 4" — the operator thinks in ordered deliverables, not
   * opaque identifiers.
   */
  async addMarketingAsset(id: string, kind: MarketingAsset['kind']): Promise<ProjectRecord> {
    const record = await this.get(id)
    const definition = getMarketingKind(kind)
    const plan: MarketingPlan =
      record.marketing ?? createDefaultMarketingPlan(record.distribution.releaseDate)

    if (!definition.repeatable && plan.assets.some((asset) => asset.kind === kind)) {
      throw new AppError(`${definition.label} is a single deliverable.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const ordinal = plan.assets.filter((asset) => asset.kind === kind).length + 1

    return this.upsertMarketingAsset(id, {
      id: `${kind}-${ordinal}`,
      kind,
      title: `${definition.label} ${ordinal}`,
      status: 'planned',
      scheduledFor: null,
      assetPath: null,
      platforms: [],
      notes: ''
    })
  }

  async removeMarketingAsset(id: string, assetId: string): Promise<ProjectRecord> {
    const record = await this.get(id)
    if (!record.marketing) return record

    const next: ProjectRecord = {
      ...record,
      updatedAt: Date.now(),
      marketing: {
        ...record.marketing,
        assets: record.marketing.assets.filter((asset) => asset.id !== assetId)
      }
    }

    await this.repository.replace(next)
    return next
  }

  // ------------------------------------------------------------------ removal

  /** Drops a record whose folder is gone. Only permitted for missing projects. */
  async forget(id: string): Promise<void> {
    const record = await this.get(id)
    if (!record.missing) {
      throw new AppError('That project still exists on disk.', {
        code: ErrorCode.Validation,
        hint: 'Only projects whose folder has disappeared can be removed from the registry.',
        recoverable: false
      })
    }

    await this.repository.deleteById(id)
  }

  // --------------------------------------------------------------- thumbnails

  /**
   * Decodes an image to a data URL for the renderer.
   *
   * The renderer's CSP allows `img-src 'self' data:` and nothing else, so a
   * `file://` src would be blocked — correctly, since loosening it for artwork
   * would give a compromised renderer read access to the disk. Electron's
   * `nativeImage` does the decode and downscale with no added dependency.
   */
  async thumbnail(path: string, width: number): Promise<string | null> {
    let modifiedAt: number
    try {
      modifiedAt = (await stat(path)).mtimeMs
    } catch {
      return null
    }

    const key = `${path}@${width}`
    const cached = this.thumbnails.get(key)
    if (cached && cached.modifiedAt === modifiedAt) return cached.dataUrl

    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return null

    const resized = image.getSize().width > width ? image.resize({ width, quality: 'good' }) : image
    const dataUrl = resized.toDataURL()

    if (this.thumbnails.size >= THUMBNAIL_CACHE_LIMIT) {
      // Oldest insertion first — Map preserves order, and artwork is browsed
      // in roughly the order the register lists it.
      const oldest = this.thumbnails.keys().next().value
      if (oldest !== undefined) this.thumbnails.delete(oldest)
    }
    this.thumbnails.set(key, { modifiedAt, dataUrl })

    return dataUrl
  }

  dispose(): void {
    this.inFlight?.abort()
    this.inFlight = null
    this.thumbnails.clear()
    this.clear()
  }

  // ------------------------------------------------------------------ private

  private patch(partial: Partial<ScanState>, options: { throttle?: boolean } = {}): void {
    this.scanState = { ...this.scanState, ...partial }

    if (options.throttle) {
      const now = Date.now()
      if (now - this.lastProgressAt < PROGRESS_INTERVAL_MS) return
      this.lastProgressAt = now
    }

    this.emit('scan', this.scanState)
  }

  private log(level: ScanLogEntry['level'], message: string): void {
    const entry: ScanLogEntry = { at: Date.now(), level, message }
    // The log rides on the state, as with the boot snapshot, so a view that
    // opens mid-scan receives the whole history in one payload.
    const log = [...this.scanState.log, entry].slice(-SCAN_LOG_LIMIT)
    this.patch({ log })
  }
}

// -------------------------------------------------------------------- helpers

interface CachedAnalysis {
  modifiedAt: number
  sizeBytes: number
  analysis: AbletonAnalysis
}

/**
 * Indexes every set analysis already on file, keyed by the set's path.
 *
 * Keyed on the full path rather than on a project id, which also handles the
 * moved-project case correctly: a relocated folder produces different set paths,
 * so nothing matches and its sets are re-read — which they must be, because the
 * sample locations recorded in the stored analysis were resolved relative to
 * the old location.
 */
function buildAnalysisCache(records: readonly ProjectRecord[]): Map<string, CachedAnalysis> {
  const cache = new Map<string, CachedAnalysis>()

  for (const record of records) {
    for (const set of record.sets) {
      // A partial read is not worth caching — the next scan should retry it.
      if (!set.analysis || set.analysis.parseError) continue

      /*
       * Analyses written before this build are missing fields the schema now
       * fills with defaults, so they parse but carry no real values. Declining
       * to cache those makes the next scan re-read them, which heals the
       * registry without the operator having to know to force a full re-read.
       *
       * `samplePaths` is the marker: it is populated for every set that
       * references any sample, so empty-but-nonzero means the analysis predates
       * the field.
       */
      if (set.analysis.sampleCount > 0 && set.analysis.samplePaths.length === 0) continue

      cache.set(set.path.toLowerCase(), {
        modifiedAt: set.modifiedAt,
        sizeBytes: set.sizeBytes,
        analysis: set.analysis
      })
    }
  }

  return cache
}

/** The scanner's half of a record. Overwritten wholesale on every rescan. */
function discoveredFields(
  project: ScannedProject,
  now: number
): Omit<
  ProjectRecord,
  | 'id'
  | 'path'
  | 'stage'
  | 'stageHistory'
  | 'tags'
  | 'favourite'
  | 'notes'
  | 'deliverables'
  | 'distribution'
  | 'marketing'
  | 'createdAt'
> {
  return {
    name: project.name,
    folderName: project.folderName,
    sets: project.sets,
    revisions: project.revisions,
    audio: project.audio,
    images: project.images,
    videos: project.videos,
    sampleFileCount: project.sampleFileCount,
    sizeBytes: project.sizeBytes,
    missingSamples: project.missingSamples,
    lastTouchedAt: project.lastTouchedAt,
    scannedAt: now,
    missing: false,
    updatedAt: now
  }
}

/**
 * Finds the existing record for a project folder that has moved or been renamed.
 *
 * Matched on folder name plus the primary set's filename, among records whose
 * own path was not seen in this scan. Producers reorganise folders constantly,
 * and losing a release's metadata to a drag-and-drop would make the registry
 * untrustworthy.
 */
function findRelinked(
  project: ScannedProject,
  existing: readonly ProjectRecord[],
  claimed: Set<string>,
  scannedPaths: ReadonlySet<string>
): ProjectRecord | undefined {
  const primarySet = project.sets.find((set) => set.isPrimary)?.fileName
  if (!primarySet) return undefined

  return existing.find((record) => {
    if (claimed.has(record.id)) return false
    // A record whose own folder was also found in this scan is a different
    // project that merely shares a name — it will be matched by path instead.
    if (scannedPaths.has(record.path.toLowerCase())) return false

    if (cleanProjectName(record.folderName) !== project.name) return false
    return record.sets.some((set) => set.fileName === primarySet)
  })
}

/**
 * Creates the promotional plan once the three shipping files are chosen.
 *
 * Tied to the deliverables rather than to the stage because that is the real
 * trigger: the plan is built around a finished master, a cover and a canvas, so
 * before those exist there is nothing to promote.
 */
function seedMarketingPlan(record: ProjectRecord): ProjectRecord {
  if (record.marketing) return record

  const { master, cover, canvas } = record.deliverables
  if (!master || !cover || !canvas) return record

  return { ...record, marketing: createDefaultMarketingPlan(record.distribution.releaseDate) }
}

function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of tags) {
    const tag = raw.trim()
    if (!tag) continue
    // Case-insensitive dedupe, first spelling wins — so "Techno" and "techno"
    // do not both end up in the filter row.
    const key = tag.toLowerCase()
    if (!seen.has(key)) seen.set(key, tag)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

function toSummary(record: ProjectRecord): ProjectSummary {
  const primary = record.sets.find((set) => set.isPrimary) ?? record.sets[0] ?? null
  const readiness = evaluateReadiness(record)

  const marketing = record.marketing
    ? {
        settled: record.marketing.assets.filter((asset) => isMarketingAssetSettled(asset.status))
          .length,
        required: record.marketing.assets.length
      }
    : null

  return {
    id: record.id,
    path: record.path,
    name: record.name,
    stage: record.stage,
    tags: record.tags,
    favourite: record.favourite,
    title: record.distribution.title,
    primaryArtist: record.distribution.primaryArtist,
    releaseKind: record.distribution.releaseKind,
    releaseDate: record.distribution.releaseDate,
    tempo: primary?.analysis?.tempo ?? null,
    key: primary?.analysis?.key ?? null,
    trackCount: primary?.analysis?.trackCounts.total ?? 0,
    setCount: record.sets.length,
    revisionCount: record.revisions.length,
    audioCount: record.audio.length,
    sizeBytes: record.sizeBytes,
    missingSampleCount: record.missingSamples.length,
    coverPath: record.deliverables.cover ?? record.images[0]?.path ?? null,
    pinnedNote: record.notes.find((note) => note.pinned)?.body ?? null,
    readiness: {
      met: readiness.filter((requirement) => requirement.met).length,
      total: readiness.length
    },
    marketing,
    liveLinkCount: record.distribution.liveLinks.length,
    lastTouchedAt: record.lastTouchedAt,
    updatedAt: record.updatedAt,
    missing: record.missing
  }
}

function matches(record: ProjectRecord, query: ProjectQuery): boolean {
  if (record.missing && !query.includeMissing) return false
  if (query.favouritesOnly && !record.favourite) return false
  if (query.stages?.length && !query.stages.includes(record.stage)) return false
  if (query.tags?.length && !query.tags.every((tag) => record.tags.includes(tag))) return false

  const search = query.search?.trim().toLowerCase()
  if (!search) return true

  const haystack = [
    record.name,
    record.folderName,
    record.distribution.title,
    record.distribution.primaryArtist,
    record.distribution.genre,
    ...record.tags,
    ...record.notes.map((note) => note.body)
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(search)
}

function sortSummaries(
  summaries: ProjectSummary[],
  sort: NonNullable<ProjectQuery['sort']>
): ProjectSummary[] {
  const ordered = [...summaries]

  switch (sort) {
    case 'name':
      ordered.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'stage':
      // Within a stage, most recently touched first — the useful secondary key.
      ordered.sort(
        (a, b) =>
          getStage(a.stage).order - getStage(b.stage).order || b.lastTouchedAt - a.lastTouchedAt
      )
      break
    case 'revisions':
      ordered.sort((a, b) => b.revisionCount - a.revisionCount)
      break
    case 'size':
      ordered.sort((a, b) => b.sizeBytes - a.sizeBytes)
      break
    case 'recent':
    default:
      ordered.sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)
      break
  }

  // Favourites float regardless of sort: they are the operator's own pin.
  return ordered.sort((a, b) => Number(b.favourite) - Number(a.favourite))
}
