import type { MusterState } from '@shared/domain/muster'
import { MUSTER_LAYOUTS, createEmptyMusterState } from '@shared/domain/muster.constants'
import type { MusterLayout } from '@shared/domain/muster.constants'
import { resolveOverlayAddress } from '@shared/domain/overlays'
import { MusterFace } from '@renderer/muster/muster-renderer'
import './muster.scss'

/**
 * THE MUSTER — browser source.
 *
 * One canvas, as the rest of the kit is. Everything visible — the question,
 * the roll, the clock, the resonance field behind them — is drawn by
 * `muster/muster-renderer.ts`, which the console preview drives too. One
 * implementation of the composition rather than a canvas and a parallel DOM
 * layout that would have to be kept looking the same.
 *
 * No preload and no IPC: this is a real browser page, and its one channel is
 * the server-sent event stream. `EventSource` reconnects on its own, which is
 * worth having because OBS tears a browser source down and rebuilds it on
 * every scene change and every cache refresh.
 */

/**
 * Which layout this source draws, taken from the address it was loaded at.
 *
 * `/muster` is the full scene and `/muster-widget` the corner plate, both
 * served off this one document. Read from the path rather than a query
 * parameter — the same choice THE CONCORD makes — so the address the console
 * hands over is the whole configuration for that source, and both can run at
 * once off one call.
 */
function resolveLayout(): MusterLayout {
  const segment = window.location.pathname.replace(/^\/+/, '').split('/')[0]
  const pin = resolveOverlayAddress(segment)?.address.pin
  return MUSTER_LAYOUTS.find((layout) => layout === pin) ?? 'full'
}

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new MusterFace(canvas, { motion: true, layout: resolveLayout() })

// Painted immediately with an empty call rather than left blank, so a source
// added to a scene before anything has been called shows the resting state
// instead of nothing at all.
face.setState(createEmptyMusterState())
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
    if (frame.channel !== 'muster') return
    face.setState(frame.payload as MusterState)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good state.
  }
})
