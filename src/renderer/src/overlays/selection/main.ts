import type { RiteState } from '@shared/domain/rite'
import { createEmptyRiteState, petitionOdds } from '@shared/domain/rite.constants'
import { RiteWheel } from '@renderer/rite/wheel-renderer'
import './selection.scss'

/**
 * RESONANCE SELECTION — browser source.
 *
 * One document per overlay, declared in the shared overlay registry and served
 * by the overlay server at its slug. Each is a separate OBS browser source, so
 * they are separate builds rather than one page switching modes.
 *
 * Deliberately not React. This page is a canvas, a heading and a list, it runs
 * for the length of a broadcast inside an OBS browser source, and it shares its
 * only complicated part — the ring — with the console through
 * `rite/wheel-renderer.ts`. A framework would add a bundle to serve and a render
 * cycle to reason about, and buy nothing.
 *
 * There is no preload and no IPC here: this is a real browser page. Its one
 * channel is the server-sent event stream, which `EventSource` reconnects on its
 * own — worth having, because OBS tears a browser source down and rebuilds it on
 * every scene change and every cache refresh.
 *
 * `?transparent=1` drops the backdrop so the ring composites over the scene.
 * The default is opaque, so that opening the address in an ordinary browser to
 * check it shows the overlay as designed rather than on white.
 */

const params = new URLSearchParams(window.location.search)

/**
 * Per-source override for compositing.
 *
 * Presentation normally comes from the rite config, so it is editable in the
 * console. This flag stays because two browser sources can point at the same
 * overlay and want different compositing — a full-scene copy and a corner copy.
 * Present means forced on; absent means follow the config.
 */
const forceTransparent = params.get('transparent') === '1'
if (params.get('guides') === '1') {
  document.documentElement.dataset.guides = 'true'
}

const root = document.querySelector<HTMLDivElement>('#overlay')
if (!root) throw new Error('Overlay root missing.')

root.innerHTML = `
  <div class="shell">
    <aside class="roster" aria-label="Filed petitions">
      <p class="rosterLabel">Petitions filed</p>
      <ol class="rosterList"></ol>
    </aside>

    <div class="content">
      <header class="masthead">
        <p class="eyebrow">Sonoalchemy &middot; Observatory</p>
        <h1 class="title"></h1>
        <p class="prompt"></p>
        <span class="rule"></span>
      </header>

      <div class="stage">
        <canvas class="ring"></canvas>
      </div>

      <footer class="status">
        <span class="statusDot" data-state="pending"></span>
        <span class="statusText">Attaching&hellip;</span>
      </footer>
    </div>

    <div class="guide" aria-hidden="true"><span class="guideLabel">Reserved</span></div>
  </div>
`

const mastheadEl = root.querySelector<HTMLElement>('.masthead')!
const statusEl = root.querySelector<HTMLElement>('.status')!
const titleEl = root.querySelector<HTMLElement>('.title')!
const promptEl = root.querySelector<HTMLElement>('.prompt')!
const rosterEl = root.querySelector<HTMLElement>('.roster')!
const rosterListEl = root.querySelector<HTMLOListElement>('.rosterList')!
const canvasEl = root.querySelector<HTMLCanvasElement>('.ring')!
const statusDotEl = root.querySelector<HTMLElement>('.statusDot')!
const statusTextEl = root.querySelector<HTMLElement>('.statusText')!

const wheel = new RiteWheel(canvasEl, { motion: true })
wheel.start()

// The canvas is sized by CSS from the viewport, which OBS can change at any
// time by resizing the source.
new ResizeObserver(() => wheel.resize()).observe(canvasEl)

/** Last roster revision rendered, so a heartbeat does not rebuild the list. */
let renderedRevision = -1

/** Last theme applied, so the ring only re-reads its palette when it changes. */
let renderedTheme: string | null = null

