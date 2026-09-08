import type { ConcordLayout, ConcordState } from '@shared/domain/concord'
import { CONCORD_LAYOUTS, createEmptyConcordState } from '@shared/domain/concord.constants'
import { resolveOverlayAddress } from '@shared/domain/overlays'
import { ConcordFace } from '@renderer/concord/tally-renderer'
import './concord.scss'

/**
 * THE CONCORD — browser source.
 *
 * Deliberately not React, and here that is barely a decision: the page is one
 * canvas. Everything visible — masthead, ballot, countdown, footer, the casting
 * — is drawn by `concord/tally-renderer.ts`, which the console preview drives
 * too. So there is one implementation of the composition rather than a canvas
 * plus a parallel DOM layout that would have to be kept looking the same.
 *
 * There is no preload and no IPC here: this is a real browser page. Its one
 * channel is the server-sent event stream, which `EventSource` reconnects on its
 * own — worth having, because OBS tears a browser source down and rebuilds it on
 * every scene change and every cache refresh.
 */

const params = new URLSearchParams(window.location.search)

/**
 * Per-source override for compositing.
 *
 * Presentation normally comes from the poll's config, so it is editable in the
 * console. This flag stays because two browser sources can point at the same
 * overlay and want different compositing — a full-scene copy and a corner copy.
 * Present means forced on; absent means follow the config.
 */
const forceTransparent = params.get('transparent') === '1'

/**
 * Which layout this source draws, taken from the address it was loaded at.
 *
 * `/concord` is the full scene and `/concord-widget` is the corner plate, both
 * served off this one document. Reading it from the path rather than a query
 * parameter — the same choice the countdowns make for their timer id — means the
 * address the console hands over is the whole configuration for that source, and
 * that both can run at once off one live poll.
 *
 * Falls back to the full scene rather than failing: a source pointed straight at
 * the document should render something recognisable instead of a blank scene.
 */
function resolveLayout(): ConcordLayout {
  const segment = window.location.pathname.replace(/^\/+/, '').split('/')[0]
  const pin = resolveOverlayAddress(segment)?.address.pin
  return CONCORD_LAYOUTS.find((layout) => layout === pin) ?? 'full'
}

const layout = resolveLayout()

const canvas = document.querySelector<HTMLCanvasElement>('#face')
if (!canvas) throw new Error('Overlay canvas missing.')

const face = new ConcordFace(canvas, { motion: true, layout })

function apply(state: ConcordState): void {
  face.setState(
    forceTransparent ? { ...state, config: { ...state.config, transparent: true } } : state
  )
}

// Painted immediately with an empty poll rather than left blank, so a source
// added to a scene before the operator has filed anything shows the overlay's
// resting state instead of nothing at all.
apply(createEmptyConcordState())
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
    if (frame.channel !== 'concord') return
    apply(frame.payload as ConcordState)
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the face
    // keeps rendering the last good state and the next frame will be sound.
    // This matters more here than elsewhere in the kit: frames arrive up to
    // eight times a second for the length of a poll, so anything that throws
    // per frame would throw a great many times.
  }
})
