import { randomUUID } from 'node:crypto'
import type {
  ArtistDraft,
  ArtistLink,
  ArtistPatch,
  ArtistRecord,
  ArtistSummary
} from '@shared/domain/artists'
import {
  MAX_ARTIST_LINKS,
  MAX_PICTURE_BYTES,
  PICTURE_EXTENSIONS,
  artistNameKey,
  checkArtistName,
  checkLinkUrl,
  guessPlatform
} from '@shared/domain/artists.constants'
import { isHexColour, normaliseHex } from '@shared/domain/stacks.constants'
// The same palette tags draw from. A fourth swatch table would be a fourth
// set of colours to keep inside the five-material brief for no gain.
import { randomTagColour } from '@shared/domain/tags.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ProjectsService } from '@main/services/projects/projects.service'
import type { StacksService } from '@main/services/stacks/stacks.service'
import { clearMedia, noMedia, storeMedia } from '@main/services/media/media.store'
import { ArtistsRepository } from './artists.repository'

const logger = getLogger('artists')

/**
 * How a release reports who it credits, so the roster can count without
 * importing the discography service and making the two mutually dependent.
 */
export type ReleaseCreditReader = () => Promise<readonly (readonly string[])[]>

/**
 * ARTISTS — the roster.
 *
 * The third quiet service in the ARCHIVE family, after volumes and tags, and
 * quiet for the same reason: **nothing here moves a project.** An artist
 * record says who made something; the work stays filed wherever the operator
 * put it, and no directory is created, moved or removed by anything below.
 *
 * The one file it touches is a picture, and that is *copied* into the
 * archive's own `Media\artists\` rather than referenced where it was found —
 * see `media.store.ts` for why.
 *
 * ## Why this is not the ARTIST folder kind
 *
 * The filing tree has one. They are unrelated, deliberately, and this is
 * decision D3 in docs/DISCOGRAPHY.md rather than an oversight. A folder is
 * one place on one disk; a track can credit four people. Making the two the
 * same thing would mean a collaboration needed two folders, and dragging a
 * project to a different shelf would silently rewrite who made it.
 *
 * Membership is read through `ProjectsService` and through the release credit
 * reader rather than through second repositories on collections this service
 * does not own — the same arrangement tags use, so each collection keeps one
 * owner.
 */
