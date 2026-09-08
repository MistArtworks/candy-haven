import { z } from 'zod'
import { sparseShape } from './patch'
import {
  CAST_DURATION_MS,
  CAST_SETTLE_MS,
  CONCORD_PRESENTATIONS,
  DEFAULT_RESULT_LINGER_MS,
  RESULT_LINGER_MAX_MS,
  RESULT_LINGER_MIN_MS,
  DEFAULT_POLL_DURATION_MS,
  DEFAULT_VOTE_COMMAND,
  MAX_CONCORD_PROMPT,
  MAX_CONCORD_TITLE,
  MAX_EDGE_RESERVE,
  MAX_OPTION_LABEL,
  MAX_OPTIONS,
  MAX_VOTE_COMMAND,
  OVERLAY_THEMES,
  POLL_DURATION_MAX_MS,
  VOTE_SYNTAXES
} from './concord.constants'

/**
 * Schema half of THE CONCORD — the chat-voted poll served by the OBSERVATORY
 * department to an OBS browser source.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. The arithmetic that turns a message into a vote, and a cast command
 * into a lifted lot, lives in concord.constants.ts so the console and the
 * standalone overlay page can import it as values without pulling zod into
 * either bundle.
 *
 * As with the rite: **every field added here must carry a default**, because the
 * state is persisted and a record written by an earlier build is missing
 * whatever was added since. The IPC router validates handler output, so a field
 * without a default turns a restored poll into a hard failure of every concord
 * channel at once.
 */

export type { ConcordLayout, ConcordPresentation, VoteSyntax } from './concord.constants'

/**
 * The life of a poll.
 *
 * `casting` is entered only on a deadlock — a clear result goes straight from
 * `open` to `resolved`. There is deliberately no `closed` state distinct from
 * `resolved`: a poll whose voting has ended either has an answer or is in the
 * middle of drawing one, and a third state between them would be a state with
 * nothing to render.
 */
export const ConcordPhaseSchema = z.enum(['idle', 'open', 'casting', 'resolved'])
export type ConcordPhase = z.infer<typeof ConcordPhaseSchema>

/**
 * One option on the ballot.
 *
 * `token` is the numeral a viewer types. Stored rather than derived from the
 * array index so that a vote already counted cannot be re-attributed by the
 * roster being reordered, and so the overlay and chat can never disagree about
 * which numeral belongs to which option.
 */
export const ConcordOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(MAX_OPTION_LABEL),
  token: z.string().min(1).max(2),
  /**
   * Votes currently held.
   *
   * A plain count, and the only vote data that crosses either boundary. The
   * ledger of who voted for what stays in the main process — see
   * `ConcordStateSchema` below.
   */
  tally: z.number().int().min(0).default(0)
})
export type ConcordOption = z.infer<typeof ConcordOptionSchema>

/**
 * Everything needed to replay one casting, decided once in the main process.
 *
 * The rite's `SpinCommand` doctrine applies verbatim, and this is the reason it
 * exists at all: the lot that will be lifted is drawn by a CSPRNG *before*
 * anything moves, and both surfaces then render a deterministic function of this
 * object. Neither is rolling its own outcome and hoping to agree. Getting this
 * wrong lifts two different lots on two screens in front of an audience, and
 * there is no recovering from that on a live stream.
 */
export const CastCommandSchema = z.object({
  id: z.string(),
  /**
   * The deadlocked options, in ballot order.
   *
   * Carried on the command rather than re-derived from the tallies, so a
   * browser source that attaches mid-casting draws the same vessel even if it
   * also received a newer state.
   */
  tiedIds: z.array(z.string()).min(1),
  /** Index *within `tiedIds`* of the lot that will be lifted. */
  targetIndex: z.number().int().min(0),
  durationMs: z.number().int().min(500).max(30_000).default(CAST_DURATION_MS),
  settleMs: z.number().int().min(0).max(10_000).default(CAST_SETTLE_MS),
  /** Epoch milliseconds. Host and overlay share a wall clock — same machine. */
  startedAt: z.number()
})
export type CastCommand = z.infer<typeof CastCommandSchema>

/**
 * A settled poll.
 *
 * Carries the label as well as the option id, so the result still renders after
 * the ballot has been cleared for the next question.
 */
