/**
 * THE SEEDER — one harvest, one review, one write, then delete the folder.
 *
 * A temporary department. It exists because typing a back catalogue in by
 * hand is an evening's work that produces a catalogue disagreeing with the
 * stores in a dozen small ways — a date here, a spelling there, an ISRC
 * nobody copied — when everything needed is already public and already keyed
 * by identifiers built for exactly this.
 *
 * `docs/DISCOGRAPHY_SEEDER.md` is the whole design; §7 is the removal
 * checklist.
 *
 * ## Three gestures, and the middle one is the point
 *
 *   1. **Harvest.** Six sources, held in this object's memory for the run.
 *   2. **Review.** A plan is proposed and *nothing is written*. The operator
 *      reads every record, overrules any flagged call, and ticks off anything
 *      they do not want. Each change rebuilds the plan from the cached
 *      harvest, so the screen always shows what applying would do.
 *   3. **Write.** Additive and idempotent. See `apply.ts`.
 *
 * The gap between 1 and 3 is the feature. A seeder that harvested and wrote
 * in one press would be a seeder nobody could trust with a catalogue that is
 * not empty.
 *
 * ## Credentials never leave this object
 *
 * They arrive on `run`, live in a private field, and are dropped by `reset`
 * or when the process exits. They are never written to settings, never
 * returned across the bridge, and never logged. `SeedState` — the only thing
 * the renderer can read — has no field that could carry one.
 */
import type {
  SeedChoice,
  SeedCredentials,
  SeedJournal,
  SeedOutcome,
  SeedPhase,
  SeedPlan,
  SeedProgress,
  SeedState,
  SeedUndoResult
} from '@shared/domain/seed'
import type { DiscographyRelease } from '@shared/domain/discography'
import { AppError, ErrorCode } from '@main/core/errors'
import { TypedEmitter } from '@main/core/emitter'
import { getLogger } from '@main/core/logger'
import type { ArtistsService } from '@main/services/artists/artists.service'
import type { DiscographyService } from '@main/services/discography/discography.service'
import { adjudicate, type Verdict } from './adjudicate'
import { applyPlan } from './apply'
import { clearJournal, readJournal, undoJournal, writeJournal } from './journal'
import { buildPlan } from './plan'
import { harvestSoundcloud, type SoundcloudHarvest } from './sources/soundcloud'
import { harvestSpotify, type SpotifyHarvest } from './sources/spotify'
import { harvestStores, type StoreHarvest } from './sources/stores'
import { harvestYoutube, type YoutubeHarvest } from './sources/youtube'

const logger = getLogger('seed')

interface SeedEvents {
  progress: SeedProgress
}

/** Everything the harvest learned, kept so a rebuild costs no network. */
interface Harvest {
  spotify: SpotifyHarvest
  stores: StoreHarvest
  youtube: YoutubeHarvest
  soundcloud: SoundcloudHarvest
  verdicts: Verdict[]
  warnings: string[]
}

export class SeedService extends TypedEmitter<SeedEvents> {
  constructor(
    private readonly discography: DiscographyService,
    private readonly artists: ArtistsService
  ) {
    super()
  }

  private credentials: SeedCredentials | null = null
  private harvest: Harvest | null = null
  private overrides: Record<string, SeedChoice> = {}
  private excluded = new Set<string>()
  private plan: SeedPlan | null = null
  private outcome: SeedOutcome | null = null
  private progress: SeedProgress = { phase: 'idle', note: '', done: 0, total: 0, error: '' }
  private busy = false
  /**
   * The last run on record, read from disk on first use.
   *
   * `undefined` means "not looked yet", `null` means "looked, there is
   * none" — the distinction matters because the file survives a restart and
   * the whole point of the journal is to be there afterwards.
   */
  private journal: SeedJournal | null | undefined = undefined

  // ------------------------------------------------------------------ state

  /**
   * Everything the page draws.
   *
   * Asynchronous only because of the journal, which lives on disk so that an
   * undo survives the restart it is usually wanted after.
   */
  async getState(): Promise<SeedState> {
    if (this.journal === undefined) this.journal = await readJournal()
    return {
      progress: this.progress,
      plan: this.plan,
      outcome: this.outcome,
      armed: this.credentials !== null,
      journal: this.journal
    }
  }

  private advance(phase: SeedPhase, note = '', done = 0, total = 0): void {
    this.progress = { phase, note, done, total, error: '' }
    this.emit('progress', this.progress)
  }

