import { randomUUID } from 'node:crypto'
import type {
  DiscographyRegistry,
  DiscographyRelease,
  DiscographySummary,
  ReleaseAppearance,
  ReleaseAsset,
  ReleaseDraft,
  ReleaseLink,
  ReleasePatch,
  ReleaseTrack,
  TrackDraft,
  TrackPatch
} from '@shared/domain/discography'
import {
  ARTWORK_EXTENSIONS,
  CANVAS_EXTENSIONS,
  LINKABLE_PROJECT_STAGES,
  MAX_ARTWORK_BYTES,
  MAX_CREDITS,
  MAX_RELEASE_LINKS,
  RELEASE_KIND_LABEL,
  isLinkableStage,
  maxTracksFor,
  normaliseIsrc,
  normaliseUpc,
  releaseYear,
  seedsOneTrack
} from '@shared/domain/discography.constants'
import type { CalendarRelease } from '@shared/domain/calendar'
import type { MediaFile, ProjectRecord } from '@shared/domain/projects'
import { getStage } from '@shared/domain/projects.constants'
import { checkLinkUrl, guessPlatform } from '@shared/domain/artists.constants'
import { isHexColour, normaliseHex } from '@shared/domain/stacks.constants'
import { randomTagColour } from '@shared/domain/tags.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ArtistsService } from '@main/services/artists/artists.service'
import type { ProjectsService } from '@main/services/projects/projects.service'
import type { StacksService } from '@main/services/stacks/stacks.service'
import { clearMedia, noMedia, storeMedia } from '@main/services/media/media.store'
import { publishRelease, type PublishResult } from './publish'
import { DiscographyRepository } from './discography.repository'

const logger = getLogger('discography')

/**
 * DISCOGRAPHY — the public record of what shipped.
 *
 * Replaces VOLUMES and the stood-down RELEASES, which between them were two
 * records describing one thing and neither of which carried what actually
 * ships a track. Decision D2 in docs/DISCOGRAPHY.md.
 *
 * ## The one rule this service exists to enforce
 *
 * **A release owns its running order, and a project does not know it is on
 * one.** The tracklist is an ordered array here, each entry carrying an
 * optional `projectId`.
 *
 * That reverses the rule volumes followed — membership on the project, so
 * there is one source of truth — and the reversal is not a lapse. A volume
 * was made *only* of projects. A discography is not: everything released
 * before this application existed, everything a label mastered, every remix
 * somebody else made. A track with no project cannot be stored on a project.
 *
 * So the link runs one way, and the reverse lookup is *derived* — see
 * `appearances()`, which the projects service reads through a resolver rather
 * than storing a second copy of the relationship that would drift.
 *
 * ## What it touches on disk
 *
 * Artwork and a canvas, copied into `Media\releases\`. Nothing else. A
 * release does not own a directory: that was the old model, and it put the
 * audio that ships in a second place competing with
 * `Release Mastered Tracks`, which is the confusion D2 exists to end.
 */
/**
 * How the catalogue says it has changed, without knowing who is listening.
 *
 * The CALENDAR projects release dates and stores none of them, so it cannot
 * see one move — it has to be told its projection is stale. Handed in by the
 * composition root, like every other cross-service link here, and deliberately
 * carrying no payload: "something about the catalogue is different" is all the
 * listener needs, and anything more specific would be this service guessing at
 * what the other one draws.
 */
export type CatalogueListener = () => Promise<void>

