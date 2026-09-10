import type { MusterEntry, MusterState } from '@shared/domain/muster'
import type { MusterLayout } from '@shared/domain/muster.constants'
import {
  ARRIVAL_MS,
  MUSTER_PHASE_LABEL,
  fileInstruction,
  musterAtRest,
  remainingAt
} from '@shared/domain/muster.constants'
import { readCustomProperty, withAlpha } from '@renderer/overlays/colour'

/**
 * THE MUSTER — browser source.
 *
 * An open call, drawn. The question stands at the top, the roll fills beneath
 * it as chat files, and a clock runs the call down. When it closes the roll
 * holds, then the overlay returns to rest.
 *
 * ## The picture
 *
 * The brief's Processing Floor — "mortals reduced to data; choices measured" —
 * so the roll is a **ledger**, numbered and ruled, and every entry is credited
 * to the citizen who filed it. Institutional rather than playful: this is a
 * bureaucracy taking submissions, not a scoreboard.
 *
 * Behind it, a resonance field: nodes for every entry, joined where they are
 * close, with each new filing arriving as a bright node that settles into the
 * network. That is the lore's one claim about matter — everything sharing an
 * underlying frequency — used here to say something true about the thing being
 * drawn. The roll *is* the network, and it grows in front of the audience.
 *
 * ## Two layouts, one document
 *
 * `full` is a scene of its own; `widget` is a corner plate for a working
 * scene. Same state, same renderer, chosen by the address the source was
 * loaded at — the arrangement THE CONCORD already uses, and for the same
 * reason: two addresses off one poll rather than two pages to keep in step.
 *
 * ## Written the way the rest of the kit is
 *
 * Glyph-by-glyph tracked text, because canvas `letterSpacing` is not in the
 * Chromium an OBS browser source ships. No `shadowBlur`; everything soft is a
 * pre-rendered sprite. Nothing allocates per frame.
 */

const TAU = Math.PI * 2

const FALLBACK = {
  obsidian: '#0c0c0c',
  slab: '#111011',
  slabRaised: '#171517',
  concrete: '#6f6656',
  brass: '#5e472c',
  gold: '#976b30',
  goldLit: '#d2a961',
  goldHot: '#e3c286',
  crimson: '#a32b23',
  crimsonHot: '#c4453a',
  alabaster: '#ddcfb2',
  line: 'rgba(255,255,255,0.08)',
  // The three faces, read from CSS so the overlay and the console set type
  // identically. A browser source loads the same stylesheet the app does.
  display: 'system-ui, sans-serif',
  body: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace'
}

type Palette = typeof FALLBACK

interface Node {
  /** Normalised position in the field, 0..1 both axes. */
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  /** The entry this node stands for, or null for the ambient population. */
  entryId: string | null
  /** Seconds since it appeared, for the arrival flare. */
  age: number
}

export interface MusterFaceOptions {
  motion?: boolean
  layout?: MusterLayout
}

export class MusterFace {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private palette: Palette

  private state: MusterState | null = null
  private layout: MusterLayout
  private motion: boolean

  private width = 0
  private height = 0
  private running = false
  private frameHandle = 0
  private lastFrameAt = 0
  private elapsed = 0

  private nodes: Node[] = []
  /** Entry ids already given a node, so a rebuild does not duplicate them. */
  private known = new Set<string>()

  private spark: HTMLCanvasElement | null = null
  private flare: HTMLCanvasElement | null = null

  constructor(canvas: HTMLCanvasElement, options: MusterFaceOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.layout = options.layout ?? 'full'
    this.motion = options.motion ?? true
    this.palette = readPalette(document.documentElement)

    this.buildSprites()
    this.resize()
  }

  setLayout(layout: MusterLayout): void {
    this.layout = layout
  }

  setMotion(enabled: boolean): void {
    this.motion = enabled
  }

