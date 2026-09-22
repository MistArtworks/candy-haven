import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import type { ChatConnectionState, ChatStatus } from '@shared/domain/chat'
import type { ConcordState } from '@shared/domain/concord'
import {
  MAX_CONCORD_PROMPT,
  MAX_CONCORD_TITLE,
  MAX_OPTION_LABEL,
  MAX_OPTIONS,
  POLL_DURATION_MAX_MS,
  VOTE_SYNTAXES,
  VOTE_SYNTAX_LABEL,
  createEmptyConcordState,
  isDeadlocked
} from '@shared/domain/concord.constants'
import type { MusterState } from '@shared/domain/muster'
import {
  // Three domains export a `DURATION_MAX_MS`; each is a different instrument's
  // ceiling, so the alias is the import doing what the call site needs to say.
  DURATION_MAX_MS as MUSTER_DURATION_MAX_MS,
  MAX_ENTRY_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_TITLE_LENGTH,
  createEmptyMusterState,
  remainingAt as musterRemainingAt
} from '@shared/domain/muster.constants'
import type { NowPlayingState } from '@shared/domain/nowplaying'
import { createNowPlayingState } from '@shared/domain/nowplaying.constants'
import type { OverlayId } from '@shared/domain/overlays'
import type { OverlayServerInfo, RiteState } from '@shared/domain/rite'
import {
  MAX_PETITION_LABEL,
  MAX_PETITIONS,
  MAX_RITE_PROMPT,
  MAX_RITE_TITLE,
  RITE_MECHANISMS,
  RITE_MECHANISM_LABEL,
  SPIN_DURATION_MAX_MS,
  SPIN_DURATION_MIN_MS,
  createEmptyRiteState
} from '@shared/domain/rite.constants'
import type { Settings } from '@shared/domain/settings'
import type { TimerFrame, TimerId, TimerSet, TimerState } from '@shared/domain/timer'
import {
  GRACE_MAX_MS,
  MAX_TERMINAL_WORD,
  MAX_TIMER_LABEL,
  TIMER_KIND,
  TIMER_MAX_MS,
  TIMER_MIN_MS,
  createTimerState,
  formatClock,
  formatDurationLabel,
  timerFrameAt
} from '@shared/domain/timer.constants'
import type { StatusTone } from '@renderer/components/primitives/StatusDot'
import { useChatStatus, useConcordState } from '@renderer/hooks/useConcord'
import { useMusterState } from '@renderer/hooks/useMuster'
import { useNowPlaying } from '@renderer/hooks/useNowPlaying'
import { useOverlayInfo, useRiteState } from '@renderer/hooks/useRite'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTimerFrame, useTimerSet } from '@renderer/hooks/useTimers'

/**
 * The whole broadcast kit's live state, gathered once.
 *
 * The catalogue used to read a single overlay — the rite — and label every
 * other card `Commissioned`, which was honest when one overlay existed and
 * became a page of placeholders once nine did. A dashboard whose whole purpose
 * is to answer "what is happening right now" has to actually subscribe to all
 * of it, so this is the one place that does.
 *
 * ## What mounting this costs
 *
 * Two of these subscriptions are not free, and both are deliberate.
 *
 * `useNowPlaying` is reference-counted in the main process: subscribing starts
 * the Spotify poll. The dashboard therefore polls while it is open and stops
 * when the operator leaves, exactly as NOW TRANSMITTING's own page does. That
 * is the right trade for a surface that reports whether a track is on air.
 *
 * `useChatStatus` claims the chat socket for as long as it is mounted. Its own
 * note gives the reason and it applies here with more force than anywhere:
 * discovering the channel name was wrong *after* asking an audience to vote is
 * not recoverable, and the dashboard is where an operator looks before they
 * start. Both claims are released on unmount, so an idle console holds neither.
 */
export interface OverlayDeck {
  server: OverlayServerInfo
  chat: ChatStatus
  rite: RiteState
  concord: ConcordState
  muster: MusterState
  timers: TimerSet
  frames: Record<TimerId, TimerFrame>
  nowPlaying: NowPlayingState
  settings: Settings | null
  /** True when a call or a poll could be run — a channel, or test mode. */
  chatReady: boolean
}

/**
 * A wall clock that ticks only while something is counting down.
 *
 * The timer frames carry their own clock, so this exists for the two
 * countdowns that are *not* timers: a muster's call window and a concord's
 * poll window, both of which are a `closesAt` and nothing else. Held in state
 * and written only from the interval, so render stays pure — the same shape
 * `useTimerFrame` and `usePlaybackClock` already use.
 */
function useCountdownClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    /*
     * Seeded on a macrotask rather than in the body of this effect.
     *
     * It has to be seeded at all, which is where this differs from
     * `useTimerFrame` and `usePlaybackClock`. Both of those start at zero and
     * document it as safe, because their arithmetic clamps a clock that is
     * behind the sample to "no time consumed yet". This one subtracts from a
     * `closesAt`, so a stale clock does not read as zero — it reads as however
     * long the page has been open, in extra minutes, on the first frame a
     * countdown appears.
     *
     * But a synchronous setState in the body of an effect cascades a second
     * render before paint, so the seed goes through the task queue. The window
     * it leaves is one task, not one tick.
     */
    const seed = setTimeout(() => setNow(Date.now()), 0)
    const handle = setInterval(() => setNow(Date.now()), 500)

    return () => {
      clearTimeout(seed)
      clearInterval(handle)
    }
  }, [active])

  return now
}

