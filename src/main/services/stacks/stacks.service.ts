import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'
import { app, shell } from 'electron'
import type { ProjectDraft, ProjectRecord } from '@shared/domain/projects'
import { requiresVolume } from '@shared/domain/projects.constants'
import type {
  ArchiveFolder,
  ArchiveSetupDraft,
  ArchiveSetupState,
  FolderDraft,
  FolderKind,
  FolderPatch,
  StacksTree
} from '@shared/domain/stacks'
import {
  DEFAULT_FOLDER_COLOUR,
  MAX_FOLDER_DEPTH,
  FOLDER_KIND_LABEL,
  PROJECTS_DIRECTORY_NAME,
  allowedChildKinds,
  RECYCLE_BIN_DIRECTORY_NAME,
  RELEASE_MASTERED_TRACKS_DIRECTORY_NAME,
  WRAPPER_DIRECTORY_NAME,
  RELEASES_DIRECTORY_NAME,
  isHexColour,
  isValidChildKind,
  normaliseHex,
  validateFolderName
} from '@shared/domain/stacks.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import { provisionProject } from '@main/services/projects/project-provisioner'
import { indexProject } from '@main/services/projects/scanner'
import { stampProjectIcon } from '@main/services/projects/project-icon'
import type { ProjectsService } from '@main/services/projects/projects.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import { StacksRepository } from './stacks.repository'
import {
  createDirectory,
  directoryExists,
  ensureDirectory,
  isAtOrUnder,
  copyDirectory,
  moveDirectory,
  moveFile,
  pathExists,
  rewritePath,
  samePath
} from './filesystem'

const logger = getLogger('stacks')

/** What a bulk filing actually managed to do. See `fileMany`. */
export interface BulkFilingResult {
  moved: number
  failures: { id: string; name: string; reason: string }[]
}

