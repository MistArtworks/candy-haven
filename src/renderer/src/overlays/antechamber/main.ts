import type { AntechamberState } from '@shared/domain/antechamber'
import { createAntechamberState } from '@shared/domain/antechamber.constants'
import { AntechamberFace } from '@renderer/antechamber/antechamber-renderer'
import './antechamber.scss'

/**
 * THE ANTECHAMBER browser source.
 *
 * The field a broadcast waits on, and nothing else: no clock, no chat, no
 * now-playing. Those are separate sources composited over this one in OBS, and
 * duplicating any of them here would mean two of everything to keep in step.
 *
 * Painted from the defaults immediately rather than waiting for the first
 * frame from the stream. A source added to a scene should be showing something
 * within a frame or two of loading — and if the console is not running at all,
 * the defaults are a perfectly good field.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new AntechamberFace(canvas, createAntechamberState().config, { motion: true })
face.start()

new ResizeObserver(() => face.resize()).observe(canvas)

const stream = new EventSource('/events')

stream.addEventListener('message', (event) => {
  try {
    // One stream feeds every overlay; keep only this one's frames.
    const frame = JSON.parse((event as MessageEvent<string>).data) as {
      channel: string
      payload: unknown
    }
    if (frame.channel !== 'antechamber') return
    face.setConfig((frame.payload as AntechamberState).config)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good configuration.
  }
})