export function useOverlayDeck(): OverlayDeck {
  const server = useOverlayInfo()
  const chat = useChatStatus()
  const rite = useRiteState()
  const concord = useConcordState()
  const muster = useMusterState()
  const timers = useTimerSet()
  const nowPlaying = useNowPlaying()
  const settings = useSettings()

  /*
   * Both frames, unconditionally.
   *
   * `useTimerFrame` is a hook, so it cannot be mapped over `TIMER_IDS` — and
   * it should not be. There are exactly two countdowns, the set is closed by
   * `TIMER_IDS`, and naming them here is what keeps the hook count fixed.
   */
  const interval = timers.interval ?? createTimerState('interval')
  const convene = timers.convene ?? createTimerState('convene')
  const intervalFrame = useTimerFrame(interval)
  const conveneFrame = useTimerFrame(convene)

  const channel = (settings?.integrations.twitchChannel ?? '').trim()
  const testMode = settings?.workspace.testMode ?? false

  return useMemo(
    () => ({
      server,
      chat,
      rite,
      concord,
      muster,
      timers,
      frames: { interval: intervalFrame, convene: conveneFrame },
      nowPlaying,
      settings,
      chatReady: channel.length > 0 || testMode
    }),
    [
      server,
      chat,
      rite,
      concord,
      muster,
      timers,
      intervalFrame,
      conveneFrame,
      nowPlaying,
      settings,
      channel,
      testMode
    ]
  )
}

/**
 * A deck carrying **one** overlay's live state, for that overlay's own page.
 *
 * ## Why this exists
 *
 * `OverlayBench` is drawn in two places — the desk, and slot 02 of every
 * overlay's console page — and it reads its verbs, fields and dials from
 * `actionsFor` / `composerFor` / `dialsFor`, which take an `OverlayDeck`. The
 * desk has one, because gathering the whole kit is its job. An overlay page
 * must not: `useOverlayDeck` claims the chat socket and **starts the Spotify
 * poll**, and THE ENCLOSURE's console has no business doing either.
 *
 * So a page supplies the slice it already subscribes to, and this fills the
 * rest from the same empty-state factories the hooks themselves start from.
 *
 * ## The invariant, which is load-bearing
 *
 * **Every case in `statusFor`, `actionsFor`, `composerFor` and `dialsFor` reads
 * only the slice named by its own `id`, plus `chatReady`.** Check any of them:
 * the muster cases touch `deck.muster`, the timer cases touch `deck.timers` and
 * `deck.frames`, and none reaches across. That is what makes filling the others
 * with defaults safe rather than a trap.
 *
 * If a case ever genuinely needs a second overlay's state — a verb on THE
 * MUSTER that depends on whether the chamber is sitting, say — it must take it
 * as an explicit argument rather than reaching into the deck. Otherwise this
 * hands it a default, and the overlay's page silently disagrees with the desk
 * about whether a control is available. `owner` is checked below so that at
 * least the page's *own* slice can never be the one that is missing.
 */
export interface SoloSlice {
  /** The overlay whose page this is. Asserted against the slice supplied. */
  owner: OverlayId
  /** A channel is set, or test mode is on. Both pages that need it have it. */
  chatReady?: boolean
  muster?: MusterState
  concord?: ConcordState
  rite?: RiteState
  /**
   * The one countdown this page is for, with its live frame.
   *
   * A single timer rather than the whole `TimerSet`, because a timer page has
   * exactly one and filling the other slot is this module's problem rather than
   * the page's. The first attempt had `TimerPage` hand over both slots with the
   * same state in each, which type-checked and was quietly wrong — the deck
   * then claimed CONVENING was doing whatever INTERVAL was doing.
   */
  timer?: { id: TimerId; state: TimerState; frame: TimerFrame }
  nowPlaying?: NowPlayingState
  server?: OverlayServerInfo
  settings?: Settings | null
}

/** Which slice of the deck each overlay's own cases read. `null` reads none. */
const SOLO_CARRIER: Record<OverlayId, keyof SoloSlice | null> = {
  muster: 'muster',
  selection: 'rite',
  concord: 'concord',
  transmission: 'nowPlaying',
  interval: 'timer',
  convene: 'timer',
  // The three address-configured overlays hold no state at all, and THE DOCKET
  // is not built. Nothing to carry, so nothing to assert.
  enclosure: null,
  gate: null,
  survey: null,
  docket: null
}

export function soloDeck(slice: SoloSlice): OverlayDeck {
  const carrier = SOLO_CARRIER[slice.owner]
  if (carrier && slice[carrier] === undefined) {
    throw new Error(
      `soloDeck(${slice.owner}) was given no '${carrier}' state — its own page must pass it, or the bench will read a default and disagree with the desk.`
    )
  }

  return {
    server: slice.server ?? { running: false, url: null, port: null, clients: 0, error: null },
    chat: {
      platform: 'twitch',
      state: 'idle',
      channel: null,
      error: null,
      since: null,
      messages: 0,
      lastMessageAt: null,
      failures: 0,
      claims: []
    },
    rite: slice.rite ?? createEmptyRiteState(),
    concord: slice.concord ?? createEmptyConcordState(),
    muster: slice.muster ?? createEmptyMusterState(),
    /*
     * The page's own timer in its own slot, and a default in the other.
     *
     * Both slots are always present because `TimerSet` is a full record. The
     * untouched one is derived through the same `timerFrameAt` that
     * `useTimerFrame` calls, at a clock of zero — an idle timer's own note
     * records why that reads as "no time consumed yet" rather than as stale.
     */
    timers: {
      interval: slice.timer?.id === 'interval' ? slice.timer.state : createTimerState('interval'),
      convene: slice.timer?.id === 'convene' ? slice.timer.state : createTimerState('convene')
    },
    frames: {
      interval:
        slice.timer?.id === 'interval'
          ? slice.timer.frame
          : timerFrameAt(createTimerState('interval'), 0),
      convene:
        slice.timer?.id === 'convene'
          ? slice.timer.frame
          : timerFrameAt(createTimerState('convene'), 0)
    },
    nowPlaying: slice.nowPlaying ?? createNowPlayingState(),
    settings: slice.settings ?? null,
    chatReady: slice.chatReady ?? false
  }
}

