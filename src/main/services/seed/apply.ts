/**
 * Write the plan into the catalogue. The only file here that changes anything.
 *
 * ## Additive, and that is the whole of its correctness
 *
 * The catalogue on his machine is **not empty** and must not be trampled. So:
 *
 *   - A record already there is **updated**, never replaced. Empty fields are
 *     filled; fields that hold something are left alone, because what is
 *     there was either typed by him or written by a previous run and either
 *     way it is not this run's to overrule.
 *   - **Nothing is ever deleted.** A record the harvest knows nothing about
 *     is untouched. A track, a link or a credit it did not propose stays.
 *   - Running twice produces the same catalogue as running once. "Run once"
 *     is always run twice in practice — the first press is interrupted, or
 *     the operator adds a key and goes again — so idempotence is a
 *     requirement rather than a nicety.
 *
 * ## It goes through the ordinary service
 *
 * `DiscographyService.create`, `.update`, `.addTrack`. Not the repository,
 * and not the database. Every rule the catalogue enforces — a single holds
 * one track, a URL has to parse, the running order renumbers, the calendar
 * hears about a date — is enforced on what the seeder writes too, which is
 * the point of writing it through the front door. It is also what lets this
 * folder be deleted without leaving anything behind.
 *
 * ## One record's failure is one record's failure
 *
 * There is no transaction and there deliberately isn't one. A run that writes
 * fourteen records and reports two failures is useful; a run that rolls back
 * fourteen good records because of a malformed URL on the fifteenth is an
 * evening wasted. Failures are collected and reported per record.
 */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SeedJournal, SeedOutcome, SeedPlan, SeedRecord } from '@shared/domain/seed'
import type { DiscographyRelease, ReleaseDistribution } from '@shared/domain/discography'
import { maxTracksFor, normaliseIsrc, seedsOneTrack } from '@shared/domain/discography.constants'
import { getLogger } from '@main/core/logger'
import type { ArtistsService } from '@main/services/artists/artists.service'
import type { DiscographyService } from '@main/services/discography/discography.service'
import { titleKey } from './normalise'

const logger = getLogger('seed:apply')

export interface ApplyOptions {
  plan: SeedPlan
  discography: DiscographyService
  artists: ArtistsService
  report: (note: string, done: number, total: number) => void
}

/**
 * What the write did, twice over.
 *
 * `outcome` is for the operator — counts they can read. `journal` is for
 * `undoJournal`, and records the *ids* of everything this run added so that
 * exactly those can be taken back. See `SeedJournalSchema` for why nothing
 * less precise would be safe.
 */
export interface ApplyResult {
  outcome: SeedOutcome
  journal: SeedJournal
}

/** Image types the catalogue accepts, keyed by what a CDN says it is sending. */
const IMAGE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
}

/**
 * Fetch a remote image to a temporary file so the archive can store it.
 *
 * Used for both a record's sleeve and an artist's portrait — the two
 * services take a **path**, because every other route to either is the
 * operator picking a file, and both copy what they are given into the
 * managed media folder.
 *
 * `setAsset` takes a **path**, because every other route to artwork is the
 * operator picking a file — and it copies what it is given into the managed
 * media folder, so the temporary file is disposable the moment it returns.
 *
 * Returns null on any failure. Artwork is the one part of a record that is
 * worth nothing if it fails and costs nothing to add by hand later, so it
 * never fails a write.
 */
async function fetchImage(
  url: string,
  name = 'artwork'
): Promise<{ path: string; cleanup: () => Promise<void> } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const extension = IMAGE_EXTENSION[(response.headers.get('content-type') ?? '').split(';')[0]]
    if (!extension) return null

    const folder = await mkdtemp(join(tmpdir(), 'candy-seed-'))
    const path = join(folder, `${name}.${extension}`)
    await writeFile(path, Buffer.from(await response.arrayBuffer()))

    return { path, cleanup: () => rm(folder, { recursive: true, force: true }) }
  } catch (error) {
    logger.warn(`Could not fetch ${name}: ${(error as Error).message}`)
    return null
  }
}