  /**
   * Takes a new state, and gives any new entry a node.
   *
   * Nodes are *added* rather than rebuilt from the roll each time: an entry
   * that has been on screen for a minute has drifted somewhere, and rebuilding
   * would teleport the whole network every time somebody typed.
   */
  setState(state: MusterState): void {
    this.state = state

    const live = new Set(state.entries.map((entry) => entry.id))

    // Gone from the roll — moderated away, or the roll was cleared.
    this.nodes = this.nodes.filter((node) => node.entryId === null || live.has(node.entryId))
    for (const id of this.known) if (!live.has(id)) this.known.delete(id)

    for (const entry of state.entries) {
      if (this.known.has(entry.id)) continue
      this.known.add(entry.id)
      this.nodes.push(this.makeNode(entry.id))
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameAt = performance.now()

    const tick = (now: number): void => {
      if (!this.running) return
      this.frame(now)
      this.frameHandle = requestAnimationFrame(tick)
    }

    this.frameHandle = requestAnimationFrame(tick)
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)

    // The ambient population is topped up rather than replaced, so a resize
    // does not scatter a network the audience is watching.
    const ambient = this.nodes.filter((node) => node.entryId === null).length
    for (let i = ambient; i < 34; i += 1) this.nodes.push(this.makeNode(null))
  }

  private makeNode(entryId: string | null): Node {
    return {
      x: Math.random(),
      y: Math.random(),
      // Slow. This is a field, not a screensaver.
      vx: (Math.random() - 0.5) * 0.016,
      vy: (Math.random() - 0.5) * 0.016,
      phase: Math.random() * TAU,
      entryId,
      age: 0
    }
  }

  private buildSprites(): void {
    const soft = (size: number, colour: string, stops: [number, number][]): HTMLCanvasElement => {
      const tile = document.createElement('canvas')
      tile.width = size
      tile.height = size

      const context = tile.getContext('2d')
      if (!context) return tile

      const half = size / 2
      const gradient = context.createRadialGradient(half, half, 0, half, half, half)
      for (const [offset, alpha] of stops) gradient.addColorStop(offset, withAlpha(colour, alpha))
      context.fillStyle = gradient
      context.fillRect(0, 0, size, size)
      return tile
    }

    this.spark = soft(32, this.palette.goldHot, [
      [0, 1],
      [0.3, 0.4],
      [1, 0]
    ])
    this.flare = soft(96, this.palette.crimsonHot, [
      [0, 0.9],
      [0.22, 0.3],
      [1, 0]
    ])
  }

  // -------------------------------------------------------------------- frame

  private frame(now: number): void {
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now
    if (this.motion) this.elapsed += delta

    const { context } = this
    if (this.width <= 0 || this.height <= 0) return

    context.clearRect(0, 0, this.width, this.height)

    const state = this.state
    if (!state) return

    const wall = Date.now()

    /*
     * At rest, the overlay stays on screen and shows that it is waiting.
     *
     * The same decision THE CONCORD reached: a source that vanishes between
     * calls reads as broken rather than as idle, and the operator composites
     * this into a scene once and leaves it there.
     */
    const resting = musterAtRest(state, wall)

    if (!state.config.transparent) {
      context.fillStyle = this.palette.obsidian
      context.fillRect(0, 0, this.width, this.height)
    }

    if (state.config.showField) this.drawField(delta, state, resting)

    if (this.layout === 'widget') this.drawWidget(state, wall, resting)
    else this.drawFull(state, wall, resting)
  }

