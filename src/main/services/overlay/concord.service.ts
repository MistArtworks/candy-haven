import { randomInt, randomUUID } from 'node:crypto'
import type {
  CastCommand,
  ConcordConfigPatch,
  ConcordOption,
  ConcordOptionDraft,
  ConcordResult,
  ConcordState
} from '@shared/domain/concord'
import {
  CAST_DURATION_MS,
  CAST_SETTLE_MS,
  CONCORD_FLUSH_MS,
  CONCORD_HISTORY_LIMIT,
  CONCORD_PERSIST_MS,
  MAX_OPTIONS,
  MAX_VOTERS,
  blendVoteRate,
  clampPollDuration,
  createEmptyConcordState,
  leadingOptions,
  normaliseOptionLabel,
  optionKey,
  optionShare,
  parseVote,
  totalCastDurationMs,
  totalTally,
  voteTokenFor
} from '@shared/domain/concord.constants'
import type { ChatMessage } from '@shared/domain/chat.constants'
import { normaliseChatChannel } from '@shared/domain/chat.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '../archive/archive.service'
import type { SettingsService } from '../settings/settings.service'
import type { TwitchChatService } from '../chat/twitch-chat.service'
import type { OverlayServer } from './overlay-server'
import { ConcordRepository } from './concord.repository'

const logger = getLogger('concord')

interface ConcordEvents {
  state: ConcordState
}

/**
 * THE CONCORD — the chat-voted poll.
 *
 * ### The two rules this service exists to enforce
 *
 * **One vote per person, and the ledger never leaves this process.** Votes are
 * held as `Map<userId, optionId>`, keyed on the platform's immutable id rather
 * than a display name, which is what makes a vote changeable *and* unrepeatable.
 * The ledger is never serialised: it would grow an event frame from a few
 * hundred bytes to megabytes on a busy poll, and the tallies are its only
 * projection anybody outside needs.
 *
 * **A deadlock is settled by chance, decided here, once.** The lot that will be
 * lifted is drawn by a CSPRNG *before* the casting animates and travels to both
 * surfaces inside a `CastCommand`. This is the rite's doctrine and it is the one
 * part of either feature that is correctness rather than presentation — two
 * screens lifting different lots in front of an audience is unrecoverable.
 *
 * ### Why this is not a copy of the rite
 *
 * Every other service in the app is *operator*-paced, or ticks once a second.
 * This one is **audience**-paced: a busy channel delivers votes far faster than
 * anything should be redrawn, and the rite's `commit()` — IPC, SSE and a Mongo
 * write per mutation — would push a frame per vote and thrash both surfaces.
 *
 * So there are two mutation paths. Operator actions `commit()` immediately, as
 * the rite does. Votes only mark the state dirty, and a ticker fans out at
 * `CONCORD_FLUSH_MS`. Counting still happens the instant a message lands, so
 * nothing is lost or reordered — only the fan-out is coalesced.
 */
export class ConcordService extends TypedEmitter<ConcordEvents> {
  private state: ConcordState = createEmptyConcordState()
  private readonly repository: ConcordRepository

  /**
   * Who voted for what. The authority; `option.tally` is a projection of it.
   *
   * Never persisted and never published — see the class comment.
   */
  private readonly ledger = new Map<string, string>()
  /** Live counts, kept beside the ledger so a vote is O(1) rather than a scan. */
  private readonly tallies = new Map<string, number>()

  private releaseChat: (() => void) | null = null
  private detachChat: (() => void) | null = null

  private flushTimer: NodeJS.Timeout | null = null
  private persistTimer: NodeJS.Timeout | null = null
  private closeTimer: NodeJS.Timeout | null = null
  private castTimer: NodeJS.Timeout | null = null

  /** Set by a vote; cleared by the next flush. */
  private dirty = false
  /** Votes counted since the last rate sample, and when that window opened. */
  private windowVotes = 0
  private windowAt = 0
  /** Voters turned away at `MAX_VOTERS`, logged once per poll rather than each. */
  private turnedAway = 0