// ------------------------------------------------------------------- reading

/**
 * Chat's connection, as a tone.
 *
 * Lived privately inside THE CONCORD's page while that was the only surface
 * reporting it. The dashboard is the second, and two tables mapping one enum
 * to a colour is how the same state ends up crimson on one page and gold on
 * another. Paired with `CHAT_STATE_LABEL` in the shared domain, which already
 * owns the words.
 *
 * `idle` is `offline` rather than a fault tone: nothing is listening because
 * nothing needs to be, which is the normal condition of a console that is not
 * running a poll. Crimson there would have the operator fixing what works.
 */
export const CHAT_TONE: Record<ChatConnectionState, StatusTone> = {
  idle: 'offline',
  connecting: 'pending',
  live: 'online',
  retrying: 'warn',
  failed: 'error'
}

export interface DeckStatus {
  tone: StatusTone
  /** Short enough for the rail and the panel's header: `12 filed`. */
  readout: string
  /** One line of live detail for the panel body, or null when at rest. */
  detail: string | null
  /** Reserved for genuinely in-flight states, as StatusDot requires. */
  pulse?: boolean
}

const AT_REST: DeckStatus = { tone: 'offline', readout: 'At rest', detail: null }

/**
 * What one overlay is doing, in the vocabulary its own page already uses.
 *
 * Deliberately not new wording. An operator who reads `THE ROLL IS OPEN` on
 * THE MUSTER's page and `Open` here is reading one system; two descriptions of
 * one state is how a dashboard stops being trusted.
 */
export function statusFor(id: OverlayId, deck: OverlayDeck, now: number): DeckStatus {
  switch (id) {
    case 'muster': {
      const filed = deck.muster.entries.length
      if (deck.muster.phase === 'open') {
        const left = musterRemainingAt(deck.muster, now)
        return {
          tone: 'online',
          readout: `${filed} filed`,
          detail: [
            'The roll is open',
            `${filed} filed`,
            deck.muster.citizens > 0 ? `${deck.muster.citizens} citizens` : null,
            left !== null ? `${formatClock(left)} left` : 'no clock'
          ]
            .filter(Boolean)
            .join(' · '),
          pulse: true
        }
      }
      if (deck.muster.phase === 'closed') {
        return {
          tone: 'pending',
          readout: `${filed} on the roll`,
          detail: `The roll is closed · ${filed} filed · waiting to be handed on`
        }
      }
      return AT_REST
    }

    case 'selection': {
      const filed = deck.rite.petitions.length
      if (deck.rite.phase === 'spinning') {
        return { tone: 'warn', readout: 'Selecting', detail: 'A selection is running', pulse: true }
      }
      if (deck.rite.phase === 'resolved') {
        const winner = deck.rite.winner?.label ?? null
        return {
          tone: 'pending',
          readout: 'Resolved',
          detail: winner ? `Nayara took "${winner}"` : 'Resolved'
        }
      }
      if (filed === 0) return AT_REST
      return { tone: 'online', readout: `${filed} filed`, detail: `${filed} petitions on the ring` }
    }

    case 'concord': {
      const options = deck.concord.options.length
      if (deck.concord.phase === 'open') {
        const left = deck.concord.closesAt !== null ? deck.concord.closesAt - now : null
        return {
          tone: 'online',
          readout: `${deck.concord.totalVotes} votes`,
          detail: [
            'The chamber sits',
            `${deck.concord.totalVotes} votes from ${deck.concord.voters} citizens`,
            left !== null ? `${formatClock(Math.max(left, 0))} left` : 'open until closed'
          ].join(' · '),
          pulse: true
        }
      }
      if (deck.concord.phase === 'casting') {
        return {
          tone: 'warn',
          readout: 'Casting',
          detail: 'A deadlock is being settled',
          pulse: true
        }
      }
      if (deck.concord.phase === 'resolved') {
        return {
          tone: 'pending',
          readout: 'Resolved',
          detail: `Closed · ${deck.concord.totalVotes} votes counted`
        }
      }
      if (options === 0) return AT_REST
      return {
        tone: 'pending',
        readout: `${options} on the ballot`,
        detail: `${options} options filed, not yet put`
      }
    }

    case 'transmission': {
      const { link, track } = deck.nowPlaying
      if (link.state === 'unconfigured') {
        return { tone: 'offline', readout: 'Not set up', detail: 'No Spotify client id yet' }
      }
      if (link.state === 'linking') {
        return { tone: 'pending', readout: 'Authorising', detail: link.message, pulse: true }
      }
      if (link.state === 'error') {
        return { tone: 'error', readout: 'Link failed', detail: link.message }
      }
      if (link.state === 'disconnected') {
        return { tone: 'pending', readout: 'Not linked', detail: 'Link a Spotify account to draw' }
      }
      if (track?.isPlaying) {
        const artists = track.artists.join(', ')
        return {
          tone: 'online',
          readout: 'On air',
          detail: artists ? `${track.title} — ${artists}` : track.title,
          pulse: true
        }
      }
      return { tone: 'pending', readout: 'Silent', detail: 'Linked, nothing playing' }
    }

    case 'interval':
    case 'convene':
      return timerStatus(deck.timers[id] ?? createTimerState(id), deck.frames[id], TIMER_KIND[id])

    /*
     * The three that hold no state at all.
     *
     * Every setting they have rides in the address, which is what lets two
     * scenes carry two differently-configured copies — see `OverlayAddress`.
     * So there is nothing to report and, below, nothing to press.
     */
    case 'enclosure':
    case 'gate':
    case 'survey':
      /*
       * `pending` rather than `online`, which it used to be.
       *
       * Nothing is wrong and nothing is happening, and those are the two facts
       * the dot has to distinguish. It mattered less on the old card, where
       * `Set by its address` was printed beside the dot and explained it. The
       * board hides an at-rest readout, so a gold dot there would read as
       * "this one is live" on three overlays that are merely ready — next to
       * rows where gold genuinely does mean a call is open.
       *
       * Same reasoning `CHAT_TONE` gives for mapping `idle` to `offline`: a
       * tone that has the operator fixing what works is worse than a quiet one.
       */
      return { tone: 'pending', readout: 'Set by its address', detail: null }

    default:
      return AT_REST
  }
}

