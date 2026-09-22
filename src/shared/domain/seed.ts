import { z } from 'zod'
import { ReleaseKindSchema, ReleaseStatusSchema } from './discography'
import { DISTRIBUTION_PLATFORMS } from './discography.constants'
import { IsoDateSchema } from './dates'

/**
 * THE SEEDER — a temporary department, and the only one documented as such.
 *
 * It fills an empty DISCOGRAPHY from the platforms the music is already on,
 * runs once on the operator's machine, and is then deleted. Everything it
 * needs lives in this file, `src/main/services/seed/`, and one renderer
 * folder; `docs/DISCOGRAPHY_SEEDER.md` §7 is the removal checklist.
 *
 * ## The shape of the thing
 *
 * Three nouns, in the order the operator meets them:
 *
 *   **Credentials** — pasted, held in main-process memory for the run, never
 *   written to settings and never sent back across the bridge. See
 *   `SeedCredentials`, whose every field the renderer can write and none of
 *   which it can read afterwards.
 *
 *   **Plan** — what the harvest proposes. A pure description of writes that
 *   have not happened: the records, the links, the flagged calls. Recomputed
 *   from the cached harvest whenever the operator overrules a decision, so
 *   what the confirm screen draws is always what applying would do rather
 *   than what applying would do plus some adjustments.
 *
 *   **Outcome** — what applying actually did, counted.
 *
 * Nothing here is stored. A plan lives in memory until the window closes.
 */

// ------------------------------------------------------------- credentials

/**
 * Everything the harvest needs, as the operator types it.
 *
 * All optional and all defaulted to the empty string, which is not laxity —
 * the sources degrade independently. No TIDAL key means no TIDAL links and a
 * warning on the plan; no Jev key means every fuzzy call is flagged for the
 * operator instead of being adjudicated. Only Spotify is load-bearing, because
 * it is the spine every other source is matched against.
 */
export const SeedCredentialsSchema = z.object({
  spotifyClientId: z.string().default(''),
  spotifyClientSecret: z.string().default(''),
  /** A profile URL or a bare id. An artist is keyed by id, never by name. */
  spotifyArtistUrl: z.string().default(''),

  tidalClientId: z.string().default(''),
  tidalClientSecret: z.string().default(''),

  youtubeApiKey: z.string().default(''),
  /** The channel he posts to — promos, videos, the occasional exclusive. */
  youtubeChannelUrl: z.string().default(''),
  /** `<Artist> - Topic`, auto-generated, one Art Track per released recording. */
  youtubeTopicChannelUrl: z.string().default(''),

  /**
   * SoundCloud track URLs, one per line.
   *
   * A list rather than a profile crawl because a SoundCloud API application
   * requires an Artist Pro subscription and the account is on Artist. The
   * keyless oEmbed endpoint resolves one URL at a time, so the URLs have to
   * come from somewhere — and pasting them is a minute's work once.
   */
  soundcloudTrackUrls: z.string().default(''),

  /** TypeSafe's `apikey_…`. Absent means every fuzzy call reaches the operator. */
  jevApiKey: z.string().default(''),

  /** iTunes lookups are per storefront; his own is likeliest to carry it all. */
  appleStorefront: z.string().default('ca')
})
export type SeedCredentials = z.infer<typeof SeedCredentialsSchema>

/**
 * What reading an environment file filled in.
 *
 * Reported rather than applied silently: a key spelled `SPOTIFY_SECRET`
 * instead of `SPOTIFY_CLIENT_SECRET` is otherwise an empty field the
 * operator does not notice until the harvest refuses, and a track list the
 * file names but that is not there is otherwise a SoundCloud rung that
 * quietly contributes nothing.
 */
export const SeedEnvImportSchema = z.object({
  fileName: z.string().default(''),
  credentials: SeedCredentialsSchema,
  /** Variable names the file supplied and this recognised. */
  filled: z.array(z.string()).default([]),
  /** Variable names it carried that mean nothing here. Blanks are not listed. */
  ignored: z.array(z.string()).default([]),
  /** The track list it followed, or why it could not. */
  soundcloudFrom: z.string().default(''),
  soundcloudCount: z.number().int().min(0).default(0)
})
export type SeedEnvImport = z.infer<typeof SeedEnvImportSchema>

// ---------------------------------------------------------------- progress

