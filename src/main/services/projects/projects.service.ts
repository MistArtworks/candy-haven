import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { nativeImage, shell } from 'electron'
import type { AnyBulkWriteOperation } from 'mongodb'
import type {
  AbletonAnalysis,
  NoteDraft,
  ProjectCategory,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ProjectStage,
  ProjectSummary,
  ScanLogEntry,
  ScanState
} from '@shared/domain/projects'
import {
  PROJECT_CATEGORIES,
  PROJECT_STAGE_IDS,
  SCAN_LOG_LIMIT,
  createEmptyScanState,
  evaluateReadiness,
  getStage
} from '@shared/domain/projects.constants'
import type { ArchiveTag, TagSummary } from '@shared/domain/tags'
import type { ArtistRecord } from '@shared/domain/artists'
import type { ReleaseAppearance } from '@shared/domain/discography'
import { tagKey } from '@shared/domain/tags.constants'
import { DEFAULT_FOLDER_COLOUR, normaliseHex } from '@shared/domain/stacks.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { TypedEmitter } from '@main/core/emitter'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import { isAtOrUnder, rewritePath } from '@main/services/stacks/filesystem'
import { ProjectsRepository, type ProjectDocument } from './projects.repository'
import { cleanProjectName, scanRoots, type ScannedProject } from './scanner'
import { hasProjectIcon, stampProjectIcon } from './project-icon'

const logger = getLogger('projects')

/** Progress events are coalesced to this cadence so a scan cannot flood IPC. */
const PROGRESS_INTERVAL_MS = 120

/** Thumbnails are decoded on demand and cached; bounded to keep memory flat. */
const THUMBNAIL_CACHE_LIMIT = 240

interface ProjectsEvents {
  scan: ScanState
}

/**
 * Where a project ends up when the stacks service files it.
 *
 * Carries no genre any more. Filing used to overwrite the release's genre from
 * the folder names it landed under; there is no such metadata on a project now
 * — the shelf *is* the statement of genre, and reading it off the tree when
 * something needs it beats copying it into a field that can then disagree.
 */
export interface FilingChange {
  folderId: string | null
  /** The project folder's path before the move. */
  from: string
  /** Its path after. Equal to `from` when only the record changed. */
  to: string
}

/** What the stacks service supplies when it provisions a project directory. */
export interface AdoptedProject {
  scanned: ScannedProject
  folderId: string
  category: ProjectCategory
  artistIds: string[]
  colour: string
}

/**
 * Recomputes each project's folder from its path on disk.
 *
 * Supplied by the container after both services exist. Projects cannot import
 * the stacks service — the stacks service reads the register through *this*
 * one — so the dependency is inverted into a callback rather than made mutual.
 */
export type FilingResolver = (
  records: readonly ProjectRecord[]
) => Promise<Map<string, string | null>>

/**
 * Hands over the tag library so the registry can resolve `tagIds`.
 *
 * Inverted into a callback for the same reason as `FilingResolver`, and it is
 * the same cycle: the tags service reads the register through *this* service
 * to count usage, so this one cannot import it back. The registry is the only
 * place that needs the library — everything else takes ids at face value.
 */
export type TagResolver = () => Promise<ArchiveTag[]>

/** How the roster is read, so the register can draw credits. */
export type ArtistResolver = () => Promise<ArtistRecord[]>

/**
 * Where each project appears in the catalogue, by project id.
 *
 * Supplied by the container once the discography service exists. The register
 * does not store which release a project is on — the release owns its
 * tracklist, because a track need not have a project — so this is the only
 * way the ARCHIVE can say "track 3 of *Ossuary*" without a second copy of the
 * relationship that would drift. Same arrangement as `TagResolver`.
 */
export type AppearanceResolver = () => Promise<Map<string, ReleaseAppearance[]>>

/**
 * Owns the project registry: what exists on disk, what the operator has said
 * about it, and where each project sits in the production pipeline.
 *
 * The central rule here is the ownership split. The scanner owns everything
 * discovered from the filesystem and overwrites it on every rescan. The
 * operator owns stage, notes, tags, category, colour and the master picks, and
 * a scan never touches those — a rescan after moving a sample must not be able
 * to lose the operator's own work.
 */
export class ProjectsService extends TypedEmitter<ProjectsEvents> {
  private scanState: ScanState = createEmptyScanState()
  private inFlight: AbortController | null = null
  private lastProgressAt = 0
  private readonly thumbnails = new Map<string, { modifiedAt: number; dataUrl: string }>()
  private filingResolver: FilingResolver | null = null
  private tagResolver: TagResolver | null = null
  private artistResolver: ArtistResolver | null = null
  private appearanceResolver: AppearanceResolver | null = null