/**
 * What the two countdowns are for, said on the block itself.
 *
 * They share a page, a set of faces and an implementation, and on a deck of
 * ten blocks that made them near-indistinguishable: two clocks, both reading
 * `05:00`, both offering Start and Restart. Which one opens the broadcast was
 * a thing you had to already know.
 *
 * They are genuinely different instruments, and `createDefaultTimerConfig`
 * already says how — grace against a terminal word, warned against silent.
 * This is that difference, drawn. It is always present, unlike every other
 * block's detail line, because for these two the line *is* the distinction.
 */
function timerRole(state: TimerState, kind: 'interval' | 'convene'): string {
  const config = state.config

  if (kind === 'convene') {
    return [
      'Opens the broadcast',
      formatDurationLabel(config.durationMs),
      `resolves to ${config.terminalWord || 'TIME'}`,
      config.sound ? 'cues on' : 'silent'
    ].join(' · ')
  }

  return [
    'Breaks and segments',
    formatDurationLabel(config.durationMs),
    config.graceMs > 0 ? `${formatDurationLabel(config.graceMs)} of grace` : 'stops at zero',
    config.sound ? 'cues on' : 'silent'
  ].join(' · ')
}

function timerStatus(
  state: TimerState,
  frame: TimerFrame,
  kind: 'interval' | 'convene'
): DeckStatus {
  const role = timerRole(state, kind)

  switch (frame.phase) {
    case 'running':
      return {
        tone: 'online',
        readout: formatClock(frame.remainingMs),
        detail: `Running · ${formatClock(frame.remainingMs)} remaining · ${role}`,
        pulse: true
      }
    case 'grace':
      // Only an interval reaches here: grace is for work that runs over, and
      // counting a room in does not. See `createDefaultTimerConfig`.
      return {
        tone: 'warn',
        readout: `+${formatClock(frame.graceRemainingMs)}`,
        detail: `Past zero · ${formatClock(frame.graceRemainingMs)} of grace left`,
        pulse: true
      }
    case 'elapsed':
      /*
       * The one place the two genuinely render differently.
       *
       * A spent interval is a clock that has run out and wants saying so. A
       * spent convening is not spent at all — it has *arrived*, and the
       * overlay is showing the word it resolves to. Reporting "Spent" here
       * would describe the opposite of what is on the broadcast.
       */
      return kind === 'convene'
        ? {
            tone: 'online',
            readout: state.config.terminalWord || 'TIME',
            detail: `Arrived · the scene reads ${state.config.terminalWord || 'TIME'}`
          }
        : { tone: 'pending', readout: 'Spent', detail: `The clock has run out · ${role}` }
    case 'paused':
      return {
        tone: 'pending',
        readout: `Held at ${formatClock(frame.remainingMs)}`,
        detail: `Held · ${formatClock(frame.remainingMs)} remaining · ${role}`
      }
    default:
      return {
        tone: 'offline',
        readout: formatClock(state.config.durationMs),
        detail: role
      }
  }
}

// ------------------------------------------------------------------- pressing

export interface DeckAction {
  /**
   * Stable across renders; drives the busy state and the React key.
   *
   * Namespaced `<overlay>:<verb>` — and, where an overlay has more than one of
   * a kind, `<overlay>:<verb>:<target>`. A host surface may select on that
   * prefix to lay one group of verbs out separately, which is how the muster's
   * hand-off gets its own panel on its own page while remaining one
   * implementation.
   */
  key: string
  label: string
  variant?: 'primary' | 'ghost' | 'danger'
  /** Why the service would refuse. Present means the control is disabled. */
  refusal?: string
  run(): Promise<unknown>
  /**
   * Turns an accepted result into a line worth showing, or null.
   *
   * Most verbs have nothing to say — the overlay's own state is the
   * acknowledgement. The hand-off is the exception and the reason this exists:
   * it *truncates* a roll longer than the destination holds and reports what
   * fitted, so an operator who sent forty entries to a ten-option ballot has to
   * be told that thirty stayed behind. Swallowing that would be silent data
   * loss from the operator's point of view.
   */
  report?(result: unknown): string | null
}

/**
 * The one or two verbs worth having without opening the overlay's own page.
 *
 * Kept to the ones that need no composition — an argument the operator would
 * have to type belongs on the page that has the field for it. Putting a call
 * is the interesting case and it is here because the service already falls
 * back to the standing question when none is given, so the dashboard can open
 * the call the operator has already written rather than inventing one.
 *
 * Refusals are mirrored from the services rather than discovered by pressing.
 * Each is checked in the main process too — that is where correctness lives,
 * and these guards exist so a dead control explains itself instead of throwing
 * a notice at somebody mid-broadcast.
 */
