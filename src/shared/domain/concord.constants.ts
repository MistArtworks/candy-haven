import type { CastCommand, ConcordConfig, ConcordOption, ConcordState } from './concord'
import { clamp01, settleEase } from './rite.constants'

/**
 * Zod-free half of THE CONCORD — see boot.constants.ts for why the split exists.
 *
 * Two kinds of arithmetic live here, for two different reasons:
 *
 *  - **Vote parsing.** Pure, because it decides what counts as a vote in front
 *    of an audience and therefore has to be exercisable against a table of
 *    awkward messages rather than only against live chat.
 *  - **Playback.** `concordFrameAt` and `castFrameAt` are the position-at-time
 *    functions the console and the browser source both drive themselves from,
 *    exactly as `spinFrameAt` serves the ring. If each surface eased its own
 *    way, the two would lift different lots at different moments.
 *
 * The overlay presentation vocabulary — themes, the edge reserve — is imported
 * from rite.constants rather than restated. It is generic overlay language that
 * simply landed there first, and a theme added to one list and not the other
 * would be a silent inconsistency between two overlays in the same catalogue.
 */

export {
  MAX_EDGE_RESERVE,
  OVERLAY_REFERENCE_WIDTH,
  OVERLAY_THEMES,
  OVERLAY_THEME_LABEL
} from './rite.constants'
export type { OverlayTheme } from './rite.constants'

// -------------------------------------------------------------------- limits

/**
 * Most options a poll may carry.
 *
 * Bounded by chat, not by the canvas. Every option needs a numeral a viewer can
 * type, and a poll with more than ten of them is neither readable on a
 * broadcast nor votable without scrolling back to find the list.
 */
export const MAX_OPTIONS = 10
export const MAX_OPTION_LABEL = 48

/** Masthead and question bounds, matching the rite's. */
export const MAX_CONCORD_TITLE = 64
export const MAX_CONCORD_PROMPT = 96

/** Longest vote command the operator may set, e.g. `!vote`. */
export const MAX_VOTE_COMMAND = 16

/**
 * Hard bound on the vote ledger.
 *
 * The ledger is one entry per distinct voter and it is what makes a changeable
 * vote possible, so it cannot be trimmed by age without letting an early voter
 * vote again. Bounding it instead: past this, new voters are turned away and the
 * poll says so. A raid is an ordinary thing to happen to a poll, and unbounded
 * growth in the main process is not an acceptable response to one.
 */
export const MAX_VOTERS = 50_000

/** Rolling record of settled polls carried on the state. */
export const CONCORD_HISTORY_LIMIT = 24

// ------------------------------------------------------------------ cadence

/**
 * How often vote-driven state is fanned out to the console and the broadcast.
 *
 * The one number in this feature that has no precedent elsewhere in the app.
 * Every other service is operator-paced or ticks once a second; a poll is
 * *audience*-paced, and a busy channel delivers votes far faster than anything
 * should be redrawn. 125ms is eight frames a second — beneath the threshold
 * where a tally reads as laggy, and two orders of magnitude below the message
 * rate it is absorbing.
 *
 * Votes are still counted the instant they arrive. This throttles the fan-out
 * only, which is why no vote is lost or reordered by it.
 */
export const CONCORD_FLUSH_MS = 125

/**
 * Persistence interval while a poll is open.
 *
 * Deliberately far slower than the flush, and off that path entirely. Writing
 * the archive eight times a second for the length of a poll would be the most
 * expensive thing this feature does, in exchange for surviving a crash with a
 * slightly fresher tally.
 */
export const CONCORD_PERSIST_MS = 2_000

/**
 * How fast a drawn bar chases its true tally, as a fraction closed per frame at
 * 60fps.
 *
 * Shared so both surfaces converge identically. It exists because the tally
 * arrives in coalesced steps: snapping to each flush would read as eight
 * stutters a second, whereas chasing the target turns the same data into
 * continuous motion.
 */
export const TALLY_SMOOTHING = 0.12

/**
 * Smoothing applied to the vote-rate estimate, per flush, in each direction.
 *
 * Asymmetric on purpose, and this was measured rather than guessed. A field that
 * is still churning seconds after chat has gone quiet reads as broken; a field
 * that takes a moment to catch up with a surge reads as inertia. So the two
 * directions genuinely want different constants — the fall is the one a viewer
 * notices being wrong.
 *
 * At `CONCORD_FLUSH_MS`, a fall of 0.55 leaves the estimate at 0.45× per tick,
 * which carries the ceiling below the cutoff in about 1.2 seconds.
 */