/** An operator-facing sentence from whatever was thrown. */
function describe(error: unknown): string {
  if (error instanceof AppError) return error.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * THE STACKS — the ARCHIVE's shelving.
 *
 * Owns the filing tree: the folders the operator builds, and which project sits
 * in which. The distinguishing fact about this service is that its records
 * describe *real directories*, so every write is a pair — a filesystem
 * operation and a database write — and the order matters.
 *
 * The order chosen throughout is **disk first, database second**. A disk
 * operation that fails leaves the database untouched and the operator sees a
 * refusal; a database write that fails after a successful move leaves a folder
 * on disk that the next scan will reconcile. The reverse order would let the
 * app believe in a directory that does not exist, which is the failure the
 * operator cannot diagnose.
 *
 * The register is read through `ProjectsService` rather than through a second
 * repository on the same collection, so projects keep one owner — the same
 * arrangement TRANSMISSIONS uses.
 */
export class StacksService {
  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService,
    private readonly settings: SettingsService
  ) {}

  private get repository(): StacksRepository {
    return new StacksRepository(this.archive.getDb())
  }

  // ------------------------------------------------------------------ roots

  /**
   * The one root the ARCHIVE builds in.
   *
   * A single setting now, read verbatim. It used to fall back to "the first of
   * the configured roots" when the named one was not among them, which made
   * sense while every root was equal and the tree merely happened to live in
   * one of them. It is actively wrong now: the department *writes* here, and
   * quietly relocating the whole filing tree to a different drive because a
   * setting was edited is not a graceful degradation.
   */
  private resolveFilingRoot(): string | null {
    return this.settings.snapshot.workspace.filingRoot
  }

  private resolveWrapper(): string | null {
    const root = this.resolveFilingRoot()
    return root ? join(root, WRAPPER_DIRECTORY_NAME) : null
  }

  /** `<wrapper>/RELEASES`. Nothing creates this now; kept for archives that have one. */
  resolveReleasesRoot(): string | null {
    const wrapper = this.resolveWrapper()
    return wrapper ? join(wrapper, RELEASES_DIRECTORY_NAME) : null
  }

  /** `<wrapper>/RECYCLE BIN`, where deleted projects wait to be restored. */
  resolveRecycleBin(): string | null {
    const wrapper = this.resolveWrapper()
    return wrapper ? join(wrapper, RECYCLE_BIN_DIRECTORY_NAME) : null
  }

  /** `<wrapper>/Projects`, the root of the filing tree. */
  resolveProjectsRoot(): string | null {
    const wrapper = this.resolveWrapper()
    return wrapper ? join(wrapper, PROJECTS_DIRECTORY_NAME) : null
  }

  /** `<wrapper>/Release Mastered Tracks`, where finished tracks are kept. */
  resolveMasteredTracksRoot(): string | null {
    const wrapper = this.resolveWrapper()
    return wrapper ? join(wrapper, RELEASE_MASTERED_TRACKS_DIRECTORY_NAME) : null
  }

  /** The projects root, created if needed. */
  private async requireProjectsRoot(): Promise<string> {
    const root = join(await this.requireWrapper(), PROJECTS_DIRECTORY_NAME)
    await ensureDirectory(root)
    return root
  }

  /** The wrapper, created if needed, or a refusal explaining what is missing. */
  private async requireWrapper(): Promise<string> {
    const wrapper = this.resolveWrapper()

    if (!wrapper) {
      throw new AppError('The ARCHIVE has not been set up yet.', {
        code: ErrorCode.Validation,
        hint: 'Choose the folder that holds your Ableton projects first.',
        recoverable: false
      })
    }

    await ensureDirectory(wrapper)
    return wrapper
  }

  // ------------------------------------------------------------------ setup

  /**
   * Whether the department can be used, and which gate is missing if not.
   *
   * Reports each condition separately rather than one `ready` boolean, because
   * the three failures need three different sentences: never configured, root
   * has gone (an unplugged drive), and template has gone. Collapsing them would
   * send an operator to re-pick a root that is perfectly fine.
   */
  async getSetupState(): Promise<ArchiveSetupState> {
    const { filingRoot, projectTemplatePath, satelliteRoots } = this.settings.snapshot.workspace
    const suggestedRoot = defaultArchiveRoot()
    const wrapper = this.resolveWrapper()
    const recycleBin = this.resolveRecycleBin()
    const projectsRoot = this.resolveProjectsRoot()
    const masteredTracks = this.resolveMasteredTracksRoot()

    const rootPresent = filingRoot !== null && (await directoryExists(filingRoot))

    /*
     * The three primitives the wrapper holds, and creating any that are absent.
     *
     * This checked for `RELEASES` until RELEASES was stood down, at which point
     * nothing created that directory any more — so an archive that had never
     * had one reported `ready: false` for ever, and the department disabled
     * every control on the page. The failure was silent and total: no error,
     * just nothing responding to a click.
     *
     * Creating rather than only reporting, because the alternative is a readout
     * that can say "not ready" about a condition the operator has no way to
     * satisfy. These are directories the app owns outright and `ensureDirectory`
     * is a no-op where they exist, so self-healing here costs nothing and
     * removes a whole class of dead-end state. Guarded on the wrapper existing,
     * so an unplugged drive is still reported rather than rebuilt on whatever
     * happens to be mounted at that letter.
     */
    let wrapperReady = false

    if (
      wrapper !== null &&
      recycleBin !== null &&
      projectsRoot !== null &&
      masteredTracks !== null
    ) {
      if (await directoryExists(wrapper)) {
        await ensureDirectory(projectsRoot)
        await ensureDirectory(masteredTracks)
        await ensureDirectory(recycleBin)
        wrapperReady = true
      }
    }
    const templatePresent = projectTemplatePath !== null && (await pathExists(projectTemplatePath))

    return {
      filingRoot,
      rootPresent,
      wrapper,
      wrapperReady,
      recycleBin,
      templatePath: projectTemplatePath,
      templatePresent,
      satelliteRoots,
      suggestedRoot,
      ready: rootPresent && wrapperReady && templatePresent
    }
  }

  /**
   * Saves the root and template, then builds the wrapper.
   *
   * One call rather than two settings writes and a provisioning step, because
   * there is no useful state in between: a root saved without its directories
   * made is a department that reports itself set up and then refuses the first
   * thing asked of it.
   */
  async setup(draft: ArchiveSetupDraft): Promise<ArchiveSetupState> {
    if (!(await directoryExists(draft.filingRoot))) {
      throw new AppError('That folder could not be found.', {
        code: ErrorCode.NotFound,
        hint: 'Choose a directory that exists and is reachable.',
        recoverable: false
      })
    }

    if (!(await pathExists(draft.templatePath))) {
      throw new AppError('That template set could not be found.', {
        code: ErrorCode.NotFound,
        hint: 'Choose an .als file that exists.',
        recoverable: false
      })
    }

    // Disk first, settings second — the ordering used everywhere in this
    // service. A wrapper that cannot be created leaves the settings untouched
    // and the operator back at the gate, rather than configured but broken.
    const wrapper = join(draft.filingRoot, WRAPPER_DIRECTORY_NAME)
    await ensureDirectory(wrapper)
    /*
     * Three primitives, and the wrapper holds nothing else the app made.
     *
     * `RELEASES` is no longer among them. Nothing creates it now that the lens
     * is stood down, and an operator who already has one keeps it — it stays
     * reserved by name so a category cannot shadow it, but it is not made
     * afresh for anybody.
     */
    await ensureDirectory(join(wrapper, PROJECTS_DIRECTORY_NAME))
    await ensureDirectory(join(wrapper, RELEASE_MASTERED_TRACKS_DIRECTORY_NAME))
    await ensureDirectory(join(wrapper, RECYCLE_BIN_DIRECTORY_NAME))

    /*
     * Source locations are merged with anything already configured rather than
     * replacing it, and the filing root is filtered out of them — it is walked
     * anyway, and listing it twice would double every directory count in the
     * scan readout for no extra coverage.
     */
    const satelliteRoots = [
      ...new Set(
        [...this.settings.snapshot.workspace.satelliteRoots, ...draft.sourceRoots]
          .filter((root) => !samePath(root, draft.filingRoot))
          .map((root) => root.trim())
          .filter(Boolean)
      )
    ]

    await this.settings.update({
      workspace: {
        filingRoot: draft.filingRoot,
        projectTemplatePath: draft.templatePath,
        satelliteRoots
      }
    })

    logger.info(`ARCHIVE set up at ${wrapper}`)
    return this.getSetupState()
  }

  // ---------------------------------------------------------------- reading

  async getTree(): Promise<StacksTree> {
    const all = await this.repository.listAll()
    // A binned folder is out of the tree entirely — it has no parent to hang
    // from any more, and its path points into the recycle bin.
    const folders = all.filter((folder) => folder.trashedAt === null)
    const trashed = all
      .filter((folder) => folder.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
    const records = await this.projects.listRecords()

    const counts: Record<string, number> = Object.fromEntries(
      folders.map((folder) => [folder.id, 0])
    )
    let unfiledCount = 0

    for (const record of records) {
      // Binned projects are counted by the bin, not by the shelves.
      if (record.missing || record.trashedAt !== null) continue
      if (record.folderId && record.folderId in counts) counts[record.folderId] += 1
      else unfiledCount += 1
    }

    return {
      folders,
      setup: await this.getSetupState(),
      counts,
      unfiledCount,
      trashed
    }
  }

  // ------------------------------------------------------- creating projects

  /**
   * Provisions a project and registers it, as one operation.
   *
   * Sited on this service rather than on projects for the same reason
   * `fileProject` is: it needs a folder's *path*, and the folder tree is this
   * service's. Projects reaching back for that would make the two mutually
   * dependent, which `FilingResolver` exists to prevent.
   *
   * The sequence is disk, index, record. Indexing the freshly copied set before
   * writing the record costs one decompression and means the dossier opens with
   * a real tempo, key and track list from the moment the project appears —
   * rather than an empty shell that fills in whenever the next scan happens.
   */
  async createProject(draft: ProjectDraft): Promise<ProjectRecord> {
    this.refuseDuringScan()

    const setup = await this.getSetupState()
    if (!setup.ready) {
      throw new AppError('The ARCHIVE is not set up yet.', {
        code: ErrorCode.Validation,
        hint: setup.templatePresent
          ? 'Choose the folder that holds your Ableton projects first.'
          : 'Choose a template set in the INDEXING panel first.',
        recoverable: false
      })
    }

    const folders = await this.repository.listAll()
    const folder = this.requireFolder(folders, draft.folderId)

    /*
     * Any shelf that holds work may hold a project — a genre, an artist, or a
     * folder under either. A category may not.
     *
     * A category divides the operator's *filing* rather than their work: it
     * holds kinds of shelf, and a project beside genres at that level would be
     * the one thing in the tree with no answer to "what is this filed as".
     *
     * No deeper requirement than that. An earlier build demanded a sub-genre in
     * between and refused a project created directly in a genre, which was
     * dropped as ceremony — a producer with four EDM tracks should not have to
     * invent a sub-genre to file them, and one who wants `EDM / Melodic Bass`
     * can simply make the folder.
     */
    this.refuseCategoryAsShelf(folder)

    const name = this.requireValidName(draft.name)

    if (requiresVolume(draft.category) && draft.volumeId === null) {
      throw new AppError(`A ${draft.category} track has to belong to a ${draft.category}.`, {
        code: ErrorCode.Validation,
        hint: 'Choose an existing one, or create it first.',
        recoverable: false
      })
    }

    const { path } = await provisionProject({
      parentPath: folder.path,
      name,
      templatePath: setup.templatePath as string,
      // Every project already on disk is a place Live may have left a copy of
      // its icon, for the case where Live is installed somewhere non-standard.
      iconSources: (await this.projects.listRecords()).map((record) => record.path)
    })

    const scanned = await indexProject(path)

    return this.projects.adopt({
      scanned,
      folderId: folder.id,
      category: draft.category,
      volumeId: draft.volumeId,
      colour: this.resolveColour(draft.colour)
    })
  }

  // --------------------------------------------------------------- creating

  async createFolder(draft: FolderDraft): Promise<StacksTree> {
    this.refuseDuringScan()

    const projectsRoot = await this.requireProjectsRoot()
    const folders = await this.repository.listAll()

    const parent = draft.parentId ? this.requireFolder(folders, draft.parentId) : null
    // Top-level names are checked against the reserved wrapper directories as
    // well: those are the app's own and a category beside them must not
    // collide, even though the tree now sits one level down inside `Projects`.
    const name = this.requireValidName(draft.name, parent === null)

    this.requireValidKind(parent, draft.kind)

    if (parent && depthOf(parent, folders) + 1 >= MAX_FOLDER_DEPTH) {
      throw new AppError(`Folders can only be nested ${MAX_FOLDER_DEPTH} deep.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    this.refuseDuplicateSibling(folders, draft.parentId, name, null)

    const parentPath = parent ? parent.path : projectsRoot
    const path = join(parentPath, name)
    const now = Date.now()

    // Disk first: if the directory cannot be made, there is nothing to record.
    await createDirectory(path)

    const folder: ArchiveFolder = {
      id: randomUUID(),
      parentId: draft.parentId,
      name,
      kind: draft.kind,
      path,
      colour: this.resolveColour(draft.colour),
      order: siblingsOf(folders, draft.parentId).length,
      favourite: false,
      trashedAt: null,
      trashedFrom: null,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.insert(folder)
    logger.info(`Created folder ${path}`)

    return this.getTree()
  }

  // --------------------------------------------------------------- updating

  /**
   * Applies an operator edit to a folder.
   *
   * Rename and re-parent both move the directory, so they are resolved into a
   * single destination path and performed as one move — renaming and re-parenting
   * in the same patch must not produce two moves, the first of which could
   * succeed while the second fails.
   */
  async updateFolder(id: string, patch: FolderPatch): Promise<StacksTree> {
    this.refuseDuringScan()

    const folders = await this.repository.listAll()
    const folder = this.requireFolder(folders, id)

    const parentId = patch.parentId === undefined ? folder.parentId : patch.parentId
    const name =
      patch.name === undefined ? folder.name : this.requireValidName(patch.name, parentId === null)

    let next: ArchiveFolder = {
      ...folder,
      name,
      colour: patch.colour === undefined ? folder.colour : this.resolveColour(patch.colour),
      order: patch.order ?? folder.order,
      favourite: patch.favourite ?? folder.favourite,
      updatedAt: Date.now()
    }

    const moved = name !== folder.name || parentId !== folder.parentId

    if (moved) {
      const projectsRoot = await this.requireProjectsRoot()
      const parent = parentId ? this.requireFolder(folders, parentId) : null

      // Re-parenting is held to the same rule as creating. A genre that could
      // not be *made* inside another genre must not be able to arrive there by
      // being dragged, or the stored kind stops meaning anything.
      this.requireValidKind(parent, folder.kind)

      if (parent) {
        if (parent.id === folder.id || isDescendantOf(parent, folder, folders)) {
          throw new AppError('A folder cannot be moved inside itself.', {
            code: ErrorCode.Validation,
            recoverable: false
          })
        }

        const combined = depthOf(parent, folders) + 1 + subtreeHeight(folder, folders)
        if (combined >= MAX_FOLDER_DEPTH) {
          throw new AppError(`Folders can only be nested ${MAX_FOLDER_DEPTH} deep.`, {
            code: ErrorCode.Validation,
            hint: 'Move some of its sub-folders out first.',
            recoverable: false
          })
        }
      }

      this.refuseDuplicateSibling(folders, parentId, name, folder.id)

      const destination = join(parent ? parent.path : projectsRoot, name)
      await moveDirectory(folder.path, destination)
      logger.info(`Moved folder ${folder.path} -> ${destination}`)

      next = { ...next, parentId, path: destination }

      // The move already happened on disk, so every record that referenced a
      // path underneath it is now stale. Both cascades below re-point them.
      await this.cascadePaths(folders, folder.path, destination)
    }

    await this.repository.replace(next)
    return this.getTree()
  }

  /**
   * Re-points every descendant folder and every project underneath a moved folder.
   *
   * Prefix rewriting rather than a rescan: the files are byte-identical and keep
   * their timestamps, so there is nothing to re-read — only paths to correct.
   */
  private async cascadePaths(
    folders: readonly ArchiveFolder[],
    from: string,
    to: string
  ): Promise<void> {
    const descendants = folders
      // Strictly below: the folder that moved is written by the caller, which
      // is also applying the rest of its patch.
      .filter((entry) => isAtOrUnder(entry.path, from) && !samePath(entry.path, from))
      .map((entry) => ({
        ...entry,
        path: rewritePath(entry.path, from, to),
        updatedAt: Date.now()
      }))

    await this.repository.replaceMany(descendants)
    await this.projects.rewritePathsUnder(from, to)
  }

  // --------------------------------------------------------------- deleting

  /**
   * Moves a folder into the recycle bin, with everything inside it.
   *
   * This used to lift the contents up to the parent and then remove the — by
   * then empty — directory, behind a two-step confirmation. That was the safest
   * thing available before the archive had a bin of its own, but it was not
   * what the operator meant by "delete": the shelf vanished irreversibly, its
   * projects were scattered one level up, and the dialog's promise that
   * "nothing is deleted from disk" was not quite true of the directory itself.
   *
   * Now the whole subtree moves intact — one `moveDirectory` of the folder,
   * then bookkeeping for every descendant folder and every project underneath.
   * Because nothing is destroyed there is no need to refuse an occupied folder,
   * so the second confirmation is gone too.
   */
  async deleteFolder(id: string): Promise<StacksTree> {
    this.refuseDuringScan()

    const folders = await this.repository.listAll()
    const folder = this.requireFolder(folders, id)

    if (folder.trashedAt !== null) {
      throw new AppError(`“${folder.name}” is already in the bin.`, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }

    const bin = this.resolveRecycleBin()
    if (!bin) {
      throw new AppError('The ARCHIVE has not been set up yet.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    await ensureDirectory(bin)

    const from = folder.path
    const to = await claimName(bin, folder.name)
    const now = Date.now()

    // Disk first, as everywhere in this service. A move that cannot happen
    // leaves the tree exactly as it was.
    if (await directoryExists(from)) {
      await moveDirectory(from, to)
      logger.warn(`Binned folder ${from} -> ${to}`)
    }

    /*
     * Descendants are marked before the folder itself, and both record where
     * they were. `trashedFrom` is what makes restoring put the subtree back in
     * its original shape rather than flattening it into one directory.
     */
    const descendants = folders.filter(
      (entry) => isAtOrUnder(entry.path, from) && !samePath(entry.path, from)
    )

    await this.repository.replaceMany(
      descendants.map((entry) => ({
        ...entry,
        path: rewritePath(entry.path, from, to),
        trashedAt: now,
        trashedFrom: entry.path,
        updatedAt: now
      }))
    )

    const binned = await this.projects.applyTrashUnder(from, to, true)

    await this.repository.replace({
      ...folder,
      path: to,
      trashedAt: now,
      trashedFrom: from,
      updatedAt: now
    })

    logger.info(
      `Binned “${folder.name}” with ${descendants.length} folder(s) and ${binned} project(s)`
    )

    return this.getTree()
  }

  /**
   * Puts a binned folder and its whole subtree back.
   *
   * Restores to where it came from when that place still exists, and to the
   * wrapper root when it does not — a genre whose parent was itself deleted
   * comes back at the top of the tree rather than refusing to come back at all.
   */
  async restoreFolder(id: string): Promise<StacksTree> {
    this.refuseDuringScan()

    const folders = await this.repository.listAll()
    const folder = this.requireFolder(folders, id)

    if (folder.trashedAt === null) {
      throw new AppError(`“${folder.name}” is not in the bin.`, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }

    const wrapper = await this.requireWrapper()
    const origin = folder.trashedFrom
    const originParent = origin ? dirname(origin) : null

    const parent = originParent && (await directoryExists(originParent)) ? originParent : wrapper

    const from = folder.path
    const to = await claimName(parent, folder.name)
    const now = Date.now()

    if (await directoryExists(from)) {
      await moveDirectory(from, to)
      logger.info(`Restored folder ${from} -> ${to}`)
    }

    const descendants = folders.filter(
      (entry) => isAtOrUnder(entry.path, from) && !samePath(entry.path, from)
    )

    await this.repository.replaceMany(
      descendants.map((entry) => ({
        ...entry,
        path: rewritePath(entry.path, from, to),
        trashedAt: null,
        trashedFrom: null,
        updatedAt: now
      }))
    )

    await this.projects.applyTrashUnder(from, to, false)

    /*
     * Re-parent from where it actually landed.
     *
     * Restoring into the wrapper root makes it a genre again; restoring into a
     * surviving folder keeps it nested. Deriving the parent from the path means
     * the two cases need no separate handling, and a stale `parentId` pointing
     * at a folder that was deleted in the meantime cannot survive.
     */
    const parentFolder = folders.find(
      (entry) => entry.trashedAt === null && samePath(entry.path, parent)
    )

    await this.repository.replace({
      ...folder,
      parentId: parentFolder?.id ?? null,
      path: to,
      trashedAt: null,
      trashedFrom: null,
      updatedAt: now
    })

    return this.getTree()
  }

  // ---------------------------------------------------------------- filing

  /**
   * Moves a project into a folder, or back out of the tree.
   *
   * The three things that happen here are one operation from the operator's
   * point of view and must be treated as one: the folder moves on disk, the
   * record's paths are re-pointed, and the release's genre metadata is brought
   * into agreement with where it now sits.
   *
   * Nothing about genre is copied onto the record. The folder *is* the statement
   * of genre, and reading it off the tree when something needs it beats copying
   * it into a field that can then disagree with where the project sits.
   */
  async fileProject(projectId: string, folderId: string | null): Promise<ProjectRecord> {
    this.refuseDuringScan()

    const record = await this.projects.get(projectId)

    if (record.missing) {
      throw new AppError('That project folder is no longer on disk.', {
        code: ErrorCode.Validation,
        hint: 'Run a scan, or remove the record from the register.',
        recoverable: false
      })
    }

    if (record.folderId === folderId) return record

    const folders = await this.repository.listAll()
    const target = folderId ? this.requireFolder(folders, folderId) : null

    // Checked on the way in as well as on creation: a drag must not be able to
    // put a project somewhere the new-project dialog would have refused.
    if (target) this.refuseCategoryAsShelf(target)

    const destinationParent = target ? target.path : await this.unfiledDestination(record)
    const destination = join(destinationParent, basename(record.path))

    if (!samePath(destination, record.path)) {
      /*
       * COPY only applies on the way *in*, and only from outside the wrapper.
       *
       * Moving a project between two shelves is reorganising, not migrating —
       * duplicating it there would leave the operator with two copies of one
       * project inside their own archive, which is never what dragging between
       * genres means. Taking a project off the shelf is the same in reverse.
       */
      const migrating =
        this.settings.snapshot.workspace.migrationMode === 'copy' &&
        folderId !== null &&
        !isAtOrUnder(record.path, this.resolveWrapper() ?? destination)

      if (migrating) {
        await copyDirectory(record.path, destination)
        logger.info(`Copied ${record.name} into the archive: ${record.path} -> ${destination}`)
      } else {
        await moveDirectory(record.path, destination)
        logger.info(`Filed ${record.name}: ${record.path} -> ${destination}`)
      }

      /*
       * Conformed as it lands, so a project brought in from outside looks like
       * one made here rather than staying visibly foreign on the shelf.
       *
       * A no-op for the common case: Live wrote the icon the first time it
       * saved, so the stamp finds all three parts already present and returns.
       * It earns its place on the projects Live has never opened, and on a
       * cross-volume move, where the ReadOnly attribute that switches folder
       * customisation on does not reliably survive the copy.
       */
      await stampProjectIcon(destination, [record.path])
    }

    return this.projects.applyFiling(projectId, {
      folderId,
      from: record.path,
      to: destination
    })
  }

  /**
   * Files several projects and several folders in one gesture.
   *
   * Moves what it can and reports the rest, rather than stopping at the first
   * refusal. A name collision is the likely failure in a bulk migration and it
   * is specific to one item — halting would leave eleven good moves undone
   * because of the twelfth, and the operator would have to work out which had
   * already gone.
   *
   * All-or-nothing is not achievable here and is not claimed. There is no
   * staging area on a filesystem; by the time the eighth move fails, seven
   * directories have really moved. What is offered instead is an exact account
   * of what happened, which is the honest version of the same promise.
   *
   * Folders are re-parented before projects, so a project dropped into a folder
   * that is itself moving in the same batch lands in its new home rather than
   * chasing it.
   */
  async fileMany(
    projectIds: readonly string[],
    folderIds: readonly string[],
    folderId: string | null
  ): Promise<BulkFilingResult> {
    this.refuseDuringScan()

    const failures: BulkFilingResult['failures'] = []
    let moved = 0

    for (const id of folderIds) {
      // A folder cannot be filed into itself, and the tree guards that anyway;
      // catching here keeps one bad drop from ending the batch.
      try {
        await this.updateFolder(id, { parentId: folderId })
        moved += 1
      } catch (error) {
        failures.push({ id, name: await this.folderName(id), reason: describe(error) })
      }
    }

    for (const id of projectIds) {
      try {
        await this.fileProject(id, folderId)
        moved += 1
      } catch (error) {
        const record = await this.projects.get(id).catch(() => null)
        failures.push({ id, name: record?.name ?? id, reason: describe(error) })
      }
    }

    logger.info(`Filed ${moved} of ${projectIds.length + folderIds.length}`)
    return { moved, failures }
  }

  /** A category holds genres and artists, never projects. See `createProject`. */
  private refuseCategoryAsShelf(folder: ArchiveFolder): void {
    if (folder.kind !== 'category') return

    throw new AppError(`“${folder.name}” is a category, so it does not hold projects.`, {
      code: ErrorCode.Validation,
      hint: 'File it into a genre or an artist inside it.',
      recoverable: false
    })
  }

  private async folderName(id: string): Promise<string> {
    const folders = await this.repository.listAll()
    return folders.find((entry) => entry.id === id)?.name ?? id
  }

  // -------------------------------------------------- final mix and master

  /**
   * Promotes a bounce to the project's final mix and master.
   *
   * The file **moves** into `Release Mastered Tracks` under a name the
   * operator types, rather than being copied there. One file in one place: the
   * directory is a trustworthy list of finished tracks precisely because the
   * audio cannot also be sitting somewhere else under a different name.
   *
   * Disk first, database second, as everywhere in this service. A demotion of
   * the previous final happens before the new move, so the directory never
   * holds two finals for one project even briefly.
   */
  async setFinalMaster(
    projectId: string,
    sourcePath: string,
    name: string
  ): Promise<ProjectRecord> {
    this.refuseDuringScan()

    const record = await this.projects.get(projectId)
    const root = this.resolveMasteredTracksRoot()

    if (!root) {
      throw new AppError('The ARCHIVE has not been set up yet.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (!isAtOrUnder(sourcePath, record.path)) {
      throw new AppError('That file is not in this project.', {
        code: ErrorCode.Validation,
        hint: 'The final mix and master is chosen from the audio inside the project folder.',
        recoverable: false
      })
    }

    const trimmed = name.trim()
    if (!trimmed) {
      throw new AppError('The final mix and master needs a name.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    // The operator names the track, not the file type. Carrying the extension
    // over means they cannot accidentally produce a `.wav` called `.mp3`.
    const extension = extname(sourcePath)
    const fileName = trimmed.toLowerCase().endsWith(extension.toLowerCase())
      ? trimmed
      : `${trimmed}${extension}`

    const verdict = validateFolderName(fileName)
    if (!verdict.ok) {
      throw new AppError(verdict.reason ?? 'That name cannot be used.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    await ensureDirectory(root)
    const destination = join(root, fileName)

    // Put the outgoing final back before moving the new one out, so the two
    // can never both be in the directory under this project's name.
    const restored = record.masters.final ? await this.returnFinalMaster(record) : record

    await moveFile(sourcePath, destination)
    logger.info(`Final master for ${record.name}: ${sourcePath} -> ${destination}`)

    /*
     * The source path is dropped from the buckets and from the scanned audio
     * list. It has left the project folder, so every one of those references
     * is now stale, and the next scan would drop them anyway — doing it here
     * means the dossier is right immediately rather than after a rescan.
     */
    return this.projects.applyFinalMaster(projectId, {
      final: destination,
      removedPath: sourcePath,
      wips: restored.masters.wips,
      masters: restored.masters.masters
    })
  }

  /**
   * Demotes the final, moving the file back into the project folder.
   *
   * It keeps the name the operator typed rather than reverting to whatever it
   * was called before. That name was a deliberate choice, and renaming it a
   * second time would be the app changing a filename the operator set.
   */
  async clearFinalMaster(projectId: string): Promise<ProjectRecord> {
    this.refuseDuringScan()
    const record = await this.projects.get(projectId)

    if (!record.masters.final) return record

    const returned = await this.returnFinalMaster(record)
    return this.projects.applyFinalMaster(returned.id, {
      final: null,
      removedPath: null,
      wips: returned.masters.wips,
      masters: returned.masters.masters
    })
  }

  /** Moves a project's current final back into its folder. Disk only. */
  private async returnFinalMaster(record: ProjectRecord): Promise<ProjectRecord> {
    const current = record.masters.final
    if (!current) return record

    if (await pathExists(current)) {
      await moveFile(current, join(record.path, basename(current)))
      logger.info(`Returned ${basename(current)} to ${record.name}`)
    } else {
      // Gone from under us — deleted in Explorer, most likely. Clearing the
      // record is still the right outcome; refusing would leave the project
      // permanently claiming a final that does not exist.
      logger.warn(`Final master for ${record.name} was already gone from ${current}`)
    }

    return record
  }

  // ------------------------------------------------------------ recycle bin

  /**
   * Moves a project's folder into the archive's recycle bin.
   *
   * Sited here rather than on the projects service for the same reason
   * `fileProject` is: it needs the wrapper's path, and the wrapper belongs to
   * the stacks. Projects reaching back for it would make the two mutually
   * dependent.
   *
   * The record is kept, complete, with the path it came from. That is the
   * entire advantage of an archive-owned bin over the operating system's: this
   * is a reversible move rather than a deletion, and the thing that makes it
   * reversible is remembering the origin.
   */
  async trashProject(projectId: string): Promise<ProjectRecord> {
    this.refuseDuringScan()

    const record = await this.projects.get(projectId)

    if (record.trashedAt !== null) {
      throw new AppError(`“${record.name}” is already in the bin.`, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }

    const bin = this.resolveRecycleBin()
    if (!bin) {
      throw new AppError('The ARCHIVE has not been set up yet.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    await ensureDirectory(bin)

    /*
     * A project whose folder has already vanished is binned as a record only.
     *
     * Refusing would leave the operator unable to clear a row for a folder they
     * deleted in Explorer — the one case where they most want the register
     * tidied up.
     */
    if (record.missing || !(await directoryExists(record.path))) {
      return this.projects.applyTrash(projectId, {
        from: record.path,
        to: record.path,
        trashed: true
      })
    }

    const destination = await claimName(bin, basename(record.path))
    await moveDirectory(record.path, destination)
    logger.warn(`Binned ${record.name}: ${record.path} -> ${destination}`)

    return this.projects.applyTrash(projectId, {
      from: record.path,
      to: destination,
      trashed: true
    })
  }

  /**
   * Puts a binned project back where it came from.
   *
   * Falls back to the filing root when the original location has gone — a shelf
   * deleted while the project sat in the bin. Coming back unfiled is recoverable
   * in one drag; refusing to restore at all is not, and would strand the project
   * in the bin permanently.
   */
  async restoreProject(projectId: string): Promise<ProjectRecord> {
    this.refuseDuringScan()

    const record = await this.projects.get(projectId)

    if (record.trashedAt === null) {
      throw new AppError(`“${record.name}” is not in the bin.`, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }

    const origin = record.trashedFrom
    const originParent = origin ? dirname(origin) : null

    const parent =
      originParent && (await directoryExists(originParent))
        ? originParent
        : this.resolveFilingRoot()

    if (!parent) {
      throw new AppError('There is nowhere to restore this project to.', {
        code: ErrorCode.Validation,
        hint: 'Set the archive location again in the INDEXING panel.',
        recoverable: false
      })
    }

    // The record is kept for a project whose folder was already gone when it
    // was binned; there is nothing on disk to move back.
    if (!(await directoryExists(record.path))) {
      return this.projects.applyTrash(projectId, {
        from: record.path,
        to: record.path,
        trashed: false
      })
    }

    const destination = await claimName(parent, basename(record.path))
    await moveDirectory(record.path, destination)
    logger.info(`Restored ${record.name}: ${record.path} -> ${destination}`)

    const restored = await this.projects.applyTrash(projectId, {
      from: record.path,
      to: destination,
      trashed: false
    })

    /*
     * Re-file from where it actually landed.
     *
     * Restoring to a folder that still exists should put the project back on
     * that shelf, and restoring to the filing root should leave it unfiled.
     * Both fall out of asking the same reconciliation the scan uses rather than
     * trusting the folder id the record was carrying.
     */
    const resolved = await this.reconcileFiling([restored])
    const folderId = resolved.get(restored.id)

    if (folderId !== undefined && folderId !== restored.folderId) {
      return this.projects.applyFiling(restored.id, {
        folderId,
        from: restored.path,
        to: restored.path
      })
    }

    return restored
  }

  /**
   * Removes a binned folder for good, with everything inside it.
   *
   * Refused for anything not already in the bin — the same safety property the
   * project path has: no single action takes a live shelf from the tree to
   * gone. Emptying the bin is a second, deliberate act.
   *
   * The directory goes to the *operating system's* recycle bin rather than
   * being unlinked, so even this last step is recoverable by someone who knows
   * to look. Disk first, then the records: the folder, every folder beneath it,
   * and every project that was filed in any of them.
   */
  async purgeFolder(id: string): Promise<StacksTree> {
    this.refuseDuringScan()

    const folders = await this.repository.listAll()
    const folder = this.requireFolder(folders, id)

    if (folder.trashedAt === null) {
      throw new AppError(`“${folder.name}” has not been deleted.`, {
        code: ErrorCode.Validation,
        hint: 'Delete it first; the bin is the only place anything is purged from.',
        recoverable: false
      })
    }

    if (await directoryExists(folder.path)) {
      try {
        await shell.trashItem(folder.path)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new AppError(`Could not remove “${folder.name}”.`, {
          code: ErrorCode.Unknown,
          hint: `${message} A set open in Ableton Live will hold the folder.`,
          recoverable: true
        })
      }
    }

    const descendants = folders.filter((entry) => isAtOrUnder(entry.path, folder.path))
    for (const entry of descendants) await this.repository.deleteById(entry.id)

    const projects = await this.projects.forgetUnder(folder.path)

    logger.warn(
      `Purged “${folder.name}” from ${folder.path}: ` +
        `${descendants.length} folder(s), ${projects} project(s)`
    )

    return this.getTree()
  }

  /**
   * Where an unfiled project goes.
   *
   * Out of the wrapper entirely, into the filing root itself — which is where
   * projects lived before any of this existed. Unfiling should undo filing, not
   * leave the project in a different corner of the app's own directory.
   */
  private async unfiledDestination(record: ProjectRecord): Promise<string> {
    const wrapper = this.resolveWrapper()

    // A project that was never inside the wrapper is already unfiled as far as
    // the disk is concerned; leave it exactly where the operator keeps it.
    if (!wrapper || !isAtOrUnder(record.path, wrapper)) {
      return dirname(record.path)
    }

    /*
     * Home is where the register first found it.
     *
     * This used to return the filing root, which is not anywhere the operator
     * ever put anything — a project discovered on an external drive, filed
     * into a genre, then taken off the shelf, landed beside `Candy Haven`
     * rather than back where it came from. The record now remembers, so it can
     * go home.
     */
    const origin = record.originPath ? dirname(record.originPath) : null

    if (!origin) {
      throw new AppError(`There is no recorded original location for “${record.name}”.`, {
        code: ErrorCode.Validation,
        hint: 'It was either created inside the archive, or filed before origins were recorded. Use File to… to choose where it should go.',
        recoverable: false
      })
    }

    /*
     * A refusal rather than a fallback when the original location is gone —
     * an unplugged drive, a folder deleted in Explorer, a root removed from
     * settings. Quietly putting it somewhere else is the behaviour this whole
     * change exists to remove, and an unplugged drive is recoverable: plug it
     * in and the same gesture works.
     */
    if (!(await directoryExists(origin))) {
      throw new AppError(`“${record.name}” came from a location that is no longer reachable.`, {
        code: ErrorCode.NotFound,
        hint: `Expected ${origin}. Reconnect it and try again, or use File to… to choose somewhere else.`,
        recoverable: true
      })
    }

    return origin
  }

  /**
   * Recomputes which folder each project sits in, from its path.
   *
   * Called after a scan. The tree and the filesystem are two views of one thing,
   * and the operator is perfectly entitled to drag a project between genre
   * folders in Explorer — this is what stops the app disagreeing with what they
   * can plainly see.
   */
  async reconcileFiling(records: readonly ProjectRecord[]): Promise<Map<string, string | null>> {
    await this.pruneMissingFolders()

    const folders = await this.repository.listAll()
    const resolved = new Map<string, string | null>()

    if (folders.length === 0) return resolved

    /*
     * Deepest path first, so a project inside `Hip Hop/Boom Bap` is recorded
     * against the folder it actually sits in rather than the genre that also
     * contains it.
     *
     * No folder is excluded: every one of them may legitimately hold projects,
     * so whatever directory a project is sitting in is the answer.
     */
    const byDepth = [...folders].sort((a, b) => b.path.length - a.path.length)

    for (const record of records) {
      const parent = dirname(record.path).toLowerCase()
      const match = byDepth.find((folder) => folder.path.toLowerCase() === parent)
      const folderId = match?.id ?? null

      if (record.folderId !== folderId) resolved.set(record.id, folderId)
    }

    return resolved
  }

  /**
   * Drops folder records whose directory has been deleted outside the app.
   *
   * Guarded on the wrapper still being present, and that guard is the whole
   * point. If the filing root is an external drive that happens to be unplugged
   * — or a root the operator has just removed from settings — then *every*
   * folder looks missing, and pruning would silently delete the operator's
   * entire filing structure from the register in response to a USB cable. With
   * the wrapper gone, the correct conclusion is "cannot see the shelves right
   * now", not "there are no shelves".
   */
  private async pruneMissingFolders(): Promise<number> {
    const wrapper = this.resolveWrapper()
    if (!wrapper || !(await directoryExists(wrapper))) return 0

    const folders = await this.repository.listAll()
    let pruned = 0

    for (const folder of folders) {
      if (await directoryExists(folder.path)) continue
      await this.repository.deleteById(folder.id)
      logger.warn(`Folder ${folder.name} no longer exists at ${folder.path}; dropped from the tree`)
      pruned += 1
    }

    return pruned
  }

  // ----------------------------------------------------------------- guards

  /**
   * Refuses a write while a scan is in flight.
   *
   * A scan reconciles records against paths it read at the start of the walk.
   * Moving a folder underneath it would have the scan file its findings against
   * a location that no longer exists, and mark a perfectly present project as
   * missing.
   */
  private refuseDuringScan(): void {
    const { phase } = this.projects.scan
    if (phase === 'walking' || phase === 'analysing' || phase === 'persisting') {
      throw new AppError('A scan is running.', {
        code: ErrorCode.Validation,
        hint: 'Wait for it to finish, or cancel it, before moving anything.',
        recoverable: true
      })
    }
  }

  private requireFolder(folders: readonly ArchiveFolder[], id: string): ArchiveFolder {
    const folder = folders.find((entry) => entry.id === id)
    if (!folder) {
      throw new AppError('That folder is no longer in the tree.', {
        code: ErrorCode.NotFound,
        recoverable: true
      })
    }
    return folder
  }

  /**
   * Refuses a folder kind that may not sit where it is being put.
   *
   * This is what keeps a *stored* kind honest. Kind used to be read off depth,
   * so it could not disagree with position; now that the operator chooses it,
   * the guarantee has to come from the other direction — position is
   * constrained to the kinds that are legal there, and an illegal arrangement
   * is refused rather than silently reinterpreted.
   *
   * Applied on create and on re-parent alike, which is the part that matters:
   * a genre that could not be created inside another genre must not be able to
   * arrive there by being dragged.
   */
  private requireValidKind(parent: ArchiveFolder | null, kind: FolderKind): void {
    if (isValidChildKind(parent?.kind ?? null, kind)) return

    const where = parent ? `a ${FOLDER_KIND_LABEL[parent.kind].toLowerCase()}` : 'the top level'
    const allowed = allowedChildKinds(parent?.kind ?? null)
      .map((entry) => FOLDER_KIND_LABEL[entry])
      .join(' or ')

    throw new AppError(`A ${FOLDER_KIND_LABEL[kind].toLowerCase()} cannot go inside ${where}.`, {
      code: ErrorCode.Validation,
      hint: `${where[0].toUpperCase()}${where.slice(1)} holds ${allowed}.`,
      recoverable: false
    })
  }

  private requireValidName(name: string, topLevel = false): string {
    const verdict = validateFolderName(name, topLevel)
    if (!verdict.ok) {
      throw new AppError(verdict.reason ?? 'That name cannot be used.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
    return name.trim()
  }

  private refuseDuplicateSibling(
    folders: readonly ArchiveFolder[],
    parentId: string | null,
    name: string,
    exceptId: string | null
  ): void {
    const clash = siblingsOf(folders, parentId).some(
      (entry) => entry.id !== exceptId && entry.name.toLowerCase() === name.toLowerCase()
    )

    if (clash) {
      throw new AppError(`There is already a folder called “${name}” here.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
  }

  /**
   * Settles a colour before it is stored.
   *
   * Validated, never rewritten. An earlier build ran this through a
   * `clampToPalette` that folded out-of-band hues into the world's crimson-to-
   * gold range; it was removed on the operator's instruction, and the reasoning
   * is recorded on `isHexColour` in stacks.constants.ts. All that survives is
   * the case normalisation, which does not change the colour.
   */
  private resolveColour(colour: string | undefined): string {
    if (!colour || !isHexColour(colour)) return DEFAULT_FOLDER_COLOUR
    return normaliseHex(colour)
  }
}

// ------------------------------------------------------------------ helpers

/**
 * Where the archive goes when the operator has no opinion.
 *
 * The OS music folder — `%USERPROFILE%\Music` on Windows. Chosen over the
 * projects directory, which is what an earlier build defaulted to: an archive
 * that builds itself inside whatever folder happens to hold the operator's
 * Ableton projects buries its own structure in someone else's, and forces the
 * two to share a disk. Music is where a music library belongs, it is backed up
 * by every sync tool by default, and it is somewhere the operator can find
 * without being told.
 *
 * Falls back to the home directory if Electron cannot resolve one — which it
 * can on every supported platform, but a thrown error here would take out the
 * whole setup state and with it the gate that fixes the problem.
 */
function defaultArchiveRoot(): string {
  try {
    return app.getPath('music')
  } catch {
    try {
      return app.getPath('home')
    } catch {
      return ''
    }
  }
}

/**
 * Finds a free name for a directory about to be moved into `parent`.
 *
 * Two projects can legitimately share a folder name — deleted, restored, and
 * deleted again, or two genres each with an `Untitled Project`. Suffixing
 * rather than refusing means the bin never rejects a deletion, which would be a
 * strange thing for a bin to do.
 */
async function claimName(parent: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = join(parent, attempt === 0 ? name : `${name} (${attempt + 1})`)
    if (!(await pathExists(candidate))) return candidate
  }

  throw new AppError(`Could not find a free name for “${name}”.`, {
    code: ErrorCode.Validation,
    hint: 'Empty some of the recycle bin first.',
    recoverable: false
  })
}

function siblingsOf(
  folders: readonly ArchiveFolder[],
  parentId: string | null
): readonly ArchiveFolder[] {
  return folders.filter((folder) => folder.parentId === parentId)
}

/** Ancestors from the top of the tree down to the folder itself. */
function ancestorsOf(
  folder: ArchiveFolder,
  folders: readonly ArchiveFolder[]
): readonly ArchiveFolder[] {
  const trail: ArchiveFolder[] = [folder]
  let current = folder

  // Bounded by the depth limit, so a cycle introduced by a corrupt record
  // cannot spin here.
  for (let step = 0; step < MAX_FOLDER_DEPTH && current.parentId; step += 1) {
    const parent = folders.find((entry) => entry.id === current.parentId)
    if (!parent) break
    trail.unshift(parent)
    current = parent
  }

  return trail
}

/**
 * How many levels sit above this folder. A top-level folder is 0.
 *
 * Used for the nesting limit and to decide which mark a tile draws — depth 0 is
 * a genre, below that is a plain folder. It no longer gates anything: every
 * folder may hold projects. See `folderKindAtDepth` in stacks.constants.ts.
 */
function depthOf(folder: ArchiveFolder, folders: readonly ArchiveFolder[]): number {
  return ancestorsOf(folder, folders).length - 1
}

/** How many levels sit below this folder. A leaf is 0. */
function subtreeHeight(folder: ArchiveFolder, folders: readonly ArchiveFolder[]): number {
  const children = folders.filter((entry) => entry.parentId === folder.id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((child) => subtreeHeight(child, folders)))
}

function isDescendantOf(
  candidate: ArchiveFolder,
  ancestor: ArchiveFolder,
  folders: readonly ArchiveFolder[]
): boolean {
  return ancestorsOf(candidate, folders).some((entry) => entry.id === ancestor.id)
}
