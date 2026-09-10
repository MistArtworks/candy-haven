import { randomUUID } from 'node:crypto'
import { copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  ArchiveRelease,
  DeliverableKind,
  ReleaseDraft,
  ReleasePatch,
  ReleaseSummary
} from '@shared/domain/releases'
import {
  DELIVERABLE_DESTINATION,
  DELIVERABLE_LABEL,
  RELEASE_SCAFFOLD_FOLDERS,
  slugifyReleaseTitle
} from '@shared/domain/releases.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ProjectsService } from '@main/services/projects/projects.service'
import type { StacksService } from '@main/services/stacks/stacks.service'
import type { VolumesService } from '@main/services/volumes/volumes.service'
import {
  ensureDirectory,
  moveDirectory,
  pathExists,
  samePath
} from '@main/services/stacks/filesystem'
import { ReleasesRepository } from './releases.repository'

const logger = getLogger('releases')

/**
 * RELEASES — what is going out, and the files that go with it.
 *
 * A release owns a real directory under `<wrapper>/RELEASES`, which makes this
 * the second service after the stacks that writes to disk, and it follows the
 * same rule: **disk first, database second.** A directory that cannot be made
 * leaves no record behind; a record written after a successful move can be
 * reconciled.
 *
 * The decision that shapes everything here is that a release **copies** rather
 * than moves. The project stays filed under its genre, and the master, cover
 * and canvas are duplicated into the release folder. Moving them would empty
 * the shelf the operator filed the work on and leave the genre tree full of
 * holes the moment anything shipped — and the duplication costs one audio file
 * and two images per release, which is nothing next to the project itself.
 *
 * Deliberately small in this pass. Distribution metadata — ISRC, UPC, label,
 * copyright, platform links — is not modelled at all; it is waiting on the
 * scheduling system that replaces TRANSMISSIONS.
 */