export const VOTE_RATE_RISE = 0.35
export const VOTE_RATE_FALL = 0.55

/**
 * Largest rate the estimate will carry.
 *
 * Necessary, not defensive. A burst of several hundred votes can land inside a
 * single 125ms flush window, which as a naive votes-per-second figure is a rate
 * in the thousands — a number that carries no more information than the ceiling
 * does, since the field saturates at `VOTE_RATE_FULL`, and that then takes
 * *seconds* to decay back through. Clamping the sample bounds the decay as well
 * as the value.
 */
export const VOTE_RATE_CEILING = 18

/** Below this the estimate is snapped to zero, so the field truly settles. */
export const VOTE_RATE_FLOOR = 0.01

/**
 * Vote rate, in votes per second, that reads as maximum agitation in the field.
 *
 * Not a hard ceiling — the plexus response is clamped, not the measurement. Set
 * where a busy but ordinary poll sits, so the field is expressive at the rates
 * that actually occur rather than saving all its range for a raid.
 */
export const VOTE_RATE_FULL = 12

// ------------------------------------------------------------------- duration

export const POLL_DURATION_MIN_MS = 10_000
/** An hour. Past this it is a standing docket, not a poll. */
export const POLL_DURATION_MAX_MS = 60 * 60 * 1_000
export const DEFAULT_POLL_DURATION_MS = 60_000

/**
 * Durations the console offers as one-tap presets, in seconds.
 *
 * `0` is first and it is not a duration — it is "open until I close it", which
 * is the right default for a poll the operator wants to talk over rather than
 * race.
 */
export const POLL_QUICK_SET = [0, 30, 60, 120, 300] as const

/** Remaining time at which the console plays its final-call cue. */
export const CONCORD_FINAL_CALL_MS = 10_000

// ---------------------------------------------------------------- appearance

/** How long a ballot takes to arrive. Opening a poll is news; it is quick. */
export const REVEAL_MS = 420

/**
 * How long a settled result holds before the chamber returns to rest.
 *
 * Operator-settable because it depends entirely on what they do next — a poll
 * they immediately talk through wants a long linger, one that gates a scene
 * change wants a short one.
 */
export const RESULT_LINGER_MIN_MS = 2_000
export const RESULT_LINGER_MAX_MS = 120_000
export const DEFAULT_RESULT_LINGER_MS = 12_000
/** Durations the console offers as one-tap presets, in seconds. */
export const RESULT_LINGER_QUICK_SET = [5, 12, 30, 60] as const

export function clampResultLinger(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_RESULT_LINGER_MS
  return Math.min(Math.max(Math.round(ms), RESULT_LINGER_MIN_MS), RESULT_LINGER_MAX_MS)
}

/**
 * Whether the chamber is at rest — no question currently before it.
 *
 * True while idle, and true again once a settled result has held for its
 * linger. Derived from the state and the clock rather than pushed, which is the
 * rule every timed thing here follows: a browser source that OBS rebuilds after
 * a poll has expired resolves to the resting composition on its first frame
 * instead of flashing a stale tally.
 *
 * `resolvedAt` is used rather than `result.at` because a poll can settle with no
 * result — nobody voted — and that case has to return to rest on the same
 * schedule instead of hanging on screen forever.
 */
export function concordAtRest(state: ConcordState, now: number): boolean {
  if (state.phase === 'idle') return true
  if (state.phase !== 'resolved') return false
  if (state.resolvedAt === null) return false

  return now - state.resolvedAt > clampResultLinger(state.config.resultLingerMs)
}

/**
 * The state as the overlay should draw it while at rest.
 *
 * The ballot is cleared rather than left standing: a resolved poll's options
 * with their final bars is a *result*, and once the result has had its linger
 * the scene should read as "nothing is being decided", not as a tally nobody
 * has cleared. Everything the composition is built from otherwise — the
 * masthead, the theme, the reserve — comes from the config and survives.
 *
 * A projection for drawing only. Nothing writes this back: the service still
 * holds the resolved poll, so the result stays in the record and in the
 * console.
 */
export function concordRestingProjection(state: ConcordState): ConcordState {
  return {
    ...state,
    phase: 'idle',
    options: [],
    totalVotes: 0,
    voters: 0,
    voteRate: 0,
    openedAt: null,
    closesAt: null,
    resolvedAt: null,
    cast: null,
    result: null
  }
}

