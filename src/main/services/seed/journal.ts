/**
 * Where the record of one run is kept, and how it is taken back.
 *
 * ## The journal
 *
 * Written to `userData/seed-journal.json` rather than held in memory, because
 * the run somebody wants to undo is almost always the one from before the
 * restart — they seeded the catalogue, looked at it for a day, and decided
 * against it. An undo that only survived until the window closed would be an
 * undo for the five minutes nobody needs one.
 *
 * It is a **journal, not a rule**. See `SeedJournalSchema` for why that
 * distinction is the whole safety argument: a record the seeder updated is
 * afterwards indistinguishable from one the operator filled in by hand, so
 * anything that tried to *infer* what to remove would eventually remove
 * something they typed.
 *
 * ## Undo is itself additive-safe
 *
 * It removes only the ids it wrote down. A track the operator added to a
 * seeded record afterwards is not in the journal and survives; so does a link
 * they pasted, a label they corrected, and every record the run never
 * touched. A record that has since been deleted by hand is skipped rather
 * than treated as a failure.
 *
 * Deleted with the seeder. See `docs/DISCOGRAPHY_SEEDER.md` §7.
 */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SeedJournal, SeedUndoResult } from '@shared/domain/seed'
import { SeedJournalSchema } from '@shared/domain/seed'
import { getPaths } from '@main/core/paths'
import { getLogger } from '@main/core/logger'
import type { ArtistsService } from '@main/services/artists/artists.service'
import type { DiscographyService } from '@main/services/discography/discography.service'

const logger = getLogger('seed:journal')

const FILE = (): string => join(getPaths().userData, 'seed-journal.json')

export async function readJournal(): Promise<SeedJournal | null> {
  const path = FILE()
  if (!existsSync(path)) return null

  try {
    const parsed = SeedJournalSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
    // An unreadable journal is treated as no journal rather than as an error:
    // the alternative is a seeder page that refuses to load because of a file
    // whose only job is to make one button available.
    return parsed.success ? parsed.data : null
  } catch (error) {
    logger.warn(`Could not read the seed journal: ${(error as Error).message}`)
    return null
  }
}

export async function writeJournal(journal: SeedJournal): Promise<void> {
  await writeFile(FILE(), JSON.stringify(journal, null, 2), 'utf8')
}

export async function clearJournal(): Promise<void> {
  await rm(FILE(), { force: true })
}

export interface UndoOptions {
  journal: SeedJournal
  discography: DiscographyService
  artists: ArtistsService
  report: (note: string, done: number, total: number) => void
}

export async function undoJournal({
  journal,
  discography,
  artists,
  report
}: UndoOptions): Promise<SeedUndoResult> {
  const result: SeedUndoResult = {
    releasesRemoved: 0,
    releasesReverted: 0,
    tracksRemoved: 0,
    linksRemoved: 0,
    artistsRemoved: 0,
    failures: []
  }

  const total = journal.releases.length + journal.artistIds.length
  let done = 0

  for (const entry of journal.releases) {
    report(entry.title, done, total)
    try {
      if (entry.created) {
        await discography.remove(entry.releaseId)
        result.releasesRemoved += 1
        done += 1
        continue
      }

      /*
       * An updated record is put back field by field.
       *
       * Read fresh each time rather than trusting a snapshot: the operator
       * may have edited it since, and the rule is that only what this run
       * added comes off.
       */
      let release = await discography.get(entry.releaseId)

      for (const trackId of entry.addedTrackIds) {
        if (!release.tracks.some((track) => track.id === trackId)) continue
        release = await discography.removeTrack(release.id, trackId)
        result.tracksRemoved += 1
      }

      const added = new Set(entry.addedDistributionIds)
      const kept = release.distribution.filter((row) => !added.has(row.id))
      const removed = release.distribution.length - kept.length

      // `''` rather than `undefined`: the patch replaces what it names, and
      // naming a field with the empty string is how a field is cleared.
      const patch: Record<string, unknown> = {}
      for (const field of entry.filledFields) {
        patch[field] = field === 'releaseDate' ? null : ''
      }
      if (removed > 0) patch.distribution = kept

      if (Object.keys(patch).length > 0) {
        await discography.update(release.id, patch)
      }
      result.linksRemoved += removed

      if (entry.artworkStored) await discography.setAsset(entry.releaseId, 'artwork', null)

      result.releasesReverted += 1
    } catch (error) {
      const reason = (error as Error).message
      /*
       * A record deleted by hand since the run is not a failure.
       *
       * Undo's job is "leave the catalogue as if the run had not happened",
       * and a record that is already gone satisfies that. Reporting it would
       * be a red line on a screen where nothing went wrong.
       */
      if (/no longer|not found/i.test(reason)) {
        logger.info(`"${entry.title}" is already gone; nothing to undo`)
      } else {
        logger.error(`Could not undo "${entry.title}": ${reason}`)
        result.failures.push({ title: entry.title, reason })
      }
    }
    done += 1
  }

  /*
   * Artists last, and only the ones this run created.
   *
   * After the releases are gone their credits are gone with them, so a
   * collaborator the seeder introduced has nothing left pointing at them.
   * `artists.remove` detaches from anything that somehow still does, which
   * is the right behaviour if the operator credited one on a project of
   * their own in the meantime — the person leaves the roster, the project
   * keeps working.
   */
  for (const [index, artistId] of journal.artistIds.entries()) {
    report(journal.artistNames[index] ?? 'artist', done, total)
    try {
      await artists.remove(artistId)
      result.artistsRemoved += 1
    } catch (error) {
      const reason = (error as Error).message
      if (!/no longer|not found/i.test(reason)) {
        result.failures.push({ title: journal.artistNames[index] ?? artistId, reason })
      }
    }
    done += 1
  }

  await clearJournal()
  logger.info(
    `Undid a seed run: ${result.releasesRemoved} removed, ${result.releasesReverted} reverted, ${result.artistsRemoved} artists`
  )
  return result
}