export function actionsFor(id: OverlayId, deck: OverlayDeck): DeckAction[] {
  const candy = window.candy

  switch (id) {
    case 'muster': {
      /*
       * The hand-off, reachable without leaving the desk.
       *
       * This is the point of the whole overlay — "a finished roll becomes a
       * draw or a vote without anyone re-typing anything" — and it was two
       * navigations away from the surface an operator has open while the call
       * is closing. Offered whenever there is a roll, open or not: handing on
       * an open call is legitimate (it seeds the ring while chat keeps filing)
       * and the service does not refuse it.
       */
      const handoff: DeckAction[] =
        deck.muster.entries.length > 0
          ? (
              [
                ['selection', 'To the ring'],
                ['concord', 'To the chamber'],
                /*
                 * Both at once, which is not redundant with the other two.
                 *
                 * A roll can be voted down to a shortlist and the shortlist
                 * then drawn from, so the two destinations are a pipeline
                 * rather than alternatives — and pressing them one after the
                 * other would file the second lot against a ballot the first
                 * press had already opened.
                 */
                ['both', 'To both']
              ] as const
            ).map(([destination, label]) => ({
              key: `muster:handoff:${destination}`,
              label,
              run: () => candy.muster.handoff({ destination, clear: false }),
              report: (result: unknown) => {
                const { sent, dropped } = result as { sent: number; dropped: number }
                return dropped > 0
                  ? `Sent ${sent}. ${dropped} did not fit and stayed on the roll.`
                  : `Sent ${sent}.`
              }
            }))
          : []

      if (deck.muster.phase === 'open') {
        return [
          { key: 'muster:close', label: 'Close the call', run: () => candy.muster.close() },
          ...handoff
        ]
      }
      return [
        {
          key: 'muster:open',
          label: 'Put the call',
          variant: 'primary',
          // The service refuses this, and says the same thing.
          refusal: deck.chatReady ? undefined : 'No chat channel is set',
          // Empty prompt: the service falls back to the standing question.
          run: () => candy.muster.open('')
        },
        ...handoff,
        ...(deck.muster.entries.length > 0
          ? [{ key: 'muster:reset', label: 'Clear the roll', run: () => candy.muster.reset() }]
          : [])
      ]
    }

    case 'selection': {
      if (deck.rite.phase === 'resolved') {
        return [{ key: 'rite:reset', label: 'Clear the result', run: () => candy.rite.reset() }]
      }
      return [
        {
          key: 'rite:spin',
          label: 'Draw',
          variant: 'primary',
          refusal:
            deck.rite.phase === 'spinning'
              ? 'A selection is already running'
              : deck.rite.petitions.length === 0
                ? 'Nothing has been filed to choose between'
                : undefined,
          run: () => candy.rite.spin()
        }
      ]
    }

    case 'concord': {
      /*
       * Clearing the votes, which the desk could not reach.
       *
       * Offered whenever there is something to clear — a settled result or a
       * ballot mid-poll — and never during a casting, which is the one phase
       * the service will not interrupt. The same shape as the muster's
       * `Clear the roll` beside it.
       */
      const clear: DeckAction[] =
        deck.concord.phase !== 'casting' &&
        (deck.concord.phase !== 'idle' || deck.concord.result !== null)
          ? [{ key: 'concord:reset', label: 'Clear the votes', run: () => candy.concord.reset() }]
          : []

      if (deck.concord.phase === 'open') {
        return [
          {
            key: 'concord:close',
            // A deadlocked ballot escalates to THE CASTING on close, and saying
            // so before the press is the difference between an operator
            // choosing that and being surprised by it on air.
            label: isDeadlocked(deck.concord.options)
              ? 'Close — will cast lots'
              : 'Close the chamber',
            run: () => candy.concord.close()
          },
          ...clear
        ]
      }
      return [
        {
          key: 'concord:open',
          label: 'Put the question',
          variant: 'primary',
          refusal:
            deck.concord.phase === 'casting'
              ? 'A casting is settling the last poll'
              : !deck.chatReady
                ? 'No Twitch channel is configured'
                : deck.concord.options.length < 2
                  ? 'A poll needs at least two options'
                  : undefined,
          run: () => candy.concord.open()
        },
        ...clear
      ]
    }

    case 'interval':
    case 'convene': {
      const frame = deck.frames[id]
      const running = frame.phase === 'running' || frame.phase === 'grace'
      return [
        {
          key: `timer:${id}:toggle`,
          label: running ? 'Hold' : 'Start',
          variant: running ? 'ghost' : 'primary',
          run: () => candy.timers.toggle(id)
        },
        {
          key: `timer:${id}:restart`,
          label: 'Restart',
          run: () => candy.timers.restart(id)
        },
        /*
         * Back to standing by, which the desk could not reach.
         *
         * `danger` because it is the one verb here that throws away where the
         * clock had got to; restarting keeps the duration and begins again,
         * this puts the overlay back to rest. Absent when it would do nothing.
         */
        ...(deck.timers[id]?.phase !== undefined && deck.timers[id]?.phase !== 'idle'
          ? [
              {
                key: `timer:${id}:reset`,
                label: 'Reset',
                variant: 'danger' as const,
                run: () => candy.timers.reset(id)
              }
            ]
          : []),
        /*
         * Adding and removing a minute mid-run, which `timers.extend` has
         * always supported and only the keyboard could reach (`Ctrl`+`↑`,
         * `Ctrl`+`↓`, on the timer's own page).
         *
         * Drawn only while the clock is actually moving. "The break is running
         * over" is the single most common thing that happens to a countdown
         * during a broadcast, and it is not a thing to discover a chord for
         * with an audience waiting. A stopped clock has a duration slider
         * instead, which is the same intent said properly.
         */
        ...(running
          ? [
              {
                key: `timer:${id}:add`,
                label: '+1 min',
                run: () => candy.timers.extend(id, 60_000)
              },
              {
                key: `timer:${id}:drop`,
                label: '−1 min',
                // The service clamps rather than going negative, so there is
                // no refusal to mirror — only a floor.
                run: () => candy.timers.extend(id, -60_000)
              }
            ]
          : [])
      ]
    }

    case 'transmission': {
      const state = deck.nowPlaying.link.state

      /*
       * Offered in every state, including `connected`.
       *
       * It used to return nothing once linked, which read as "done" and was
       * not: a token can be revoked from Spotify's own account page, and the
       * only way back is to authorise again. `link()` is both verbs, so the
       * label is what changes rather than the availability. This also means the
       * overlay's own page no longer needs an `Authorise` button of its own —
       * it had one, and a linked account then showed two controls for linking.
       */
      return [
        {
          key: 'nowplaying:link',
          label:
            state === 'linking'
              ? 'Authorising…'
              : state === 'connected'
                ? 'Re-authorise'
                : 'Link Spotify',
          variant: state === 'connected' ? 'ghost' : 'primary',
          refusal:
            state === 'unconfigured' ? 'Set a Spotify client id in REGULATION first' : undefined,
          run: () => candy.nowPlaying.link()
        },
        ...(state === 'unconfigured'
          ? []
          : [
              {
                key: 'nowplaying:unlink',
                label: 'Unlink',
                variant: 'danger' as const,
                run: () => candy.nowPlaying.unlink()
              }
            ])
      ]
    }

    default:
      return []
  }
}