  constructor(
    archive: ArchiveService,
    /** Shared with the rite and the timers: one server serves every overlay. */
    private readonly server: OverlayServer,
    private readonly chat: TwitchChatService,
    /** Read for the configured channel and the test-mode gate. */
    private readonly settings: SettingsService
  ) {
    super()
    this.repository = new ConcordRepository(archive)
    this.server.registerSnapshot('concord', () => this.state)

    // Attached for the whole life of the service rather than only while a poll
    // is open. The listener is free, and the alternative — attaching on open —
    // races the first messages of a poll against the subscription.
    this.detachChat = this.chat.on('message', (message) => this.onMessage(message))
  }

  get current(): ConcordState {
    return this.state
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Restores a stored poll.
   *
   * A poll that was `open` or `casting` when the app closed is restored
   * **`resolved` with no result** and its tallies intact.
   *
   * Not merely a limitation. The ledger is memory-only, so reopening would let
   * everyone who already voted vote a second time — and declaring a winner from
   * the restored tallies would announce a result the audience never saw settle,
   * which is precisely the fabrication the brief's honest-states rule forbids.
   * The counts are kept because they are a real record; the verdict is left to
   * the operator. Same instinct as the rite refusing to restore mid-spin and the
   * countdowns restoring paused.
   */
  async initialize(): Promise<void> {
    const restored = await this.repository.load()
    if (!restored) return

    const interrupted = restored.phase === 'open' || restored.phase === 'casting'
    this.state = interrupted
      ? {
          ...restored,
          phase: 'resolved',
          openedAt: null,
          closesAt: null,
          resolvedAt: null,
          voteRate: 0,
          cast: null,
          result: null
        }
      : restored

    // The tallies are restored; the ledger deliberately is not.
    this.tallies.clear()
    for (const option of this.state.options) this.tallies.set(option.id, option.tally)

    logger.info(
      `Restored poll with ${this.state.options.length} options` +
        (interrupted ? ' (interrupted; left unresolved)' : '')
    )
  }

  dispose(): void {
    this.stopFlush()
    this.clearTimer('close')
    this.clearTimer('cast')
    this.clearTimer('persist')
    this.releaseChat?.()
    this.releaseChat = null
    this.detachChat?.()
    this.detachChat = null
    this.clear()
  }

  // ------------------------------------------------------------------ ballot

  addOption(draft: ConcordOptionDraft): ConcordState {
    this.assertNotOpen('The ballot is locked while voting is open.')

    const label = normaliseOptionLabel(draft.label)
    if (label.length === 0) {
      throw new AppError('An option needs a label.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (this.state.options.length >= MAX_OPTIONS) {
      throw new AppError(`A ballot holds at most ${MAX_OPTIONS} options.`, {
        code: ErrorCode.Validation,
        hint: 'Every option needs a numeral an audience can type; past ten the poll is unreadable.',
        recoverable: false
      })
    }

    // Duplicates are rejected rather than merged, which is the opposite of the
    // rite's petitions — and deliberately so. Two identical petitions are a
    // signal about popularity that folds into one entry's weight; two identical
    // *options* would split the vote between them while reading as one choice,
    // so the poll would under-report its own leader.
    const key = optionKey(label)
    if (this.state.options.some((option) => optionKey(option.label) === key)) {
      throw new AppError(`"${label}" is already on the ballot.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const option: ConcordOption = {
      id: randomUUID(),
      label,
      token: voteTokenFor(this.state.options.length),
      tally: 0
    }
    this.tallies.set(option.id, 0)

    return this.commit({ options: [...this.state.options, option] })
  }

  removeOption(id: string): ConcordState {
    this.assertNotOpen('The ballot is locked while voting is open.')
    this.tallies.delete(id)
    return this.commit({ options: this.retoken(this.state.options.filter((o) => o.id !== id)) })
  }

  /**
   * Replaces the whole ballot at once.
   *
   * Exists because an operator's ballot arrives as a pasted list far more often
   * than as four separate submissions, and adding options one channel call at a
   * time would publish four intermediate ballots to the broadcast.
   */
  setBallot(labels: readonly string[]): ConcordState {
    this.assertNotOpen('The ballot is locked while voting is open.')

    const seen = new Set<string>()
    const options: ConcordOption[] = []

    for (const raw of labels) {
      const label = normaliseOptionLabel(raw)
      if (label.length === 0) continue
      const key = optionKey(label)
      // Silently skipped rather than rejected: a pasted list with a repeated
      // line should produce the ballot the operator meant, not an error they
      // have to go and find.
      if (seen.has(key)) continue
      seen.add(key)
      if (options.length >= MAX_OPTIONS) break

      options.push({ id: randomUUID(), label, token: voteTokenFor(options.length), tally: 0 })
    }

    this.tallies.clear()
    for (const option of options) this.tallies.set(option.id, 0)

    return this.commit({ options, result: null, cast: null })
  }

  clearBallot(): ConcordState {
    this.assertNotOpen('The ballot is locked while voting is open.')
    this.ledger.clear()
    this.tallies.clear()
    return this.commit({ options: [], result: null, cast: null, totalVotes: 0, voters: 0 })
  }

  updateConfig(patch: ConcordConfigPatch): ConcordState {
    const config = { ...this.state.config, ...patch }
    if (patch.durationMs !== undefined) config.durationMs = clampPollDuration(patch.durationMs)
    return this.commit({ config })
  }

  /**
   * Renumbers a ballot after a removal.
   *
   * Tokens are stored on the option rather than derived from its index, so they
   * have to be rewritten here — but only while voting is shut. A vote already
   * counted holds an option *id*, so renumbering can never re-attribute it.
   */
  private retoken(options: readonly ConcordOption[]): ConcordOption[] {
    return options.map((option, index) => ({ ...option, token: voteTokenFor(index) }))
  }

  // ------------------------------------------------------------------ voting

  /** Whether the operator has explicitly asked for the gates to be lifted. */
  private get testMode(): boolean {
    return this.settings.snapshot.workspace.testMode
  }

  /**
   * Opens voting.
   *
   * **Refuses when no Twitch channel is configured**, unless test mode is on.
   *
   * This began as a warning the operator could click past, and that was the
   * wrong call. A poll with no ingest looks entirely normal — masthead, ballot,
   * countdown, a tally sitting at zero — so by the time the silence is diagnosed
   * the audience has already been asked to vote and has already watched nothing
   * happen. That failure is unrecoverable in the only sense that matters on a
   * broadcast, so it belongs at the gate rather than in a banner.
   *
   * Test mode is the escape hatch, and it is deliberately explicit: driving a
   * poll from the simulator with nothing connected is a legitimate thing to do,
   * but it should be something the operator switched on rather than something
   * they clicked through.
   */
  open(): ConcordState {
    if (this.state.phase === 'open') {
      throw new AppError('Voting is already open.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
    if (this.state.phase === 'casting') {
      throw new AppError('A casting is settling the last poll.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const channel = normaliseChatChannel(this.settings.snapshot.integrations.twitchChannel ?? '')
    if (channel.length === 0 && !this.testMode) {
      throw new AppError('No Twitch channel is configured, so no votes could be counted.', {
        code: ErrorCode.Validation,
        hint: 'Set a channel in REGULATION, or enable test mode there to run a poll without chat.',
        recoverable: false
      })
    }

    // Two, not one: a ballot with a single option is not a question.
    if (this.state.options.length < 2) {
      throw new AppError('A poll needs at least two options.', {
        code: ErrorCode.Validation,
        hint: 'Add another option to the ballot first.',
        recoverable: false
      })
    }

    this.ledger.clear()
    this.turnedAway = 0
    for (const option of this.state.options) this.tallies.set(option.id, 0)

    const now = Date.now()
    const duration = clampPollDuration(this.state.config.durationMs)
    const closesAt = duration > 0 ? now + duration : null

    // Claimed for the length of the poll, so an idle app holds no socket.
    this.releaseChat?.()
    this.releaseChat = this.chat.acquire('concord')

    this.windowVotes = 0
    this.windowAt = now
    this.startFlush()

    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer =
      closesAt === null
        ? null
        : setTimeout(
            () => {
              /*
               * Bookkeeping only. Both surfaces derive the countdown from
               * `closesAt`, so the visible clock never depends on this firing
               * punctually.
               *
               * The phase is re-checked because `close` throws when voting is not
               * open, and an exception thrown from a timer callback has nothing to
               * catch it — it would take the main process down. Reaching this with
               * the poll already closed is a narrow race (a manual close landing in
               * the same tick as the deadline) but the cost of losing it is the
               * whole application, mid-broadcast.
               */
              if (this.state.phase !== 'open') return
              this.close()
            },
            Math.max(closesAt - now, 0)
          )

    logger.info(
      `Poll opened on ${this.state.options.length} options` +
        (closesAt ? ` for ${Math.round(duration / 1000)}s` : ' with no timer')
    )

    return this.commit({
      phase: 'open',
      openedAt: now,
      closesAt,
      resolvedAt: null,
      totalVotes: 0,
      voters: 0,
      voteRate: 0,
      result: null,
      cast: null,
      options: this.materialise()
    })
  }

  /**
   * Closes voting and resolves, casting lots if the chamber is deadlocked.
   */
  close(): ConcordState {
    if (this.state.phase !== 'open') {
      throw new AppError('Voting is not open.', { code: ErrorCode.Validation, recoverable: false })
    }

    this.clearTimer('close')
    this.stopFlush()
    this.releaseChat?.()
    this.releaseChat = null

    const options = this.materialise()
    const leading = leadingOptions(options)

    if (this.turnedAway > 0) {
      logger.warn(`${this.turnedAway} voters were turned away at the ledger bound`)
    }

    // Nobody voted. Reported as such rather than resolved to an arbitrary
    // option — an empty result is honest and a fabricated one is not.
    if (leading.ids.length === 0) {
      logger.info('Poll closed with no votes filed')
      // `resolvedAt` is stamped even with no result: the overlay withdraws on
      // this instant, and an empty poll has to leave the screen like any other.
      return this.commit({
        phase: 'resolved',
        options,
        result: null,
        voteRate: 0,
        resolvedAt: Date.now()
      })
    }

    if (leading.ids.length === 1) {
      const winner = options.find((option) => option.id === leading.ids[0])
      // Built once: `resultFor` stamps `at`, so computing it twice would put two
      // different timestamps on the same result and its history entry.
      const result = winner ? this.resultFor(winner, options, [], false) : null
      logger.info(`Poll closed: "${result?.label ?? '?'}"`)
      return this.commit({
        phase: 'resolved',
        options,
        voteRate: 0,
        result,
        resolvedAt: result?.at ?? Date.now(),
        ...this.pushHistory(result)
      })
    }

    return this.beginCasting(options, leading.ids)
  }

  /**
   * A vote arrives.
   *
   * Runs synchronously per message and touches only two maps, because it is on
   * the hot path — a raid delivers a great many of these — and because a vote
   * must be counted at the instant it was sent rather than at the next flush.
   */
  private onMessage(message: ChatMessage): void {
    if (this.state.phase !== 'open') return

    const optionId = parseVote(message.text, this.state.options, this.state.config)
    if (!optionId) return

    const previous = this.ledger.get(message.userId)
    // The same vote sent twice is not a change. Common — people double-send, and
    // chat clients resend on reconnect.
    if (previous === optionId) return

    if (previous === undefined) {
      if (this.ledger.size >= MAX_VOTERS) {
        this.turnedAway += 1
        return
      }
      this.ledger.set(message.userId, optionId)
      this.bump(optionId, 1)
    } else {
      this.ledger.set(message.userId, optionId)
      this.bump(previous, -1)
      this.bump(optionId, 1)
    }

    this.windowVotes += 1
    this.dirty = true
  }

  private bump(optionId: string, delta: number): void {
    this.tallies.set(optionId, Math.max((this.tallies.get(optionId) ?? 0) + delta, 0))
  }

  /** The published options, with their live tallies folded in. */
  private materialise(): ConcordOption[] {
    return this.state.options.map((option) => ({
      ...option,
      tally: this.tallies.get(option.id) ?? 0
    }))
  }

  // ----------------------------------------------------------------- casting

  /**
   * Draws the lot and arms the casting.
   *
   * `randomInt` from `node:crypto` rather than `Math.random`. `Math.random`
   * would be statistically adequate, but this settles a deadlock in front of an
   * audience and a CSPRNG costs nothing at one call per casting — there is no
   * reason to leave room for the question.
   */
  private beginCasting(options: ConcordOption[], tiedIds: readonly string[]): ConcordState {
    const cast: CastCommand = {
      id: randomUUID(),
      tiedIds: [...tiedIds],
      targetIndex: randomInt(0, tiedIds.length),
      durationMs: CAST_DURATION_MS,
      settleMs: CAST_SETTLE_MS,
      startedAt: Date.now()
    }

    const chosen = options.find((option) => option.id === tiedIds[cast.targetIndex])
    logger.info(
      `Deadlock between ${tiedIds.length} options; casting lots — "${chosen?.label ?? '?'}" drawn (1 in ${tiedIds.length})`
    )

    if (this.castTimer) clearTimeout(this.castTimer)
    this.castTimer = setTimeout(() => this.settleCasting(cast), totalCastDurationMs(cast))

    return this.commit({ phase: 'casting', options, cast, voteRate: 0, result: null })
  }

  /**
   * Records the casting's result once the lot has been lifted.
   *
   * Both surfaces already lift the drawn lot off the command, so this is
   * bookkeeping rather than the reveal — deliberately, so the visible outcome
   * never depends on this timer being punctual.
   */
  private settleCasting(cast: CastCommand): void {
    this.castTimer = null
    if (this.state.cast?.id !== cast.id) return

    const options = this.state.options
    const chosenId = cast.tiedIds[cast.targetIndex]
    const chosen = options.find((option) => option.id === chosenId)
    if (!chosen) {
      this.commit({ phase: 'resolved', result: null, resolvedAt: Date.now() })
      return
    }

    const tiedLabels = cast.tiedIds
      .filter((id) => id !== chosenId)
      .map((id) => options.find((option) => option.id === id)?.label ?? '')
      .filter((label) => label.length > 0)

    const result = this.resultFor(chosen, options, tiedLabels, true)
    this.commit({
      phase: 'resolved',
      result,
      resolvedAt: result.at,
      ...this.pushHistory(result)
    })
    logger.info(`Casting settled: "${chosen.label}"`)
  }

  private resultFor(
    option: ConcordOption,
    options: readonly ConcordOption[],
    tiedWith: readonly string[],
    decidedByCasting: boolean
  ): ConcordResult {
    const total = totalTally(options)
    return {
      optionId: option.id,
      label: option.label,
      tally: option.tally,
      total,
      share: optionShare(option.tally, total),
      // The ledger is still populated at this point — it is cleared on the next
      // open or reset, not on close — so this is the true distinct-voter count.
      voters: this.ledger.size,
      at: Date.now(),
      tiedWith: [...tiedWith],
      decidedByCasting
    }
  }

  private pushHistory(result: ConcordResult | null): Partial<ConcordState> {
    if (!result) return {}
    return { history: [result, ...this.state.history].slice(0, CONCORD_HISTORY_LIMIT) }
  }

  // ------------------------------------------------------------------- reset

  /** Returns to drafting, keeping the ballot and clearing the votes. */
  reset(): ConcordState {
    this.clearTimer('close')
    this.clearTimer('cast')
    this.stopFlush()
    this.releaseChat?.()
    this.releaseChat = null

    this.ledger.clear()
    this.turnedAway = 0
    for (const option of this.state.options) this.tallies.set(option.id, 0)

    return this.commit({
      phase: 'idle',
      options: this.materialise(),
      openedAt: null,
      closesAt: null,
      resolvedAt: null,
      totalVotes: 0,
      voters: 0,
      voteRate: 0,
      cast: null,
      result: null
    })
  }

  clearHistory(): ConcordState {
    return this.commit({ history: [] })
  }

  // ---------------------------------------------------------------- simulator

  /**
   * Injects synthetic votes. **Requires test mode.**
   *
   * A poll cannot be exercised without an audience, and "open the app, start a
   * stream, ask people to vote" is not a development loop. This is how the flush
   * cadence, the bar interpolation, the field's agitation and the casting were
   * tuned, and how one-vote-changeable is verified: `voters` must not move when
   * the same ids vote again.
   *
   * Gated on the persisted setting rather than on `is.dev`, so a packaged console
   * can be rehearsed against before a stream — and so there is one answer to the
   * question of why simulation is unavailable rather than two.
   *
   * Votes are routed through `onMessage` rather than written to the ledger
   * directly, so what is being exercised is the real parser and the real
   * counting path — a simulator that bypassed them would prove nothing.
   */
  simulate(count: number, options: { changeVotes?: boolean } = {}): ConcordState {
    if (!this.testMode) {
      throw new AppError('Vote simulation requires test mode.', {
        code: ErrorCode.PermissionDenied,
        hint: 'Enable test mode in REGULATION.',
        recoverable: false
      })
    }
    if (this.state.phase !== 'open') {
      throw new AppError('Open a poll before simulating votes.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const ballot = this.state.options
    const bounded = Math.min(Math.max(Math.round(count), 1), 5_000)

    // A pool smaller than the vote count makes ids repeat, which is what a
    // changed vote looks like — and the only way to check that `voters` holds
    // steady while the tallies move.
    const pool = options.changeVotes ? Math.max(Math.floor(bounded / 3), 1) : bounded

    for (let index = 0; index < bounded; index += 1) {
      const token = voteTokenFor(randomInt(0, ballot.length))
      this.onMessage({
        platform: 'twitch',
        userId: `sim-${randomInt(0, pool)}`,
        login: 'simulacrum',
        display: 'Simulacrum',
        text: token,
        at: Date.now(),
        badges: []
      })
    }

    // Flushed at once rather than waited for, so a caller in a script sees the
    // result of what it just injected.
    this.flush(true)
    return this.state
  }

  // ---------------------------------------------------------------- plumbing

  private assertNotOpen(message: string): void {
    if (this.state.phase !== 'open' && this.state.phase !== 'casting') return
    throw new AppError(message, { code: ErrorCode.Validation, recoverable: false })
  }

  private startFlush(): void {
    this.stopFlush()
    this.flushTimer = setInterval(() => this.flush(false), CONCORD_FLUSH_MS)
  }

  private stopFlush(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = null
  }

  /**
   * Publishes vote-driven change, at most `CONCORD_FLUSH_MS` apart.
   *
   * Runs on a ticker rather than only when dirty, because the vote rate has to
   * *decay* as well as rise: if it only published on a vote, the field would
   * stay agitated at whatever the last burst was and never settle. Once the rate
   * has reached zero and nothing is dirty the tick returns without publishing,
   * so a quiet poll is silent rather than pushing eight null frames a second.
   */
  private flush(force: boolean): void {
    const now = Date.now()
    const seconds = Math.max((now - this.windowAt) / 1000, 1e-3)
    const sample = this.windowVotes / seconds
    this.windowVotes = 0
    this.windowAt = now

    // `blendVoteRate` clamps the sample and snaps its own floor to zero, so once
    // the field has settled this comparison is exactly false and the tick stops
    // publishing rather than pushing an unchanged frame eight times a second.
    const rate = blendVoteRate(this.state.voteRate, sample)
    const settling = rate !== this.state.voteRate

    if (!force && !this.dirty && !settling) return
    this.dirty = false

    const options = this.materialise()
    this.state = {
      ...this.state,
      options,
      voteRate: rate,
      totalVotes: totalTally(options),
      voters: this.ledger.size
    }

    this.emit('state', this.state)
    this.server.broadcast('concord', this.state)
    this.schedulePersist()
  }

  /**
   * Persistence, well off the flush path.
   *
   * Debounced rather than written per flush: eight archive writes a second for
   * the length of a poll would be the most expensive thing this feature does, in
   * exchange for surviving a crash with a marginally fresher tally. Phase
   * changes go through `commit`, which persists immediately, so the moments that
   * matter are never merely debounced.
   */
  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.repository.save(this.state)
    }, CONCORD_PERSIST_MS)
  }

  /**
   * Applies an operator-driven change, then fans it out immediately.
   *
   * One path for every deliberate mutation, so the IPC broadcast, the browser
   * sources and the persisted copy cannot get out of step. `revision` is bumped
   * here and *not* in `flush`, which is what keeps it meaningful: it counts
   * structural changes — the ballot, the config, the phase — so a consumer can
   * use it to decide whether to rebuild rather than seeing it tick eight times a
   * second while only tallies move.
   */
  private commit(partial: Partial<ConcordState>): ConcordState {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }

    this.emit('state', this.state)
    this.server.broadcast('concord', this.state)

    // Persistence is best-effort by design: the archive may not be connected,
    // and a stream is not the moment to fail an action because a write to Mongo
    // did not land. The in-memory state stays authoritative.
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    void this.repository.save(this.state)

    return this.state
  }

  private clearTimer(which: 'close' | 'cast' | 'persist'): void {
    if (which === 'close') {
      if (this.closeTimer) clearTimeout(this.closeTimer)
      this.closeTimer = null
    } else if (which === 'cast') {
      if (this.castTimer) clearTimeout(this.castTimer)
      this.castTimer = null
    } else {
      if (this.persistTimer) clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
  }
}