  /**
   * The resonance field: one node per entry, plus an ambient population.
   *
   * Connections are tested in normalised space and scaled by the *shorter*
   * side, so the network keeps its density at any aspect rather than becoming
   * a web on a wide frame and a scatter on a tall one.
   */
  private drawField(delta: number, state: MusterState, resting: boolean): void {
    const { context } = this
    if (!this.spark || !this.flare) return

    const drift = this.motion ? delta : 0
    const unit = Math.min(this.width, this.height)
    const reach = 0.22
    const reachSquared = reach * reach
    // The field brightens while a call is open: the network is *live*.
    const energy = state.phase === 'open' ? 1 : resting ? 0.4 : 0.7

    for (const node of this.nodes) {
      node.x += node.vx * drift
      node.y += node.vy * drift
      node.phase += drift * 0.5
      node.age += drift

      // Wrapped, not bounced: a bounce puts a visible edge on the frame.
      if (node.x < -0.05) node.x = 1.05
      if (node.x > 1.05) node.x = -0.05
      if (node.y < -0.05) node.y = 1.05
      if (node.y > 1.05) node.y = -0.05
    }

    context.globalCompositeOperation = 'lighter'
    context.lineWidth = Math.max(unit / 1400, 0.5)

    for (let i = 0; i < this.nodes.length; i += 1) {
      const a = this.nodes[i]
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const b = this.nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = dx * dx + dy * dy
        if (distance > reachSquared) continue

        const closeness = 1 - distance / reachSquared
        // A link between two *entries* is brighter than one to the ambient
        // population: the roll is the subject, and the rest is atmosphere.
        const filed = a.entryId !== null && b.entryId !== null
        context.strokeStyle = withAlpha(
          filed ? this.palette.goldLit : this.palette.gold,
          closeness * closeness * (filed ? 0.3 : 0.13) * energy
        )
        context.beginPath()
        context.moveTo(a.x * this.width, a.y * this.height)
        context.lineTo(b.x * this.width, b.y * this.height)
        context.stroke()
      }
    }

    for (const node of this.nodes) {
      const x = node.x * this.width
      const y = node.y * this.height
      const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 0.9 + node.phase)