  constructor(private readonly archive: ArchiveService) {
    super()
  }

  get scan(): ScanState {
    return this.scanState
  }

  /** Wired by the container once the stacks service exists. See `FilingResolver`. */
  setFilingResolver(resolver: FilingResolver): void {
    this.filingResolver = resolver
  }

  /** Wired by the container once the tags service exists. See `TagResolver`. */
  /** Wired by the container once the artists service exists. */
  setArtistResolver(resolver: ArtistResolver): void {
    this.artistResolver = resolver
  }

  /** Wired by the container once the discography service exists. */
  setAppearanceResolver(resolver: AppearanceResolver): void {
    this.appearanceResolver = resolver
  }

  setTagResolver(resolver: TagResolver): void {
    this.tagResolver = resolver
  }

  private get repository(): ProjectsRepository {
    return new ProjectsRepository(this.archive.getDb())
  }

  // ------------------------------------------------------------------ reading

  async getRegistry(query: ProjectQuery = {}): Promise<ProjectRegistry> {
    const records = await this.repository.listAll()

    const stageCounts = Object.fromEntries(PROJECT_STAGE_IDS.map((stage) => [stage, 0])) as Record<
      ProjectStage,
      number
    >
    const categoryCounts = Object.fromEntries(
      PROJECT_CATEGORIES.map((category) => [category, 0])
    ) as Record<ProjectCategory, number>

    /*
     * Tag usage is tallied here rather than asked of the tags service, which
     * would read the whole register a second time to count what this loop is
     * already walking past. The library itself still comes from there — this
     * service knows ids and nothing about names or colours.
     */
    const tagUsage = new Map<string, number>()
    let unfiledCount = 0
    let trashedCount = 0

    for (const record of records) {
      if (record.trashedAt !== null) {
        trashedCount += 1
        // Deleted projects are counted and then left out of everything else.
        // A stage tally that includes the bin would report work in progress
        // that the operator has already thrown away.
        continue
      }

      // Counts describe the whole registry, not the filtered view — the board
      // column headers should not change as the operator types in the search.
      stageCounts[record.stage] += 1
      categoryCounts[record.category] += 1
      for (const tagId of record.tagIds) {
        tagUsage.set(tagId, (tagUsage.get(tagId) ?? 0) + 1)
      }
      if (!record.missing && record.folderId === null) unfiledCount += 1
    }

    const library = this.tagResolver ? await this.tagResolver() : []

    /*
     * Names, for the search box alone.
     *
     * Typing "dark" into the register should find projects tagged `Dark`, and
     * a record holds only ids — so the lookup is built once here and handed to
     * `matches`, rather than every predicate call resolving the library again.
     */
    const tagNames = new Map(library.map((tag) => [tag.id, tag.name]))

    const projects = sortSummaries(
      records.filter((record) => matches(record, query, tagNames)).map(toSummary),
      query.sort ?? 'recent'
    )

    const tags: TagSummary[] = library
      .map((tag) => ({ ...tag, usageCount: tagUsage.get(tag.id) ?? 0 }))
      .sort((a, b) => tagKey(a.name).localeCompare(tagKey(b.name)))

    const roster = (await this.artistResolver?.()) ?? []
    const index = (await this.appearanceResolver?.()) ?? new Map()

    return {
      projects,
      scan: this.scanState,
      tags,
      artists: roster,
      // Flattened on the way out: a Map does not survive structured cloning
      // across the bridge, and the renderer rebuilds one on arrival.
      appearances: [...index.entries()].map(([projectId, on]) => ({ projectId, on })),
      stageCounts,
      categoryCounts,
      unfiledCount,
      trashedCount,
      roots: this.scanState.roots
    }
  }

