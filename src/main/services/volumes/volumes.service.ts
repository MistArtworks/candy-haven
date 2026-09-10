import { randomUUID } from 'node:crypto'
import type { ProjectRecord } from '@shared/domain/projects'
import type { ArchiveVolume, VolumeDraft, VolumePatch, VolumeSummary } from '@shared/domain/volumes'
import { validateVolumeTitle } from '@shared/domain/volumes.constants'
import { DEFAULT_FOLDER_COLOUR, isHexColour, normaliseHex } from '@shared/domain/stacks.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ProjectsService } from '@main/services/projects/projects.service'
import { VolumesRepository } from './volumes.repository'

const logger = getLogger('volumes')

/**
 * VOLUMES — albums, EPs and compilations.
 *
 * The quiet service in the ARCHIVE, and the reason is worth stating: **nothing
 * here touches the filesystem.** A volume is a record that says "these tracks
 * are one work"; the tracks themselves stay filed on the shelf the operator put
 * them on, and no directory is created, moved or removed by anything below.
 *
 * That makes this the only ARCHIVE service without the disk-first ordering the
 * others are built around, because there is no disk half to order against.
 *
 * Membership is read through `ProjectsService` rather than through a second
 * repository on the projects collection, and written the same way — the same
 * arrangement the stacks use, so projects keep one owner.
 */