function renderChrome(next: RiteState): void {
  const { config } = next
  const root = document.documentElement

  titleEl.textContent = config.title
  promptEl.textContent = config.prompt

  mastheadEl.hidden = !config.showMasthead
  statusEl.hidden = !config.showStatus
  rosterEl.hidden = !config.showRoster

  // Published on the root so the shell can collapse to a single column rather
  // than holding an empty track open where the roster used to be.
  root.dataset.roster = config.showRoster ? 'on' : 'off'
  root.dataset.rosterSide = config.rosterSide
  root.dataset.theme = config.theme
  root.dataset.transparent = forceTransparent || config.transparent ? 'true' : 'false'

  // The presets re-skin the ring through `--ch-ring-*` properties, which the
  // renderer reads once and caches. Setting the attribute above is not enough
  // on its own; it has to be told to look again — and only when the preset
  // actually changed, since re-reading forces a style recalculation.
  if (renderedTheme !== config.theme) {
    renderedTheme = config.theme
    wheel.refreshPalette()
  }

  // Published as a percentage on the root so both the shell's padding and the
  // guide read one value.
  document.documentElement.style.setProperty(
    '--ch-overlay-reserve',
    `${(next.config.reserveRight * 100).toFixed(3)}%`
  )
}

/**
 * Rebuilds the roster column.
 *
 * Only called when the revision changes. Rebuilding on every frame — or on
 * every heartbeat — would drop the list's own transitions and thrash the DOM
 * during a spin, which is the one moment nothing else should be competing for
 * the compositor.
 */
function renderRoster(next: RiteState): void {
  const odds = petitionOdds(next.petitions)
  rosterListEl.replaceChildren(
    ...next.petitions.map((petition, index) => {
      const row = document.createElement('li')
      row.className = 'rosterRow'
      if (next.winner?.petitionId === petition.id) row.dataset.winner = 'true'
      if (!next.config.showOdds) row.dataset.bare = 'true'

      const number = document.createElement('span')
      number.className = 'rosterIndex'
      number.textContent = String(index + 1).padStart(2, '0')

      const label = document.createElement('span')
      label.className = 'rosterName'
      label.textContent = petition.label

      row.append(number, label)

      if (next.config.showOdds) {
        const chance = document.createElement('span')
        chance.className = 'rosterOdds'
        chance.textContent = `${(odds[index] * 100).toFixed(odds[index] < 0.1 ? 1 : 0)}%`
        row.append(chance)
      }

      return row
    })
  )
}

function apply(next: RiteState): void {
  renderChrome(next)

  if (next.revision !== renderedRevision) {
    renderedRevision = next.revision
    renderRoster(next)
  }

  wheel.setState({
    petitions: next.petitions,
    phase: next.phase,
    spin: next.spin,
    winnerIndex: next.winner?.index ?? null,
    winnerLabel: next.winner?.label ?? null,
    showField: next.config.showField
  })

  document.documentElement.dataset.phase = next.phase
}

function setStatus(tone: 'online' | 'pending' | 'error', text: string): void {
  statusDotEl.dataset.state = tone
  statusTextEl.textContent = text
}

const stream = new EventSource('/rite/stream')

stream.addEventListener('open', () => {
  setStatus('online', 'Attached')
})

stream.addEventListener('message', (event) => {
  try {
    apply(JSON.parse((event as MessageEvent<string>).data) as RiteState)
    setStatus('online', 'Attached')
  } catch {
    // A malformed frame must not take the overlay down mid-broadcast; the next
    // one will be well-formed, and the ring keeps rendering the last good state.
    setStatus('error', 'Bad frame')
  }
})

stream.addEventListener('error', () => {
  // EventSource retries on its own using the `retry` interval the server sends,
  // so this only reports the gap rather than trying to reconnect.
  setStatus('pending', 'Reattaching…')
})

// Keeps the ring's palette current if the theme is ever driven from the host.
window.addEventListener('focus', () => wheel.refreshPalette())

apply(createEmptyRiteState())