export const SEED_PHASES = [
  'idle',
  'spotify',
  'stores',
  'youtube',
  'soundcloud',
  'adjudicating',
  'planning',
  'review',
  'applying',
  'done',
  'failed'
] as const
export type SeedPhase = (typeof SEED_PHASES)[number]

export const SEED_PHASE_LABEL: Record<SeedPhase, string> = {
  idle: 'READY',
  spotify: 'SPOTIFY',
  stores: 'STORES',
  youtube: 'YOUTUBE',
  soundcloud: 'SOUNDCLOUD',
  adjudicating: 'ADJUDICATING',
  planning: 'PLANNING',
  review: 'REVIEW',
  applying: 'WRITING',
  done: 'DONE',
  failed: 'FAILED'
}

/**
 * Where the run has got to, broadcast as it moves.
 *
 * A harvest is minutes of network against six services, so a spinner would be
 * the wrong report: `total` is zero until the step knows its own size, and the
 * renderer draws a bar only once it does.
 */
export const SeedProgressSchema = z.object({
  phase: z.enum(SEED_PHASES).default('idle'),
  note: z.string().default(''),
  done: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
  /** Set when `phase` is `failed`. The plan is left untouched. */
  error: z.string().default('')
})
export type SeedProgress = z.infer<typeof SeedProgressSchema>

// --------------------------------------------------------------------- log

export const SEED_LOG_LEVELS = ['step', 'request', 'response', 'note', 'warn', 'error'] as const
export type SeedLogLevel = (typeof SEED_LOG_LEVELS)[number]

/**
 * One line of the harvest's account of itself.
 *
 * ## Why the run is narrated rather than metered
 *
 * A harvest is two minutes of somebody else's computers being asked
 * questions, and a progress bar says only that it has not finished. The
 * operator watching it is not waiting — they are deciding whether to trust
 * what comes out, and that judgement needs the working: which service was
 * asked, what it was asked for, what it said, and what that means for the
 * next step.
 *
 * It is also the only diagnostic there is. When TIDAL rate-limits or a
 * channel handle resolves to the wrong account, the line that says so is the
 * difference between a fixable run and a mysterious one.
 *
 * **URLs are redacted before they get here.** A YouTube request carries its
 * API key in the query string, and this list crosses the bridge into a
 * renderer that could be screen-shared. See `redact` in `reporter.ts`.
 */
export const SeedLogEntrySchema = z.object({
  /** Milliseconds since the run began, not a wall clock — this is a stopwatch. */
  at: z.number().int().min(0).default(0),
  level: z.enum(SEED_LOG_LEVELS).default('note'),
  /** Which rung produced it: `spotify`, `tidal`, `jev`, `plan`, `write`. */
  source: z.string().default(''),
  text: z.string().default('')
})
export type SeedLogEntry = z.infer<typeof SeedLogEntrySchema>

/** Emitted in batches, because a harvest writes a few hundred of these. */
export const SeedLogBatchSchema = z.object({
  entries: z.array(SeedLogEntrySchema).default([])
})
export type SeedLogBatch = z.infer<typeof SeedLogBatchSchema>

// -------------------------------------------------------------------- plan

export const SeedPlatformSchema = z.object({
  platform: z.enum(DISTRIBUTION_PLATFORMS),
  url: z.string(),
  /**
   * How the link was arrived at. Drawn in review, because the difference
   * between the two is the whole argument of this feature: `upc` and `isrc`
   * cannot be wrong, and `title` is a judgement a model or the operator made.
   */
  via: z.enum(['upc', 'isrc', 'title', 'source']).default('source')
})
export type SeedPlatform = z.infer<typeof SeedPlatformSchema>

export const SeedTrackSchema = z.object({
  position: z.number().int().min(1),
  title: z.string(),
  isrc: z.string().default(''),
  durationMs: z.number().int().min(0).default(0),
  artistNames: z.array(z.string()).default([]),
  /**
   * Written onto the track row.
   *
   * Carries the one relationship the catalogue's own rules will not let
   * this express structurally: a recording that came out on two products.
   * See the shared-recording pass in `plan.ts`.
   */
  notes: z.string().default(''),
  /** True when a record already in the catalogue holds this ISRC or title. */
  present: z.boolean().default(false)
})
export type SeedTrack = z.infer<typeof SeedTrackSchema>

/**
 * How a proposed record lines up with the catalogue that is already there.
 *
 * `create` writes a new one. `update` adds to one that exists and **removes
 * nothing** — see `docs/DISCOGRAPHY_SEEDER.md` §6. The `matchedOn` field is
 * what the review screen shows to justify the second of those, because
 * "already there" is a claim the operator should be able to check.
 */
