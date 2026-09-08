import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  TimerConfigPatch,
  TimerFrame,
  TimerId,
  TimerSet,
  TimerState
} from '@shared/domain/timer'
import { TIMER_IDS, createTimerState, timerFrameAt } from '@shared/domain/timer.constants'

/**
 * How often the React-level clock re-renders.
 *
 * The canvas face runs its own frame loop, so this only drives text readouts in
 * the console. Four times a second keeps a seconds display honest without
 * re-rendering a panel sixty times a second for no visible gain.
 */
const READOUT_INTERVAL_MS = 250

function emptySet(): TimerSet {
  return Object.fromEntries(TIMER_IDS.map((id) => [id, createTimerState(id)])) as TimerSet
}

/**
 * Both timers, pushed from the main process.
 *
 * Subscribes before fetching the snapshot and only applies the snapshot if no
 * push has overtaken it — the same ordering guard `SystemBridge` uses, so a
 * slow response cannot roll live state backwards.
 */
export function useTimerSet(): TimerSet {
  const [timers, setTimers] = useState<TimerSet>(emptySet)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.timers.onState((next) => {
      if (cancelled) return
      claimed = true
      // The push carries one timer; merge rather than replace.
      setTimers((current) => ({ ...current, [next.id]: next }))
    })

    void window.candy.timers.all().then((initial) => {
      if (!cancelled && !claimed) setTimers(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return timers
}

export function useTimer(id: TimerId): TimerState {
  const timers = useTimerSet()
  return timers[id] ?? createTimerState(id)
}

/**
 * The derived clock, ticking locally.
 *
 * Nothing about this comes over IPC: the state carries a start instant and the
 * durations, so the console derives its own frame exactly as the browser source
 * does. That is what keeps the two in step — a pushed tick would arrive
 * jittery and put them a variable fraction of a second apart.
 */
export function useTimerFrame(state: TimerState): TimerFrame {
  const [now, setNow] = useState(0)

  useEffect(() => {
    // A stopped timer cannot change on its own. Keyed on the phase alone, so
    // editing the duration does not tear the interval down and rebuild it.
    if (state.phase !== 'running') return

    const handle = setInterval(() => setNow(Date.now()), READOUT_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [state.phase])

  /*
   * The instant is held in state and only ever written from the interval, so
   * render itself stays pure — `timerFrameAt` is a function of its arguments.
   *
   * A stale `now` is harmless while the timer is not running: `timerFrameAt`
   * ignores the clock for `idle` and `paused`, deriving the readout from the
   * configured duration and the accumulated time instead. It only has to be
   * fresh while something is actually counting, which is exactly when the
   * interval above is alive.
   *
   * The initial zero is safe for the same reason `consumedMs` clamps its
   * elapsed term at zero: a `now` behind `startedAt` reads as "no time
   * consumed yet", which is precisely the correct frame for the instant before
   * the first tick lands.
   */
  return timerFrameAt(state, now)
}

export interface TimerActions {
  toggle(id: TimerId): Promise<void>
  start(id: TimerId): Promise<void>
  pause(id: TimerId): Promise<void>
  reset(id: TimerId): Promise<void>
  restart(id: TimerId): Promise<void>
  extend(id: TimerId, deltaMs: number): Promise<void>
  configure(id: TimerId, patch: TimerConfigPatch): Promise<void>
  pending: string | null
  error: string | null
  dismissError(): void
}

/**
 * Timer controls.
 *
 * As with the rite: no response is applied locally. Every channel causes the
 * main process to broadcast, and `useTimerSet` is already listening — applying
 * the response as well would give one update two sources and reintroduce the
 * ordering race that settings hit.
 */
export function useTimerActions(): TimerActions {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(key)
    try {
      await action()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<TimerActions>(
    () => ({
      toggle: (id) => run('toggle', () => window.candy.timers.toggle(id)),
      start: (id) => run('start', () => window.candy.timers.start(id)),
      pause: (id) => run('pause', () => window.candy.timers.pause(id)),
      reset: (id) => run('reset', () => window.candy.timers.reset(id)),
      restart: (id) => run('restart', () => window.candy.timers.restart(id)),
      extend: (id, deltaMs) =>
        run(`extend:${deltaMs}`, () => window.candy.timers.extend(id, deltaMs)),
      configure: (id, patch) => run('config', () => window.candy.timers.configure(id, patch)),
      pending,
      error,
      dismissError: () => setError(null)
    }),
    [run, pending, error]
  )
}
