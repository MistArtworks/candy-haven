import { useEffect, useRef, type ReactNode } from 'react'
import type { ConcordState } from '@shared/domain/concord'
import { concordFrameAt, createEmptyConcordState } from '@shared/domain/concord.constants'
import { playCue } from '@renderer/timer/cues'

/** Polled rather than tied to a frame loop: a cue edge is a quarter-second event. */
const CHECK_INTERVAL_MS = 250

/**
 * Fires THE CONCORD's audio cues, wherever the operator happens to be.
 *
 * Mounted above the router for the reason `TimerCues` is: a cue exists to reach
 * the operator while they are looking at something else. A vote closing while
 * they are mid-sentence about something in the ARCHIVE is exactly when they need
 * telling, and a warning that only sounds on the page already showing the clock
 * is a warning for someone who is already watching.
 *
 * ### Why this subscribes without any React state
 *
 * A live poll pushes eight frames a second. `useConcordState` deliberately keeps
 * that out of the global store so it cannot re-render the whole console, and a
 * provider that called `setState` on every push would reintroduce exactly that —
 * app-wide re-renders at 8Hz, to play at most two sounds.
 *
 * So the subscription writes to a ref and nothing else, and a 250ms interval
 * reads it. The component never re-renders after mount.
 *
 * Renders nothing. It is a subscriber, not a component.
 */
export function ConcordCues(): ReactNode {
  const latest = useRef<ConcordState>(createEmptyConcordState())
  /** Cues already fired for the poll currently open, so each sounds once. */
  const firedFinal = useRef(false)
  const lastPhase = useRef<ConcordState['phase']>('idle')

  useEffect(() => {
    const unsubscribe = window.candy.concord.onState((next) => {
      latest.current = next
    })

    void window.candy.concord.state().then((initial) => {
      // Only if a push has not already claimed it — a slow snapshot must not
      // roll the phase backwards and re-arm a cue that has already sounded.
      if (latest.current.revision === 0) latest.current = initial
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const check = (): void => {
      const state = latest.current
      const phase = state.phase

      // Re-arm on each fresh opening rather than on any change, so re-opening a
      // poll gets its warning and a reconnect does not.
      if (phase === 'open' && lastPhase.current !== 'open') {
        firedFinal.current = false
      }

      if (state.config.sound) {
        const frame = concordFrameAt(state, Date.now())

        // Final call: the operator is usually talking over the vote and needs to
        // know to start wrapping up.
        if (phase === 'open' && frame.timed && frame.finalCall && !firedFinal.current) {
          firedFinal.current = true
          playCue('final')
        }

        // A deadlock is the one outcome that needs attention rather than just
        // reading — the chamber is tied and lots are about to be cast. A clean
        // result is deliberately silent: the operator closed it and is looking.
        if (phase === 'casting' && lastPhase.current === 'open') {
          playCue('expired')
        }
      }

      lastPhase.current = phase
    }

    const handle = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [])

  return null
}