export class ArtistsService {
  private readReleaseCredits: ReleaseCreditReader | null = null

  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService,
    private readonly stacks: StacksService
  ) {}

  private get repository(): ArtistsRepository {
    return new ArtistsRepository(this.archive.getDb())
  }

  /**
   * How to count release credits, handed in rather than imported.
   *
   * The discography needs the roster (to draw credits) and the roster needs
   * the discography (to count them). Resolving that with a callback rather
   * than a mutual import is the arrangement `setFilingResolver` and
   * `setTagResolver` already use — see the composition root.
   */
  setReleaseCreditReader(reader: ReleaseCreditReader): void {
    this.readReleaseCredits = reader
  }

  // ----------------------------------------------------------------- reading

  /**
   * The whole roster, with what each artist is on.
   *
   * Both registers are read once and tallied in memory rather than counted
   * per artist — the same reasoning recorded on `TagsService.list`: there are
   * tens of artists and hundreds of projects, so one pass beats N round trips.
   *
   * Binned projects do not count. An artist reading "4 projects" that turns up
   * one when clicked is a worse answer than no figure at all.
   */
  async list(): Promise<ArtistSummary[]> {
    const artists = await this.repository.listAll()
    if (artists.length === 0) return []

    const records = await this.projects.listRecords()
    const projectCounts = new Map<string, number>()
    for (const record of records) {
      if (record.trashedAt !== null) continue
      for (const id of record.artistIds) {
        projectCounts.set(id, (projectCounts.get(id) ?? 0) + 1)
      }
    }

    const releaseCounts = new Map<string, number>()
    const credits = (await this.readReleaseCredits?.()) ?? []
    for (const ids of credits) {
      // A release crediting somebody twice — at release level and on a track —
      // counts once. "On 3 releases" must mean three releases.
      for (const id of new Set(ids)) {
        releaseCounts.set(id, (releaseCounts.get(id) ?? 0) + 1)
      }
    }

    return artists.map((artist) => ({
      ...artist,
      projectCount: projectCounts.get(artist.id) ?? 0,
      releaseCount: releaseCounts.get(artist.id) ?? 0
    }))
  }

  /** Every artist, without touching either register. For the registries. */
  async listPlain(): Promise<ArtistRecord[]> {
    return this.repository.listAll()
  }

  async get(id: string): Promise<ArtistRecord> {
    const artist = await this.repository.findById(id)
    if (!artist) {
      throw new AppError('That artist is no longer on the roster.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
    return artist
  }

  // ----------------------------------------------------------------- writing

  /**
   * Adds somebody to the roster, optionally crediting them in the same breath.
   *
   * `attachTo` is not a convenience, for the reason recorded on
   * `TagsService.create`: the dossier's "credit «Nasko»" is one gesture, and
   * doing it as two calls from the renderer would leave a new artist credited
   * on nothing whenever the second failed — a roster slowly filling with
   * people the operator believes they credited.
   *
   * A name that already exists is **returned rather than refused**. The picker
   * offers "create" only for text matching nothing, but two windows and a
   * stale list can still race it, and the operator's intent in that case is
   * plainly "give me Nasko", not an error dialog.
   */
  async create(draft: ArtistDraft): Promise<ArtistRecord> {
    const verdict = checkArtistName(draft.name)
    if (!verdict.ok) {
      throw new AppError(verdict.reason ?? 'That name cannot be used.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const name = draft.name.trim()
    const existing = await this.repository.findByName(name)

    if (existing) {
      if (draft.attachTo) await this.credit(draft.attachTo, existing.id)
      logger.info(`Artist "${name}" is already on the roster; reusing them`)
      return existing
    }

    const now = Date.now()
    const artist: ArtistRecord = {
      id: randomUUID(),
      name,
      nameKey: artistNameKey(name),
      realName: draft.realName?.trim() ?? '',
      roles: draft.roles ?? [],
      picture: noMedia(),
      colour:
        draft.colour && isHexColour(draft.colour) ? normaliseHex(draft.colour) : randomTagColour(),
      links: (draft.links ?? []).map((link) => this.makeLink(link.url, link.platform, link.label)),
      notes: draft.notes?.trim() ?? '',
      favourite: false,
      isOperator: draft.isOperator ?? false,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.insert(artist)
    if (draft.attachTo) await this.credit(draft.attachTo, artist.id)

    logger.info(`Added "${artist.name}" to the roster`)
    return artist
  }

  async update(id: string, patch: ArtistPatch): Promise<ArtistRecord> {
    const artist = await this.get(id)

    if (patch.name !== undefined) {
      const verdict = checkArtistName(patch.name)
      if (!verdict.ok) {
        throw new AppError(verdict.reason ?? 'That name cannot be used.', {
          code: ErrorCode.Validation,
          recoverable: false
        })
      }

      const clash = await this.repository.findByName(patch.name)
      if (clash && clash.id !== id) {
        throw new AppError(`"${clash.name}" is already on the roster.`, {
          code: ErrorCode.Validation,
          hint: 'Rename the other one first, or credit that one instead.',
          recoverable: false
        })
      }
    }

    if (patch.links) {
      for (const link of patch.links) {
        const check = checkLinkUrl(link.url)
        if (!check.ok) {
          throw new AppError(check.reason ?? 'That link cannot be used.', {
            code: ErrorCode.Validation,
            recoverable: false
          })
        }
      }
      if (patch.links.length > MAX_ARTIST_LINKS) {
        throw new AppError(`An artist holds at most ${MAX_ARTIST_LINKS} links.`, {
          code: ErrorCode.Validation,
          recoverable: false
        })
      }
    }

    const next: ArtistRecord = {
      ...artist,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.name !== undefined ? { nameKey: artistNameKey(patch.name) } : {}),
      ...(patch.realName !== undefined ? { realName: patch.realName.trim() } : {}),
      ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
      ...(patch.colour !== undefined && isHexColour(patch.colour)
        ? { colour: normaliseHex(patch.colour) }
        : {}),
      ...(patch.links !== undefined ? { links: patch.links } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.favourite !== undefined ? { favourite: patch.favourite } : {}),
      ...(patch.isOperator !== undefined ? { isOperator: patch.isOperator } : {}),
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    return next
  }

  /**
   * Copies a picture in and records where it came from.
   *
   * A null source clears it, removing our copy. Cleared rather than left
   * behind because the record is the only thing that knows the file is ours —
   * an orphan in `Media\artists\` is a file nobody can account for.
   */
  async setPicture(id: string, sourcePath: string | null): Promise<ArtistRecord> {
    const artist = await this.get(id)
    const wrapperPath = await this.stacks.requireWrapperPath()

    if (sourcePath === null) {
      await clearMedia(wrapperPath, 'artists', id)
      const next = { ...artist, picture: noMedia(), updatedAt: Date.now() }
      await this.repository.replace(next)
      return next
    }

    const picture = await storeMedia({
      wrapperPath,
      bucket: 'artists',
      key: id,
      sourcePath,
      allowed: PICTURE_EXTENSIONS,
      maxBytes: MAX_PICTURE_BYTES
    })

    const next = { ...artist, picture, updatedAt: Date.now() }
    await this.repository.replace(next)
    return next
  }

  /**
   * Removes somebody from the roster, and from everything crediting them.
   *
   * Returns how many records were touched so the confirmation can say it out
   * loud — removing an artist is the one artist action that reaches beyond the
   * artist, exactly as deleting a tag is. The alternative, leaving dangling
   * ids behind, is survivable (they resolve to nothing and are not drawn) but
   * it makes the register quietly wrong about who made what.
   */
  async remove(id: string): Promise<{ projects: number; releases: number }> {
    const artist = await this.get(id)

    // One bulk write rather than a patch per project: `detachArtist` is the
    // credits twin of `detachTag` and exists so this is not N round trips.
    const projects = await this.projects.detachArtist(id)
    const releases = (await this.detachFromReleases?.(id)) ?? 0

    const wrapperPath = await this.stacks.wrapperPathOrNull()
    if (wrapperPath) await clearMedia(wrapperPath, 'artists', id)

    await this.repository.deleteById(id)
    logger.info(`Removed "${artist.name}" from the roster`)

    return { projects, releases }
  }

  /**
   * How to strip an artist from every release, handed in like the reader.
   *
   * Same reason: the discography owns its own collection, and a second
   * repository pointed at it from here would be two writers for one document.
   */
  detachFromReleases: ((artistId: string) => Promise<number>) | null = null

  // ----------------------------------------------------------------- private

  /** Adds an artist to a project's credits, leaving the rest alone. */
  private async credit(projectId: string, artistId: string): Promise<void> {
    const record = await this.projects.get(projectId)
    if (record.artistIds.includes(artistId)) return

    await this.projects.patchProject(projectId, {
      artistIds: [...record.artistIds, artistId]
    })
  }

  private makeLink(url: string, platform?: ArtistLink['platform'], label?: string): ArtistLink {
    const check = checkLinkUrl(url)
    if (!check.ok) {
      throw new AppError(check.reason ?? 'That link cannot be used.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const trimmed = url.trim()
    return {
      id: randomUUID(),
      platform: platform ?? guessPlatform(trimmed),
      url: trimmed,
      label: label?.trim() ?? ''
    }
  }
}