      if (node.entryId !== null) {
        // A new filing lands hot and cools into the network over a couple of
        // seconds — the one moment the audience should see their entry arrive.
        const arrival = Math.max(1 - (node.age * 1000) / ARRIVAL_MS, 0)
        if (arrival > 0) {
          const size = unit * (0.02 + arrival * 0.09)
          context.globalAlpha = arrival * 0.8 * energy
          context.drawImage(this.flare, x - size / 2, y - size / 2, size, size)
        }

        context.globalAlpha = Math.min((0.5 + arrival * 0.5) * pulse * energy, 1)
        const size = Math.max(unit * 0.012, 3)
        context.drawImage(this.spark, x - size / 2, y - size / 2, size, size)
      } else {
        context.globalAlpha = Math.min(0.22 * pulse * energy, 1)
        const size = Math.max(unit * 0.006, 1.5)
        context.drawImage(this.spark, x - size / 2, y - size / 2, size, size)
      }
    }

    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
  }

  // --------------------------------------------------------------- the scene

  private drawFull(state: MusterState, wall: number, resting: boolean): void {
    const { context, palette } = this
    const pad = Math.max(Math.min(this.width, this.height) * 0.055, 18)
    const usable = this.width * (1 - clamp01(state.config.reserveRight))
    const left = pad
    const right = Math.max(usable - pad, left + 60)
    const width = right - left
    const unit = Math.max(Math.min(this.width, this.height) * 0.02, 11)

    /*
     * The apparatus, before any text.
     *
     * The brief is a world of monumental architecture and one suspended focal
     * object, and a list of song titles on a black rectangle is neither. So
     * the frame is *built* first — registration marks at the corners, a ribbed
     * rule under the masthead, a mandala behind the question — and the roll is
     * then filed into it.
     */
    this.drawCorners(left, pad, right, this.height - pad, unit)
    // Centred on the plate rather than on the question: at this size it is
    // architecture the whole scene is mounted on, and putting it behind the
    // first three rows only made it look like a mistake in the ledger.
    if (!resting) {
      this.drawMandala(
        left + width * 0.5,
        pad + (this.height - pad * 2) * 0.56,
        Math.min(width, this.height - pad * 2) * 0.42,
        state
      )
    }

    let cursor = pad + unit

    // -------------------------------------------------------------- masthead

    // The sigil: a small filled diamond, the same mark the console rail uses
    // for a live department. An institution signs its documents.
    context.fillStyle = withAlpha(palette.goldLit, 0.9)
    context.save()
    context.translate(left + unit * 0.3, cursor - unit * 0.24)
    context.rotate(Math.PI / 4)
    context.fillRect(-unit * 0.19, -unit * 0.19, unit * 0.38, unit * 0.38)
    context.restore()

    this.tracked(
      state.config.title.toUpperCase(),
      left + unit,
      cursor,
      unit * 0.82,
      0.26,
      'display'
    )

    if (state.config.showCount) {
      const count = `${String(state.entries.length).padStart(2, '0')} / ${state.config.maxEntries}`
      context.fillStyle = withAlpha(palette.concrete, 0.9)
      context.textAlign = 'right'
      context.font = `${unit * 0.8}px ${palette.mono}`
      context.fillText(count, right, cursor)
      context.textAlign = 'left'
    }

    cursor += unit * 0.7

    /*
     * A ribbed rule rather than a hairline.
     *
     * The reference boards' gold is structural ribbing, not trim — so the rule
     * under the masthead is a line with ticks hung off it at a fixed interval,
     * which reads as a measured edge rather than as a border.
     */
    this.ribbedRule(left, cursor, width, unit)
    cursor += unit * 1.9

    // ------------------------------------------------------------ the question

    if (resting) {
      this.drawResting(left, cursor, width, unit, state)
      this.drawFooter(state, left, this.height - pad, width, unit, wall)
      return
    }

    const question = (state.prompt || state.config.prompt).toUpperCase()
    context.fillStyle = withAlpha(palette.alabaster, 0.96)
    this.tracked(
      this.fit(question, width, unit * 1.6, 0.14, 'display'),
      left,
      cursor,
      unit * 1.6,
      0.14,
      'display'
    )

    // A crimson rib under the question: the one saturated colour, spent on the
    // single most important line on the scene.
    context.fillStyle = withAlpha(palette.crimsonHot, 0.75)
    context.fillRect(left, cursor + unit * 0.5, unit * 2.6, 2)

    cursor += unit * 2.4

    // ---------------------------------------------------------------- the roll

    const footRoom = unit * 4
    const room = Math.max(this.height - pad - footRoom - cursor, unit * 4)
    this.drawRoll(state, left, cursor, width, room, unit)

    this.drawFooter(state, left, this.height - pad, width, unit, wall)
  }

  /**
   * Registration marks at the four corners.
   *
   * Corner ticks rather than a full border. A rectangle around a broadcast
   * overlay is a box; four right angles are a *plate* — the frame is implied
   * and the scene keeps breathing through the edges.
   */
  private drawCorners(x1: number, y1: number, x2: number, y2: number, unit: number): void {
    const { context, palette } = this
    const arm = unit * 1.3

    context.strokeStyle = withAlpha(palette.gold, 0.32)
    context.lineWidth = 1

    for (const [x, y, dx, dy] of [
      [x1, y1, 1, 1],
      [x2, y1, -1, 1],
      [x1, y2, 1, -1],
      [x2, y2, -1, -1]
    ]) {
      context.beginPath()
      context.moveTo(x + dx * arm, y)
      context.lineTo(x, y)
      context.lineTo(x, y + dy * arm)
      context.stroke()
    }
  }

  /** A measured rule: a line with ticks hung off it at a fixed interval. */
  private ribbedRule(x: number, y: number, width: number, unit: number): void {
    const { context, palette } = this

    context.fillStyle = withAlpha(palette.gold, 0.3)
    context.fillRect(x, y, width, 1)

    const step = unit * 1.6
    context.fillStyle = withAlpha(palette.gold, 0.22)
    for (let at = 0; at <= width; at += step) {
      // Every fourth tick is longer, so the rule reads as graduated rather
      // than as a row of identical marks.
      const long = Math.round(at / step) % 4 === 0
      context.fillRect(x + at, y, 1, long ? unit * 0.5 : unit * 0.26)
    }
  }

  /**
   * Concentric rings behind the question — the focal object.
   *
   * Sacred geometry as apparatus: three rings on a shared centre, one of them
   * graduated, turning at different rates. Drawn *behind* the type at low
   * alpha so it reads as architecture the text is mounted on rather than as
   * decoration laid over it.
   *
   * It quickens while the call is open. The instrument is running.
   */
  private drawMandala(cx: number, cy: number, radius: number, state: MusterState): void {
    const { context, palette } = this
    const live = state.phase === 'open' ? 1 : 0.45
    const spin = this.elapsed * (state.phase === 'open' ? 0.16 : 0.05)

    context.save()
    context.globalCompositeOperation = 'lighter'

    for (const [scale, speed, alpha] of [
      [1, 1, 0.16],
      [0.74, -0.7, 0.12],
      [0.46, 1.6, 0.1]
    ]) {
      context.strokeStyle = withAlpha(palette.gold, alpha * live)
      context.lineWidth = 1
      context.beginPath()
      context.arc(cx, cy, radius * scale, 0, TAU)
      context.stroke()

      // Twelve stations on each ring. An instrument is graduated; a hoop is not.
      const angle = spin * speed
      context.fillStyle = withAlpha(palette.goldLit, alpha * 2.2 * live)
      for (let i = 0; i < 12; i += 1) {
        const at = angle + (i / 12) * TAU
        const r = radius * scale
        context.fillRect(cx + Math.cos(at) * r - 1, cy + Math.sin(at) * r - 1, 2, 2)
      }
    }

    context.restore()
  }

  /** Nothing has been called. The apparatus waits, and says so. */
  private drawResting(x: number, y: number, width: number, unit: number, state: MusterState): void {
    const { context, palette } = this

    this.drawMandala(x + width * 0.5, y + unit * 4.6, unit * 5.2, state)

    context.fillStyle = withAlpha(palette.concrete, 0.8)
    this.tracked(MUSTER_PHASE_LABEL.idle, x, y + unit, unit * 1.1, 0.2, 'display')

    context.fillStyle = withAlpha(palette.concrete, 0.5)
    this.tracked('THE ROLL STANDS EMPTY', x, y + unit * 2.4, unit * 0.72, 0.24, 'display')
  }

  /**
   * The roll, as a numbered ledger.
   *
   * Two columns once one will not hold the entries, which is the whole reason
   * the row height is computed from the room rather than fixed: a call that
   * fills up should get tighter, not scroll — a browser source has no
   * scrollbar and nobody is going to touch it mid-broadcast.
   */
  private drawRoll(
    state: MusterState,
    x: number,
    y: number,
    width: number,
    height: number,
    unit: number
  ): void {
    const { context, palette } = this
    const entries = state.entries

    if (entries.length === 0) {
      context.fillStyle = withAlpha(palette.concrete, 0.7)
      this.tracked(
        state.phase === 'open' ? 'THE ROLL IS EMPTY. BE FIRST.' : 'NOTHING WAS FILED.',
        x,
        y + unit * 1.5,
        unit * 0.9,
        0.24,
        'display'
      )
      return
    }

    const columns = entries.length > 12 ? 2 : 1
    const gutter = unit * 2
    const columnWidth = (width - (columns - 1) * gutter) / columns
    const perColumn = Math.ceil(entries.length / columns)
    /*
     * Rows fill the room they are given.
     *
     * Capped tight, a short roll left the bottom half of the plate empty and
     * the whole thing read as a list that had been pushed to the top. The
     * ceiling is now generous enough that seven entries fill a 16:9 frame and
     * forty still fit, because the height is divided by the column length
     * rather than fixed.
     */
    const rowHeight = Math.min(Math.max(height / perColumn, unit * 1.2), unit * 3.2)

    // A rule down the gutter, joining the rows into one ledger rather than two
    // lists that happen to sit beside each other.
    if (columns === 2) {
      const gutterX = x + columnWidth + gutter / 2
      this.context.fillStyle = withAlpha(this.palette.gold, 0.16)
      this.context.fillRect(gutterX, y - unit * 0.6, 1, Math.min(perColumn * rowHeight, height))
    }

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      const column = Math.floor(i / perColumn)
      const row = i % perColumn

      const rowX = x + column * (columnWidth + gutter)
      const rowY = y + row * rowHeight + rowHeight * 0.72
      if (rowY > y + height + rowHeight) continue

      this.drawEntry(entry, rowX, rowY, columnWidth, unit, i + 1, state, rowHeight)
    }
  }

  private drawEntry(
    entry: MusterEntry,
    x: number,
    y: number,
    width: number,
    unit: number,
    index: number,
    state: MusterState,
    /** The room this row was given, so the plate fills it. */
    slot: number
  ): void {
    const { context, palette } = this

    // Fresh entries are lit, then settle. The same two seconds the field's
    // arrival flare uses, so the two read as one event.
    const arrival = Math.max(1 - (Date.now() - entry.at) / ARRIVAL_MS, 0)
    // The plate fills its slot, less a hairline of breathing room, so a roll
    // of seven and a roll of forty both look deliberate.
    const rowHeight = Math.max(slot - 2, unit * 1.02)
    const rowTop = y - rowHeight * 0.72

    /*
     * A slab per row, not a bare line of text.
     *
     * The reference boards are stacked stone. A row that is a *plate* — a
     * faint fill, a hairline under it, a rib down its left edge — reads as a
     * record filed into an apparatus, which is the whole conceit. A row that
     * is only type reads as a chat log.
     */
    context.fillStyle = withAlpha(palette.slabRaised, index % 2 === 0 ? 0.5 : 0.28)
    context.fillRect(x, rowTop, width, rowHeight)

    // The rib. Crimson while the entry is arriving, then gold: the audience
    // sees their own filing land and then take its place in the record.
    context.fillStyle = withAlpha(
      arrival > 0 ? palette.crimsonHot : palette.gold,
      0.28 + arrival * 0.7
    )
    context.fillRect(x, rowTop, 2, rowHeight)

    // The numeral, in its own cell against the rib. Tabular, so the column
    // does not shift width as the roll climbs past nine.
    const numeral = String(index).padStart(2, '0')
    context.fillStyle = withAlpha(palette.gold, 0.55 + arrival * 0.4)
    context.font = `${unit * 0.7}px ${palette.mono}`
    context.textAlign = 'right'
    context.fillText(numeral, x + unit * 1.6, y)
    context.textAlign = 'left'

    // A hairline between numeral and entry, continuing the vertical rule the
    // whole column shares.
    context.fillStyle = withAlpha(palette.gold, 0.14)
    context.fillRect(x + unit * 1.95, rowTop + rowHeight * 0.16, 1, rowHeight * 0.68)

    const textX = x + unit * 2.4
    const authorWidth = state.config.showAuthors ? unit * 5.4 : 0
    const textWidth = width - (textX - x) - authorWidth - unit * 0.4

    context.fillStyle = withAlpha(arrival > 0 ? palette.goldHot : palette.alabaster, 0.94)
    context.font = `${unit * 0.9}px ${palette.body}`
    context.fillText(this.clip(entry.text, textWidth, unit * 0.9, palette.body), textX, y)

    if (state.config.showAuthors && entry.author) {
      context.fillStyle = withAlpha(palette.concrete, 0.8)
      context.font = `${unit * 0.62}px ${palette.mono}`
      context.textAlign = 'right'
      context.fillText(
        this.clip(entry.author.toUpperCase(), authorWidth - unit * 0.4, unit * 0.62, palette.mono),
        x + width - unit * 0.3,
        y
      )
      context.textAlign = 'left'
    }

    // The rule under the row, brighter while the entry is fresh.
    this.rule(x, rowTop + rowHeight, width, 0.07 + arrival * 0.2)
  }

  /** The clock, the instruction and the count. */
  private drawFooter(
    state: MusterState,
    x: number,
    bottom: number,
    width: number,
    unit: number,
    wall: number
  ): void {
    const { context, palette } = this
    let cursor = bottom

    const remaining = remainingAt(state, wall)
    if (remaining !== null) {
      const seconds = Math.ceil(remaining / 1000)
      const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

      // Crimson in the last ten seconds. The one saturated colour in the kit,
      // spent on the only moment that is actually urgent.
      context.fillStyle = withAlpha(seconds <= 10 ? palette.crimsonHot : palette.goldLit, 0.95)
      context.textAlign = 'right'
      context.font = `${unit * 1.5}px ${palette.mono}`
      context.fillText(clock, x + width, cursor)
      context.textAlign = 'left'
    }

    context.fillStyle = withAlpha(palette.concrete, 0.8)
    this.tracked(
      state.phase === 'open' ? MUSTER_PHASE_LABEL.open : MUSTER_PHASE_LABEL[state.phase],
      x,
      cursor - unit * 1.1,
      unit * 0.72,
      0.24,
      'display'
    )

    if (state.config.showInstruction && state.phase === 'open') {
      context.fillStyle = withAlpha(palette.goldLit, 0.9)
      this.tracked(fileInstruction(state.config), x, cursor, unit * 0.82, 0.2, 'display')
    } else if (state.phase === 'closed' && state.entries.length > 0) {
      context.fillStyle = withAlpha(palette.concrete, 0.85)
      const filed = `${state.entries.length} ENTERED BY ${state.citizens} ${state.citizens === 1 ? 'CITIZEN' : 'CITIZENS'}`
      this.tracked(filed, x, cursor, unit * 0.82, 0.2, 'display')
    }

    cursor -= unit * 1.1
  }

  // -------------------------------------------------------------- the widget

  /** The corner plate: the same call, reduced to what fits beside a capture. */
  private drawWidget(state: MusterState, wall: number, resting: boolean): void {
    const { context, palette } = this
    const pad = Math.max(Math.min(this.width, this.height) * 0.05, 10)
    const unit = Math.max(Math.min(this.width, this.height) * 0.055, 9)

    // A slab, so the plate reads as an object dropped onto a busy scene rather
    // than as text floating over it.
    if (!state.config.transparent) {
      context.fillStyle = withAlpha(palette.slab, 0.88)
      context.fillRect(0, 0, this.width, this.height)
      context.strokeStyle = withAlpha(palette.gold, 0.28)
      context.lineWidth = 1
      context.strokeRect(0.5, 0.5, this.width - 1, this.height - 1)
    }

    let cursor = pad + unit * 0.9

    context.fillStyle = withAlpha(palette.goldLit, 0.85)
    this.tracked(state.config.title.toUpperCase(), pad, cursor, unit * 0.62, 0.24, 'display')

    const remaining = remainingAt(state, wall)
    if (remaining !== null) {
      const seconds = Math.ceil(remaining / 1000)
      context.fillStyle = withAlpha(seconds <= 10 ? palette.crimsonHot : palette.goldLit, 0.95)
      context.textAlign = 'right'
      context.font = `${unit * 0.7}px ${palette.mono}`
      context.fillText(
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
        this.width - pad,
        cursor
      )
      context.textAlign = 'left'
    }

    cursor += unit * 0.5
    this.rule(pad, cursor, this.width - pad * 2, 0.2)
    cursor += unit * 1.1

    if (resting) {
      context.fillStyle = withAlpha(palette.concrete, 0.7)
      this.tracked('AWAITING A CALL', pad, cursor + unit * 0.4, unit * 0.6, 0.22, 'display')
      return
    }

    context.fillStyle = withAlpha(palette.alabaster, 0.9)
    context.font = `${unit * 0.72}px ${palette.body}`
    context.fillText(
      this.clip(
        state.prompt || state.config.prompt,
        this.width - pad * 2,
        unit * 0.72,
        palette.body
      ),
      pad,
      cursor
    )
    cursor += unit * 1.2

    /*
     * The most recent filings, newest first.
     *
     * The opposite of the full scene, which numbers from the top. A corner
     * plate has room for four or five and the interesting ones are the ones
     * that just arrived — a widget showing the first five entries of a
     * forty-entry roll would be showing the least current thing on the roll.
     */
    const room = this.height - pad - cursor - unit * 1.4
    const rows = Math.max(Math.floor(room / (unit * 1.05)), 0)
    const recent = state.entries.slice(-rows).reverse()

    for (const entry of recent) {
      const arrival = Math.max(1 - (Date.now() - entry.at) / ARRIVAL_MS, 0)
      context.fillStyle = withAlpha(arrival > 0 ? palette.goldHot : palette.alabaster, 0.82)
      context.font = `${unit * 0.62}px ${palette.body}`
      context.fillText(
        this.clip(entry.text, this.width - pad * 2, unit * 0.62, palette.body),
        pad,
        cursor
      )
      cursor += unit * 1.05
    }

    const count = `${state.entries.length} FILED`
    context.fillStyle = withAlpha(palette.concrete, 0.75)
    this.tracked(count, pad, this.height - pad, unit * 0.55, 0.22, 'display')
  }

  // ------------------------------------------------------------- typography

  private rule(x: number, y: number, width: number, alpha: number): void {
    this.context.fillStyle = withAlpha(this.palette.gold, alpha)
    this.context.fillRect(x, y, width, 1)
  }

  /**
   * Tracked uppercase text, one glyph at a time.
   *
   * Canvas has `letterSpacing` and it is deliberately not used: an OBS browser
   * source runs an embedded Chromium that can lag Electron's by years, and
   * this has to render identically on both. Laying the glyphs out by hand is
   * version-proof, and it is what every other face in this kit does.
   */
  private tracked(
    text: string,
    x: number,
    baseline: number,
    size: number,
    tracking: number,
    face: 'display' | 'mono'
  ): void {
    const { context, palette } = this
    context.font = `${size}px ${face === 'mono' ? palette.mono : palette.display}`

    const gap = size * tracking
    let cursor = x
    for (const glyph of text) {
      context.fillText(glyph, cursor, baseline)
      cursor += context.measureText(glyph).width + gap
    }
  }

  /** Shrinks a string until its tracked width fits. */
  private fit(
    text: string,
    width: number,
    size: number,
    tracking: number,
    face: 'display' | 'mono'
  ): string {
    const { context, palette } = this
    context.font = `${size}px ${face === 'mono' ? palette.mono : palette.display}`

    const measure = (value: string): number => {
      let total = 0
      for (const glyph of value) total += context.measureText(glyph).width + size * tracking
      return total
    }

    if (measure(text) <= width) return text

    let clipped = text
    while (clipped.length > 3 && measure(`${clipped}…`) > width) clipped = clipped.slice(0, -1)
    return `${clipped}…`
  }

  /** Truncates plain (untracked) text to a pixel width. */
  private clip(text: string, width: number, size: number, family: string): string {
    const { context } = this
    context.font = `${size}px ${family}`
    if (context.measureText(text).width <= width) return text

    let clipped = text
    while (clipped.length > 1 && context.measureText(`${clipped}…`).width > width) {
      clipped = clipped.slice(0, -1)
    }
    return `${clipped}…`
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function readPalette(root: HTMLElement): Palette {
  const styles = getComputedStyle(root)
  const read = (names: readonly string[], fallback: string): string =>
    readCustomProperty(styles, names, fallback)

  return {
    obsidian: read(['--ch-obsidian-900'], FALLBACK.obsidian),
    slab: read(['--ch-obsidian-800'], FALLBACK.slab),
    slabRaised: read(['--ch-obsidian-600'], FALLBACK.slabRaised),
    concrete: read(['--ch-concrete-500'], FALLBACK.concrete),
    brass: read(['--ch-alabaster-600'], FALLBACK.brass),
    gold: read(['--ch-gold-400'], FALLBACK.gold),
    goldLit: read(['--ch-gold-300'], FALLBACK.goldLit),
    goldHot: read(['--ch-gold-200'], FALLBACK.goldHot),
    crimson: read(['--ch-crimson-500'], FALLBACK.crimson),
    crimsonHot: read(['--ch-crimson-400'], FALLBACK.crimsonHot),
    alabaster: read(['--ch-alabaster-300'], FALLBACK.alabaster),
    line: FALLBACK.line,
    display: read(['--ch-font-display'], 'system-ui, sans-serif'),
    body: read(['--ch-font-body'], 'system-ui, sans-serif'),
    mono: read(['--ch-font-mono'], 'ui-monospace, monospace')
  }
}
