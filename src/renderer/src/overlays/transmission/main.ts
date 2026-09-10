import type { NowPlayingState } from '@shared/domain/nowplaying'
import { createNowPlayingState, pickNowPlayingSource } from '@shared/domain/nowplaying.constants'
import { NowPlayingFace } from '@renderer/nowplaying/nowplaying-renderer'
import './transmission.scss'

/**
 * NOW TRANSMITTING browser source.
 *
 * Silent, transparent and read-only. It knows nothing about Spotify: the main
 * process polls, inlines the cover art and pushes state, and this page draws
 * whatever the last frame said — interpolating the playhead locally so the
 * timeline moves smoothly between polls.
 *
 * **Which presentation it draws comes from its own address.** The operator
 * configures a source per kind of music and points each scene at the one that
 * fits, so `?source=lofi` and `?source=hardstyle` are two browser sources
 * rendering one live playback two different ways, off one poll and one built
 * document.
 *
 * A query parameter rather than a path segment, unlike THE CONCORD's two
 * layouts. Those are a fixed pair declared in the overlay registry and served
 * at their own slugs; these are operator-defined and there are as many as they
 * make, which the server's URL table cannot know ahead of time.
 */

const requested = new URLSearchParams(window.location.search).get('source')

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new NowPlayingFace(canvas, { motion: true })

/**
 * Resolves the address to a presentation and hands both to the face.
 *
 * `pickNowPlayingSource` falls back to the first source rather than to nothing,
 * so a scene pointed at the bare document — or at a slug the operator has since
 * removed — draws something recognisable instead of going blank mid-broadcast.
 */
function apply(state: NowPlayingState): void {
  const source = pickNowPlayingSource(state.sources, requested)
  if (source) face.setConfig(source.config)
  face.setState(state)
}

apply(createNowPlayingState())
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
    apply(frame.payload as NowPlayingState)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good state.
  }
})