export class DiscographyService {
  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService,
    private readonly artists: ArtistsService,
    private readonly stacks: StacksService
  ) {}

  private catalogueListener: CatalogueListener | null = null

  /** Wired by the container once the calendar service exists. */
  setCatalogueListener(listener: CatalogueListener): void {
    this.catalogueListener = listener
  }

  /**
   * Tells whoever is listening that the catalogue moved.
   *
   * Swallowed on failure: a calendar that did not hear is a calendar showing a
   * marker on yesterday's date until it is reopened, which is not worth
   * failing a write the operator asked for.
   */
  private async notifyCatalogue(): Promise<void> {
    try {
      await this.catalogueListener?.()
    } catch (cause) {
      logger.warn('Could not notify the calendar of a catalogue change', cause)
    }
  }

  private get repository(): DiscographyRepository {
    return new DiscographyRepository(this.archive.getDb())
  }

  // ----------------------------------------------------------------- reading

  /**
   * The whole catalogue, plus what a renderer needs to draw it.
   *
   * Ships the label list alongside the summaries, as `ProjectRegistry` ships
   * the tag library: the field autocompletes from labels already used, and
   * deriving that in the renderer would mean every surface that offers the
   * field re-deriving it from a list it may not have.
   *
   * Artist *names* are resolved here rather than shipped as ids, unlike tags.
   * The catalogue draws credits on every card and a card holding ids and no
   * roster cannot draw one — and unlike the ARCHIVE's register, this
   * department has no other reason to hold the whole roster in memory.
   */
  async getRegistry(): Promise<DiscographyRegistry> {
    const releases = await this.repository.listAll()
    const roster = new Map((await this.artists.listPlain()).map((a) => [a.id, a.name]))

    const labels = [
      ...new Set(releases.map((release) => release.label.trim()).filter(Boolean))
    ].sort((a, b) => a.localeCompare(b))

    return {
      releases: releases.map((release) => this.summarise(release, roster)),
      labels,
      total: releases.length
    }
  }

  async get(id: string): Promise<DiscographyRelease> {
    const release = await this.repository.findById(id)
    if (!release) {
      throw new AppError('That release is no longer in the catalogue.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
    return release
  }

  /**
   * Where each project appears in the catalogue, by project id.
   *
   * The derived half of the one-directional link. Handed to the projects
   * service by the composition root so the ARCHIVE can say "track 3 of
   * *Ossuary*" without storing a second copy of the relationship — the same
   * arrangement `setTagResolver` already uses.
   *
   * A project on two releases — a single and then the album — keeps both, and
   * the album wins the summary line by being later. Sorted rather than
   * arbitrary so the ARCHIVE does not report a different one each read.
   */
  async appearances(): Promise<Map<string, ReleaseAppearance[]>> {
    const releases = await this.repository.listAll()
    const index = new Map<string, ReleaseAppearance[]>()

    for (const release of releases) {
      for (const track of release.tracks) {
        if (!track.projectId) continue
        const entry: ReleaseAppearance = {
          releaseId: release.id,
          trackId: track.id,
          title: release.title,
          kind: release.kind,
          status: release.status,
          position: track.position,
          releaseDate: release.releaseDate,
          master: track.master
        }
        index.set(track.projectId, [...(index.get(track.projectId) ?? []), entry])
      }
    }

    for (const list of index.values()) {
      list.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
    }

    return index
  }

  /**
   * Every dated release, for the CALENDAR to draw.
   *
   * The projected half of D20. Handed to the calendar service by the
   * composition root, exactly as `appearances()` is handed to projects — the
   * calendar stores nothing about releases, so this is read afresh each time
   * and a date moved here moves there with no reconciliation at all.
   *
   * Released entries are included, not just scheduled ones. A record that came
   * out on a date is still a thing that happened on that date, and a register
   * that forgot it the moment it shipped would be a worse diary than a paper
   * one.
   */
  async scheduledDates(): Promise<CalendarRelease[]> {
    const releases = await this.repository.listAll()

    return releases
      .filter((release): release is DiscographyRelease & { releaseDate: string } =>
        Boolean(release.releaseDate)
      )
      .map((release) => ({
        releaseId: release.id,
        title: release.title,
        kind: release.kind,
        status: release.status,
        date: release.releaseDate
      }))
  }

  /** Every release's credits, for the roster's counts. See `ArtistsService`. */
  async creditIndex(): Promise<string[][]> {
    const releases = await this.repository.listAll()
    return releases.map((release) => [
      ...release.artistIds,
      ...release.featuredArtistIds,
      ...release.tracks.flatMap((track) => track.artistIds)
    ])
  }

  // ----------------------------------------------------------------- writing

  /**
   * Raises a release, optionally around a project that already exists.
   *
   * `fromProjectId` is the dossier's "add to discography", and it is one call
   * for the reason `TagDraft.attachTo` is: doing it as create-then-add-track
   * would leave an empty release behind whenever the second failed.
   */
  async create(draft: ReleaseDraft, raisedFor: string | null = null): Promise<DiscographyRelease> {
    const title = draft.title.trim()
    if (!title) {
      throw new AppError('A release needs a title.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const now = Date.now()
    const kind = draft.kind ?? 'single'
    const tracks: ReleaseTrack[] = []

    if (draft.fromProjectId) {
      const project = await this.requireLinkable(draft.fromProjectId)
      tracks.push({
        id: randomUUID(),
        position: 1,
        title: project.name,
        projectId: project.id,
        artistIds: [...project.artistIds],
        // Carried over from the project's own pick — see `masterFromProject`.
        master: this.masterFromProject(project),
        isrc: '',
        durationMs: 0,
        notes: ''
      })
    } else if (seedsOneTrack(kind)) {
      /*
       * A single arrives with its track. See `seedsOneTrack`.
       *
       * Only in the `else`: a release raised *from* a project already has
       * exactly one track, and seeding a second would give a single two —
       * the release's title and the project's name, which are usually the
       * same string and always the same recording.
       */
      tracks.push({
        id: randomUUID(),
        position: 1,
        title,
        projectId: null,
        artistIds: [],
        master: null,
        isrc: '',
        durationMs: 0,
        notes: ''
      })
    }

    const release: DiscographyRelease = {
      id: randomUUID(),
      kind,
      title,
      subtitle: '',
      artistIds: draft.artistIds ?? [],
      featuredArtistIds: [],
      credits: [],
      label: '',
      labelUrl: '',
      catalogueNumber: '',
      // `scheduled` is where everything starts now that the set is two. An
      // entry exists because the operator intends to put something out; the
      // null date is what says they have not fixed when.
      status: draft.status ?? 'scheduled',
      releaseDate: draft.releaseDate ?? null,
      upc: '',
      phonographicLine: '',
      copyrightLine: '',
      artwork: noMedia(),
      canvas: noMedia(),
      links: [],
      tracks,
      colour: randomTagColour(),
      notes: '',
      favourite: false,
      raisedFor,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.insert(release)

    // A back-catalogue entry is often raised straight into RELEASED around a
    // project that is already finished, so the stage has to follow here too
    // and not only on a later status change.
    await this.reconcileLinkedStages(null, release)
    await this.notifyCatalogue()

    logger.info(`Raised "${release.title}" in the catalogue`)
    return release
  }

  /**
   * Raises a single around a project, unless the catalogue already holds it.
   *
   * Called by the projects service — through a callback wired in the
   * composition root, because that service cannot import this one — the moment
   * a final master is named. Naming the file that ships is the operator saying
   * the work is finished and going out, and the entry they would then raise by
   * hand would carry exactly the fields this can fill in itself: the project,
   * its title, its credits, and the master they just picked.
   *
   * **Idempotent, and that is the whole of its correctness.** It is driven by
   * an event that repeats — a master can be re-picked any number of times, and
   * each one would otherwise leave another single behind. So it returns null
   * rather than creating when the project already appears anywhere in the
   * catalogue, on any release of any kind: a track that is already on an album
   * does not also want a single raised for it.
   *
   * Returns the release it made, or null when it made nothing. The caller logs
   * and never fails on it.
   */
  async reconcileAutoSingle(projectId: string): Promise<DiscographyRelease | null> {
    const project = await this.projects.get(projectId)
    const releases = await this.repository.listAll()

    if (project.masters.final === null) {
      /*
       * The master has been cleared, so the single it raised goes with it.
       *
       * Confined to a release still carrying `raisedFor`, and that is the whole
       * guard. An entry the operator has edited has had it set to null, and
       * deleting a record somebody has put a label, a catalogue number and
       * artwork onto — because they cleared an unrelated field on a project —
       * is a far worse outcome than leaving a stray single behind.
       */
      const raised = releases.find((release) => release.raisedFor === projectId)
      if (!raised) return null

      await this.repository.deleteById(raised.id)
      await this.notifyCatalogue()
      logger.info(`Withdrew "${raised.title}", raised automatically and never edited`)
      return null
    }

    /*
     * Idempotent, and that is the whole of its correctness.
     *
     * This runs again on every re-pick, so it creates nothing when the project
     * already appears anywhere in the catalogue, on a release of any kind — a
     * track already on an album does not also want a single raised for it.
     */
    const already = releases.find((release) =>
      release.tracks.some((track) => track.projectId === projectId)
    )
    if (already) return null

    const release = await this.create(
      {
        title: project.name,
        kind: 'single',
        // Not RELEASED: naming the master says the work is finished, not that
        // it is out in the world. `scheduled` with no date is exactly "going
        // out, when is not fixed yet" — see `RELEASE_STATUSES`.
        status: 'scheduled',
        artistIds: [...project.artistIds],
        fromProjectId: projectId
      },
      projectId
    )

    logger.info(`Raised "${release.title}" automatically for its final master`)
    return release
  }

  async update(id: string, patch: ReleasePatch): Promise<DiscographyRelease> {
    const release = await this.get(id)

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new AppError('A release needs a title.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    /*
     * Refused rather than silently truncating the tracklist.
     *
     * Without this the ceiling is trivially escaped: file four tracks as an
     * EP, then change the kind to SINGLE. Dropping the extra tracks to fit
     * would be destroying the operator's record to satisfy a label they can
     * change back, so the refusal names the count instead.
     */
    if (patch.kind !== undefined && patch.kind !== release.kind) {
      const ceiling = maxTracksFor(patch.kind)
      if (release.tracks.length > ceiling) {
        throw new AppError(
          `A ${RELEASE_KIND_LABEL[patch.kind].toLowerCase()} holds ${
            ceiling === 1 ? 'one track' : `at most ${ceiling} tracks`
          }, and this has ${release.tracks.length}.`,
          {
            code: ErrorCode.Validation,
            hint: 'Remove the extra tracks first, or leave the kind as it is.',
            recoverable: false
          }
        )
      }
    }

    if (patch.credits && patch.credits.length > MAX_CREDITS) {
      throw new AppError(`A release holds at most ${MAX_CREDITS} credit lines.`, {
        code: ErrorCode.Validation,
        hint: 'There are only eight roles — a list this long is saying something twice.',
        recoverable: false
      })
    }

    if (patch.links) {
      if (patch.links.length > MAX_RELEASE_LINKS) {
        throw new AppError(`A release holds at most ${MAX_RELEASE_LINKS} links.`, {
          code: ErrorCode.Validation,
          recoverable: false
        })
      }
      for (const link of patch.links) {
        const check = checkLinkUrl(link.url)
        if (!check.ok) {
          throw new AppError(check.reason ?? 'That link cannot be used.', {
            code: ErrorCode.Validation,
            recoverable: false
          })
        }
      }
    }

    /*
     * A release marked RELEASED with no date is a contradiction the register
     * would then sort at the bottom of the catalogue, under every idea.
     *
     * Refused rather than back-filled with today: the operator knows when it
     * came out and guessing would put a wrong date in a record whose whole
     * job is to be right about dates.
     */
    const status = patch.status ?? release.status
    const releaseDate = patch.releaseDate !== undefined ? patch.releaseDate : release.releaseDate

    if (status === 'released' && releaseDate === null) {
      throw new AppError('A released entry needs the date it came out.', {
        code: ErrorCode.Validation,
        hint: 'Set the release date, or move it back to SCHEDULED.',
        recoverable: false
      })
    }

    /*
     * Refused outright if a linked project has not named its final master.
     *
     * `released` carries `requiresMaster`, so those projects cannot be moved
     * to the RELEASED stage — and the alternative to refusing here is letting
     * the flip succeed and then silently failing to move them, which leaves
     * the catalogue saying a track is out while the register says it is merely
     * finished. That disagreement is precisely what the one-directional link
     * and its propagation exist to prevent.
     *
     * Named rather than counted. "Two projects need a final master" sends the
     * operator hunting; the titles say where to go.
     */
    if (status === 'released' && release.status !== 'released') {
      const unnamed = await this.projectsAwaitingMaster(release)

      if (unnamed.length > 0) {
        throw new AppError(
          `${unnamed.join(', ')} ${unnamed.length === 1 ? 'has' : 'have'} no final master named.`,
          {
            code: ErrorCode.Validation,
            hint: 'Open each in the ARCHIVE and choose it in the FINAL MASTER panel, then mark this released.',
            recoverable: false
          }
        )
      }
    }

    const next: DiscographyRelease = {
      ...release,
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle.trim() } : {}),
      ...(patch.artistIds !== undefined ? { artistIds: patch.artistIds } : {}),
      ...(patch.featuredArtistIds !== undefined
        ? { featuredArtistIds: patch.featuredArtistIds }
        : {}),
      ...(patch.credits !== undefined ? { credits: patch.credits } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.labelUrl !== undefined ? { labelUrl: patch.labelUrl.trim() } : {}),
      ...(patch.catalogueNumber !== undefined
        ? { catalogueNumber: patch.catalogueNumber.trim() }
        : {}),
      ...(patch.upc !== undefined ? { upc: normaliseUpc(patch.upc) } : {}),
      ...(patch.phonographicLine !== undefined
        ? { phonographicLine: patch.phonographicLine.trim() }
        : {}),
      ...(patch.copyrightLine !== undefined ? { copyrightLine: patch.copyrightLine.trim() } : {}),
      ...(patch.links !== undefined ? { links: patch.links } : {}),
      ...(patch.colour !== undefined && isHexColour(patch.colour)
        ? { colour: normaliseHex(patch.colour) }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.favourite !== undefined ? { favourite: patch.favourite } : {}),
      status,
      releaseDate,
      // The operator has edited it, so it is theirs — see `raisedFor`.
      // From here on nothing removes it on their behalf.
      raisedFor: null,
      updatedAt: Date.now()
    }

    await this.repository.replace(next)
    await this.reconcileLinkedStages(release, next)
    await this.notifyCatalogue()
    return next
  }

  /**
   * Hands an automatically raised entry over to the operator.
   *
   * The sheet is read-only while `raisedFor` is set, because the entry is
   * a *projection* of the project until then: the app made it, the app
   * withdraws it if the master is cleared, and editing something that
   * might vanish underneath you is the wrong offer. Adopting it is the
   * operator saying the release is real.
   *
   * Idempotent, and harmless on an entry raised by hand — `raisedFor` is
   * already null there, so this only stamps `updatedAt`.
   */
  async adopt(id: string): Promise<DiscographyRelease> {
    const release = await this.get(id)
    if (release.raisedFor === null) return release

    const next = { ...release, raisedFor: null, updatedAt: Date.now() }
    await this.repository.replace(next)
    logger.info(`"${release.title}" adopted; it is no longer withdrawn automatically`)
    return next
  }

  /**
   * Writes a distributor-ready folder for this release.
   *
   * The filesystem work is `publishRelease`; this is the policy in front of
   * it — what must be true before a folder is worth writing, and the roster
   * lookup the namer needs.
   *
   * ## What it refuses, and why only these
   *
   * Four things, each named rather than hidden behind one message: no tracks,
   * no master on any track, no artwork, and no date. Those are the conditions
   * under which the folder would be a lie — an empty delivery, or one a label
   * cannot act on.
   *
   * Everything else is allowed through and *recorded*. A missing catalogue
   * number is a field the operator has not been given yet, not a reason to
   * refuse; a single track without a master on a five-track album is a label
   * master they do not hold. Those are named in `Release Details.txt` and
   * returned in `skipped`, because the honest thing is to hand over what
   * exists and say what does not.
   *
   * ## And it refuses an unadopted entry
   *
   * An entry the app raised is a projection the app will withdraw again if the
   * master is cleared (D18, D19). Publishing presumes the record is real, so
   * the operator has to say so first — the ADOPT bar is already on the sheet.
   */
  async publish(id: string): Promise<PublishResult> {
    const release = await this.get(id)

    if (release.raisedFor !== null) {
      throw new AppError('This entry has not been adopted yet.', {
        code: ErrorCode.Validation,
        hint: 'Adopt it on its RELEASE tab, then publish.',
        recoverable: false
      })
    }

    const missing: string[] = []
    if (release.tracks.length === 0) missing.push('a running order')
    else if (release.tracks.every((track) => track.master === null)) {
      missing.push('a final master on at least one track')
    }
    if (!release.artwork.copiedPath) missing.push('cover art')
    if (!release.releaseDate) missing.push('a release date')

    if (missing.length > 0) {
      throw new AppError(`This release still needs ${missing.join(', ')}.`, {
        code: ErrorCode.Validation,
        hint: 'Fill those in and publish again — nothing is written until it can be complete.',
        recoverable: false
      })
    }

    const root = this.stacks.resolveReleasesRoot()
    if (!root) {
      throw new AppError('The ARCHIVE has not been set up, so there is nowhere to publish to.', {
        code: ErrorCode.Validation,
        hint: 'Set a filing root in REGULATION.',
        recoverable: false
      })
    }

    // One read of the roster, turned into a lookup. `publishRelease` never
    // touches the artists service itself — it is handed a resolver, so the
    // filesystem half stays testable without one.
    const roster = new Map((await this.artists.listPlain()).map((a) => [a.id, a.name]))
    return publishRelease(release, root, (artistId) => roster.get(artistId) ?? null)
  }

  async remove(id: string): Promise<void> {
    const release = await this.get(id)

    const wrapperPath = await this.stacks.wrapperPathOrNull()
    if (wrapperPath) {
      await clearMedia(wrapperPath, 'releases', `${id}-artwork`)
      await clearMedia(wrapperPath, 'releases', `${id}-canvas`)
    }

    await this.repository.deleteById(id)

    // Dropping the entry takes the RELEASED stage with it. A project cannot go
    // on claiming it was put out by a release that no longer exists, and the
    // operator can always set the stage back by hand if it really did ship.
    await this.reconcileLinkedStages(release, null)
    await this.notifyCatalogue()

    logger.info(`Removed "${release.title}" from the catalogue`)
  }

  /** Copies artwork or a canvas in. A null source clears it. */
  async setAsset(
    id: string,
    asset: ReleaseAsset,
    sourcePath: string | null
  ): Promise<DiscographyRelease> {
    const release = await this.get(id)
    const wrapperPath = await this.stacks.requireWrapperPath()
    const key = `${id}-${asset}`

    if (sourcePath === null) {
      await clearMedia(wrapperPath, 'releases', key)
      const next = { ...release, [asset]: noMedia(), raisedFor: null, updatedAt: Date.now() }
      await this.repository.replace(next)
      return next
    }

    const stored = await storeMedia({
      wrapperPath,
      bucket: 'releases',
      key,
      sourcePath,
      allowed: asset === 'artwork' ? ARTWORK_EXTENSIONS : CANVAS_EXTENSIONS,
      maxBytes: MAX_ARTWORK_BYTES
    })

    const next = { ...release, [asset]: stored, raisedFor: null, updatedAt: Date.now() }
    await this.repository.replace(next)
    return next
  }

  // ------------------------------------------------------------------ tracks

  /**
   * Adds a track, linking a project when one is named.
   *
   * The title falls back to the project's name rather than being required: a
   * track added from the ARCHIVE is almost always called what the project is
   * called, and asking again would be asking a question the app can answer.
   */
  async addTrack(id: string, draft: TrackDraft): Promise<DiscographyRelease> {
    const release = await this.get(id)

    const ceiling = maxTracksFor(release.kind)
    if (release.tracks.length >= ceiling) {
      /*
       * Per kind, not a flat ceiling. A single already holding its track is
       * the case that produced this rule.
       *
       * The hint names the way out rather than only the refusal: the operator
       * with a single and a remix to file is not making a mistake, they are
       * filing a two-track record, and the kind is the field that has to give.
       */
      throw new AppError(
        ceiling === 1
          ? `A ${RELEASE_KIND_LABEL[release.kind].toLowerCase()} holds one track.`
          : `A ${RELEASE_KIND_LABEL[release.kind].toLowerCase()} holds at most ${ceiling} tracks.`,
        {
          code: ErrorCode.Validation,
          hint:
            ceiling === 1
              ? 'Change the kind to EP if this release carries more than one recording.'
              : undefined,
          recoverable: false
        }
      )
    }

    let title = draft.title?.trim() ?? ''
    let artistIds = draft.artistIds ?? []
    let master: MediaFile | null = null

    if (draft.projectId) {
      // Refuses a project that is not in the register rather than writing a
      // dangling id, and refuses one that is not finished — see
      // `requireLinkable`.
      const project = await this.requireLinkable(draft.projectId)
      if (!title) title = project.name
      if (artistIds.length === 0) artistIds = [...project.artistIds]
      master = this.masterFromProject(project)
    }

    if (!title) {
      throw new AppError('A track needs a title.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const track: ReleaseTrack = {
      id: randomUUID(),
      position: release.tracks.length + 1,
      title,
      projectId: draft.projectId ?? null,
      artistIds,
      master,
      isrc: draft.isrc ? normaliseIsrc(draft.isrc) : '',
      durationMs: 0,
      notes: ''
    }

    return this.writeTracks(release, [...release.tracks, track])
  }

  async updateTrack(id: string, trackId: string, patch: TrackPatch): Promise<DiscographyRelease> {
    const release = await this.get(id)
    if (!release.tracks.some((track) => track.id === trackId)) {
      throw new AppError('That track is no longer on this release.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    const repointedTo = patch.projectId ? await this.requireLinkable(patch.projectId) : null

    /*
     * Re-pointing a track adopts the new project's master, or clears it.
     *
     * The old file belonged to the project that was there a moment ago, so
     * keeping it would leave the release claiming a bounce from one project
     * shipped as a track now credited to another. Where the new project has
     * named a final master the track takes that instead, which is the same
     * hand-over `addTrack` makes; unlinking altogether leaves nothing to
     * adopt, so the master goes with the link.
     */
    const repointed =
      patch.projectId !== undefined &&
      patch.projectId !== release.tracks.find((track) => track.id === trackId)?.projectId

    const tracks = release.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            ...(repointed
              ? { master: repointedTo ? this.masterFromProject(repointedTo) : null }
              : {}),
            ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
            ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
            ...(patch.artistIds !== undefined ? { artistIds: patch.artistIds } : {}),
            ...(patch.isrc !== undefined ? { isrc: normaliseIsrc(patch.isrc) } : {}),
            ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {})
          }
        : track
    )

    return this.writeTracks(release, tracks)
  }

  async removeTrack(id: string, trackId: string): Promise<DiscographyRelease> {
    const release = await this.get(id)
    return this.writeTracks(
      release,
      release.tracks.filter((track) => track.id !== trackId)
    )
  }

  /**
   * Names the audio file that ships as this track. A null path clears it.
   *
   * **Nothing on disk moves.** The stored path points at the bounce where it
   * already sits, inside the project folder, beside the set that made it.
   * That is a deliberate reversal of what `masters.final` did — it moved the
   * file into `Release Mastered Tracks`, which took the audio away from its
   * own session and made "find me the source" a worse question to ask, not a
   * better one.
   *
   * The pick is confined to the linked project's own bounces. A release master
   * that could be any file on the disk would let a `.wav` from somebody else's
   * project be recorded as the thing this track shipped, and the catalogue's
   * only job is to be right about that.
   */
  async setTrackMaster(
    id: string,
    trackId: string,
    path: string | null
  ): Promise<DiscographyRelease> {
    const release = await this.get(id)
    const track = release.tracks.find((entry) => entry.id === trackId)

    if (!track) {
      throw new AppError('That track is no longer on this release.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    if (path === null) {
      return this.writeTracks(
        release,
        release.tracks.map((entry) => (entry.id === trackId ? { ...entry, master: null } : entry))
      )
    }

    if (!track.projectId) {
      throw new AppError('This track has no project, so there are no bounces to choose from.', {
        code: ErrorCode.Validation,
        hint: 'Link a project from the ARCHIVE first.',
        recoverable: false
      })
    }

    const project = await this.projects.get(track.projectId)
    const file = project.audio.find((entry) => entry.path === path)

    if (!file) {
      throw new AppError('That file is not one of this project’s bounces.', {
        code: ErrorCode.Validation,
        hint: 'Bounce it into the project folder and rescan the ARCHIVE, then choose it here.',
        recoverable: false
      })
    }

    logger.info(`Release master for "${release.title}" track ${track.position}: ${file.path}`)

    return this.writeTracks(
      release,
      release.tracks.map((entry) => (entry.id === trackId ? { ...entry, master: file } : entry))
    )
  }

  /** Reorders the running order; ids are given in their new order. */
  async reorderTracks(id: string, trackIds: readonly string[]): Promise<DiscographyRelease> {
    const release = await this.get(id)
    const byId = new Map(release.tracks.map((track) => [track.id, track]))

    /*
     * Anything the caller did not name keeps its relative order at the end.
     *
     * A renderer working from a stale list would otherwise silently delete
     * whatever it had not heard about yet — a reorder is the one operation
     * where a partial list is a plausible accident rather than an intent.
     */
    const ordered = [
      ...trackIds.map((trackId) => byId.get(trackId)).filter((t): t is ReleaseTrack => Boolean(t)),
      ...release.tracks.filter((track) => !trackIds.includes(track.id))
    ]

    return this.writeTracks(release, ordered)
  }

  /**
   * Strips an artist from every release crediting them.
   *
   * Called by the artists service through a callback rather than by reaching
   * into that collection, so each collection keeps one writer.
   */
  async detachArtist(artistId: string): Promise<number> {
    const releases = await this.repository.listAll()
    let touched = 0

    for (const release of releases) {
      const credited =
        release.artistIds.includes(artistId) ||
        release.featuredArtistIds.includes(artistId) ||
        release.tracks.some((track) => track.artistIds.includes(artistId))

      if (!credited) continue

      await this.repository.replace({
        ...release,
        artistIds: release.artistIds.filter((id) => id !== artistId),
        featuredArtistIds: release.featuredArtistIds.filter((id) => id !== artistId),
        tracks: release.tracks.map((track) => ({
          ...track,
          artistIds: track.artistIds.filter((id) => id !== artistId)
        })),
        updatedAt: Date.now()
      })
      touched += 1
    }

    return touched
  }

  /**
   * Unlinks every track pointing at a project that has gone.
   *
   * The track itself survives. A released track does not stop having been
   * released because its project was forgotten — the catalogue is a record of
   * the world, not of this application's contents.
   */
  async detachProject(projectId: string): Promise<number> {
    const releases = await this.repository.listAll()
    let touched = 0

    for (const release of releases) {
      if (!release.tracks.some((track) => track.projectId === projectId)) continue

      await this.repository.replace({
        ...release,
        tracks: release.tracks.map((track) =>
          track.projectId === projectId ? { ...track, projectId: null } : track
        ),
        updatedAt: Date.now()
      })
      touched += 1
    }

    return touched
  }

  // ----------------------------------------------------------------- private

  /**
   * The project behind a link, or a refusal saying why it cannot be one.
   *
   * The ARCHIVE's pipeline is the gate into the catalogue: a track on a
   * release is finished work, and TRACK READY is where the operator says the
   * work is finished. See `LINKABLE_PROJECT_STAGES`.
   *
   * Enforced here and not only in the picker. The renderer hides what it
   * cannot offer, which is a courtesy — this is the guard, as everywhere else
   * in this codebase, and it is what makes the rule true of a stale window or
   * a second one as well as of the list somebody is looking at.
   */
  /**
   * The project's finished master, as a file descriptor for a track to carry.
   *
   * ### Why the track takes a copy rather than reading through
   *
   * The project owns "this is the finished bounce" and may change its mind: a
   * remaster, a different render, a fixed fade. A release that read through
   * would then rewrite what it claims to have shipped, retroactively, on a
   * record whose entire job is to be right about what went out. So the copy is
   * taken when the link is made and left alone afterwards — the track's own
   * pick overrides it, which is how a release says "we actually sent the label
   * this other file".
   *
   * Falls back to a descriptor built from the path when the pick is not in the
   * scanned inventory. That is the legacy case: a final chosen under the old
   * workflow was *moved* into `Release Mastered Tracks`, so it is a real file
   * at a real path that the project no longer lists. Its size is unknown
   * without touching the disk, and 0 is how the renderer is told not to draw
   * one rather than a figure that would be wrong.
   */
  private masterFromProject(project: ProjectRecord): MediaFile | null {
    const path = project.masters.final
    if (!path) return null

    const known = project.audio.find((file) => file.path === path)
    if (known) return known

    const fileName = path.split(/[\\/]/).pop() ?? path
    return { path, fileName, relativePath: fileName, sizeBytes: 0, modifiedAt: 0 }
  }

  /**
   * The names of linked projects that have not named a final master.
   *
   * Read through the projects service rather than gated on `hasFinalMaster` in
   * a summary, because this runs once on a status change and wants the truth
   * rather than a projection of it. A project that has been forgotten since
   * the track was linked is skipped: it cannot be moved to RELEASED either
   * way, and refusing the whole flip over a record that no longer exists would
   * leave the operator with nothing to fix.
   */
  private async projectsAwaitingMaster(release: DiscographyRelease): Promise<string[]> {
    const ids = [
      ...new Set(
        release.tracks.map((track) => track.projectId).filter((id): id is string => id !== null)
      )
    ]

    const names: string[] = []
    for (const id of ids) {
      try {
        const project = await this.projects.get(id)
        if (project.masters.final === null) names.push(project.name)
      } catch {
        // Forgotten since the link was made. See above.
      }
    }

    return names
  }

  private async requireLinkable(projectId: string): Promise<ProjectRecord> {
    const project = await this.projects.get(projectId)

    if (!isLinkableStage(project.stage)) {
      const allowed = LINKABLE_PROJECT_STAGES.map((stage) => getStage(stage).label).join(' or ')
      throw new AppError(`"${project.name}" is not finished yet.`, {
        code: ErrorCode.Validation,
        hint: `Move it to ${allowed} in the ARCHIVE, then link it here.`,
        recoverable: false
      })
    }

    return project
  }

  /**
   * Moves the projects behind a release's tracks as the release goes out.
   *
   * The interlink the operator asked for: putting something out is one action
   * in one department, and the ARCHIVE should not then need to be told about
   * it by hand. Flipping a release to RELEASED moves every project it credits
   * to the RELEASED stage with a note naming the release; moving it back, or
   * unlinking, or deleting the entry, hands them back to TRACK READY.
   *
   * ## Only two stages are ever touched
   *
   * A project at MIX, in the bin, or SHELVED is left exactly where it is. This
   * is the load-bearing constraint, not a nicety: the alternative is a
   * catalogue edit that drags work backwards through the pipeline or
   * resurrects something the operator deliberately parked, and neither is a
   * consequence anybody would predict from changing a release's status.
   *
   * Failures are logged and swallowed. The release write has already
   * succeeded, and refusing the whole operation because one project's stage
   * could not be written would leave the catalogue and the register further
   * apart than the drift this exists to prevent.
   *
   * `before` is null when a release has just been raised, `after` is null when
   * one has just been dropped.
   */
  private async reconcileLinkedStages(
    before: DiscographyRelease | null,
    after: DiscographyRelease | null
  ): Promise<void> {
    const wasOut = before?.status === 'released'
    const isOut = after?.status === 'released'

    const linked = (release: DiscographyRelease | null): Set<string> =>
      new Set(
        (release?.tracks ?? [])
          .map((track) => track.projectId)
          .filter((id): id is string => id !== null)
      )

    const linkedBefore = linked(before)
    const linkedAfter = linked(after)
    const title = after?.title ?? before?.title ?? 'a release'

    /*
     * Which way each project should move, keyed so a project on both sides of
     * the change is decided once. A project that is still linked to a release
     * that is still out is absent from this map entirely — there is nothing to
     * do, and writing the stage it already holds would put a duplicate line in
     * its history on every unrelated edit.
     */
    const intended = new Map<string, 'released' | 'ready'>()

    for (const id of linkedAfter) {
      if (isOut && !(wasOut && linkedBefore.has(id))) intended.set(id, 'released')
    }

    for (const id of linkedBefore) {
      if (!wasOut) continue
      if (isOut && linkedAfter.has(id)) continue
      intended.set(id, 'ready')
    }

    for (const [projectId, stage] of intended) {
      try {
        const project = await this.projects.get(projectId)

        // The guard. Forward only from TRACK READY, back only from RELEASED.
        if (stage === 'released' && project.stage !== 'ready') continue
        if (stage === 'ready' && project.stage !== 'released') continue

        await this.projects.patchProject(projectId, {
          stage,
          stageNote:
            stage === 'released' ? `Out on ${title}` : `${title} is no longer out in the world`
        })

        logger.info(`${project.name} -> ${getStage(stage).label} (${title})`)
      } catch (cause) {
        logger.warn(`Could not move project ${projectId} to ${stage}`, cause)
      }
    }
  }

  /** Writes a tracklist back, renumbered so positions are always contiguous. */
  private async writeTracks(
    release: DiscographyRelease,
    tracks: readonly ReleaseTrack[]
  ): Promise<DiscographyRelease> {
    const next: DiscographyRelease = {
      ...release,
      tracks: tracks.map((track, index) => ({ ...track, position: index + 1 })),
      // Every tracklist change funnels through here, so this is where a
      // hand-edited running order disowns its automatic provenance.
      raisedFor: null,
      updatedAt: Date.now()
    }

    await this.repository.replace(next)

    /*
     * Every tracklist change funnels through here, which is why the stage
     * reconciliation hangs off this one call rather than off each of the four
     * public methods above.
     *
     * It matters for linking and unlinking specifically: attaching a project
     * to a release that is already out should move that project to RELEASED
     * immediately, and detaching it should hand it back. Doing that per-method
     * would be four places to forget it in.
     */
    await this.reconcileLinkedStages(release, next)
    return next
  }

  private summarise(
    release: DiscographyRelease,
    roster: ReadonlyMap<string, string>
  ): DiscographySummary {
    const { tracks, ...rest } = release
    const names = [...release.artistIds, ...release.featuredArtistIds]
      .map((id) => roster.get(id))
      .filter((name): name is string => Boolean(name))

    return {
      ...rest,
      trackCount: tracks.length,
      linkedCount: tracks.filter((track) => track.projectId !== null).length,
      artistNames: names,
      year: releaseYear(release.releaseDate)
    }
  }

  /** Builds a link record, validating the address as the services all do. */
  makeLink(url: string, platform?: ReleaseLink['platform'], label?: string): ReleaseLink {
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
