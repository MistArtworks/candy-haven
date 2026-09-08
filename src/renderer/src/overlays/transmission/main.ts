import type { NowPlayingState } from '@shared/domain/nowplaying'
import { createNowPlayingState } from '@shared/domain/nowplaying.constants'
import { NowPlayingFace } from '@renderer/nowplaying/nowplaying-renderer'
import './transmission.scss'

/**
 * NOW TRANSMITTING browser source.
 *
 * Silent, transparent and read-only. It knows nothing about Spotify: the main
 * process polls, inlines the cover art and pushes state, and this page draws
 * whatever the last frame said — interpolating the playhead locally so the
 * timeline moves smoothly between polls.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new NowPlayingFace(canvas, { motion: true })
face.setState(createNowPlayingState())
face.start()

new ResizeObserver(() => face.resize()).observe(canvas)

const stream = new EventSource('/events')

stream.addEventListener('message', (event) => {
  try {
    // One stream feeds every overlay; keep only the frames this page renders.
    const frame = JSON.parse((event as MessageEvent<string>).data) as {
      channel: string
      payload: unknown
    }
    if (frame.channel !== 'nowplaying') return
    face.setState(frame.payload as NowPlayingState)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good state.
  }
})