export const SeedMatchSchema = z.object({
  action: z.enum(['create', 'update']).default('create'),
  releaseId: z.string().default(''),
  title: z.string().default(''),
  matchedOn: z.enum(['upc', 'isrc', 'url', 'title', 'none']).default('none')
})
export type SeedMatch = z.infer<typeof SeedMatchSchema>

export const SeedRecordSchema = z.object({
  /** Stable for the life of the plan, so a toggle survives a recompute. */
  key: z.string(),
  /**
   * Where the record came from, which decides how much to trust it.
   *
   * `store` is identifier-confirmed and needs no judgement. `exclusive` is a
   * recording found only on SoundCloud or YouTube, so it exists because a
   * model or the operator said it was a recording rather than a promo.
   * `compilation` is somebody else's record he has one track on, and seeds
   * that track only.
   */
  origin: z.enum(['store', 'exclusive', 'compilation']).default('store'),
  title: z.string(),
  kind: ReleaseKindSchema.default('single'),
  status: ReleaseStatusSchema.default('released'),
  releaseDate: IsoDateSchema.nullable().default(null),
  upc: z.string().default(''),
  label: z.string().default(''),
  phonographicLine: z.string().default(''),
  copyrightLine: z.string().default(''),
  /** Remote, and downloaded at apply time only when the record has none. */
  artworkUrl: z.string().default(''),
  artistNames: z.array(z.string()).default([]),
  distribution: z.array(SeedPlatformSchema).default([]),
  tracks: z.array(SeedTrackSchema).default([]),
  match: SeedMatchSchema.prefault({}),
  /**
   * Written onto the record itself, so the catalogue keeps saying it.
   *
   * Distinct from `note` below, which explains what the *plan* decided and
   * is read once on the review screen. This is a fact about the release
   * that outlives the seeder — chiefly that it belongs to somebody else.
   */
  notes: z.string().default(''),
  /** Cleared by the operator in review. An excluded record is never written. */
  include: z.boolean().default(true),
  /** Why the kind was proposed, when it was not simply read off the source. */
  note: z.string().default('')
})
export type SeedRecord = z.infer<typeof SeedRecordSchema>

export const SEED_CHOICES = ['merge', 'exclusive', 'drop'] as const
export type SeedChoice = (typeof SEED_CHOICES)[number]
export const SeedChoiceSchema = z.enum(SEED_CHOICES)

export const SEED_CHOICE_LABEL: Record<SeedChoice, string> = {
  merge: 'SAME RECORDING',
  exclusive: 'ITS OWN RECORD',
  drop: 'NOT A RECORD'
}

/**
 * One call a title could not settle, and what was decided about it.
 *
 * Only SoundCloud and YouTube produce these: every other source is joined by
 * UPC or ISRC and is therefore exact. `probability` is the model's own number
 * for its proposal, and `flagged` is true when that number fell in the middle
 * band — confident enough to propose, not confident enough to act on.
 */
export const SeedDecisionSchema = z.object({
  key: z.string(),
  source: z.enum(['soundcloud', 'youtube']),
  title: z.string(),
  url: z.string().default(''),
  /** The released recording it was matched against, when it was matched. */
  against: z.string().default(''),
  /** `recording` · `promo` · `mix` · `other`, for the ones matched to nothing. */
  nature: z.string().default(''),
  proposal: z.enum(SEED_CHOICES).default('drop'),
  /** The operator's answer, when they gave one. Overrules the proposal. */
  choice: z.enum(SEED_CHOICES).nullable().default(null),
  probability: z.number().min(0).max(1).default(0),
  flagged: z.boolean().default(false),
  /** One line of plain English for the review table. */
  reason: z.string().default('')
})
export type SeedDecision = z.infer<typeof SeedDecisionSchema>

export const SeedSummarySchema = z.object({
  records: z.number().int().min(0).default(0),
  creating: z.number().int().min(0).default(0),
  updating: z.number().int().min(0).default(0),
  excluded: z.number().int().min(0).default(0),
  recordings: z.number().int().min(0).default(0),
  links: z.number().int().min(0).default(0),
  dropped: z.number().int().min(0).default(0),
  flagged: z.number().int().min(0).default(0)
})
export type SeedSummary = z.infer<typeof SeedSummarySchema>