export class ReleasesService {
  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService,
    private readonly volumes: VolumesService,
    private readonly stacks: StacksService
  ) {}

  private get repository(): ReleasesRepository {
    return new ReleasesRepository(this.archive.getDb())
  }

  // ---------------------------------------------------------------- reading

  /**
   * Every release, with its subject resolved.
   *
   * `orphaned` is reported rather than hidden. A release whose project has been
   * forgotten or trashed is still a true statement about something that shipped,
   * and quietly dropping it from the list would lose the record of a release
   * the operator actually made.
   */
  async list(): Promise<ReleaseSummary[]> {
    const releases = await this.repository.listAll()
    if (releases.length === 0) return []

    const records = await this.projects.listRecords()
    const projectsById = new Map(records.map((record) => [record.id, record]))

    const volumes = await this.volumes.list()
    const volumesById = new Map(volumes.map((volume) => [volume.id, volume]))

    return releases.map((release) => {
      const attached = countAttached(release)

      if (release.subjectKind === 'volume') {
        const volume = volumesById.get(release.subjectId)
        return {
          ...release,
          subjectName: volume?.title ?? release.title,
          orphaned: volume === undefined,
          trackCount: volume?.trackCount ?? 0,
          attached
        }
      }

      const project = projectsById.get(release.subjectId)
      return {
        ...release,
        subjectName: project?.name ?? release.title,
        orphaned: project === undefined,
        trackCount: project ? 1 : 0,
        attached
      }
    })
  }

  async get(id: string): Promise<ArchiveRelease> {
    const release = await this.repository.findById(id)
    if (!release) {
      throw new AppError('That release is no longer in the register.', {
        code: ErrorCode.NotFound,
        recoverable: true
      })
    }
    return release
  }

  // --------------------------------------------------------------- creating

  async create(draft: ReleaseDraft): Promise<ReleaseSummary> {
    const existing = await this.repository.findBySubject(draft.subjectId)
    if (existing) {
      throw new AppError(`“${existing.title}” has already been raised for release.`, {
        code: ErrorCode.Validation,
        hint: 'Open it in the RELEASES lens to change its date or deliverables.',
        recoverable: true
      })
    }

    const subject = await this.resolveSubject(draft.subjectKind, draft.subjectId)
    const title = (draft.title?.trim() || subject.name).trim()
    const root = await this.requireReleasesRoot()

    const path = await this.claimDirectory(root, title)
    for (const folder of RELEASE_SCAFFOLD_FOLDERS) {
      await ensureDirectory(join(path, folder))
    }

    const now = Date.now()
    const release: ArchiveRelease = {
      id: randomUUID(),
      subjectKind: draft.subjectKind,
      subjectId: draft.subjectId,
      title,
      category: subject.category,
      releaseDate: draft.releaseDate ?? null,
      path,
      master: { sourcePath: null, copiedPath: null, copiedAt: null },
      cover: { sourcePath: null, copiedPath: null, copiedAt: null },
      canvas: { sourcePath: null, copiedPath: null, copiedAt: null },
      notes: '',
      createdAt: now,
      updatedAt: now
    }

    /*
     * A project's own final master is attached automatically when it has one.
     *
     * The operator chose that file already, in the project record; asking them
     * to choose it a second time to say the same thing would be busywork. Cover
     * and canvas are left empty because nothing in the project claims to be
     * either — the images it holds are whatever happened to be in GRAPHICS.
     */
    await this.repository.insert(release)
    logger.info(`Raised release “${title}” at ${path}`)

    if (subject.finalMaster) {
      return this.summarise(await this.attach(release.id, 'master', subject.finalMaster))
    }

    return this.summarise(release)
  }

  // --------------------------------------------------------------- updating

  async update(id: string, patch: ReleasePatch): Promise<ReleaseSummary> {
    const current = await this.get(id)
    let next: ArchiveRelease = {
      ...current,
      releaseDate: patch.releaseDate === undefined ? current.releaseDate : patch.releaseDate,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      updatedAt: Date.now()
    }

    const title = patch.title?.trim()
    if (title && title !== current.title) {
      if (title.length === 0) {
        throw new AppError('A release needs a title.', {
          code: ErrorCode.Validation,
          recoverable: false
        })
      }

      const root = await this.requireReleasesRoot()
      const destination = join(root, slugifyReleaseTitle(title))

      if (!samePath(destination, current.path)) {
        if (await pathExists(destination)) {
          throw new AppError(`There is already a release folder called “${title}”.`, {
            code: ErrorCode.Validation,
            recoverable: false
          })
        }

        // Disk first: a rename that cannot happen leaves the record alone.
        await moveDirectory(current.path, destination)
        logger.info(`Renamed release ${current.path} -> ${destination}`)
      }

      next = {
        ...next,
        title,
        path: destination,
        // Every copied file sat inside the directory that just moved, so the
        // recorded paths are stale. Source paths are untouched: they point into
        // the project folder, which has not moved.
        master: repoint(next.master, current.path, destination),
        cover: repoint(next.cover, current.path, destination),
        canvas: repoint(next.canvas, current.path, destination)
      }
    }

    await this.repository.replace(next)
    return this.summarise(next)
  }

  /**
   * Copies a chosen file into the release folder.
   *
   * Both paths are kept — where it came from, and where the copy now sits. The
   * source is what the picker shows as selected; the copy is what explains the
   * file the operator can see in Explorer. Keeping only one of them loses half
   * the story.
   */
  async attach(
    id: string,
    kind: DeliverableKind,
    sourcePath: string | null
  ): Promise<ArchiveRelease> {
    const release = await this.get(id)

    if (sourcePath === null) {
      /*
       * Detaching leaves the copy on disk.
       *
       * It was assembled deliberately and may well be the file already sent to
       * a distributor. Removing it because a selection changed would be the app
       * deleting something the operator can see, which nothing here does
       * without being asked plainly.
       */
      const next: ArchiveRelease = {
        ...release,
        [kind]: { sourcePath: null, copiedPath: null, copiedAt: null },
        updatedAt: Date.now()
      }
      await this.repository.replace(next)
      return next
    }

    if (!(await pathExists(sourcePath))) {
      throw new AppError(`That ${DELIVERABLE_LABEL[kind].toLowerCase()} could not be found.`, {
        code: ErrorCode.NotFound,
        hint: `Expected a file at ${sourcePath}.`,
        recoverable: false
      })
    }

    const destinationFolder = join(release.path, DELIVERABLE_DESTINATION[kind])
    await ensureDirectory(destinationFolder)

    const copiedPath = join(destinationFolder, basename(sourcePath))

    try {
      await copyFile(sourcePath, copiedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError(`Could not copy ${basename(sourcePath)} into the release.`, {
        code: ErrorCode.Unknown,
        hint: message,
        recoverable: true
      })
    }

    const next: ArchiveRelease = {
      ...release,
      [kind]: { sourcePath, copiedPath, copiedAt: Date.now() },
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    logger.info(`Attached ${kind} to “${release.title}”`)
    return next
  }

  // --------------------------------------------------------------- deleting

  /**
   * Drops the record and leaves the directory.
   *
   * The asymmetry with `projects.trash` is deliberate. A release folder holds
   * copies the operator assembled for a hand-off — possibly the exact files a
   * distributor already has — so removing the record should stop the app
   * tracking it, not reach into the filesystem. Deleting the folder is an
   * Explorer job, and an obvious one.
   */
  async remove(id: string): Promise<void> {
    const release = await this.get(id)
    await this.repository.deleteById(id)
    logger.info(`Dropped release “${release.title}”; ${release.path} left on disk`)
  }

  // ----------------------------------------------------------------- guards

  private async requireReleasesRoot(): Promise<string> {
    const root = this.stacks.resolveReleasesRoot()
    if (!root) {
      throw new AppError('The ARCHIVE has not been set up yet.', {
        code: ErrorCode.Validation,
        hint: 'Choose the folder that holds your Ableton projects first.',
        recoverable: false
      })
    }

    await ensureDirectory(root)
    return root
  }

  /**
   * Finds a free directory for a release title.
   *
   * Two releases can legitimately share a name — a single and the album track
   * of the same name — so a collision suffixes rather than refuses. The record
   * keeps the operator's title either way; only the directory is disambiguated.
   */
  private async claimDirectory(root: string, title: string): Promise<string> {
    const base = slugifyReleaseTitle(title)

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = join(root, attempt === 0 ? base : `${base} (${attempt + 1})`)
      if (!(await pathExists(candidate))) {
        await ensureDirectory(candidate)
        return candidate
      }
    }

    throw new AppError(`Could not find a free folder name for “${title}”.`, {
      code: ErrorCode.Validation,
      hint: 'Rename or clear some of the existing release folders.',
      recoverable: false
    })
  }

  /** Resolves the project or volume a release is being raised for. */
  private async resolveSubject(
    kind: ArchiveRelease['subjectKind'],
    id: string
  ): Promise<{ name: string; category: ArchiveRelease['category']; finalMaster: string | null }> {
    if (kind === 'volume') {
      const volume = await this.volumes.get(id)
      return { name: volume.title, category: volume.kind, finalMaster: null }
    }

    const project = await this.projects.get(id)
    return {
      name: project.name,
      category: project.category,
      finalMaster: project.masters.final
    }
  }

  private async summarise(release: ArchiveRelease): Promise<ReleaseSummary> {
    const all = await this.list()
    const found = all.find((entry) => entry.id === release.id)
    if (found) return found

    // Only reachable if the record vanished between the write and the read.
    return {
      ...release,
      subjectName: release.title,
      orphaned: true,
      trackCount: 0,
      attached: countAttached(release)
    }
  }
}

// ------------------------------------------------------------------ helpers

function countAttached(release: ArchiveRelease): number {
  return [release.master, release.cover, release.canvas].filter(
    (deliverable) => deliverable.copiedPath !== null
  ).length
}

/** Re-points a copied file after its release folder was renamed. */
function repoint(
  deliverable: ArchiveRelease['master'],
  from: string,
  to: string
): ArchiveRelease['master'] {
  if (!deliverable.copiedPath) return deliverable
  return { ...deliverable, copiedPath: deliverable.copiedPath.replace(from, to) }
}