export const ConcordResultSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  tally: z.number().int().min(0).default(0),
  /** Votes cast across every option, so the margin stays auditable. */
  total: z.number().int().min(0).default(0),
  share: z.number().min(0).max(1).default(0),
  /** Distinct voters, which is not the same as the total once votes change. */
  voters: z.number().int().min(0).default(0),
  at: z.number(),
  /**
   * The options this one was tied with, if it was.
   *
   * Retained after the fact rather than discarded, because "it was a three-way
   * tie and chance settled it" is a materially different result from a clean
   * win and the record should say so.
   */
  tiedWith: z.array(z.string()).default([]),
  /** Whether THE CASTING decided this rather than the vote. */
  decidedByCasting: z.boolean().default(false)
})
export type ConcordResult = z.infer<typeof ConcordResultSchema>

export const ConcordConfigSchema = z.object({
  /** Masthead on the overlay. */
  title: z.string().max(MAX_CONCORD_TITLE).default('THE CONCORD'),
  /** The question being put to the chamber, e.g. `WHICH TRACK DO WE FINISH`. */
  prompt: z.string().max(MAX_CONCORD_PROMPT).default('THE CHAMBER WILL DECIDE'),
  /**
   * How the tally is presented.
   *
   * `.catch()` as well as `.default()`, which is the lesson the rite's
   * `mechanism` field learned the hard way: presentations get retired, the
   * repository parses a stored poll with `safeParse` and discards the whole
   * thing on failure, so without this a config naming a presentation that no
   * longer exists would take the ballot and the history down with it.
   */
  presentation: z.enum(CONCORD_PRESENTATIONS).default('tally').catch('tally'),
  /**
   * Withdraw the overlay when no poll is running.
   *
   * The reason a widget can live permanently in a scene: it is absent until the
   * question is put, and leaves once the result has been read. Without this the
   * operator has to remember to toggle a source's visibility twice per poll,
   * mid-broadcast, which is exactly the sort of thing that gets forgotten.
   */
  autoHide: z.boolean().default(true),
  /** How long a settled result stays up before withdrawing. */
  resultLingerMs: z
    .number()
    .int()
    .min(RESULT_LINGER_MIN_MS)
    .max(RESULT_LINGER_MAX_MS)
    .default(DEFAULT_RESULT_LINGER_MS),

  // ------------------------------------------------------------------- voting

  /**
   * Voting window in milliseconds, or **0 for no timer at all**.
   *
   * Zero is a real setting rather than an unset one — a poll the operator wants
   * to talk over stays open until they close it. Validated loosely here and
   * clamped by `clampPollDuration` in the service, which knows that zero has to
   * survive the clamp.
   */
  durationMs: z.number().int().min(0).max(POLL_DURATION_MAX_MS).default(DEFAULT_POLL_DURATION_MS),
  voteSyntax: z.enum(VOTE_SYNTAXES).default('both').catch('both'),
  /** Command word, with or without its `!`; normalised on use. */
  command: z
    .string()
    .max(MAX_VOTE_COMMAND + 1)
    .default(DEFAULT_VOTE_COMMAND),

  // ------------------------------------------------------------- presentation
  // Look, as opposed to behaviour. A fixed set of choices within the locked
  // palette rather than free-form styling.

  /** Composite over the scene instead of drawing a backdrop. */
  transparent: z.boolean().default(false),
  theme: z.enum(OVERLAY_THEMES).default('obsidian').catch('obsidian'),
  /**
   * Fraction of the overlay's width held clear at the right edge.
   *
   * Nothing is drawn into it — it is there so a chat panel and a camera can be
   * composited over that band in OBS. A fraction rather than pixels because a
   * browser source can be sized to anything.
   */
  reserveRight: z.number().min(0).max(MAX_EDGE_RESERVE).default(0.2),
  /** The title block: eyebrow, title, question and rule. */
  showMasthead: z.boolean().default(true),
  /** The resonance plexus behind the tally. */
  showField: z.boolean().default(true),
  /** The numeral beside each option. Hiding it makes the poll unvotable. */
  showTokens: z.boolean().default(true),
  showPercentages: z.boolean().default(true),
  showVoterCount: z.boolean().default(true),
  /** The directive telling the audience how to vote. */
  showInstruction: z.boolean().default(true),
  /** The faint connection diagnostic at the foot of the overlay. */
  showStatus: z.boolean().default(true),

  /**
   * Audio cues in the console — final call, and a deadlock.
   *
   * Console only, never the broadcast, for the reason the countdowns keep their
   * cues off the overlay: an OBS browser source can be configured to shut down
   * when it is not visible, so a cue living there would be silent exactly when
   * a poll was running behind a full-screen scene.
   */
  sound: z.boolean().default(true)
})
export type ConcordConfig = z.infer<typeof ConcordConfigSchema>