/**
 * Runs a deck action, reporting what is in flight and what was refused.
 *
 * The same shape every overlay page already uses for its own mutations — one
 * pending key for busy states, one message for the notice line — rather than a
 * fourth variation on it.
 */
export interface DeckRunner {
  pending: string | null
  /** Resolves true when the action was accepted, so a field can clear itself. */
  run(action: DeckAction): Promise<boolean>
}

/**
 * Runs a deck action, reporting what is in flight.
 *
 * What came back goes to the console's notice stack. It used to be held here
 * as two strings and drawn by each of the six pages as its own dismissible
 * bar — the same twelve lines of markup six times, with the tone rules
 * restated in two stylesheets. The distinction those bars drew is the one the
 * notice stack is built on, so it survives the move intact: a report is gold
 * and goes away, a refusal is crimson and waits to be dismissed.
 *
 * `report` and `error` are gone from the interface. A page that needs to know
 * whether something worked takes the boolean `run` already resolves with.
 */
export function useDeckRunner(): DeckRunner {
  const [pending, setPending] = useState<string | null>(null)

  const run = useCallback(async (action: DeckAction): Promise<boolean> => {
    if (action.refusal) return false

    setPending(action.key)
    try {
      const result = await action.run()
      // A hand-off that dropped thirty entries is news, and it is not a fault.
      const said = action.report?.(result) ?? null
      if (said) notify.report(action.label, { detail: said })
      return true
    } catch (cause) {
      notify.refuse(cause, { label: action.label })
      return false
    } finally {
      setPending((current) => (current === action.key ? null : current))
    }
  }, [])

  return useMemo(() => ({ pending, run }), [pending, run])
}

// ------------------------------------------------------------------ writing

/** One text field on a block's composer, bound to a pushed config value. */
export interface ComposerText {
  key: string
  label: string
  /** The pushed value. The field owns it while an edit is outstanding. */
  value: string
  maxLength: number
  placeholder?: string
  commit(value: string): void
}

/** The one-line "add something to this overlay" input, where there is one. */
export interface ComposerEntry {
  actionKey: string
  label: string
  placeholder: string
  maxLength: number
  hint?: string
  /** Why the service would refuse. Present means the field is disabled. */
  refusal?: string
  submit(text: string): Promise<unknown>
}

export interface ComposerSpec {
  texts: readonly ComposerText[]
  entry?: ComposerEntry
  /** What has already been filed, drawn as chips so the field shows its effect. */
  filed?: readonly string[]
}

/**
 * What an overlay needs written before its verb means anything.
 *
 * Three of the overlays are *put* rather than merely started — a call, a
 * question, a draw — and each is put against text the operator writes. Leaving
 * that on the overlay's own page made the dashboard's verbs decorative: "Put
 * the call" with no way to say what the call asks is a button that opens
 * whatever was last configured, which is not a thing anybody would press
 * during a broadcast.
 *
 * All three share the same two fields, and that is not a coincidence — TITLE
 * and PROMPT are the same pair in `MusterConfig`, `ConcordConfig` and
 * `RiteConfig`. So they get the same composer, in the same order, with the
 * limits each schema actually enforces.
 *
 * The list editors stay on the overlay pages. What is here is the single-line
 * "add one" that unblocks the verb — a ballot option, a petition, an entry
 * filed on somebody's behalf. Reordering a ballot, weighting a petition and
 * cutting an entry are composition, and composition has a page.
 */