export const SeedPlanSchema = z.object({
  harvestedAt: z.string().default(''),
  artist: z
    .object({ id: z.string().default(''), name: z.string().default(''), url: z.string().default('') })
    .prefault({}),
  records: z.array(SeedRecordSchema).default([]),
  decisions: z.array(SeedDecisionSchema).default([]),
  summary: SeedSummarySchema.prefault({}),
  /** Sources that were skipped, and why. Drawn above the proposal. */
  warnings: z.array(z.string()).default([])
})
export type SeedPlan = z.infer<typeof SeedPlanSchema>

// ----------------------------------------------------------------- outcome

export const SeedOutcomeSchema = z.object({
  created: z.number().int().min(0).default(0),
  updated: z.number().int().min(0).default(0),
  tracksAdded: z.number().int().min(0).default(0),
  linksAdded: z.number().int().min(0).default(0),
  artistsCreated: z.number().int().min(0).default(0),
  artworkStored: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0).default(0),
  /** Per-record failures. The run continues past one; nothing is rolled back. */
  failures: z.array(z.object({ title: z.string(), reason: z.string() })).default([])
})
export type SeedOutcome = z.infer<typeof SeedOutcomeSchema>

/**
 * Exactly what one run wrote, so it can be taken back.
 *
 * ## Why a journal and not a rule
 *
 * "Undo the seeding" sounds like it could be a query — find everything that
 * looks seeded and delete it — and that is the version that eventually
 * deletes something the operator typed. A record the seeder *updated* is
 * indistinguishable afterwards from one they filled in themselves, because
 * the whole point of §6 is that the seeder writes the same fields a person
 * would.
 *
 * So the writer records what it did, per record, at the moment it did it.
 * Undo reverses precisely that and touches nothing else: the four links it
 * added come off, the two links that were already there stay, and a record
 * that existed before the run is left holding everything except what this
 * run put on it.
 *
 * Persisted to `userData`, because the run that wants undoing is usually the
 * one from before the restart.
 */
export const SeedJournalEntrySchema = z.object({
  releaseId: z.string(),
  title: z.string().default(''),
  /** True when the run raised it. Undo deletes it outright. */
  created: z.boolean().default(false),
  /** Rows added to an existing record. Undo removes exactly these. */
  addedTrackIds: z.array(z.string()).default([]),
  addedDistributionIds: z.array(z.string()).default([]),
  /** Fields that were empty before the run and were filled by it. */
  filledFields: z.array(z.string()).default([]),
  artworkStored: z.boolean().default(false)
})
export type SeedJournalEntry = z.infer<typeof SeedJournalEntrySchema>

export const SeedJournalSchema = z.object({
  writtenAt: z.string().default(''),
  releases: z.array(SeedJournalEntrySchema).default([]),
  /** Only the artists this run put on the roster. Never a pre-existing one. */
  artistIds: z.array(z.string()).default([]),
  /** Names, so the undo panel can say who would leave. */
  artistNames: z.array(z.string()).default([])
})
export type SeedJournal = z.infer<typeof SeedJournalSchema>

export const SeedUndoResultSchema = z.object({
  releasesRemoved: z.number().int().min(0).default(0),
  releasesReverted: z.number().int().min(0).default(0),
  tracksRemoved: z.number().int().min(0).default(0),
  linksRemoved: z.number().int().min(0).default(0),
  artistsRemoved: z.number().int().min(0).default(0),
  failures: z.array(z.object({ title: z.string(), reason: z.string() })).default([])
})
export type SeedUndoResult = z.infer<typeof SeedUndoResultSchema>

/** Everything the seeder page draws, in one fetch. */
export const SeedStateSchema = z.object({
  progress: SeedProgressSchema.prefault({}),
  plan: SeedPlanSchema.nullable().default(null),
  outcome: SeedOutcomeSchema.nullable().default(null),
  /** True once credentials have been accepted, so the form can stay collapsed. */
  armed: z.boolean().default(false),
  /**
   * The last run, if one is still on record — which is what makes undo
   * offerable. Null both before the first write and after an undo.
   */
  journal: SeedJournalSchema.nullable().default(null),
  /**
   * The narration so far, so the page can be left and come back to mid-run.
   *
   * Capped in the service. A log that grew without limit would eventually be
   * the largest thing crossing the bridge on every `seed:state`.
   */
  log: z.array(SeedLogEntrySchema).default([])
})
export type SeedState = z.infer<typeof SeedStateSchema>
