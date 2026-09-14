import './enclosure.scss'

/**
 * THE ENCLOSURE — the standing frame.
 *
 * The one browser source in the kit with no live state. Every other overlay
 * opens the local event stream and redraws as the operator works; this one is
 * settled entirely by the address it was requested at, which is why it has no
 * `EventSource` and why its document forbids `connect-src` outright.
 *
 * That also makes it the only overlay an operator can run two of at once with
 * different settings, because the setting *is* the URL — see the note on
 * `OverlayAddress` in shared/domain/overlays.ts, which makes the same argument
 * for THE CONCORD's widget.
 */

const params = new URLSearchParams(window.location.search)

/*
 * Opaque by default, as everywhere else in the kit: opening the address in an
 * ordinary browser to check it should show the frame as designed rather than
 * as four gold marks on white.
 */
if (params.get('transparent') === '1') {
  document.documentElement.dataset.transparent = 'true'
}

// The same flag the selection scene carries, for cutting the scene in OBS.
if (params.get('guides') === '1') {
  document.documentElement.dataset.guides = 'true'
}

if (params.get('air') === '1') {
  document.documentElement.dataset.air = 'true'
}

/**
 * Writes an address-supplied string into the plinth.
 *
 * `textContent` rather than `innerHTML`, and that is load-bearing rather than
 * stylistic: these values arrive from a query string that anything on the
 * machine can compose, and a frame that renders markup from its own URL is an
 * injection waiting for somebody to paste the wrong link into OBS.
 *
 * Length is capped because the plinth is a fixed bar on a fixed stage. An
 * over-long marque would push the numeral off the canvas, and silently
 * truncating is kinder than a frame that looks broken on air.
 */
function setText(id: string, value: string | null, fallback: string, limit: number): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)
  if (!node) return
  const text = (value ?? '').trim() || fallback
  node.textContent = text.slice(0, limit).toUpperCase()
}

setText('marque', params.get('marque'), 'CANDY HEIST', 32)
setText('section', params.get('section'), '§01', 8)

/**
 * Fits the fixed 1920×1080 stage to whatever viewport it was given.
 *
 * The stage is laid out at true broadcast size and scaled as a whole, rather
 * than being sized in viewport units. Two reasons: every measurement in the
 * stylesheet stays a real pixel count that can be reasoned about against the
 * canvas, and the frame stays geometrically identical at any source size — a
 * bracket that is 120px at 1920 is 60px at 960, not a different shape.
 *
 * `min` of the two ratios rather than stretching, so a source cut at the wrong
 * aspect letterboxes instead of distorting the brackets.
 */
const stage = document.querySelector<HTMLElement>('#stage')
if (!stage) throw new Error('Enclosure stage missing.')

function fit(): void {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
  stage!.style.setProperty('--ch-stage-scale', String(scale))
}

fit()
new ResizeObserver(fit).observe(document.documentElement)