export async function applyPlan({
  plan,
  discography,
  artists,
  report
}: ApplyOptions): Promise<ApplyResult> {
  const journal: SeedJournal = {
    writtenAt: new Date().toISOString(),
    releases: [],
    artistIds: [],
    artistNames: []
  }
  const outcome: SeedOutcome = {
    created: 0,
    updated: 0,
    tracksAdded: 0,
    linksAdded: 0,
    artistsCreated: 0,
    artworkStored: 0,
    portraitsStored: 0,
    skipped: 0,
    failures: []
  }

  /*
   * Names resolved to ids once for the whole run.
   *
   * `artists.create` already returns the existing record on a name collision
   * rather than refusing — which is exactly the behaviour a seeder wants —
   * but calling it forty times for the same four collaborators is forty round
   * trips to learn the same thing.
   */
  const roster = new Map<string, string>()
  for (const artist of await artists.listPlain()) roster.set(artist.name.toLowerCase(), artist.id)

  const idsFor = async (names: readonly string[]): Promise<string[]> => {
    const ids: string[] = []
    for (const raw of names) {
      const name = raw.trim()
      if (!name) continue

      const known = roster.get(name.toLowerCase())
      if (known) {
        ids.push(known)
        continue
      }

      const artist = await artists.create({ name })

      /*
       * A portrait, and only for somebody this run put on the roster.
       *
       * Never for an artist who was already there: their picture is theirs,
       * possibly chosen by hand, and a seeder is not entitled to replace it.
       * The guard is the pre-loaded roster, which is the same thing that
       * decides whether they count as created at all.
       *
       * Failures are silent per artist. A roster entry with no picture is
       * the ordinary state of one typed in, and no portrait is worth
       * failing a write over.
       */
      const portrait = plan.artistImages[name]
      if (portrait && !artist.picture.copiedPath) {
        const fetched = await fetchImage(portrait, 'portrait')
        if (fetched) {
          try {
            await artists.setPicture(artist.id, fetched.path)
            outcome.portraitsStored += 1
          } catch (error) {
            logger.warn(`Could not store a portrait for ${name}: ${(error as Error).message}`)
          } finally {
            await fetched.cleanup()
          }
        }
      }
      // Counted against the pre-loaded roster rather than against what
      // `create` returned, because it returns the existing record on a name
      // collision and says nothing about which of the two happened. A name
      // absent from the roster we read at the start was therefore added by
      // this run, and only those go in the journal — undo must never remove
      // somebody who was already there.
      outcome.artistsCreated += 1
      journal.artistIds.push(artist.id)
      journal.artistNames.push(artist.name)
      roster.set(name.toLowerCase(), artist.id)
      ids.push(artist.id)
    }
    return ids
  }

  /*
   * A record that another record's row points at is written first.
   *
   * `4x4`'s rows name the four singles promoted out of it, and naming one
   * requires it to exist — `addTrack({ releaseId })` reads the collected
   * record to fill the row from it. Sorting by "is anybody pointing at me"
   * is enough here because the graph is one level deep: a promoted single
   * holds one recording and points at nothing.
   */
  const pointedAt = new Set(
    plan.records.flatMap((record) =>
      record.tracks.map((track) => track.ownRecordKey).filter(Boolean)
    )
  )

  /** Plan key to the id it was written as, for the rows that point at it. */
  const writtenAs = new Map<string, string>()

  const included = plan.records
    .filter((record) => record.include)
    .sort((a, b) => Number(pointedAt.has(b.key)) - Number(pointedAt.has(a.key)))

  outcome.skipped = plan.records.length - included.length

  let done = 0
  for (const record of included) {
    report(record.title, done, included.length)
    try {
      if (record.match.action === 'update') {
        writtenAs.set(record.key, record.match.releaseId)
        await updateExisting(record)
        outcome.updated += 1
      } else {
        writtenAs.set(record.key, await createFresh(record))
        outcome.created += 1
      }
    } catch (error) {
      const reason = (error as Error).message
      logger.error(`Could not seed "${record.title}": ${reason}`)
      outcome.failures.push({ title: record.title, reason })
    }
    report(record.title, ++done, included.length)
  }

  return { outcome, journal }

  // ------------------------------------------------------------------ paths

  /**
   * The distribution list a record should end up with.
   *
   * Three cases, and the middle one is the reason this is not a concat:
   *
   *   - the platform is not listed → append the row
   *   - the platform is listed with **no stream address** → fill it in, which
   *     is precisely the state a release planned onto its stores sits in
   *   - the platform is listed with an address → leave it completely alone,
   *     even when it differs from ours. What is there was chosen.
   */
  function mergedDistribution(
    held: readonly ReleaseDistribution[],
    record: SeedRecord
  ): { rows: ReleaseDistribution[]; addedIds: string[]; filledIds: string[] } {
    const rows = held.map((row) => ({ ...row }))
    const addedIds: string[] = []
    const filledIds: string[] = []

    for (const proposed of record.distribution) {
      const existing = rows.find((row) => row.platform === proposed.platform)

      if (!existing) {
        // Prefixed and unique, so undo can find exactly this row later even
        // after the operator has added rows of their own around it.
        const id = `seed-${proposed.platform}-${randomUUID().slice(0, 8)}`
        rows.push({
          id,
          platform: proposed.platform,
          label: '',
          presaveUrl: '',
          streamUrl: proposed.url
        })
        addedIds.push(id)
        continue
      }

      if (!existing.streamUrl.trim()) {
        existing.streamUrl = proposed.url
        // Filled rather than added: undo clears the address and leaves the
        // row, because the row was the operator's.
        filledIds.push(existing.id)
      }
    }

    return { rows, addedIds, filledIds }
  }

  async function storeArtwork(
    release: DiscographyRelease,
    record: SeedRecord
  ): Promise<boolean> {
    if (!record.artworkUrl) return false
    // Already has a sleeve, so this run is not the one that put it there and
    // undo must not take it off.
    if (release.artwork.copiedPath) return false

    const fetched = await fetchImage(record.artworkUrl, 'artwork')
    if (!fetched) return false

    try {
      await discography.setAsset(release.id, 'artwork', fetched.path)
      outcome.artworkStored += 1
      return true
    } finally {
      await fetched.cleanup()
    }
  }

  async function createFresh(record: SeedRecord): Promise<string> {
    const artistIds = await idsFor(record.artistNames)

    let release = await discography.create({
      title: record.title,
      kind: record.kind,
      status: record.status,
      releaseDate: record.releaseDate,
      artistIds
    })

    const { rows, addedIds } = mergedDistribution(release.distribution, record)
    release = await discography.update(release.id, {
      upc: record.upc,
      label: record.label,
      phonographicLine: record.phonographicLine,
      copyrightLine: record.copyrightLine,
      notes: record.notes,
      distribution: rows
    })
    outcome.linksAdded += addedIds.length

    /*
     * A single and a remix arrive with their track already on them, seeded
     * from the title — so the first proposed recording *fills that row* and
     * only the rest are added. Adding it instead would give a single two
     * tracks, which the service would refuse, and correctly.
     */
    const ceiling = maxTracksFor(record.kind)
    const [first, ...rest] = record.tracks

    if (first && seedsOneTrack(record.kind) && release.tracks[0]) {
      release = await discography.updateTrack(release.id, release.tracks[0].id, {
        title: first.title,
        isrc: first.isrc,
        durationMs: first.durationMs,
        notes: first.notes,
        artistIds: await idsFor(first.artistNames)
      })
    }

    const pending = seedsOneTrack(record.kind) ? rest : record.tracks
    for (const track of pending) {
      if (release.tracks.length >= ceiling) break

      /*
       * Where the recording has its own record, the row *names* it.
       *
       * `releaseId` is the field for exactly this, and going through it
       * means the service fills the row from the record it points at — one
       * title, one ISRC, one duration, stored once. Restating them here
       * would be the same facts written twice and free to drift.
       *
       * It falls back to a plain row when the link is unavailable: the
       * child may have been ticked off in review, or refused by
       * `assertOneRecording` if its kind is ever something that cannot be
       * collected. A row is better than a missing track either way.
       */
      const collected = track.ownRecordKey ? writtenAs.get(track.ownRecordKey) : undefined

      try {
        release = collected
          ? await discography.addTrack(release.id, { releaseId: collected })
          : await discography.addTrack(release.id, {
              title: track.title,
              isrc: track.isrc,
              artistIds: await idsFor(track.artistNames)
            })
      } catch (error) {
        if (!collected) throw error
        logger.warn(`Could not name "${track.title}" as a record on "${release.title}": ${(error as Error).message}`)
        release = await discography.addTrack(release.id, {
          title: track.title,
          isrc: track.isrc,
          artistIds: await idsFor(track.artistNames)
        })
      }

      outcome.tracksAdded += 1

      // Duration is not a field `addTrack` takes — it is carried from a
      // project or a collected release, and this recording has neither.
      // Duration and the row's own note in one call: neither is a field
      // `addTrack` takes, and two round trips to set two fields on a row
      // that was just written is a round trip too many.
      const written = release.tracks[release.tracks.length - 1]
      if (written && (track.durationMs > 0 || track.notes)) {
        release = await discography.updateTrack(release.id, written.id, {
          durationMs: track.durationMs,
          notes: track.notes
        })
      }
    }

    await storeArtwork(release, record)

    /*
     * One line, because the whole record is this run's.
     *
     * Undo deletes it outright and does not need to know which tracks or
     * links came from where — everything on it did.
     */
    journal.releases.push({
      releaseId: release.id,
      title: release.title,
      created: true,
      addedTrackIds: [],
      addedDistributionIds: [],
      filledFields: [],
      artworkStored: false
    })

    return release.id
  }

  async function updateExisting(record: SeedRecord): Promise<void> {
    let release = await discography.get(record.match.releaseId)

    /*
     * Only what is missing.
     *
     * Every field below is written **if and only if** the record holds
     * nothing there. A label he corrected by hand, a date he fixed, a
     * copyright line he rewrote — all of those survive a second run, which is
     * the difference between a seeder and an importer that overwrites.
     */
    /*
     * Which fields this run is about to fill, noted *before* it fills them.
     *
     * Afterwards they are indistinguishable from fields the operator typed,
     * which is exactly the ambiguity the journal exists to resolve — so the
     * list has to be taken while "was it empty?" is still answerable.
     */
    const filledFields: string[] = []
    if (!release.upc && record.upc) filledFields.push('upc')
    if (!release.label && record.label) filledFields.push('label')
    if (!release.phonographicLine && record.phonographicLine) filledFields.push('phonographicLine')
    if (!release.copyrightLine && record.copyrightLine) filledFields.push('copyrightLine')
    if (!release.notes && record.notes) filledFields.push('notes')
    if (!release.releaseDate && record.releaseDate) filledFields.push('releaseDate')

    const { rows, addedIds, filledIds } = mergedDistribution(release.distribution, record)
    release = await discography.update(release.id, {
      upc: release.upc || record.upc,
      label: release.label || record.label,
      phonographicLine: release.phonographicLine || record.phonographicLine,
      copyrightLine: release.copyrightLine || record.copyrightLine,
      // Never over-written: a note the operator typed outranks ours.
      notes: release.notes || record.notes,
      releaseDate: release.releaseDate ?? record.releaseDate,
      // Promoted to released, never demoted: the harvest only ever sees
      // records that are actually out.
      status: record.status === 'released' ? 'released' : release.status,
      distribution: rows
    })
    outcome.linksAdded += addedIds.length + filledIds.length

    const addedTrackIds: string[] = []
    const ceiling = maxTracksFor(release.kind)

    for (const track of record.tracks) {
      const held = release.tracks.find(
        (row) =>
          (track.isrc !== '' && normaliseIsrc(row.isrc) === normaliseIsrc(track.isrc)) ||
          titleKey(row.title) === titleKey(track.title)
      )

      if (held) {
        // Fill the identifiers a hand-typed row is most likely to be
        // missing, and the note if it has none. Never overwrite either:
        // what is there was the operator's.
        const wants =
          (!held.isrc && track.isrc) ||
          (held.durationMs === 0 && track.durationMs > 0) ||
          (!held.notes && track.notes)

        if (wants) {
          release = await discography.updateTrack(release.id, held.id, {
            isrc: held.isrc || track.isrc,
            durationMs: held.durationMs || track.durationMs,
            notes: held.notes || track.notes
          })
        }
        continue
      }

      if (release.tracks.length >= ceiling) break

      release = await discography.addTrack(release.id, {
        title: track.title,
        isrc: track.isrc,
        artistIds: await idsFor(track.artistNames)
      })
      outcome.tracksAdded += 1

      const written = release.tracks[release.tracks.length - 1]
      if (written) addedTrackIds.push(written.id)
      if (written && (track.durationMs > 0 || track.notes)) {
        release = await discography.updateTrack(release.id, written.id, {
          durationMs: track.durationMs,
          notes: track.notes
        })
      }
    }

    const artworkStored = await storeArtwork(release, record)

    journal.releases.push({
      releaseId: release.id,
      title: release.title,
      created: false,
      addedTrackIds,
      /*
       * Only the rows this run *created*. A row that was already there and
       * merely had its address filled in is listed separately, because undo
       * clears the address and leaves the row — the row was the operator's
       * statement that the record goes out on that platform, and this run
       * did not make it.
       */
      addedDistributionIds: addedIds,
      filledFields: [...filledFields, ...filledIds.map((id) => `distribution:${id}`)],
      artworkStored
    })
  }
}