export function composerFor(id: OverlayId, deck: OverlayDeck): ComposerSpec | null {
  const candy = window.candy

  switch (id) {
    case 'muster': {
      const config = deck.muster.config
      return {
        texts: [
          {
            key: 'muster:title',
            label: 'Title',
            value: config.title,
            maxLength: MAX_TITLE_LENGTH,
            commit: (value) => void candy.muster.configure({ title: value })
          },
          {
            key: 'muster:prompt',
            label: 'Question',
            value: config.prompt,
            maxLength: MAX_PROMPT_LENGTH,
            placeholder: 'WHAT SHOULD BE PLAYED?',
            commit: (value) => void candy.muster.configure({ prompt: value })
          }
        ],
        entry: {
          actionKey: 'muster:add',
          label: 'File',
          placeholder: 'File an entry, or seed the roll before the call',
          maxLength: MAX_ENTRY_LENGTH,
          /*
           * No open-call guard, deliberately.
           *
           * The first version disabled this unless the call was open, which
           * looked right and is not: `MusterService.add` exists precisely so
           * the operator can *seed* a roll before putting the call, or file
           * for somebody whose message did not land. Its only refusal is a
           * full roll, so that is the only one mirrored.
           */
          refusal:
            deck.muster.entries.length >= deck.muster.config.maxEntries
              ? 'The roll is full'
              : undefined,
          submit: (text) => candy.muster.add({ text, author: '' })
        }
      }
    }

    case 'concord': {
      const config = deck.concord.config
      return {
        texts: [
          {
            key: 'concord:title',
            label: 'Title',
            value: config.title,
            maxLength: MAX_CONCORD_TITLE,
            commit: (value) => void candy.concord.configure({ title: value })
          },
          {
            key: 'concord:prompt',
            label: 'Question',
            value: config.prompt,
            maxLength: MAX_CONCORD_PROMPT,
            placeholder: 'THE CHAMBER WILL DECIDE',
            commit: (value) => void candy.concord.configure({ prompt: value })
          }
        ],
        entry: {
          actionKey: 'concord:add',
          label: 'Add',
          placeholder: 'Add an option to the ballot',
          maxLength: MAX_OPTION_LABEL,
          hint: `A poll needs at least two. ${MAX_OPTIONS} is the ceiling — past ten the numerals stop being readable on a broadcast.`,
          refusal:
            deck.concord.phase === 'open'
              ? 'The chamber is sitting'
              : deck.concord.options.length >= MAX_OPTIONS
                ? `The ballot holds at most ${MAX_OPTIONS} options`
                : undefined,
          submit: (label) => candy.concord.addOption({ label })
        },
        filed: deck.concord.options.map((option) => option.label)
      }
    }

    case 'selection': {
      const config = deck.rite.config
      return {
        texts: [
          {
            key: 'rite:title',
            label: 'Title',
            value: config.title,
            maxLength: MAX_RITE_TITLE,
            commit: (value) => void candy.rite.configure({ title: value })
          },
          {
            key: 'rite:prompt',
            label: 'Question',
            value: config.prompt,
            maxLength: MAX_RITE_PROMPT,
            placeholder: 'THE FIELD WILL CHOOSE',
            commit: (value) => void candy.rite.configure({ prompt: value })
          }
        ],
        entry: {
          actionKey: 'rite:add',
          label: 'File',
          placeholder: 'File a petition',
          maxLength: MAX_PETITION_LABEL,
          refusal:
            deck.rite.phase === 'spinning'
              ? 'A selection is running'
              : deck.rite.petitions.length >= MAX_PETITIONS
                ? `The ring holds at most ${MAX_PETITIONS} petitions`
                : undefined,
          submit: (label) => candy.rite.addPetition({ label })
        },
        filed: deck.rite.petitions.map((petition) => petition.label)
      }
    }

    /*
     * The two countdowns, and the asymmetry between them is the point.
     *
     * Both carry the label set above their readout. Only CONVENING carries a
     * terminal word, because only CONVENING resolves to one — an interval
     * runs out and counts its grace, a convening *arrives*. Making that the
     * one field they do not share means the composer itself says which timer
     * you are looking at, rather than relying on the operator remembering
     * which of two identical clocks opens the broadcast.
     */
    case 'interval':
    case 'convene': {
      const timer = deck.timers[id] ?? createTimerState(id)
      const convene = TIMER_KIND[id] === 'convene'

      const texts: ComposerText[] = [
        {
          key: `${id}:label`,
          label: 'Label',
          value: timer.config.label,
          maxLength: MAX_TIMER_LABEL,
          placeholder: convene ? 'TRANSMISSION BEGINS' : 'INTERVAL',
          commit: (value) => void candy.timers.configure(id, { label: value })
        }
      ]

      if (convene) {
        texts.push({
          key: `${id}:terminal`,
          label: 'Resolves to',
          value: timer.config.terminalWord,
          maxLength: MAX_TERMINAL_WORD,
          placeholder: 'NOW',
          commit: (value) => void candy.timers.configure(id, { terminalWord: value })
        })
      }

      return { texts }
    }

    /*
     * Nothing for the rest.
     *
     * THE ENCLOSURE, THE GATE and THE SURVEY do have a marque, but it rides in
     * the address rather than in any stored state, so composing it here would
     * give one setting two composers with no way for either to know what the
     * other had said. Those keep their own page, which is what it is for.
     */
    default:
      return null
  }
}

// -------------------------------------------------------------------- dialling

/**
 * One control on a bench, beyond the text an overlay is put against.
 *
 * Three shapes because there are exactly three kinds of thing here — a
 * magnitude, a switch and a choice from a closed set — and each already has a
 * primitive. A fourth shape would mean a setting that does not belong on a
 * bench at all.
 */
export type DeckDial =
  | {
      kind: 'slider'
      key: string
      label: string
      value: number
      min: number
      max: number
      step: number
      readout: string
      hint?: string
      disabled?: boolean
      commit(value: number): void
    }
  | {
      kind: 'toggle'
      key: string
      label: string
      value: boolean
      hint?: string
      disabled?: boolean
      commit(value: boolean): void
    }
  | {
      kind: 'choice'
      key: string
      label: string
      value: string
      options: readonly { value: string; label: string }[]
      hint?: string
      disabled?: boolean
      commit(value: string): void
    }

/**
 * The settings worth having on the bench, as against on the overlay's page.
 *
 * ## The altitude rule
 *
 * **The bench carries what changes between segments. The page carries what is
 * set once.** That is the same split the ARCHIVE dossier arrived at after five
 * attempts, applied here, and it is the only principle that makes this list
 * decidable rather than a matter of taste.
 *
 * So a call's *length* is here, because "make this one thirty seconds" is a
 * decision taken per call. Its *command word* is not: `!add` is chosen once and
 * then printed on the broadcast forever, and an operator who changes it
 * mid-stream has invalidated the instruction the audience is reading. A
 * countdown's duration is here; which of five faces it draws is not. A poll's
 * window and how strictly it parses votes are here — both are turnout
 * decisions taken per question — while its twelve `show*` switches are not.
 *
 * Five overlays get nothing, and that is the honest answer rather than a gap:
 * THE GATE, THE SURVEY and THE ENCLOSURE store no settings at all (everything
 * rides in the address, which is what lets two scenes carry two differently
 * configured copies), NOW TRANSMITTING's presentation is addressed per source
 * rather than held once, and THE CHORUS is not served from here.
 */