export const ConcordStateSchema = z.object({
  phase: ConcordPhaseSchema.default('idle'),
  options: z.array(ConcordOptionSchema).max(MAX_OPTIONS).default([]),
  config: ConcordConfigSchema.prefault({}),

  /**
   * Votes counted, and the distinct people who cast them.
   *
   * Two numbers because they diverge: a changeable vote moves between options
   * without adding a voter, so `totalVotes` equals `voters` at all times and the
   * pair is what makes that legible rather than looking like a bug.
   *
   * **The ledger itself is deliberately absent.** Who voted for what is a
   * `Map<userId, optionId>` held in the service and never serialised: it is what
   * makes one-vote-per-person enforceable, and it would grow an event frame from
   * a few hundred bytes to megabytes on a busy poll. The tallies above are its
   * only published projection.
   */
  totalVotes: z.number().int().min(0).default(0),
  voters: z.number().int().min(0).default(0),
  /**
   * Smoothed votes per second.
   *
   * Drives the plexus's agitation on both surfaces, so it is computed and
   * smoothed once in the service rather than each renderer estimating its own.
   */
  voteRate: z.number().min(0).default(0),

  /** When voting opened, and when it closes. Null while idle or untimed. */
  openedAt: z.number().nullable().default(null),
  closesAt: z.number().nullable().default(null),
  /**
   * When the poll settled.
   *
   * Carried separately from `result.at` because a poll can settle with *no*
   * result — nobody voted — and the withdrawal schedule has to work for that
   * case too. Also what the winner's stamp animates from, so both surfaces
   * strike it at the same instant.
   */
  resolvedAt: z.number().nullable().default(null),

  cast: CastCommandSchema.nullable().default(null),
  result: ConcordResultSchema.nullable().default(null),
  history: z.array(ConcordResultSchema).default([]),

  /**
   * Incremented on every published change.
   *
   * The overlay rebuilds its ballot only when this changes, so a heartbeat or a
   * reconnect does not rebuild anything mid-poll.
   */
  revision: z.number().int().min(0).default(0)
})
export type ConcordState = z.infer<typeof ConcordStateSchema>

// -------------------------------------------------------------------- inputs

export const ConcordOptionDraftSchema = z.object({
  label: z.string().min(1).max(MAX_OPTION_LABEL)
})
export type ConcordOptionDraft = z.infer<typeof ConcordOptionDraftSchema>

/**
 * A whole ballot at once.
 *
 * Exists because the operator's ballot arrives as a pasted list far more often
 * than as four separate submissions, and adding options one channel call at a
 * time would publish four intermediate states to the broadcast.
 */
export const ConcordBallotSchema = z.object({
  labels: z.array(z.string()).max(MAX_OPTIONS)
})
export type ConcordBallot = z.infer<typeof ConcordBallotSchema>

/**
 * A genuinely sparse patch — only the keys the caller actually sent.
 *
 * `ConcordConfigSchema.partial()` is **not** sufficient, and the rite proved it
 * the expensive way. Every field above carries a `.default()` because the config
 * is persisted, but zod still applies those defaults for absent keys through
 * `.partial()` — so the "patch" arrives carrying every field at its default and
 * the merge resets everything the caller did not mention. It presents as none of
 * the presentation options working: each change silently undoes the one before.
 *
 * Unwrapping each field's default before making it optional is what lets an
 * absent key stay absent. Derived from `ConcordConfigSchema.shape` rather than
 * re-declared, so the two cannot disagree about what a field accepts.
 */
type ConcordConfigPatchShape = {
  [K in keyof ConcordConfig]: z.ZodOptional<z.ZodType<ConcordConfig[K]>>
}

/*
 * `Object.fromEntries` inside `sparseShape` erases key types, so the mapping has
 * to be asserted. The correspondence is guaranteed by the shape coming from
 * `ConcordConfigSchema` itself, and the round-trip is exercised by the
 * verification script rather than taken on trust.
 */
const concordConfigPatchShape = sparseShape(
  ConcordConfigSchema.shape
) as unknown as ConcordConfigPatchShape

export const ConcordConfigPatchSchema = z.object(concordConfigPatchShape)
export type ConcordConfigPatch = z.infer<typeof ConcordConfigPatchSchema>