  /**
   * Every project record, unfiltered.
   *
   * Exposed for the services that need to derive something across the whole
   * register rather than list it — the stacks count what is filed on each
   * shelf, volumes count their tracks, releases resolve their subject. They
   * read through here rather than opening their own repository on the
   * collection, so projects keep one owner.
   *
   * Returns full records, so it is not a substitute for `getRegistry` when a
   * summary will do.
   */
  async listRecords(): Promise<ProjectRecord[]> {
    return this.repository.listAll()
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

  // ---------------------------------------------------------------- creating

  /**
   * Registers a directory the stacks service has just provisioned.
   *
   * Split this way because the two halves belong to different owners: making
   * the directory, copying the template and creating the scaffold folders is
   * filesystem work the stacks service does, while deciding what a *record*
   * looks like belongs here. The alternative — projects reaching for the folder
   * tree to resolve a path — would make the two services mutually dependent,
   * which is the thing `FilingResolver` exists to avoid.
   */
  async adopt(adopted: AdoptedProject): Promise<ProjectRecord> {
    const now = Date.now()
    const record: ProjectRecord = {
      ...this.createRecord(adopted.scanned, now),
      folderId: adopted.folderId,
      category: adopted.category,
      artistIds: adopted.artistIds,
      colour: normaliseHex(adopted.colour),
      stageHistory: [{ stage: 'idea', at: now, note: 'Created' }]
    }

    await this.repository.insert(record)
    logger.info(`Registered new project ${record.path}`)
    return record
  }

  /**
   * Opens the project's working set in whatever the OS has registered.
   *
   * `openPath` rather than a spawned Ableton: the operator may have several
   * versions of Live installed, and the file association already records which
   * one they mean.
   */
  async openInLive(id: string): Promise<void> {
    const record = await this.get(id)
    const primary = record.sets.find((set) => set.isPrimary) ?? record.sets[0]

    if (!primary) {
      throw new AppError('This project has no Ableton set to open.', {
        code: ErrorCode.NotFound,
        hint: 'Run a scan, or add a set to the project folder.',
        recoverable: false
      })
    }

    const failure = await shell.openPath(primary.path)
    if (failure) {
      throw new AppError(`Could not open ${primary.fileName}.`, {
        code: ErrorCode.Unknown,
        hint: failure,
        recoverable: true
      })
    }
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
        hint: 'Choose the folder that holds your Ableton projects first.',
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

      const refiled = await this.reconcileFiling(repository)
      if (refiled > 0) {
        this.log('info', `${refiled} project${refiled === 1 ? '' : 's'} re-filed from disk`)
      }

      this.log(
        'info',
        `${reconciled.created} new, ${reconciled.updated} updated, ${reconciled.missing} missing`
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

    /*
     * Folders a project was copied *out of*, which the walk will still find.
     *
     * Under COPY migration the original stays on disk untouched — that is the
     * point of choosing it — so the next scan walks both it and the copy. Left
     * alone, the original would either be registered as a second project of the
     * same name, or worse, `findRelinked` would match it on folder name plus
     * primary set and quietly relink the record back to the copy's source,
     * undoing the migration.
     *
     * A record whose origin differs from its current path has been moved or
     * copied. After a move the origin does not exist, so this set costs
     * nothing; after a copy it is exactly the folder to ignore.
     */
    const copiedOrigins = new Set(
      existing
        .filter(
          (record) =>
            record.originPath !== null &&
            record.originPath.toLowerCase() !== record.path.toLowerCase()
        )
        .map((record) => (record.originPath as string).toLowerCase())
    )
    const operations: AnyBulkWriteOperation<ProjectDocument>[] = []

    let created = 0
    let updated = 0

    for (const project of scanned) {
      if (copiedOrigins.has(project.path.toLowerCase())) continue

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
        // A deleted project lives in the recycle bin, which the walk skips on
        // purpose. It is absent from every scan by design, and reporting it as
        // missing would fill the log with warnings about files the operator
        // deliberately threw away.
        record.trashedAt === null &&
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
      tagIds: [],
      favourite: false,
      notes: [],
      category: 'single',
      artistIds: [],
      colour: DEFAULT_FOLDER_COLOUR,
      masters: { wips: [], mixes: [], masters: [], final: null },
      trashedAt: null,
      trashedFrom: null,
      // Left unfiled even when the folder already sits inside the stacks tree;
      // `reconcileFiling` resolves that from the path a moment later, which is
      // the one place that rule is expressed.
      folderId: null,
      // Where the scan found it, recorded once. This is the only moment it can
      // be known — every later read sees wherever the project has since been
      // filed to.
      originPath: project.path,
      createdAt: now,
      ...discoveredFields(project, now),
      path: project.path
    }
  }

  /**
   * Names the bounce that is the project's finished master. Null clears it.
   *
   * **Nothing on disk moves.** The stored path points at one of the project's
   * own audio files, beside the set that made it. This replaced a pair of
   * methods that moved the bounce into `Release Mastered Tracks` and moved it
   * back on demotion, along with the two IPC channels and the stacks-service
   * half that performed the move — see `MasterSelectionSchema.final` for why
   * that was the wrong trade.
   *
   * The pick is confined to `project.audio`, which is every audio file in the
   * folder except the imported samples. A final master that could be any file
   * on the disk would let somebody else's bounce be recorded as the thing this
   * project finished, and being right about that is the whole point of asking.
   *
   * Clearing is refused while the project is RELEASED. `released` carries
   * `requiresMaster`, so allowing it would leave the record in the one state
   * that gate exists to prevent — claiming to be out in the world with no
   * named source. Step the stage back first.
   */
  async setFinalMaster(id: string, path: string | null): Promise<ProjectRecord> {
    const current = await this.get(id)

    if (path === null) {
      if (getStage(current.stage).requiresMaster) {
        throw new AppError(
          `${getStage(current.stage).label} cannot have its final master removed.`,
          {
            code: ErrorCode.Validation,
            hint: 'Move the project back to TRACK READY first, then clear it.',
            recoverable: false
          }
        )
      }

      const next = { ...current, masters: { ...current.masters, final: null } }
      await this.repository.replace({ ...next, updatedAt: Date.now() })
      return { ...next, updatedAt: Date.now() }
    }

    /*
     * Matched against the scanned inventory rather than merely existing.
     *
     * A path that is real but not in this project would type-check, pass a
     * `stat`, and quietly record the wrong provenance. The register already
     * knows what belongs to the project, so it is the thing to ask.
     */
    const file = current.audio.find((entry) => entry.path === path)
    if (!file) {
      throw new AppError('That file is not one of this project’s bounces.', {
        code: ErrorCode.Validation,
        hint: 'Bounce it into the project folder and rescan, then choose it here.',
        recoverable: false
      })
    }

    const next: ProjectRecord = {
      ...current,
      masters: { ...current.masters, final: file.path },
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    logger.info(`Final master for ${current.name}: ${file.fileName}`)
    return next
  }

  /**
   * Brings every project folder up to the shape a created one has.
   *
   * With the scaffold folders gone there is exactly one difference left between
   * a project Candy Haven made and one migrated in: whether Explorer draws
   * Live's project icon on it. Live writes that itself on first save, so a
   * migrated project usually arrives with it already — what needs this pass is
   * a project created before the app stamped icons, or one Live has never
   * opened.
   *
   * Idempotent and non-destructive. Nothing is renamed, nothing is moved and no
   * file the operator put there is touched; a project that already has the icon
   * is skipped without a write. That is what makes it safe to offer as a verb
   * over the whole archive rather than only at the moment of migration.
   */
  async conformIcons(): Promise<{ stamped: number; total: number }> {
    const records = await this.repository.listAll()
    const live = records.filter((record) => !record.missing && record.trashedAt === null)
    const sources = live.map((record) => record.path)

    let stamped = 0

    for (const record of live) {
      if (await hasProjectIcon(record.path)) continue
      if (await stampProjectIcon(record.path, sources)) stamped += 1
    }

    logger.info(`Conformed ${stamped} of ${live.length} projects`)
    return { stamped, total: live.length }
  }

  /**
   * Brings every project's folder into agreement with where it sits on disk.
   *
   * Run at the end of a scan. The filing tree and the filesystem are two views
   * of one thing, and the operator is entitled to drag a project between genre
   * folders in Explorer — without this, the app would keep showing it on the
   * shelf it used to be on.
   */
  private async reconcileFiling(repository: ProjectsRepository): Promise<number> {
    if (!this.filingResolver) return 0

    const records = await repository.listAll()
    const resolved = await this.filingResolver(records)
    if (resolved.size === 0) return 0

    const now = Date.now()
    await repository.writeMany(
      [...resolved].map(([id, folderId]) => ({
        updateOne: { filter: { _id: id }, update: { $set: { folderId, updatedAt: now } } }
      }))
    )

    return resolved.size
  }

  // ------------------------------------------------------------------ filing

  /**
   * Records a project's move into or out of a stacks folder.
   *
   * Called by the stacks service *after* the directory has already moved, so
   * this is bookkeeping rather than an action: the paths are re-pointed to
   * where the files now are, and the folder is recorded.
   *
   * Re-pointing rather than forcing a rescan is what makes filing feel
   * immediate. The files are byte-identical and keep their timestamps, so the
   * dossier keeps opening and the next scan still serves every set from its
   * stored analysis.
   */
  async applyFiling(id: string, change: FilingChange): Promise<ProjectRecord> {
    const current = await this.get(id)
    const moved = rewriteRecordPaths(current, change.from, change.to)

    /*
     * The display name follows the directory when the directory is renamed.
     *
     * Filing normally preserves the folder name, so this is a no-op for every
     * ordinary move. It earns its place when the destination resolved a name
     * collision by suffixing — without it the register would keep calling the
     * project `Untitled` while the folder on disk read `Untitled Project (2)`,
     * and the operator would have no way to tell two of them apart.
     *
     * Derived with the scanner's own rule rather than a second one here, so a
     * renamed project is spelled exactly as the next scan would spell it.
     */
    const renamed = basename(change.to) !== basename(change.from)

    const next: ProjectRecord = {
      ...moved,
      name: renamed ? cleanProjectName(basename(change.to)) : moved.name,
      folderId: change.folderId,
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    return next
  }

  /**
   * Re-points every record beneath a directory that has just been moved.
   *
   * The folder-rename counterpart to `applyFiling`: renaming `Hip Hop` leaves
   * every project filed under it holding a path that no longer exists, and this
   * is what corrects them in one pass.
   */
  async rewritePathsUnder(from: string, to: string): Promise<number> {
    const repository = this.repository
    const affected = (await repository.listAll()).filter((record) => isAtOrUnder(record.path, from))

    if (affected.length === 0) return 0

    const now = Date.now()
    for (const record of affected) {
      await repository.replace({ ...rewriteRecordPaths(record, from, to), updatedAt: now })
    }

    logger.info(`Re-pointed ${affected.length} project record(s) from ${from} to ${to}`)
    return affected.length
  }

  // ------------------------------------------------------------------ writing

  /**
   * Applies an operator edit.
   *
   * Read-modify-write rather than a targeted `$set`, because several of these
   * fields interact: a stage change is gated on a final master existing, and
   * category and volume are one statement made in two fields that must agree.
   * Expressing that as one transition over a whole record keeps those rules in
   * one readable place, and the registry is small enough that the extra read
   * costs nothing.
   */
  async patchProject(id: string, patch: ProjectPatch): Promise<ProjectRecord> {
    const current = await this.get(id)
    let next: ProjectRecord = { ...current, updatedAt: Date.now() }

    if (patch.tagIds) next.tagIds = normaliseIds(patch.tagIds)
    if (patch.favourite !== undefined) next.favourite = patch.favourite
    if (patch.colour !== undefined) next.colour = normaliseHex(patch.colour)
    if (patch.artistIds) next.artistIds = normaliseIds(patch.artistIds)

    if (patch.masters) {
      next.masters = { ...next.masters, ...patch.masters }
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

    next = reconcileCategory(next, patch)

    if (patch.stage && patch.stage !== next.stage) {
      next = this.applyStageChange(next, patch.stage, patch.stageNote ?? null)
    }

    await this.repository.replace(next)
    return next
  }

  /**
   * Enforces the gates on entering a stage.
   *
   * One gate, on `released`: a project cannot claim to be out in the world
   * until `masters.final` names the bounce that went out.
   *
   * It sat on `ready` originally, came off when the master pick briefly moved
   * to the DISCOGRAPHY track, and is now back one stage later. That position
   * matters — see the note on `ready` in projects.constants.ts for why gating
   * TRACK READY deadlocks and gating RELEASED does not.
   */
  private applyStageChange(
    record: ProjectRecord,
    stage: ProjectStage,
    note: string | null
  ): ProjectRecord {
    const definition = getStage(stage)

    if (definition.requiresMaster && record.masters.final === null) {
      throw new AppError(`${definition.label} needs the final master named first.`, {
        code: ErrorCode.Validation,
        hint: 'Choose it in the FINAL MASTER panel on the project’s OVERVIEW tab.',
        recoverable: false
      })
    }

    return {
      ...record,
      stage,
      stageHistory: [...record.stageHistory, { stage, at: Date.now(), note }]
    }
  }

  /**
   * Strips a tag that is going away from everything carrying it.
   *
   * Called by the tags service rather than reaching into the collection
   * itself, so projects keep one owner.
   */
  async detachTag(tagId: string): Promise<number> {
    const repository = this.repository
    const affected = (await repository.listAll()).filter((record) => record.tagIds.includes(tagId))
    if (affected.length === 0) return 0

    const now = Date.now()
    await repository.writeMany(
      affected.map((record) => ({
        updateOne: {
          filter: { _id: record.id },
          update: {
            $set: {
              tagIds: record.tagIds.filter((id) => id !== tagId),
              updatedAt: now
            }
          }
        }
      }))
    )

    return affected.length
  }

  /**
   * Strips an artist that is going away from everything crediting them.
   *
   * The credits twin of `detachTag`, and here for the same reason: the
   * artists service owns the roster, this service owns the register, and
   * neither reaches into the other's collection.
   */
  async detachArtist(artistId: string): Promise<number> {
    const repository = this.repository
    const affected = (await repository.listAll()).filter((record) =>
      record.artistIds.includes(artistId)
    )
    if (affected.length === 0) return 0

    const now = Date.now()
    await repository.writeMany(
      affected.map((record) => ({
        updateOne: {
          filter: { _id: record.id },
          update: {
            $set: {
              artistIds: record.artistIds.filter((id) => id !== artistId),
              updatedAt: now
            }
          }
        }
      }))
    )

    return affected.length
  }

  /*
   * `detachFromVolume`, `recategoriseVolumeTracks` and `reorderVolume` were
   * here, called by the volumes service so that projects kept one owner.
   *
   * All three are gone with volumes. A release's running order now lives on
   * the release, as an ordered array, because a track need not have a project
   * at all — so there is nothing on the project left to reorder, and nothing
   * to detach it from. See docs/DISCOGRAPHY.md §3.
   */

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

  // ------------------------------------------------------------------ removal

  /**
   * Drops a record and leaves every file alone.
   *
   * Permitted for any project, not only a missing one. The old rule — forget is
   * only for folders that have vanished — made sense when the register was
   * purely a view of the disk; now that the operator can also *delete*, the two
   * actions need to be plainly different things, and "stop tracking this"
   * should not require the files to be gone first.
   */
  async forget(id: string): Promise<void> {
    await this.get(id)
    await this.repository.deleteById(id)
    logger.info(`Forgot project ${id}`)
  }

  /**
   * Records a project's move into or out of the recycle bin.
   *
   * Bookkeeping only — the stacks service has already moved the directory, for
   * the same reason it owns `applyFiling`: it is the service that knows where
   * the wrapper is. See `StacksService.trashProject`.
   */
  async applyTrash(
    id: string,
    change: { from: string; to: string; trashed: boolean }
  ): Promise<ProjectRecord> {
    const current = await this.get(id)
    const moved = rewriteRecordPaths(current, change.from, change.to)

    const next: ProjectRecord = {
      ...moved,
      // Where it came from is captured on the way in and cleared on the way
      // out, so a project restored and deleted again remembers the *second*
      // origin rather than the first.
      trashedAt: change.trashed ? Date.now() : null,
      trashedFrom: change.trashed ? change.from : null,
      // Restoring can only put a project back somewhere the tree still has, so
      // the caller resolves the folder; a project deleted from a shelf that has
      // since gone comes back unfiled rather than pointing at nothing.
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    return next
  }

  /**
   * Bins or restores every project underneath a directory, in one pass.
   *
   * Called when a *folder* is binned: its whole subtree moves with it, so each
   * project inside needs its paths re-pointed into the bin and its trashed
   * fields set. Doing it here rather than in the stacks service keeps projects
   * the only writer of project records, which is the same split `applyFiling`
   * and `applyTrash` observe.
   *
   * `trashedFrom` records where each project was *before* the folder moved, so
   * restoring the folder can put every one of them back exactly where it was
   * rather than dropping them all at the root.
   */
  async applyTrashUnder(from: string, to: string, trashed: boolean): Promise<number> {
    const repository = this.repository
    const affected = (await repository.listAll()).filter(
      (record) => isAtOrUnder(record.path, from) && (record.trashedAt !== null) !== trashed
    )
    if (affected.length === 0) return 0

    const now = Date.now()

    for (const record of affected) {
      const moved = rewriteRecordPaths(record, from, to)
      await repository.replace({
        ...moved,
        trashedAt: trashed ? now : null,
        trashedFrom: trashed ? record.path : null,
        updatedAt: now
      })
    }

    return affected.length
  }

  /**
   * Drops every project record underneath a directory.
   *
   * Records only — the caller has already dealt with the files, which for the
   * one caller that exists means sending the whole directory to the operating
   * system's bin in a single move. Deleting each project's folder individually
   * first would be slower and would leave a half-emptied tree behind if it
   * failed part way.
   */
  async forgetUnder(prefix: string): Promise<number> {
    const repository = this.repository
    const affected = (await repository.listAll()).filter((record) =>
      isAtOrUnder(record.path, prefix)
    )

    for (const record of affected) await repository.deleteById(record.id)
    return affected.length
  }

  /**
   * Removes a project for good.
   *
   * Only permitted from the bin, which is the whole safety property: there is
   * no single action anywhere in this application that takes a live project
   * from the register to gone. Emptying the bin is a second, deliberate act.
   *
   * The folder still goes to the *operating system's* bin rather than being
   * unlinked, so even this last step is recoverable by someone who knows to
   * look. Disk first, database second, as everywhere that touches both.
   */
  async purge(id: string): Promise<void> {
    const record = await this.get(id)

    if (record.trashedAt === null) {
      throw new AppError('That project has not been deleted.', {
        code: ErrorCode.Validation,
        hint: 'Delete it first; the bin is the only place anything is purged from.',
        recoverable: false
      })
    }

    if (!record.missing) {
      try {
        await shell.trashItem(record.path)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new AppError(`Could not remove ${record.name}.`, {
          code: ErrorCode.Unknown,
          hint: `${message} A set open in Ableton Live will hold the folder.`,
          recoverable: true
        })
      }
    }

    await this.repository.deleteById(id)
    logger.warn(`Purged project ${record.name} from ${record.path}`)
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

/**
 * Keeps `category` and `volumeId` telling one story.
 *
 * The two are a single statement made in two fields, and a patch usually
 * carries only one of them — the operator picks ALBUM from a dropdown, or drags
 * a track onto a volume tile. Rather than refuse a half-statement, the missing
 * half is inferred:
 *
 *   - moving to a category that needs a volume, without naming one, is refused
 *     outright. There is nothing sensible to infer, and silently inventing a
 *     volume would be worse than asking.
 *   - moving to a standalone category detaches whatever volume was set, because
 *     a single is by definition not a track of anything.
 *   - attaching to a volume without saying what kind is fine; the caller passes
 *     the volume's kind as the category alongside it.
 */
function reconcileCategory(record: ProjectRecord, patch: ProjectPatch): ProjectRecord {
  /*
   * Nothing to reconcile any more, and the function stays as the seam.
   *
   * It enforced that an `album`/`ep`/`compilation` project was attached to a
   * volume of the same kind, adjusting whichever half of the pair the patch
   * did not set. Volumes became the DISCOGRAPHY, whose tracklist lives on the
   * release rather than on the project, so a project can no longer see what
   * it is a track of — and an invariant that cannot be evaluated is not one.
   *
   * Kept rather than inlined because category is exactly the field that grows
   * rules again, and a named place for them is cheaper than finding this
   * decision a second time.
   */
  return { ...record, category: patch.category ?? record.category }
}

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

/**
 * Re-points every absolute path a record holds after its folder moved.
 *
 * Every path a project carries is absolute and was resolved relative to where
 * the folder used to be — the sets, the backups, the candidate deliverables,
 * the chosen masters, and the sample locations recorded inside each stored
 * analysis. Missing one of them presents as a dossier that opens with blank
 * artwork, which is why this enumerates the record rather than spreading the
 * rewrite across the call sites that need it.
 */
function rewriteRecordPaths(record: ProjectRecord, from: string, to: string): ProjectRecord {
  if (from === to) return record

  const move = (value: string): string => rewritePath(value, from, to)

  return {
    ...record,
    path: move(record.path),
    sets: record.sets.map((set) => ({
      ...set,
      path: move(set.path),
      analysis: set.analysis
        ? {
            ...set.analysis,
            samplePaths: set.analysis.samplePaths.map(move),
            missingSamples: set.analysis.missingSamples.map(move)
          }
        : null
    })),
    revisions: record.revisions.map((revision) => ({ ...revision, path: move(revision.path) })),
    audio: record.audio.map((file) => ({ ...file, path: move(file.path) })),
    images: record.images.map((file) => ({ ...file, path: move(file.path) })),
    videos: record.videos.map((file) => ({ ...file, path: move(file.path) })),
    missingSamples: record.missingSamples.map(move),
    masters: {
      wips: record.masters.wips.map(move),
      mixes: record.masters.mixes.map(move),
      masters: record.masters.masters.map(move),
      // Deliberately not moved. The final lives in Release Mastered Tracks,
      // outside the project folder entirely, so a project moving on disk does
      // not move it and rewriting this path would break the reference.
      final: record.masters.final
    }
  }
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
  | 'tagIds'
  | 'favourite'
  | 'notes'
  | 'category'
  // Who made it is the operator's statement, exactly as `tagIds` is. A rescan
  // reads files; it has no idea who was in the room.
  | 'artistIds'
  | 'colour'
  | 'masters'
  | 'trashedAt'
  | 'trashedFrom'
  // Where a project is filed is the operator's decision, not the scanner's.
  // Listing it here is what stops a rescan emptying the shelves.
  | 'folderId'
  // Where the project was first found never changes, by definition. A rescan
  // finds it at its current path; writing that back would redefine home as
  // wherever it happens to be now.
  | 'originPath'
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
 * and losing a project's stage history and notes to a drag-and-drop would make
 * the registry untrustworthy.
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
 * Deduplicates a patch's tag ids, keeping the order they were given in.
 *
 * No case folding and no sorting any more, both of which the string version of
 * this had to do: ids are opaque and already unique per name, and the chip row
 * is ordered by the *library* so that it reads the same on every project
 * rather than in whatever sequence each one happened to be labelled.
 *
 * Ids are not checked against the library here. A patch naming a tag that has
 * since been deleted writes a dangling id, which the registry then resolves to
 * nothing and simply does not draw — cheaper and less surprising than refusing
 * an otherwise valid edit because of a tag the operator cannot see.
 */
function normaliseIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = raw.trim()
    if (id) seen.add(id)
  }
  return [...seen]
}

function toSummary(record: ProjectRecord): ProjectSummary {
  const primary = record.sets.find((set) => set.isPrimary) ?? record.sets[0] ?? null
  const readiness = evaluateReadiness(record)

  return {
    id: record.id,
    path: record.path,
    name: record.name,
    stage: record.stage,
    tagIds: record.tagIds,
    favourite: record.favourite,
    colour: record.colour,
    folderId: record.folderId,
    category: record.category,
    artistIds: record.artistIds,
    tempo: primary?.analysis?.tempo ?? null,
    key: primary?.analysis?.key ?? null,
    trackCount: primary?.analysis?.trackCounts.total ?? 0,
    setCount: record.sets.length,
    revisionCount: record.revisions.length,
    audioCount: record.audio.length,
    sizeBytes: record.sizeBytes,
    missingSampleCount: record.missingSamples.length,
    coverPath: record.images[0]?.path ?? null,
    pinnedNote: record.notes.find((note) => note.pinned)?.body ?? null,
    hasFinalMaster: record.masters.final !== null,
    readiness: {
      met: readiness.filter((requirement) => requirement.met).length,
      total: readiness.length
    },
    lastTouchedAt: record.lastTouchedAt,
    updatedAt: record.updatedAt,
    missing: record.missing,
    trashedAt: record.trashedAt,
    trashedFrom: record.trashedFrom
  }
}

function matches(
  record: ProjectRecord,
  query: ProjectQuery,
  tagNames: ReadonlyMap<string, string>
): boolean {
  /*
   * The bin is a separate place, not a filter.
   *
   * This is checked before anything else and in both directions, so a deleted
   * project can never leak into a normal view and a live one can never appear
   * in the bin. Every other predicate below is then free to ignore the
   * distinction entirely.
   */
  if ((record.trashedAt !== null) !== (query.trashed === true)) return false

  if (record.missing && !query.includeMissing) return false
  if (query.favouritesOnly && !record.favourite) return false
  if (query.stages?.length && !query.stages.includes(record.stage)) return false
  if (query.categories?.length && !query.categories.includes(record.category)) return false
  // AND, not OR: adding a second chip narrows the shelf. See `ProjectQuery`.
  if (query.tagIds?.length && !query.tagIds.every((id) => record.tagIds.includes(id))) return false

  // Three states, not two: absent does not filter, `null` selects the unfiled.
  // `undefined` and `null` mean genuinely different things here, so both of
  // these test for the former explicitly rather than for truthiness.
  if (query.folderId !== undefined && record.folderId !== query.folderId) return false

  // A subtree search. Mutually exclusive with `folderId` by convention rather
  // than by refusal — both set would simply intersect, which is harmless.
  if (query.folderIds?.length) {
    if (record.folderId === null || !query.folderIds.includes(record.folderId)) return false
  }
  /*
   * Credits are matched with AND, as tags are.
   *
   * The operator narrows by adding names, and a second name producing *more*
   * results would be the opposite of what adding it looks like it should do.
   */
  if (query.artistIds?.length) {
    if (!query.artistIds.every((id) => record.artistIds.includes(id))) return false
  }

  const search = query.search?.trim().toLowerCase()
  if (!search) return true

  const haystack = [
    record.name,
    record.folderName,
    // Resolved rather than stored, so a renamed tag is searchable under its
    // new name immediately and never under its old one.
    ...record.tagIds.map((id) => tagNames.get(id) ?? ''),
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