/**
 * How strongly the composition is painted, 0..1.
 *
 * Only the reveal ramp remains. There is no conceal ramp and no hidden state:
 * THE CONCORD is present in its scene at all times, and what changes when a
 * question is put is what it *shows*, not whether it is there. The ramp still
 * earns its place — a source rebuilt mid-poll fades its ballot in rather than
 * snapping it on.
 */
export function concordRevealAt(state: ConcordState, now: number): number {
  if (state.phase !== 'open' && state.phase !== 'casting') return 1
  if (state.openedAt === null) return 1

  return clamp01((now - state.openedAt) / REVEAL_MS)
}

export function clampPollDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_POLL_DURATION_MS
  const rounded = Math.round(ms)
  // Zero is meaningful and must survive the clamp: it means no timer at all.
  if (rounded <= 0) return 0
  return Math.min(Math.max(rounded, POLL_DURATION_MIN_MS), POLL_DURATION_MAX_MS)
}

// -------------------------------------------------------------- presentations

/**
 * The two ways a tally is presented.
 *
 * Two, not four. The rite shipped with four mechanisms and two of them were
 * retired for carrying no tension worth watching, so this errs the other way:
 * both of these have a reason to exist, and a third is a `case` plus a draw
 * method whenever one earns its place.
 */
export const CONCORD_PRESENTATIONS = ['tally', 'council'] as const
export type ConcordPresentation = (typeof CONCORD_PRESENTATIONS)[number]

export const CONCORD_PRESENTATION_LABEL: Record<ConcordPresentation, string> = {
  tally: 'THE TALLY — engraved slabs, each filling as votes are filed',
  council: 'THE COUNCIL — seats taken around a ring, one mote per citizen'
}

// ------------------------------------------------------------------- layouts

/**
 * How much of the scene the poll occupies.
 *
 * A separate axis from `presentation`, which is *how the tally is drawn*. This
 * is *how much room it takes*, and the two compose: a council ring can occupy a
 * scene or sit in a corner plate.
 *
 * `widget` is not the full layout scaled down. It drops the plexus, the eyebrow
 * and the vast field the brief calls for, and gains a bordered plate — because
 * those rules are about composing a *scene*, and a corner widget is furniture
 * over someone else's content. A shrunken scene reads as a mistake; a plate
 * reads as an instrument bolted to the frame.
 *
 * **Not a config field.** Layout belongs to the browser *source*, not to the
 * poll: the operator wants a full scene for the audience and a corner widget on
 * their working scene *from the same poll*, and one setting cannot say two
 * things. So each address in the overlay registry pins its own — see
 * `OverlayAddress` — and the console's preview toggle is local UI state rather
 * than something persisted.
 */
export const CONCORD_LAYOUTS = ['full', 'widget'] as const
export type ConcordLayout = (typeof CONCORD_LAYOUTS)[number]

export const CONCORD_LAYOUT_LABEL: Record<ConcordLayout, string> = {
  full: 'FULL — the poll occupies the scene',
  widget: 'WIDGET — a compact plate for a corner'
}

/** Rows past this many are dropped from the widget rather than crushed. */
export const WIDGET_MAX_ROWS = 6

// ------------------------------------------------------------- vote detection

/**
 * How a message is recognised as a vote.
 *
 * A real tradeoff rather than a preference. `bare` — typing just the numeral —
 * gets several times the turnout of a command, because most of an audience will
 * not learn a syntax. It also collides with ordinary conversation, which is why
 * the parser below refuses ambiguous messages instead of guessing.
 */
export const VOTE_SYNTAXES = ['prefix', 'bare', 'both'] as const
export type VoteSyntax = (typeof VOTE_SYNTAXES)[number]

export const VOTE_SYNTAX_LABEL: Record<VoteSyntax, string> = {
  prefix: 'COMMANDED — only the command form counts',
  bare: 'BARE NUMERAL — only a lone numeral counts',
  both: 'EITHER — the command or a bare numeral'
}

export const DEFAULT_VOTE_COMMAND = '!vote'

/** The numeral a viewer types for the option at `index`. */
export function voteTokenFor(index: number): string {
  return String(index + 1)
}

/**
 * Normalises an operator-supplied command to its bare word, without the `!`.
 *
 * They will type it both ways, and the parser needs the word alone so it can
 * accept `!vote 3`, `!vote3` and `!3` from one rule.
 */