  /** A `report` for one step, which fills in the phase the step belongs to. */
  private reporter(phase: SeedPhase): (note: string, done: number, total: number) => void {
    return (note, done, total) => {
      this.progress = { phase, note, done, total, error: '' }
      this.emit('progress', this.progress)
    }
  }

  private fail(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error)
    this.progress = { phase: 'failed', note: '', done: 0, total: 0, error: message }
    this.emit('progress', this.progress)
    logger.error(`The harvest failed: ${message}`)
    throw new AppError(message, { code: ErrorCode.Unknown, recoverable: true })
  }

  private guard(): void {
    if (this.busy) {
      throw new AppError('The seeder is already working.', {
        code: ErrorCode.Validation,
        hint: 'Wait for the current step to finish.',
        recoverable: true
      })
    }
  }

  // ---------------------------------------------------------------- harvest

  /**
   * Read all six sources, adjudicate what a title could not settle, and
   * propose a plan. **Writes nothing.**
   */
  async run(credentials: SeedCredentials): Promise<SeedPlan> {
    this.guard()
    this.busy = true
    this.credentials = credentials
    this.outcome = null

    try {
      this.advance('spotify', 'authenticating')
      const spotify = await harvestSpotify({
        credentials,
        report: this.reporter('spotify')
      })
      logger.info(
        `Spotify: ${spotify.releases.length} records, ${spotify.releases.reduce(
          (sum, release) => sum + release.tracks.length,
          0
        )} recordings`
      )

      this.advance('stores', 'matching by identifier')
      const stores = await harvestStores({
        harvest: spotify,
        storefront: credentials.appleStorefront || 'ca',
        tidalClientId: credentials.tidalClientId,
        tidalClientSecret: credentials.tidalClientSecret,
        report: this.reporter('stores')
      })

      this.advance('youtube', 'reading the channels')
      const youtube = await harvestYoutube({
        apiKey: credentials.youtubeApiKey,
        channelUrl: credentials.youtubeChannelUrl,
        topicChannelUrl: credentials.youtubeTopicChannelUrl,
        harvest: spotify,
        report: this.reporter('youtube')
      })

      this.advance('soundcloud', 'reading the uploads')
      const soundcloud = await harvestSoundcloud({
        urls: credentials.soundcloudTrackUrls,
        harvest: spotify,
        report: this.reporter('soundcloud')
      })

      this.advance('adjudicating', 'weighing the uncertain ones')
      const { verdicts, warnings } = await adjudicate({
        jevApiKey: credentials.jevApiKey,
        harvest: spotify,
        soundcloud,
        youtube,
        report: this.reporter('adjudicating')
      })

      this.harvest = {
        spotify,
        stores,
        youtube,
        soundcloud,
        verdicts,
        warnings: [...stores.warnings, ...youtube.warnings, ...soundcloud.warnings, ...warnings]
      }

      /*
       * A fresh harvest clears the operator's previous answers.
       *
       * They were answers about *other* uploads — the keys are derived from
       * URLs and video ids, so most would still apply — but "most" is the
       * problem. A decision carried silently across a re-harvest is a
       * decision nobody reviewed in this run, which is the one thing the
       * confirm screen exists to prevent.
       */
      this.overrides = {}
      this.excluded.clear()

      this.advance('planning', 'comparing against the catalogue')
      const plan = await this.rebuild()
      this.advance('review', 'nothing has been written')
      return plan
    } catch (error) {
      return this.fail(error)
    } finally {
      this.busy = false
    }
  }

  // ----------------------------------------------------------------- review

  /** Overrule one flagged call, and see the whole plan that results. */
  async decide(key: string, choice: SeedChoice): Promise<SeedPlan> {
    this.requireHarvest()
    this.overrides[key] = choice
    return this.rebuild()
  }

  /** Tick a record off, or back on. An excluded record is never written. */
  async setIncluded(key: string, include: boolean): Promise<SeedPlan> {
    this.requireHarvest()
    if (include) this.excluded.delete(key)
    else this.excluded.add(key)
    return this.rebuild()
  }

  private requireHarvest(): Harvest {
    if (!this.harvest) {
      throw new AppError('Nothing has been harvested yet.', {
        code: ErrorCode.Validation,
        hint: 'Run the harvest first.',
        recoverable: true
      })
    }
    return this.harvest
  }

  /**
   * Rebuild the plan from the cached harvest and the operator's answers.
   *
   * The catalogue is re-read every time rather than cached alongside the
   * harvest: the operator can be editing the discography in another window,
   * and a plan that said "create" about a record they raised two minutes ago
   * would be the seeder proposing a duplicate.
   */
  private async rebuild(): Promise<SeedPlan> {
    const harvest = this.requireHarvest()

    this.plan = buildPlan({
      harvest: harvest.spotify,
      stores: harvest.stores,
      youtube: harvest.youtube,
      soundcloud: harvest.soundcloud,
      verdicts: harvest.verdicts,
      overrides: this.overrides,
      excluded: [...this.excluded],
      existing: await this.catalogue(),
      warnings: harvest.warnings
    })

    return this.plan
  }

  /**
   * Every release in full, tracks included.
   *
   * The registry ships summaries, which omit the tracklist — and the
   * tracklist is where the ISRCs are, which is the strongest of the four
   * keys the plan matches on. One fetch per record is a few dozen reads
   * against a local database, once.
   */
  private async catalogue(): Promise<DiscographyRelease[]> {
    const registry = await this.discography.getRegistry()
    const releases: DiscographyRelease[] = []
    for (const summary of registry.releases) {
      releases.push(await this.discography.get(summary.id))
    }
    return releases
  }

  // ------------------------------------------------------------------ write

  /**
   * Write the plan. The operator has seen exactly this and pressed the button.
   */
  async apply(): Promise<SeedOutcome> {
    this.guard()
    const plan = this.plan
    if (!plan) {
      throw new AppError('There is no plan to write.', {
        code: ErrorCode.Validation,
        hint: 'Run the harvest first.',
        recoverable: true
      })
    }

    this.busy = true
    try {
      this.advance('applying', 'writing', 0, plan.records.filter((r) => r.include).length)

      const { outcome, journal } = await applyPlan({
        plan,
        discography: this.discography,
        artists: this.artists,
        report: this.reporter('applying')
      })

      /*
       * Journalled before anything is reported.
       *
       * If writing the journal failed after the catalogue had changed, the
       * run would be unundoable and nobody would know — so it happens first
       * and a failure here fails the call, which leaves a written catalogue
       * and a loud error rather than a quiet trap.
       */
      await writeJournal(journal)
      this.journal = journal
      this.outcome = outcome
      this.advance('done', `${outcome.created} raised, ${outcome.updated} updated`)
      logger.info(
        `Seeded the catalogue: ${outcome.created} created, ${outcome.updated} updated, ${outcome.failures.length} failed`
      )

      /*
       * The plan is rebuilt rather than dropped.
       *
       * Every record it proposed now matches something, so the rebuilt plan
       * reads "already complete — nothing would change" down the whole list.
       * That is the honest state to leave the screen in, and it is also the
       * proof of idempotence: pressing the button again does nothing.
       */
      await this.rebuild()
      return outcome
    } catch (error) {
      return this.fail(error)
    } finally {
      this.busy = false
    }
  }

  /**
   * Take back the last run, exactly.
   *
   * Removes what it created, un-adds what it added to records that already
   * existed, and leaves everything else — including anything the operator
   * has done since — untouched. See `journal.ts`.
   */
  async undo(): Promise<SeedUndoResult> {
    this.guard()
    if (this.journal === undefined) this.journal = await readJournal()

    const journal = this.journal
    if (!journal) {
      throw new AppError('There is no run on record to undo.', {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }

    this.busy = true
    try {
      this.advance('applying', 'undoing', 0, journal.releases.length + journal.artistIds.length)
      const result = await undoJournal({
        journal,
        discography: this.discography,
        artists: this.artists,
        report: this.reporter('applying')
      })

      this.journal = null
      this.outcome = null
      this.advance('done', `${result.releasesRemoved} removed, ${result.artistsRemoved} artists`)

      // The plan, if one is still loaded, now describes a catalogue that no
      // longer holds any of it — so it is rebuilt rather than left claiming
      // every record is already complete.
      if (this.harvest) await this.rebuild()
      return result
    } catch (error) {
      return this.fail(error)
    } finally {
      this.busy = false
    }
  }

  /** Forget the credentials, the harvest and the plan. Keeps the journal. */
  reset(): void {
    this.credentials = null
    this.harvest = null
    this.overrides = {}
    this.excluded.clear()
    this.plan = null
    this.outcome = null
    this.advance('idle')
  }

  /**
   * Drop the journal without undoing anything.
   *
   * For the operator who is happy with what was written: the record of the
   * run is no longer useful and an undo button on screen forever is a
   * standing invitation to an accident.
   */
  async acceptRun(): Promise<void> {
    await clearJournal()
    this.journal = null
  }
}
