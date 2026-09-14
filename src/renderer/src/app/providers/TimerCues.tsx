import { useEffect, useRef, type ReactNode } from 'react'
import { TIMER_IDS, timerFrameAt } from '@shared/domain/timer.constants'
import { TimerCueRunner } from '@renderer/timer/cues'
import { useTimerSet } from '@renderer/hooks/useTimers'

/**
 * Polled rather than tied to a frame loop, but tightly.
 *
 * A quarter of a second was fine while every cue was a chime that could land a
 * little late without anyone noticing. It is not fine now that a ticking bed
 * runs underneath: the bed is stopped in the same pass that fires the arrival
 * sample, so however late this poll notices zero is exactly how long the clock
 * keeps ticking over the top of the impact meant to replace it.
 *
 * A tenth of a second is inaudible as a gap and costs two comparisons.
 */
const CHECK_INTERVAL_MS = 100

/**
 * Fires the countdown audio cues, wherever the operator happens to be.
 *
 * Mounted above the router rather than on the timer's own page, because the
 * whole point of a cue is that it reaches the operator while they are doing
 * something else — a break timer running out while they are in the ARCHIVE
 * needs to interrupt, and a warning that only sounds on the page showing the
 * clock is a warning for someone already watching it.
 *
 * Renders nothing. It is a subscriber, not a component.
 */
export function TimerCues(): ReactNode {
  const timers = useTimerSet()
  const runner = useRef(new TimerCueRunner())

  // The interval reads the latest state through a ref so the timer is not torn
  // down and rebuilt every time a config field changes.
  const latest = useRef(timers)
  useEffect(() => {
    latest.current = timers
  }, [timers])

  useEffect(() => {
    const check = (): void => {
      const now = Date.now()
      for (const id of TIMER_IDS) {
        const state = latest.current[id]
        if (!state) continue
        runner.current.update(state, timerFrameAt(state, now))
      }
    }

    const handle = setInterval(check, CHECK_INTERVAL_MS)
    const cues = runner.current
    return () => {
      clearInterval(handle)
      // Stops the ticking bed with the subscriber. Nothing else would: it is a
      // looping element outside React, and a clock still audible after the
      // thing driving it has gone is the worst kind of leak to track down.
      cues.reset()
    }
  }, [])

  return null
}