export class VolumesService {
  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService
  ) {}

  private get repository(): VolumesRepository {
    return new VolumesRepository(this.archive.getDb())
  }

  // ---------------------------------------------------------------- reading

  /**
   * Every volume, with the figures its tile shows.
   *
   * The register is read once and bucketed in memory rather than queried per
   * volume. An operator has tens of volumes and hundreds of projects, so one
   * pass is both simpler and faster than N round trips — the same reasoning
   * recorded on `ProjectsRepository.listAll`.
   */
  async list(): Promise<VolumeSummary[]> {
    const volumes = await this.repository.listAll()
    if (volumes.length === 0) return []

    const records = await this.projects.listRecords()
    const tracks = new Map<string, ProjectRecord[]>()

    for (const record of records) {
      if (!record.volumeId) continue
      const bucket = tracks.get(record.volumeId)
      if (bucket) bucket.push(record)
      else tracks.set(record.volumeId, [record])
    }

    return volumes.map((volume) => summarise(volume, tracks.get(volume.id) ?? []))
  }

  async get(id: string): Promise<ArchiveVolume> {
    const volume = await this.repository.findById(id)
    if (!volume) {
      throw new AppError('That volume is no longer in the register.', {
        code: ErrorCode.NotFound,
        recoverable: true
      })
    }
    return volume
  }

  /** The tracks on a volume, in running order. */
  async tracksOf(id: string): Promise<ProjectRecord[]> {
    const records = await this.projects.listRecords()
    return records.filter((record) => record.volumeId === id).sort(byTrackNumber)
  }

  // --------------------------------------------------------------- creating

  async create(draft: VolumeDraft): Promise<VolumeSummary> {
    const title = this.requireValidTitle(draft.title)
    await this.refuseDuplicateTitle(title, null)

    const now = Date.now()
    const volume: ArchiveVolume = {
      id: randomUUID(),
      kind: draft.kind,
      title,
      artist: draft.artist?.trim() ?? '',
      colour: resolveColour(draft.colour),
      artworkPath: null,
      notes: '',
      folderId: draft.folderId ?? null,
      favourite: false,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.insert(volume)
    logger.info(`Created ${volume.kind} “${volume.title}”`)

    return summarise(volume, [])
  }

  // --------------------------------------------------------------- updating

  async update(id: string, patch: VolumePatch): Promise<VolumeSummary> {
    const current = await this.get(id)
    const title = patch.title === undefined ? current.title : this.requireValidTitle(patch.title)

    if (title.toLowerCase() !== current.title.toLowerCase()) {
      await this.refuseDuplicateTitle(title, id)
    }

    const next: ArchiveVolume = {
      ...current,
      kind: patch.kind ?? current.kind,
      title,
      artist: patch.artist === undefined ? current.artist : patch.artist.trim(),
      colour: patch.colour === undefined ? current.colour : resolveColour(patch.colour),
      artworkPath: patch.artworkPath === undefined ? current.artworkPath : patch.artworkPath,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
      favourite: patch.favourite ?? current.favourite,
      updatedAt: Date.now()
    }

    await this.repository.replace(next)

    /*
     * A changed kind re-categorises every track on it.
     *
     * The volume's kind and each track's category are one statement made in two
     * places. Leaving nine tracks marked `album` under something now calling
     * itself an EP would be a contradiction the operator never asked for — so
     * the edit is honoured rather than refused, and the consequence follows.
     */
    if (patch.kind && patch.kind !== current.kind) {
      const moved = await this.projects.recategoriseVolumeTracks(id, patch.kind)
      if (moved > 0) {
        logger.info(`Re-categorised ${moved} track(s) after “${next.title}” became a ${patch.kind}`)
      }
    }

    return summarise(next, await this.tracksOf(id))
  }

  /** Writes the running order. Ids arrive in their new order. */
  async reorder(id: string, projectIds: readonly string[]): Promise<VolumeSummary[]> {
    await this.get(id)
    await this.projects.setTrackOrder(id, projectIds)
    return this.list()
  }

  // --------------------------------------------------------------- deleting

  /**
   * Removes a volume and lets its tracks stand alone.
   *
   * Every track is detached first and falls back to `single`, which is the only
   * category that is true of something belonging to nothing. No files move and
   * nothing is deleted — a volume never owned a directory, so dissolving one
   * costs the operator no work at all.
   */
  async remove(id: string): Promise<void> {
    const volume = await this.get(id)
    const detached = await this.projects.detachFromVolume(id)

    await this.repository.deleteById(id)
    logger.info(`Deleted ${volume.kind} “${volume.title}”, freeing ${detached} track(s)`)
  }

  // ----------------------------------------------------------------- guards

  private requireValidTitle(title: string): string {
    const verdict = validateVolumeTitle(title)
    if (!verdict.ok) {
      throw new AppError(verdict.reason ?? 'That title cannot be used.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
    return title.trim()
  }

  /**
   * Refuses two volumes with the same name.
   *
   * Not a filesystem constraint — nothing here becomes a directory — but a
   * usability one: the only way a track is assigned to a volume is by picking
   * its title out of a menu, and two identical entries make that menu a guess.
   */
  private async refuseDuplicateTitle(title: string, exceptId: string | null): Promise<void> {
    const volumes = await this.repository.listAll()
    const clash = volumes.some(
      (volume) => volume.id !== exceptId && volume.title.toLowerCase() === title.toLowerCase()
    )

    if (clash) {
      throw new AppError(`There is already a volume called “${title}”.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
  }
}

// ------------------------------------------------------------------ helpers

/**
 * Untracked tracks sort last rather than first.
 *
 * A null `trackNumber` means "not yet placed in the running order", and those
 * belong at the bottom of the list where they read as outstanding — sorting
 * them to the top would make an unordered volume look deliberately sequenced.
 */
function byTrackNumber(a: ProjectRecord, b: ProjectRecord): number {
  if (a.trackNumber === null && b.trackNumber === null) return a.name.localeCompare(b.name)
  if (a.trackNumber === null) return 1
  if (b.trackNumber === null) return -1
  return a.trackNumber - b.trackNumber
}

function summarise(volume: ArchiveVolume, tracks: readonly ProjectRecord[]): VolumeSummary {
  return {
    ...volume,
    trackCount: tracks.length,
    masteredCount: tracks.filter((track) => track.masters.final !== null).length,
    sizeBytes: tracks.reduce((total, track) => total + track.sizeBytes, 0),
    lastTouchedAt: tracks.reduce((latest, track) => Math.max(latest, track.lastTouchedAt), 0),
    // Filled in by the releases service where it matters; a volume on its own
    // has no way to know, and guessing would be worse than reporting false.
    released: false
  }
}

function resolveColour(colour: string | undefined): string {
  if (!colour || !isHexColour(colour)) return DEFAULT_FOLDER_COLOUR
  // Validated, never rewritten — see `isHexColour` in stacks.constants.ts.
  return normaliseHex(colour)
}