export function dialsFor(id: OverlayId, deck: OverlayDeck): DeckDial[] {
  const candy = window.candy

  switch (id) {
    case 'muster': {
      const config = deck.muster.config
      return [
        {
          kind: 'slider',
          key: 'muster:duration',
          label: 'Call runs for',
          value: config.durationMs,
          min: 0,
          max: MUSTER_DURATION_MAX_MS,
          step: 15_000,
          // Zero is a mode rather than a magnitude, so it reads as one.
          readout:
            config.durationMs === 0 ? 'Until closed' : `${Math.round(config.durationMs / 1000)}s`,
          // Changing this while the call is open would not move the clock that
          // is already running — `closesAt` was set when the call was put — so
          // saying so beats appearing to do nothing.
          hint: deck.muster.phase === 'open' ? 'Applies to the next call.' : undefined,
          commit: (durationMs) => void candy.muster.configure({ durationMs })
        },
        {
          kind: 'toggle',
          key: 'muster:instruction',
          label: 'Show the instruction',
          value: config.showInstruction,
          hint: 'An audience cannot file in a syntax nobody told them.',
          commit: (showInstruction) => void candy.muster.configure({ showInstruction })
        }
      ]
    }

    case 'selection': {
      const config = deck.rite.config
      const spinning = deck.rite.phase === 'spinning'
      return [
        {
          kind: 'toggle',
          key: 'rite:elimination',
          label: 'Withdraw the winner',
          value: config.removeOnSelect,
          hint: 'For elimination rounds — a series of draws walks the field instead of repeating.',
          commit: (removeOnSelect) => void candy.rite.configure({ removeOnSelect })
        },
        {
          kind: 'choice',
          key: 'rite:mechanism',
          label: 'How it draws',
          value: config.mechanism,
          options: RITE_MECHANISMS.map((mechanism) => ({
            value: mechanism,
            label: RITE_MECHANISM_LABEL[mechanism]
          })),
          commit: (mechanism) =>
            void candy.rite.configure({ mechanism: mechanism as typeof config.mechanism })
        },
        {
          kind: 'slider',
          key: 'rite:duration',
          label: 'Spin length',
          value: config.durationMs,
          min: SPIN_DURATION_MIN_MS,
          max: SPIN_DURATION_MAX_MS,
          step: 250,
          readout: `${(config.durationMs / 1000).toFixed(1)}s`,
          disabled: spinning,
          commit: (durationMs) => void candy.rite.configure({ durationMs })
        }
      ]
    }

    case 'concord': {
      const config = deck.concord.config
      // Both are locked while the chamber sits or a casting settles, exactly as
      // the overlay's own page locked them: changing how a vote parses halfway
      // through counting one would silently reinterpret what has arrived.
      const locked = deck.concord.phase === 'open' || deck.concord.phase === 'casting'
      return [
        {
          kind: 'slider',
          key: 'concord:duration',
          label: 'Voting window',
          value: config.durationMs,
          min: 0,
          max: POLL_DURATION_MAX_MS,
          step: 10_000,
          /*
           * Zero reads as a mode, not as the bottom of a range.
           *
           * The page used to keep a separate row of quick-set buttons beside
           * this slider for exactly that reason — "a slider that has to be
           * dragged to its far left to mean *no timer* hides the most useful
           * option behind a gesture". Naming the zero fixes the same problem
           * without a second control writing the same field.
           */
          readout:
            config.durationMs === 0 ? 'Until closed' : `${Math.round(config.durationMs / 1000)}s`,
          disabled: locked,
          commit: (durationMs) => void candy.concord.configure({ durationMs })
        },
        {
          kind: 'choice',
          key: 'concord:syntax',
          label: 'How a vote counts',
          value: config.voteSyntax,
          options: VOTE_SYNTAXES.map((syntax) => ({
            value: syntax,
            label: VOTE_SYNTAX_LABEL[syntax]
          })),
          hint: 'A bare numeral gets several times the turnout, and collides with conversation.',
          disabled: locked,
          commit: (voteSyntax) =>
            void candy.concord.configure({ voteSyntax: voteSyntax as typeof config.voteSyntax })
        }
      ]
    }

    case 'interval':
    case 'convene': {
      const timer = deck.timers[id] ?? createTimerState(id)
      const dials: DeckDial[] = [
        {
          kind: 'slider',
          key: `${id}:duration`,
          label: 'Time set',
          value: timer.config.durationMs,
          min: TIMER_MIN_MS,
          max: TIMER_MAX_MS,
          step: 30_000,
          readout: formatClock(timer.config.durationMs),
          commit: (durationMs) => void candy.timers.configure(id, { durationMs })
        }
      ]

      /*
       * Grace is an INTERVAL dial and not a CONVENING one.
       *
       * Not a simplification — `createDefaultTimerConfig` records the reason:
       * grace is for work that runs over, and counting a room in does not run
       * over. Offering the slider on both would suggest a convening can be in
       * grace, which its own `timerStatus` case explicitly cannot report.
       */
      if (TIMER_KIND[id] === 'interval') {
        dials.push({
          kind: 'slider',
          key: `${id}:grace`,
          label: 'Grace past zero',
          value: timer.config.graceMs,
          min: 0,
          max: GRACE_MAX_MS,
          step: 30_000,
          readout:
            timer.config.graceMs === 0
              ? 'Stops at zero'
              : formatDurationLabel(timer.config.graceMs),
          commit: (graceMs) => void candy.timers.configure(id, { graceMs })
        })
      }

      return dials
    }

    default:
      return []
  }
}

/** True while anything on the deck is counting down, so the clock ticks. */
export function deckIsCounting(deck: OverlayDeck): boolean {
  return (
    (deck.muster.phase === 'open' && deck.muster.closesAt !== null) ||
    (deck.concord.phase === 'open' && deck.concord.closesAt !== null)
  )
}

export { useCountdownClock }