export function normaliseVoteCommand(command: string): string {
  return command
    .trim()
    .toLowerCase()
    .replace(/^!+/, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_VOTE_COMMAND)
}

/** The command as it should be displayed and instructed, with its `!`. */
export function displayVoteCommand(command: string): string {
  const word = normaliseVoteCommand(command)
  return word.length > 0 ? `!${word}` : DEFAULT_VOTE_COMMAND
}

/**
 * Resolves a chat message to the option it votes for, or null.
 *
 * Returns the option **id** rather than an index, so a vote cannot survive the
 * roster being reordered and land on someone else.
 *
 * ### The two rules that stop it miscounting
 *
 * **Ambiguity is discarded, never guessed.** A message naming two different
 * valid numerals is not a vote for the first one — "is it 1 or 2?" is a question,
 * and counting it would put a phantom vote on every poll where chat discusses
 * the options. Only a message resolving to exactly one option counts.
 *
 * **Another bot's command is not a vote.** A message that opens with `!` but
 * does not carry *this* poll's command is rejected outright rather than falling
 * back to a bare reading. Channels run gambling, queue and sound-alert bots, and
 * `!bet 2` must not become a vote for option 2.
 */
export function parseVote(
  text: string,
  options: readonly ConcordOption[],
  config: Pick<ConcordConfig, 'voteSyntax' | 'command'>
): string | null {
  if (options.length === 0) return null

  const raw = text.trim().toLowerCase()
  if (raw.length === 0) return null

  const command = normaliseVoteCommand(config.command)
  const commanded = raw.startsWith('!')

  // Strip the leading command so `!vote3`, `!vote 3` and `!3` all reduce to the
  // same body. `commandForm` records whether the `!` belonged to this poll.
  let body = raw
  let commandForm = false
  if (commanded) {
    body = raw.slice(1)
    if (command.length > 0 && body.startsWith(command)) {
      body = body.slice(command.length)
      commandForm = true
    } else if (/^\d/.test(body)) {
      // `!3` — the bang with no word is unambiguous enough to honour.
      commandForm = true
    }
  }

  switch (config.voteSyntax) {
    case 'prefix':
      if (!commandForm) return null
      break
    case 'bare':
      if (commanded) return null
      break
    case 'both':
      // Uncommanded messages are read bare; commanded ones must be ours.
      if (commanded && !commandForm) return null
      break
  }

  const tokens = new Map(options.map((option, index) => [voteTokenFor(index), option.id]))

  // Every run of digits in the body, deduplicated. Runs rather than single
  // characters so `10` is one token and not a vote for 1 and a vote for 0, and
  // so `33` fails to match instead of counting as 3.
  const seen = new Set<string>()
  for (const run of body.match(/\d+/g) ?? []) {
    if (tokens.has(run)) seen.add(run)
  }

  if (seen.size !== 1) return null
  return tokens.get([...seen][0]) ?? null
}

/** The instruction the overlay prints so an audience knows how to vote. */
export function voteInstruction(config: Pick<ConcordConfig, 'voteSyntax' | 'command'>): string {
  switch (config.voteSyntax) {
    case 'prefix':
      return `FILE YOUR VOTE — TYPE ${displayVoteCommand(config.command)} AND THE NUMERAL`
    case 'bare':
      return 'FILE YOUR VOTE — TYPE THE NUMERAL IN CHAT'
    case 'both':
      return `FILE YOUR VOTE — TYPE THE NUMERAL, OR ${displayVoteCommand(config.command)} AND THE NUMERAL`
  }
}

// ---------------------------------------------------------------------- odds

export function totalTally(options: readonly ConcordOption[]): number {
  return options.reduce((sum, option) => sum + Math.max(option.tally, 0), 0)
}

/** An option's share of the vote, 0..1. Zero total reads as zero, not NaN. */
export function optionShare(tally: number, total: number): number {
  if (total <= 0) return 0
  return clamp01(Math.max(tally, 0) / total)
}

/**
 * The options currently in front, as a set.
 *
 * Returns every option holding the top tally rather than picking one, because a
 * tie is a real outcome that has to be reported as one. Collapsing it here — by
 * returning the first, or the lowest index — is exactly the fabrication the
 * brief's "honest states over fabricated values" rule forbids, and it would hide
 * the deadlock that THE CASTING exists to settle.
 *
 * An empty roster, or one where nobody has voted, leads with nothing.
 */
