import type { TimerId, TimerSet, TimerState } from '@shared/domain/timer'
import { TIMER_IDS, TIMER_KIND, createTimerState } from '@shared/domain/timer.constants'
import { TimerFace } from '@renderer/timer/timer-renderer'
import './timer.scss'

/**
 * Countdown browser source.
 *
 * One document serves both timers. Which one it renders comes from the path it
 * was requested at — `/interval` or `/convene` — because those are the
 * addresses declared in the overlay registry, and a browser source is
 * identified by its URL and nothing else. Reading it from the path rather than
 * a query parameter means the address the console hands over is the whole
 * configuration.
 *
 * Silent by design: cues belong to the console. See timer/cues.ts.
 */

function resolveTimerId(): TimerId {
  const segment = window.location.pathname.replace(/^\/+/, '').split('/')[0]
  const match = TIMER_IDS.find((id) => id === segment)
  // Falls back rather than failing: a source pointed at the document directly
  // should render something recognisable instead of a blank scene.
  return match ?? 'interval'
}

const timerId = resolveTimerId()
const kind = TIMER_KIND[timerId]

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new TimerFace(canvas, { motion: true })
face.setState(createTimerState(timerId), kind)
face.start()

new ResizeObserver(() => face.resize()).observe(canvas)

function apply(state: TimerState): void {
  face.setState(state, kind)
}

const stream = new EventSource('/events')

stream.addEventListener('message', (event) => {
  try {
    // One stream feeds every overlay; keep only this timer's frames.
    const frame = JSON.parse((event as MessageEvent<string>).data) as {
      channel: string
      payload: unknown
    }
    if (frame.channel !== 'timer') return

    const next = (frame.payload as TimerSet)[timerId]
    if (next) apply(next)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good state and the next frame will be sound.
  }
})