export function leadingOptions(options: readonly ConcordOption[]): {
  ids: readonly string[]
  tally: number
} {
  let best = 0
  const ids: string[] = []

  for (const option of options) {
    const tally = Math.max(option.tally, 0)
    if (tally <= 0) continue
    if (tally > best) {
      best = tally
      ids.length = 0
      ids.push(option.id)
    } else if (tally === best) {
      ids.push(option.id)
    }
  }

  return { ids, tally: best }
}

/** Whether closing now would deadlock and require a casting. */
export function isDeadlocked(options: readonly ConcordOption[]): boolean {
  return leadingOptions(options).ids.length > 1
}

// ------------------------------------------------------------------ playback

export interface ConcordFrame {
  /** Milliseconds of voting left. Zero when untimed or already closed. */
  remainingMs: number
  /** Fraction of the voting window elapsed, 0..1. Zero when untimed. */
  progress: number
  /** Whether a timer is running at all. */
  timed: boolean
  /** Inside the final-call window, for the urgent treatment. */
  finalCall: boolean
  /** Seconds shown, rounded up so the last second is displayed for its whole duration. */
  seconds: number
}

/**
 * The voting window at `now`, derived rather than pushed.
 *
 * Nothing ticks over IPC or the event stream. The state carries `closesAt` and
 * each surface derives the rest at its own frame rate — the countdowns' rule,
 * for the countdowns' reason: a once-a-second push arrives jittery and puts the
 * console and the broadcast a variable fraction of a second apart.
 */
export function concordFrameAt(state: ConcordState, now: number): ConcordFrame {
  const untimed = { remainingMs: 0, progress: 0, timed: false, finalCall: false, seconds: 0 }
  if (state.phase !== 'open' || state.closesAt === null || state.openedAt === null) return untimed

  const window = state.closesAt - state.openedAt
  if (window <= 0) return untimed

  const remainingMs = Math.max(state.closesAt - now, 0)

  return {
    remainingMs,
    progress: clamp01((now - state.openedAt) / window),
    timed: true,
    finalCall: remainingMs > 0 && remainingMs <= CONCORD_FINAL_CALL_MS,
    seconds: Math.ceil(remainingMs / 1000)
  }
}

// ------------------------------------------------------------------- casting

/** How long the lots tumble before one is lifted. */
export const CAST_DURATION_MS = 4_200
/** The lift and the reveal. */
export const CAST_SETTLE_MS = 1_600

/** Fraction of the tumble spent winding up to full agitation. */
const CAST_WIND_UP = 0.28

export interface CastFrame {
  /** Fraction of the whole casting elapsed, for the progress readout. */
  progress: number
  /** How violently the lots are moving, 0..1. Drives the field's agitation. */
  tumble: number
  /** How far the chosen lot has been lifted clear, 0..1. */
  lift: number
  /** True once the lot is fully lifted and the result may be read. */
  settled: boolean
}

/**
 * Where the casting is at `now`.
 *
 * The same contract `spinFrameAt` provides, for the same reason: both surfaces
 * call this with `Date.now()` and get the same answer, so a browser source that
 * attaches mid-casting picks it up at the correct offset instead of starting
 * over — and, critically, lifts the same lot at the same instant as the console.
 */
export function castFrameAt(cast: CastCommand, now: number): CastFrame {
  const elapsed = now - cast.startedAt
  const total = cast.durationMs + cast.settleMs

  if (elapsed <= 0) return { progress: 0, tumble: 0, lift: 0, settled: false }

  if (elapsed < cast.durationMs) {
    const u = elapsed / cast.durationMs
    return {
      progress: elapsed / total,
      tumble: clamp01(u / CAST_WIND_UP),
      lift: 0,
      settled: false
    }
  }

  if (elapsed < total) {
    const eased = settleEase((elapsed - cast.durationMs) / cast.settleMs)
    return {
      progress: elapsed / total,
      // The field stills as the lot rises: the two are the same gesture.
      tumble: 1 - eased,
      lift: eased,
      settled: false
    }
  }

  return { progress: 1, tumble: 0, lift: 1, settled: true }
}

export function totalCastDurationMs(cast: CastCommand): number {
  return cast.durationMs + cast.settleMs
}

/**
 * A lot's position in the vessel, in unit coordinates about the origin.
 *
 * Solved from the clock rather than simulated, unlike the descent's motes. A
 * casting has to be *fair-looking* rather than physical, and a closed-form orbit
 * is both cheaper and exactly reproducible on two surfaces without baking
 * anything. Each lot gets an irrational-ratio orbit seeded off its index, so the
 * group never falls into a visible rotating formation the way equal rates would.
 *
 * The chosen lot's radius collapses toward the axis as `lift` rises, which is
 * what carries it out of the group and into the light.
 */
export function lotPosition(
  index: number,
  count: number,
  elapsedMs: number,
  frame: CastFrame,
  chosen: boolean
): { x: number; y: number; z: number } {
  const t = elapsedMs / 1000
  const span = Math.max(count, 1)

  // Golden-ratio offsets: no two lots share a period, so the orbit never
  // resolves into a formation.
  const phase = (index / span) * Math.PI * 2
  const rate = 0.55 + ((index * 0.61803398875) % 1) * 0.9
  const wobble = 0.8 + ((index * 0.38196601125) % 1) * 0.7

  const agitation = 0.35 + frame.tumble * 0.65
  const radius = (chosen ? 1 - frame.lift : 1) * (0.34 + 0.16 * Math.sin(t * wobble + phase))

  const angle = phase + t * rate * Math.PI * 2 * agitation

  return {
    x: Math.cos(angle) * radius,
    // The chosen lot rises; the rest sink slightly as they are set aside.
    y: chosen
      ? -frame.lift * 0.55 + Math.sin(t * wobble * 1.6 + phase) * 0.12 * (1 - frame.lift)
      : Math.sin(t * wobble * 1.6 + phase) * 0.16 + frame.lift * 0.18,
    z: Math.sin(angle) * radius
  }
}

// --------------------------------------------------------------------- labels

/**
 * Normalises an option label for duplicate detection.
 *
 * The same treatment petitions get, and needed for the same reason: an operator
 * pasting a list will paste it twice, and two identical options split the vote
 * between them while reading as one choice.
 */
export function normaliseOptionLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, MAX_OPTION_LABEL)
}

export function optionKey(label: string): string {
  return normaliseOptionLabel(label).toLowerCase()
}

// ------------------------------------------------------------------ estimates

/**
 * Folds a fresh votes-per-second reading into the running estimate.
 *
 * Smoothed in the service rather than in each renderer, so the console and the
 * broadcast agitate the field by the same amount. An unsmoothed rate computed
 * per flush swings between zero and a spike eight times a second, which reads as
 * the field flickering rather than responding.
 *
 * The sample is clamped before it is blended, and the blend is asymmetric — see
 * `VOTE_RATE_CEILING` and `VOTE_RATE_FALL` for why both of those are load
 * bearing rather than tidying.
 */
export function blendVoteRate(previous: number, sample: number): number {
  const clamped = Math.min(Math.max(sample, 0), VOTE_RATE_CEILING)
  const rate =
    previous + (clamped - previous) * (clamped >= previous ? VOTE_RATE_RISE : VOTE_RATE_FALL)
  return rate < VOTE_RATE_FLOOR ? 0 : rate
}

/** The field agitation a vote rate implies, 0..1. */
export function agitationFor(voteRate: number): number {
  return clamp01(voteRate / VOTE_RATE_FULL)
}

// ------------------------------------------------------------------ factories

export function createDefaultConcordConfig(): ConcordConfig {
  return {
    title: 'THE CONCORD',
    prompt: 'THE CHAMBER WILL DECIDE',
    presentation: 'tally',
    resultLingerMs: DEFAULT_RESULT_LINGER_MS,
    durationMs: DEFAULT_POLL_DURATION_MS,
    voteSyntax: 'both',
    command: DEFAULT_VOTE_COMMAND,
    transparent: false,
    theme: 'obsidian',
    reserveRight: 0.2,
    showMasthead: true,
    showField: true,
    showTokens: true,
    showPercentages: true,
    showVoterCount: true,
    showInstruction: true,
    showStatus: true,
    sound: true
  }
}

export function createEmptyConcordState(): ConcordState {
  return {
    phase: 'idle',
    options: [],
    config: createDefaultConcordConfig(),
    totalVotes: 0,
    voters: 0,
    voteRate: 0,
    openedAt: null,
    closesAt: null,
    resolvedAt: null,
    cast: null,
    result: null,
    history: [],
    revision: 0
  }
}
