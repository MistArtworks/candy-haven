import type { RiteMechanism, RitePhase, SpinCommand } from '@shared/domain/rite'
import { LOGOMARK_PATH, LOGOMARK_VIEWBOX } from '@renderer/components/sigil/logomark.path'
import {
  DOCKET_VISIBLE_ROWS,
  POINTER_ANGLE,
  TAU,
  attritionOrder,
  attritionStruckAt,
  docketRowAt,
  reelFrameAt,
  reelPetitionIndex,
  segmentAngle,
  spinFrameAt,
  tickIndexAt,
  totalSpinDurationMs
} from '@shared/domain/rite.constants'

/**
 * The Resonance Selection ring.
 *
 * Deliberately framework-free. The host console draws this inside React and the
 * OBS browser source draws it from a plain script, and the two are on screen at
 * the same time in front of an audience — so there is exactly one
 * implementation of the geometry, the easing and the palette, and both surfaces
 * drive it from the same `SpinCommand`.
 *
 * Canvas rather than SVG for the same reason as the boot screen's resonance web:
 * this is a rotating point cloud plus a full ring redrawn every frame, which is
 * precisely where retained-mode DOM falls over.
 *
 * Composition follows the world brief. One focal object — the crimson orb on
 * the hub — in a symmetrical field, with the only saturated colour reserved for
 * it and for the winner. Segments are differentiated by engraving and numbering
 * rather than by hue, because a multi-coloured wheel is the single most
 * off-model object this world could contain.
 */

export interface WheelPetition {
  id: string
  label: string
  weight: number
}

export interface WheelState {
  petitions: readonly WheelPetition[]
  phase: RitePhase
  spin: SpinCommand | null
  winnerIndex: number | null
  winnerLabel: string | null
  /** Which presentation to draw. Defaults to the ring. */
  mechanism?: RiteMechanism
  /** The rotating resonance field behind the ring. */
  showField?: boolean
}

export interface WheelOptions {
  /**
   * Ambient and spin motion. When disabled the ring paints a single resting
   * frame rather than nothing, so the composition still reads as intended.
   */
  motion?: boolean
  /** Tightens type and rim weights for the smaller host-side preview. */
  compact?: boolean
}

interface FieldNode {
  x: number
  y: number
  z: number
  jitter: number
  drift: number
}

/** Nodes in the resonance field surrounding the ring. */
const FIELD_NODES = 74
const FIELD_LINK_DISTANCE = 0.66

/** How long a pointer tick stays lit. Short enough to read as a strike. */
const TICK_PULSE_MS = 150

/** Stamp entrance, measured from the instant the ring settles. */
const STAMP_MS = 420

/**
 * One revolution of the mark, in seconds.
 *
 * Slow enough to read as drift rather than as animation — the ring supplies all
 * the movement this composition needs, and the mark turning at any pace that
 * competes with it makes the hub look like a second spinning object. Uncoupled
 * from the spin on purpose: the orb's glow already tracks velocity.
 */
const MARK_PERIOD_SECONDS = 48
/**
 * Mark width as a fraction of the orb's diameter.
 *
 * Kept well inside the rim. The mark is a spiral whose outer arm reads as the
 * widest thing in the orb, so filling the glass with it leaves no glass — and
 * its glow then spills past the rim and dissolves the edge that makes the orb
 * an object.
 */
const MARK_FILL = 0.6

const FALLBACK = {
  wedgeA: '#0c0c0c',
  wedgeB: '#171517',
  wedgeEdge: 'rgba(210, 169, 97, 0.34)',
  gold: '#d2a961',
  goldBright: '#e3c286',
  goldDim: '#976b30',
  brass: '#45351f',
  label: '#ddcfb2',
  labelDim: '#8a8071',
  mark: '#e3c286',
  crimson: '#a32b23',
  crimsonBright: '#c4453a',
  crimsonDeep: '#43120f',
  crimsonVoid: '#24090a',
  display: "'Bahnschrift', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
  mono: "'Cascadia Mono', 'Consolas', ui-monospace, monospace"
}

/**
 * Resolves the ring's palette from the document.
 *
 * Each entry is looked up as an overlay-semantic property first
 * (`--ch-ring-wedge-a`) and falls back to the underlying material
 * (`--ch-obsidian-800`). That is what lets the overlay's fixed presentation
 * presets re-skin the ring by declaring a handful of ring properties, while the
 * console — which declares none of them — keeps the material defaults.
 *
 * Only literal values are accepted. `--ch-accent` and friends are `var()`
 * chains, and relying on computed-value resolution of nested custom properties
 * is not worth the risk here; every value below resolves to a hex or an rgba
 * literal. The focal crimson is never themed, because the brief reserves the
 * one saturated colour for the focal point in every arrangement.
 */
function readPalette(root: HTMLElement): typeof FALLBACK {
  const styles = getComputedStyle(root)
  const read = (names: readonly string[], fallback: string): string => {
    for (const name of names) {
      const value = styles.getPropertyValue(name).trim()
      if (value.length > 0 && !value.includes('var(')) return value
    }
    return fallback
  }

  return {
    wedgeA: read(['--ch-ring-wedge-a', '--ch-obsidian-800'], FALLBACK.wedgeA),
    wedgeB: read(['--ch-ring-wedge-b', '--ch-obsidian-600'], FALLBACK.wedgeB),
    wedgeEdge: read(['--ch-ring-edge', '--ch-line-gold'], FALLBACK.wedgeEdge),
    gold: read(['--ch-ring-rim', '--ch-gold-300'], FALLBACK.gold),
    goldBright: read(['--ch-ring-rim-bright', '--ch-gold-200'], FALLBACK.goldBright),
    goldDim: read(['--ch-ring-rim-dim', '--ch-gold-500'], FALLBACK.goldDim),
    brass: read(['--ch-ring-arc-track', '--ch-brass-700'], FALLBACK.brass),
    label: read(['--ch-ring-label', '--ch-alabaster-300'], FALLBACK.label),
    labelDim: read(['--ch-ring-label-dim', '--ch-concrete-400'], FALLBACK.labelDim),
    crimson: read(['--ch-crimson-500'], FALLBACK.crimson),
    crimsonBright: read(['--ch-crimson-400'], FALLBACK.crimsonBright),
    crimsonDeep: read(['--ch-crimson-800'], FALLBACK.crimsonDeep),
    crimsonVoid: read(['--ch-crimson-900'], FALLBACK.crimsonVoid),
    mark: read(['--ch-gold-200'], FALLBACK.mark),
    display: read(['--ch-font-display'], FALLBACK.display),
    mono: read(['--ch-font-mono'], FALLBACK.mono)
  }
}

/** `#rrggbb` -> `rgba(r, g, b, a)`. */
function withAlpha(colour: string, alpha: number): string {
  const hex = colour.trim()
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    // Already a functional colour (the line tokens are rgba literals); the
    // caller's alpha cannot be applied, so return it untouched rather than
    // producing an invalid style that silently paints nothing.
    return hex
  }
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const r = parseInt(full.slice(1, 3), 16)
  const g = parseInt(full.slice(3, 5), 16)
  const b = parseInt(full.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

/** Even distribution over a sphere; random placement clumps badly at this count. */
function createField(count: number): FieldNode[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(Math.max(1 - y * y, 0))
    const theta = golden * i
    return {
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      jitter: 0.88 + Math.random() * 0.24,
      drift: Math.random() * TAU
    }
  })
}

export class RiteWheel {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly field = createField(FIELD_NODES)
  private readonly mark = new Path2D(LOGOMARK_PATH)
  private palette: typeof FALLBACK
  private compact: boolean
  private motion: boolean

  private state: WheelState = {
    petitions: [],
    phase: 'idle',
    spin: null,
    winnerIndex: null,
    winnerLabel: null,
    showField: true
  }

  private width = 0
  private height = 0
  /** The square the ring is drawn into: the shorter axis of the canvas. */
  private size = 0
  private frame = 0
  private running = false
  private fieldRotation = 0
  private markRotation = 0
  private lastFrameAt = 0

  /** Tick tracking, so the pointer strikes once per boundary crossing. */
  private lastTickIndex: number | null = null
  private tickAt = 0

  constructor(canvas: HTMLCanvasElement, options: WheelOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.compact = options.compact ?? false
    this.motion = options.motion ?? true
    this.palette = readPalette(document.documentElement)
    this.resize()
  }

  setState(state: WheelState): void {
    this.state = state
    // A fresh spin must not inherit the previous one's tick position, or the
    // pointer strikes once spuriously on the first frame.
    if (state.phase !== 'spinning') this.lastTickIndex = null
    if (!this.running) this.paint(performance.now())
  }

  setMotion(enabled: boolean): void {
    if (this.motion === enabled) return
    this.motion = enabled
    if (enabled) {
      this.start()
    } else {
      this.stop()
      this.paint(performance.now())
    }
  }

  /** Re-reads the theme, for a live accent or palette change. */
  refreshPalette(): void {
    this.palette = readPalette(document.documentElement)
    if (!this.running) this.paint(performance.now())
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const css = Math.max(Math.min(rect.width, rect.height), 1)
    // Render at device resolution so hairlines and small caps stay crisp.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    this.size = css
    this.canvas.width = Math.round(css * dpr)
    this.canvas.height = Math.round(css * dpr)
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!this.running) this.paint(performance.now())
  }

  start(): void {
    if (this.running) return
    if (!this.motion) {
      this.paint(performance.now())
      return
    }
    this.running = true
    this.lastFrameAt = performance.now()
    const loop = (now: number): void => {
      if (!this.running) return
      this.paint(now)
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  destroy(): void {
    this.stop()
  }

  // --------------------------------------------------------------- painting

  private paint(now: number): void {
    const { context: ctx, size } = this
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now

    ctx.clearRect(0, 0, this.width, this.height)
    if (size <= 0) return

    const centre = size / 2
    const radius = size * 0.38
    const count = this.state.petitions.length

    // Where is the ring, and how hard is it working?
    const wallNow = Date.now()
    let rotation = 0
    let velocity = 0
    let progress = 0
    let settled = true

    if (this.state.spin && this.state.phase !== 'idle') {
      const frame = this.motion
        ? spinFrameAt(this.state.spin, wallNow)
        : spinFrameAt(
            this.state.spin,
            this.state.spin.startedAt + totalSpinDurationMs(this.state.spin)
          )
      rotation = frame.rotation
      velocity = frame.velocity
      progress = frame.progress
      settled = frame.settled
    }

    // The ring does not drift at rest. Idle rotation would have to be folded
    // back into the spin's absolute landing angle, and getting that wrong lands
    // the pointer off-centre; ambient life comes from the field and the orb
    // instead, exactly as it does on the boot screen.
    const spinning = this.state.phase === 'spinning' && !settled
    const fieldSpeed = 0.07 + velocity * 0.55
    this.fieldRotation += delta * fieldSpeed
    this.markRotation += (delta * TAU) / MARK_PERIOD_SECONDS

    if (this.state.showField !== false) {
      ctx.save()
      ctx.translate((this.width - size) / 2, (this.height - size) / 2)
      this.drawField(centre, size * 0.465, velocity, now)
      ctx.restore()
    }

    if (count === 0) {
      ctx.save()
      ctx.translate((this.width - size) / 2, (this.height - size) / 2)
      this.drawEmptyRing(centre, radius)
      this.drawBezel(centre, radius, 0)
      this.drawOrb(centre, radius, 0, now, false)
      this.drawPointer(centre, radius, 0)
      this.drawEmptyLegend(centre, centre + radius * 0.52)
      ctx.restore()
      return
    }

    /*
     * The mechanism is a presentation choice over one draw.
     *
     * Every branch below renders the same predetermined result from the same
     * spin command, so switching between them mid-roster changes only how the
     * selection is watched — never what is selected.
     */
    const mechanism = this.state.mechanism ?? 'ring'
    if (mechanism !== 'ring') {
      this.drawLinear(mechanism, now, settled, velocity, progress, spinning)
      return
    }

    ctx.save()
    // Centres the ring's square in a rectangular canvas; everything below is
    // written against `size` and needs no knowledge of the frame's shape.
    ctx.translate((this.width - size) / 2, (this.height - size) / 2)

    this.drawSegments(centre, radius, rotation, count)
    this.drawRim(centre, radius, rotation, count, velocity)
    this.drawBezel(centre, radius, velocity)

    if (spinning) this.drawProgressArc(centre, radius, progress)

    /*
     * The reveal is driven by the spin command, not by the resolved broadcast.
     *
     * `targetIndex` was decided before the animation started and has been in
     * hand the whole time, so the segment can ignite on the exact frame the ring
     * stops. Waiting for the main process to announce the result would put a
     * variable IPC or SSE delay between the ring settling and the winner
     * lighting up — and a different delay on each of the two surfaces.
     */
    const revealIndex =
      this.state.winnerIndex ?? (settled && this.state.spin ? this.state.spin.targetIndex : null)
    const resolved = revealIndex !== null && (this.state.phase === 'resolved' || settled)

    if (resolved && revealIndex < count) {
      this.drawWinnerSegment(centre, radius, rotation, count, revealIndex, now)
    }

    this.drawOrb(centre, radius, velocity, now, resolved)
    this.drawPointer(centre, radius, this.tickPulse(rotation, count, now, spinning))

    const revealLabel =
      this.state.winnerLabel ??
      (revealIndex !== null ? this.state.petitions[revealIndex]?.label : null)
    if (resolved && revealLabel) {
      this.drawStamp(centre, radius, revealLabel)
    }

    ctx.restore()
  }

  /**
   * The resonance field: a rotating plexus on a sphere that surrounds the ring.
   *
   * Agitation scales with the ring's speed, which is the third layer of motion
   * in the composition — the ring supplies position, the orb supplies
   * intensity, and this supplies texture. Nodes behind the ring are occluded by
   * the segments, so what reads on screen is a halo.
   */
  private drawField(centre: number, radius: number, velocity: number, now: number): void {
    const { context: ctx, palette } = this
    const tint = palette.gold
    const agitation = 1 + velocity * 0.42
    const cos = Math.cos(this.fieldRotation)
    const sin = Math.sin(this.fieldRotation)
    const tiltCos = Math.cos(0.42)
    const tiltSin = Math.sin(0.42)

    const projected = this.field.map((node) => {
      const breath = 1 + Math.sin(now / 1400 + node.drift) * 0.05 * agitation
      const r = radius * node.jitter * breath
      const x1 = node.x * cos - node.z * sin
      const z1 = node.x * sin + node.z * cos
      const y1 = node.y * tiltCos - z1 * tiltSin
      const z2 = node.y * tiltSin + z1 * tiltCos
      const perspective = 1.6 / (1.6 - z2 * 0.55)
      return {
        sx: centre + x1 * r * perspective,
        sy: centre + y1 * r * perspective,
        ux: x1,
        uy: node.y,
        uz: z1,
        depth: (z2 + 1) / 2
      }
    })

    const intensity = 0.7 + velocity * 0.4

    for (let i = 0; i < projected.length; i += 1) {
      const a = projected[i]
      for (let j = i + 1; j < projected.length; j += 1) {
        const b = projected[j]
        const dx = a.ux - b.ux
        const dy = a.uy - b.uy
        const dz = a.uz - b.uz
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (distance > FIELD_LINK_DISTANCE) continue

        const closeness = 1 - distance / FIELD_LINK_DISTANCE
        const depth = (a.depth + b.depth) / 2
        const alpha = closeness * closeness * (0.06 + depth * 0.2) * intensity

        ctx.strokeStyle = withAlpha(tint, alpha)
        ctx.lineWidth = 0.5 + depth * 0.5
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.stroke()
      }
    }

    for (const point of projected) {
      ctx.fillStyle = withAlpha(palette.goldBright, (0.1 + point.depth * 0.34) * intensity)
      ctx.beginPath()
      ctx.arc(point.sx, point.sy, 0.4 + point.depth * 1.2, 0, TAU)
      ctx.fill()
    }
  }

  private drawSegments(centre: number, radius: number, rotation: number, count: number): void {
    const { context: ctx, palette } = this
    const segment = segmentAngle(count)

    for (let index = 0; index < count; index += 1) {
      const from = index * segment + rotation
      const to = from + segment

      ctx.beginPath()
      ctx.moveTo(centre, centre)
      ctx.arc(centre, centre, radius, from, to)
      ctx.closePath()
      // Alternating obsidian rather than alternating hue. On an odd count the
      // wrap would put two identical wedges side by side, so the last one takes
      // the surface tone instead of repeating.
      const alternate = count % 2 === 1 && index === count - 1 ? 2 : index % 2
      ctx.fillStyle = alternate === 0 ? palette.wedgeA : palette.wedgeB
      ctx.fill()

      ctx.strokeStyle = palette.wedgeEdge
      ctx.lineWidth = 1
      ctx.stroke()

      this.drawSegmentLabel(centre, radius, from + segment / 2, segment, index)
    }
  }

  /**
   * Labels run radially, reading outward along the spoke.
   *
   * Tangential text is prettier on a wide wheel and unreadable on a crowded
   * one; radial text degrades predictably — it just gets shorter. Type size is
   * driven by the segment's angular width so a twenty-item ring thins down
   * instead of overlapping itself, and below the point where a word would fit
   * the label drops to its filed number, which is still enough to follow the
   * spin against the roster.
   */
  private drawSegmentLabel(
    centre: number,
    radius: number,
    midAngle: number,
    segment: number,
    index: number
  ): void {
    const { context: ctx, palette } = this
    const petition = this.state.petitions[index]
    if (!petition) return

    const inner = radius * 0.3
    const outer = radius * 0.9
    const available = outer - inner

    const segmentDegrees = (segment * 180) / Math.PI
    const base = this.compact ? 11 : 13
    const fontSize = Math.max(7, Math.min(base, base * (segmentDegrees / 26), radius * 0.075))
    const numberSize = Math.max(6, fontSize * 0.72)

    ctx.save()
    ctx.translate(centre, centre)
    ctx.rotate(midAngle)

    // Keep text upright on the left half of the ring rather than upside down.
    const flipped = Math.cos(midAngle) < 0
    if (flipped) {
      ctx.rotate(Math.PI)
    }

    ctx.textBaseline = 'middle'

    const showLabel = segmentDegrees > 9 && available > 40
    if (showLabel) {
      ctx.font = `${fontSize}px ${palette.display}`
      ctx.fillStyle = palette.label
      ctx.textAlign = flipped ? 'left' : 'right'
      const text = this.fitText(petition.label.toUpperCase(), available - 18)
      ctx.fillText(text, flipped ? -outer : outer, 0)
    }

    // The filed number always renders: it is the anchor between the ring, the
    // roster and the result, and it survives every size the label does not.
    ctx.font = `${numberSize}px ${palette.mono}`
    ctx.fillStyle = withAlpha(palette.gold, 0.72)
    ctx.textAlign = flipped ? 'right' : 'left'
    const numberAt = flipped ? -inner : inner
    ctx.fillText(String(index + 1).padStart(2, '0'), numberAt, 0)

    ctx.restore()
  }

  private fitText(text: string, maxWidth: number): string {
    const ctx = this.context
    if (ctx.measureText(text).width <= maxWidth) return text

    let trimmed = text
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1)
    }
    return `${trimmed}…`
  }

  /** Outer rim plus one tick per petition — the ring's institutional edge. */
  private drawRim(
    centre: number,
    radius: number,
    rotation: number,
    count: number,
    velocity: number
  ): void {
    const { context: ctx, palette } = this
    const segment = segmentAngle(count)

    ctx.strokeStyle = withAlpha(palette.gold, 0.5 + velocity * 0.18)
    ctx.lineWidth = this.compact ? 1.2 : 1.6
    ctx.beginPath()
    ctx.arc(centre, centre, radius, 0, TAU)
    ctx.stroke()

    // Ticks sit on the segment boundaries, so what the pointer strikes and what
    // the eye counts are the same thing. These rotate with the ring; the bezel
    // outside them does not.
    for (let index = 0; index < count; index += 1) {
      const angle = index * segment + rotation
      const from = radius
      const to = radius * 1.032
      ctx.strokeStyle = withAlpha(palette.goldBright, 0.62)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(centre + Math.cos(angle) * from, centre + Math.sin(angle) * from)
      ctx.lineTo(centre + Math.cos(angle) * to, centre + Math.sin(angle) * to)
      ctx.stroke()
    }
  }

  private drawEmptyRing(centre: number, radius: number): void {
    const { context: ctx, palette } = this

    ctx.strokeStyle = withAlpha(palette.goldDim, 0.28)
    ctx.lineWidth = 1
    ctx.setLineDash([2, 6])
    ctx.beginPath()
    ctx.arc(centre, centre, radius, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    // Concentric hairlines, so an empty ring reads as a dormant instrument
    // rather than as an unfinished one. Plain low-alpha strokes — the
    // sacred-geometry mandala this echoes was tried with `mix-blend-mode:
    // screen` on the boot screen and washed the crimson orb to grey haze.
    for (const ratio of [0.66, 0.4]) {
      ctx.strokeStyle = withAlpha(palette.goldDim, 0.1)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(centre, centre, radius * ratio, 0, TAU)
      ctx.stroke()
    }
  }

  /**
   * The fixed bezel: a graduated rail outside the ring.
   *
   * Static on purpose, and that is the whole point of it. The segment ticks
   * rotate with the ring, so on their own there is nothing for the eye to
   * measure them against — a graduated frame that does not move turns the spin
   * into something being read off an instrument rather than a shape turning in
   * space. It also gives an empty ring some structure.
   *
   * Restrained deliberately: fine graduations at low alpha plus four cardinal
   * marks. Anything heavier competes with the orb, and the brief allows one
   * focal object per view.
   */
  private drawBezel(centre: number, radius: number, velocity: number): void {
    const { context: ctx, palette } = this

    ctx.strokeStyle = withAlpha(palette.goldDim, 0.4)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centre, centre, radius * 1.045, 0, TAU)
    ctx.stroke()

    // Minor graduations every 5°. Short and faint: this is the rule on the
    // instrument, not a second set of ticks.
    const minor = (5 * Math.PI) / 180
    ctx.strokeStyle = withAlpha(palette.goldDim, 0.26)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let angle = 0; angle < TAU - 1e-9; angle += minor) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.moveTo(centre + cos * radius * 1.045, centre + sin * radius * 1.045)
      ctx.lineTo(centre + cos * radius * 1.062, centre + sin * radius * 1.062)
    }
    ctx.stroke()

    // Cardinals — the four points of the Sonoalchemy star, aligned to the
    // pointer so the top mark sits under it.
    ctx.strokeStyle = withAlpha(palette.gold, 0.45 + velocity * 0.12)
    ctx.lineWidth = this.compact ? 1.2 : 1.5
    ctx.beginPath()
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const angle = POINTER_ANGLE + (quarter * Math.PI) / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.moveTo(centre + cos * radius * 1.038, centre + sin * radius * 1.038)
      ctx.lineTo(centre + cos * radius * 1.086, centre + sin * radius * 1.086)
    }
    ctx.stroke()
  }

  private drawEmptyLegend(x: number, y: number): void {
    const { context: ctx, palette } = this
    const size = Math.max(8, Math.min(this.width, this.height) * 0.028)
    ctx.font = `${size}px ${palette.display}`
    ctx.fillStyle = palette.labelDim
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('NO PETITIONS FILED', x, y)
    ctx.textAlign = 'left'
  }

  /**
   * Ignition of the selected segment.
   *
   * Crimson appears here and on the orb and nowhere else, which is the whole
   * discipline of the palette: the winner is the only saturated thing on screen.
   */
  private drawWinnerSegment(
    centre: number,
    radius: number,
    rotation: number,
    count: number,
    winnerIndex: number,
    now: number
  ): void {
    const { context: ctx, palette } = this
    const segment = segmentAngle(count)
    const from = winnerIndex * segment + rotation
    const to = from + segment
    const pulse = 0.7 + Math.sin(now / 520) * 0.12

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(centre, centre)
    ctx.arc(centre, centre, radius, from, to)
    ctx.closePath()

    const gradient = ctx.createRadialGradient(centre, centre, radius * 0.2, centre, centre, radius)
    gradient.addColorStop(0, withAlpha(palette.crimsonDeep, 0.9))
    gradient.addColorStop(1, withAlpha(palette.crimson, 0.55 * pulse))
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.85)
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.restore()

    // Re-draw the label on top of the ignition so it stays legible.
    this.drawSegmentLabel(centre, radius, from + segment / 2, segment, winnerIndex)
  }

  /** Elapsed-time arc. Gives the spin a visible tail without adding a colour. */
  private drawProgressArc(centre: number, radius: number, progress: number): void {
    const { context: ctx, palette } = this
    const r = radius * 1.13
    ctx.strokeStyle = withAlpha(palette.brass, 0.5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centre, centre, r, 0, TAU)
    ctx.stroke()

    ctx.strokeStyle = palette.gold
    ctx.lineWidth = 2
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.arc(centre, centre, r, POINTER_ANGLE, POINTER_ANGLE + TAU * progress)
    ctx.stroke()
  }

  /**
   * The focal object: crimson glass on the hub, gold rim at rest.
   *
   * A direct port of the boot screen's orb, which is the house treatment for
   * this object — deep `crimson-800` glass falling to `crimson-900` at the
   * edge, heavy inset shadow, and gold arriving only as rim light and a
   * restrained halo. The earlier version here lit the body with `crimson-400`
   * and haloed it in crimson, which made it a bright glossy ball and read as a
   * second light source rather than as glass.
   *
   * Scale and glow track the ring's speed rather than the clock, so the orb
   * reads as the thing being driven by the spin. It blooms once on lock.
   */
  private drawOrb(
    centre: number,
    radius: number,
    velocity: number,
    now: number,
    resolved: boolean
  ): void {
    const { context: ctx, palette } = this
    const breath = 1 + Math.sin(now / 1600) * 0.02
    const drive = 1 + velocity * 0.09
    const r = radius * 0.225 * breath * drive

    // Gold halo, held to a restrained bloom. An amber flood here reads as a sun
    // and drifts the composition off the five-material palette.
    const halo = resolved ? 0.17 : 0.1 + Math.min(velocity, 1.8) * 0.02
    const glow = ctx.createRadialGradient(centre, centre, r * 0.55, centre, centre, r * 1.95)
    glow.addColorStop(0, withAlpha(palette.gold, halo))
    glow.addColorStop(0.64, withAlpha(palette.gold, halo * 0.34))
    glow.addColorStop(1, withAlpha(palette.gold, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(centre, centre, r * 1.95, 0, TAU)
    ctx.fill()

    // The glass itself.
    const body = ctx.createRadialGradient(centre, centre, 0, centre, centre, r)
    body.addColorStop(0, palette.crimsonDeep)
    body.addColorStop(0.74, palette.crimsonVoid)
    body.addColorStop(1, palette.crimsonVoid)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(centre, centre, r, 0, TAU)
    ctx.fill()

    ctx.save()
    // Everything below is confined to the orb, so the inset shadows darken its
    // own edge instead of bleeding onto the wedges behind it.
    ctx.beginPath()
    ctx.arc(centre, centre, r, 0, TAU)
    ctx.clip()

    // Specular highlight, offset up and left as on the boot orb.
    const hx = centre - r * 0.16
    const hy = centre - r * 0.28
    const highlight = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.62)
    highlight.addColorStop(0, withAlpha(palette.crimsonBright, 0.3))
    highlight.addColorStop(1, withAlpha(palette.crimsonBright, 0))
    ctx.fillStyle = highlight
    ctx.fillRect(centre - r, centre - r, r * 2, r * 2)

    // Inset darkening: an even vignette plus an offset fall-off from the lower
    // right, which is what gives the glass its weight.
    const vignette = ctx.createRadialGradient(centre, centre, r * 0.3, centre, centre, r)
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)')
    ctx.fillStyle = vignette
    ctx.fillRect(centre - r, centre - r, r * 2, r * 2)

    const sx = centre + r * 0.34
    const sy = centre + r * 0.42
    const shade = ctx.createRadialGradient(sx, sy, r * 0.1, sx, sy, r * 1.4)
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)')
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = shade
    ctx.fillRect(centre - r, centre - r, r * 2, r * 2)
    ctx.restore()

    this.drawMark(centre, r, resolved)

    // Rim light. The only thing gold does to the orb itself.
    ctx.strokeStyle = withAlpha(palette.gold, resolved ? 0.4 : 0.2 + velocity * 0.06)
    ctx.lineWidth = this.compact ? 1 : 1.2
    ctx.beginPath()
    ctx.arc(centre, centre, r, 0, TAU)
    ctx.stroke()
  }

  /**
   * The brand mark on the hub, turning slowly inside the orb.
   *
   * The path comes from `components/sigil/logomark.path`, the same module
   * `Logomark` renders in the DOM, so the console chrome and the ring can never
   * show different artwork.
   *
   * Gold, self-luminous, and unthemed: the presentation presets re-skin the
   * ring around the focal object, not the focal object itself, so the mark
   * always reads warm on crimson glass. The two glows are a port of the boot
   * screen's `drop-shadow` pair — warm light coming from inside the orb, with
   * no dark shadow under it.
   *
   * The rotation is baked into a transformed copy of the path rather than
   * applied to the context, so the canvas filter's blur radii stay in the
   * canvas's own coordinate space instead of being scaled down by the very
   * large path-to-orb reduction.
   */
  private drawMark(centre: number, orbRadius: number, resolved: boolean): void {
    const { context: ctx, palette } = this
    const scale = (orbRadius * 2 * MARK_FILL) / LOGOMARK_VIEWBOX.width

    const matrix = new DOMMatrix()
      .translateSelf(centre, centre)
      .rotateSelf((this.markRotation * 180) / Math.PI)
      .scaleSelf(scale)
      .translateSelf(-LOGOMARK_VIEWBOX.width / 2, -LOGOMARK_VIEWBOX.height / 2)

    const shaped = new Path2D()
    shaped.addPath(this.mark, matrix)

    ctx.save()
    const bloom = resolved ? 1 : 0.82
    ctx.filter =
      `drop-shadow(0 0 ${(orbRadius * 0.1).toFixed(2)}px rgba(227, 194, 134, ${(0.55 * bloom).toFixed(2)})) ` +
      `drop-shadow(0 0 ${(orbRadius * 0.3).toFixed(2)}px rgba(210, 169, 97, ${(0.34 * bloom).toFixed(2)}))`
    ctx.fillStyle = withAlpha(palette.mark, resolved ? 1 : 0.94)
    ctx.fill(shaped)
    ctx.restore()
  }

  /**
   * Pointer at twelve o'clock, struck by each boundary that passes beneath it.
   *
   * Returns nothing itself — the strike intensity is computed by `tickPulse` and
   * passed in, so the pulse and the segment crossing cannot disagree.
   */
  private drawPointer(centre: number, radius: number, pulse: number): void {
    const { context: ctx, palette } = this
    const tip = centre - radius * 1.015
    const height = radius * (this.compact ? 0.1 : 0.085)
    const halfWidth = height * 0.52

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(centre, tip + height)
    ctx.lineTo(centre - halfWidth, tip)
    ctx.lineTo(centre + halfWidth, tip)
    ctx.closePath()
    ctx.fillStyle = pulse > 0.02 ? palette.goldBright : palette.gold
    ctx.fill()

    if (pulse > 0.02) {
      ctx.shadowColor = withAlpha(palette.goldBright, 0.8 * pulse)
      ctx.shadowBlur = 14 * pulse
      ctx.fill()
    }
    ctx.restore()
  }

  /** Boundary-crossing detector. The tick rate is a direct read-out of speed. */
  private tickPulse(rotation: number, count: number, now: number, spinning: boolean): number {
    if (spinning) {
      const index = tickIndexAt(rotation, count)
      if (this.lastTickIndex === null) {
        this.lastTickIndex = index
      } else if (index !== this.lastTickIndex) {
        this.lastTickIndex = index
        this.tickAt = now
      }
    }

    const age = now - this.tickAt
    if (age < 0 || age > TICK_PULSE_MS) return 0
    return 1 - age / TICK_PULSE_MS
  }

  /**
   * `SANCTIONED` — the hard punctuation on the end of the spin.
   *
   * A ring coasting to a halt is a soft ending; the stamp lands with a single
   * frame of overshoot so the result arrives rather than emerges.
   */
  private drawStamp(centre: number, radius: number, label: string): void {
    const { context: ctx, palette } = this

    // Measured against the wall clock, because that is what the spin command is
    // timed against. A state restored without its spin (or motion disabled)
    // renders the stamp already landed rather than replaying its entrance.
    const age =
      this.motion && this.state.spin
        ? Math.max(
            Date.now() - (this.state.spin.startedAt + totalSpinDurationMs(this.state.spin)),
            0
          )
        : STAMP_MS

    const u = Math.min(age / STAMP_MS, 1)
    // Overshoot on the way in: 1.18 -> 1.0 with a decelerating return.
    const scale = u >= 1 ? 1 : 1.18 - 0.18 * (1 - (1 - u) * (1 - u) * (1 - u))
    const alpha = Math.min(u * 1.6, 1)

    const width = radius * 1.22
    const height = radius * (this.compact ? 0.3 : 0.26)
    const y = centre + radius * 1.28

    ctx.save()
    ctx.translate(centre, y)
    ctx.scale(scale, scale)
    ctx.rotate(-0.014)
    ctx.globalAlpha = alpha

    ctx.fillStyle = withAlpha(palette.crimsonDeep, 0.86)
    ctx.fillRect(-width / 2, -height / 2, width, height)
    ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.9)
    ctx.lineWidth = 2
    ctx.strokeRect(-width / 2, -height / 2, width, height)

    const titleSize = Math.max(8, height * 0.26)
    const labelSize = Math.max(9, height * 0.34)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(palette.gold, 0.9)
    ctx.font = `${titleSize}px ${palette.display}`
    ctx.fillText('SANCTIONED', 0, -height * 0.24)

    ctx.fillStyle = palette.label
    ctx.font = `${labelSize}px ${palette.display}`
    ctx.fillText(this.fitText(label.toUpperCase(), width - 24), 0, height * 0.16)

    ctx.restore()
  }

  // ==========================================================================
  // Linear presentations
  //
  // The ring turns; these three move a strip, step a bar, or strike records
  // out. All derive from the same spin command, so the winner, the timing and
  // the settle are shared and only the shape differs.
  // ==========================================================================

  private drawLinear(
    mechanism: Exclude<RiteMechanism, 'ring'>,
    now: number,
    settled: boolean,
    velocity: number,
    progress: number,
    spinning: boolean
  ): void {
    const spin = this.state.spin
    const count = this.state.petitions.length

    // Reveal off the command rather than the broadcast, as the ring does, so
    // the result lands on the exact frame the motion stops.
    const revealIndex = this.state.winnerIndex ?? (settled && spin ? spin.targetIndex : null)
    const resolved = revealIndex !== null && (this.state.phase === 'resolved' || settled)

    if (count === 0) {
      this.drawEmptyLegend(this.width / 2, this.height / 2 - this.height * 0.06)
      return
    }

    switch (mechanism) {
      case 'procession':
        this.drawProcession(now, spin, count, velocity, progress, spinning, revealIndex, resolved)
        break
      case 'tribunal':
        this.drawTribunal(now, spin, count, progress, spinning, revealIndex, resolved)
        break
      case 'attrition':
        this.drawAttrition(now, spin, count, progress, spinning, revealIndex, resolved)
        break
    }
  }

  // ------------------------------------------------------------- procession

  /**
   * THE PROCESSION — petitions stream past a fixed mark and one is held.
   *
   * The case-opening arrangement rebuilt in the house materials: engraved slabs
   * on a rail rather than coloured cards, a gold mark rather than a ticker, and
   * the winner igniting crimson rather than flashing. It shares the ring's
   * easing exactly, so the long readable crawl into the result and the
   * overshoot-and-creep-back are the same beat.
   *
   * The strip is drawn from a window around the current position rather than
   * built as a list, so a roster of four reads as endless as a roster of forty
   * and nothing is duplicated to fill the rail.
   */
  private drawProcession(
    now: number,
    spin: SpinCommand | null,
    count: number,
    velocity: number,
    progress: number,
    spinning: boolean,
    revealIndex: number | null,
    resolved: boolean
  ): void {
    const { context: ctx, palette, width, height } = this
    const centreX = width / 2
    const plateWidth = Math.min(width * 0.19, height * 0.34)
    const plateHeight = plateWidth * 1.18
    const step = plateWidth * 1.08
    const railY = height * 0.5 - plateHeight / 2

    const plates = spin ? reelFrameAt(spin, Date.now()).plates : 0

    // Rail: a recessed channel the slabs run in.
    ctx.fillStyle = withAlpha(palette.wedgeA, 0.85)
    ctx.fillRect(0, railY - plateHeight * 0.1, width, plateHeight * 1.2)
    ctx.strokeStyle = palette.wedgeEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, railY - plateHeight * 0.1)
    ctx.lineTo(width, railY - plateHeight * 0.1)
    ctx.moveTo(0, railY + plateHeight * 1.1)
    ctx.lineTo(width, railY + plateHeight * 1.1)
    ctx.stroke()

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, railY - plateHeight * 0.1, width, plateHeight * 1.2)
    ctx.clip()

    // Only the plates that can be on screen are drawn.
    const span = Math.ceil(width / step / 2) + 2
    const anchor = Math.round(plates)

    for (let offset = -span; offset <= span; offset += 1) {
      const reelIndex = anchor + offset
      if (reelIndex < 0) continue

      const index = reelPetitionIndex(reelIndex, count)
      const x = centreX + (reelIndex - plates) * step - plateWidth / 2
      const isWinner = resolved && index === revealIndex && Math.abs(reelIndex - plates) < 0.5

      this.drawProcessionPlate(x, railY, plateWidth, plateHeight, index, isWinner)
    }
    ctx.restore()

    // The mark: a fixed gold blade through the rail, with a chevron at each end.
    const markTop = railY - plateHeight * 0.22
    const markBottom = railY + plateHeight * 1.22
    const pulse = this.tickPulse(plates * segmentAngle(count), count, now, spinning)

    ctx.strokeStyle = pulse > 0.02 ? palette.goldBright : palette.gold
    ctx.lineWidth = pulse > 0.02 ? 2.2 : 1.6
    ctx.beginPath()
    ctx.moveTo(centreX, markTop)
    ctx.lineTo(centreX, markBottom)
    ctx.stroke()

    const chevron = plateWidth * 0.09
    ctx.fillStyle = pulse > 0.02 ? palette.goldBright : palette.gold
    for (const [y, direction] of [
      [markTop, 1],
      [markBottom, -1]
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(centreX, y + chevron * direction)
      ctx.lineTo(centreX - chevron * 0.8, y)
      ctx.lineTo(centreX + chevron * 0.8, y)
      ctx.closePath()
      ctx.fill()
    }

    if (spinning) this.drawProgressRule(height - height * 0.1, progress)
    if (resolved && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      if (label) this.drawStampAt(centreX, height * 0.86, width * 0.7, label)
    }

    void velocity
  }

  /** One slab on the rail. Engraved, numbered, and lit only if it wins. */
  private drawProcessionPlate(
    x: number,
    y: number,
    plateWidth: number,
    plateHeight: number,
    index: number,
    isWinner: boolean
  ): void {
    const { context: ctx, palette } = this
    const petition = this.state.petitions[index]
    if (!petition) return

    if (isWinner) {
      const gradient = ctx.createLinearGradient(x, y, x, y + plateHeight)
      gradient.addColorStop(0, withAlpha(palette.crimson, 0.62))
      gradient.addColorStop(1, withAlpha(palette.crimsonDeep, 0.94))
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = index % 2 === 0 ? palette.wedgeA : palette.wedgeB
    }
    ctx.fillRect(x, y, plateWidth, plateHeight)

    ctx.strokeStyle = isWinner ? withAlpha(palette.crimsonBright, 0.9) : palette.wedgeEdge
    ctx.lineWidth = isWinner ? 1.6 : 1
    ctx.strokeRect(x + 0.5, y + 0.5, plateWidth - 1, plateHeight - 1)

    // Filed number: the anchor between the rail, the roster and the result.
    const numberSize = Math.max(7, plateWidth * 0.11)
    ctx.font = `${numberSize}px ${palette.mono}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = withAlpha(isWinner ? palette.goldBright : palette.gold, 0.75)
    ctx.fillText(String(index + 1).padStart(2, '0'), x + plateWidth * 0.09, y + plateHeight * 0.09)

    // The label runs down the slab, which is the only direction it fits.
    const labelSize = Math.max(8, plateWidth * 0.13)
    ctx.save()
    ctx.translate(x + plateWidth * 0.62, y + plateHeight * 0.9)
    ctx.rotate(-Math.PI / 2)
    ctx.font = `${labelSize}px ${palette.display}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = palette.label
    ctx.fillText(this.fitText(petition.label.toUpperCase(), plateHeight * 0.8), 0, 0)
    ctx.restore()
  }

  // --------------------------------------------------------------- tribunal

  /**
   * THE TRIBUNAL — the docket is scanned and one file is sanctioned.
   *
   * The bar steps between whole rows rather than gliding: a bar that slides
   * continuously reads as a scrollbar, whereas one that jumps reads as a
   * machine considering each file in turn. It slows to a crawl on the same
   * curve as everything else, then the file is stamped.
   *
   * The docket scrolls only when the roster outruns the frame, and it keeps the
   * scanned row in view rather than paging, so the eye never loses the bar.
   */
  private drawTribunal(
    now: number,
    spin: SpinCommand | null,
    count: number,
    progress: number,
    spinning: boolean,
    revealIndex: number | null,
    resolved: boolean
  ): void {
    const { context: ctx, palette, width, height } = this
    const pad = width * 0.06
    const headerHeight = height * 0.1
    const footerHeight = resolved ? height * 0.16 : height * 0.06
    const listTop = headerHeight
    const listHeight = height - headerHeight - footerHeight

    const visible = Math.min(count, DOCKET_VISIBLE_ROWS)
    const rowHeight = listHeight / visible
    const active = spin ? docketRowAt(spin, Date.now()) : (revealIndex ?? 0)

    // Keep the scanned row on screen without paging: the window follows it,
    // clamped so the list never scrolls past its own ends.
    const firstRow = Math.min(
      Math.max(active - Math.floor(visible / 2), 0),
      Math.max(count - visible, 0)
    )

    ctx.font = `${Math.max(8, height * 0.028)}px ${palette.display}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(palette.gold, 0.7)
    ctx.fillText('DOCKET', pad, headerHeight * 0.5)
    ctx.textAlign = 'right'
    ctx.fillStyle = palette.labelDim
    ctx.fillText(`${count} FILED`, width - pad, headerHeight * 0.5)
    ctx.textAlign = 'left'

    ctx.strokeStyle = palette.wedgeEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, headerHeight)
    ctx.lineTo(width - pad, headerHeight)
    ctx.stroke()

    for (let row = 0; row < visible; row += 1) {
      const index = firstRow + row
      if (index >= count) break

      const petition = this.state.petitions[index]
      if (!petition) continue

      const y = listTop + row * rowHeight
      const isActive = index === active
      const isWinner = resolved && index === revealIndex

      if (isWinner) {
        ctx.fillStyle = withAlpha(palette.crimson, 0.34)
        ctx.fillRect(pad, y, width - pad * 2, rowHeight)
        ctx.fillStyle = palette.crimsonBright
        ctx.fillRect(pad, y, 3, rowHeight)
      } else if (isActive && spinning) {
        // The scanning bar: a lit course, not a highlight.
        ctx.fillStyle = withAlpha(palette.gold, 0.14)
        ctx.fillRect(pad, y, width - pad * 2, rowHeight)
        ctx.fillStyle = palette.goldBright
        ctx.fillRect(pad, y, 3, rowHeight)
      }

      const numberSize = Math.max(7, rowHeight * 0.3)
      ctx.font = `${numberSize}px ${palette.mono}`
      ctx.fillStyle = isWinner
        ? palette.crimsonBright
        : withAlpha(palette.gold, isActive ? 0.9 : 0.55)
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1).padStart(2, '0'), pad + rowHeight * 0.34, y + rowHeight / 2)

      const labelSize = Math.max(9, rowHeight * 0.4)
      ctx.font = `${labelSize}px ${palette.display}`
      ctx.fillStyle = isWinner ? palette.label : isActive ? palette.label : palette.labelDim
      ctx.fillText(
        this.fitText(petition.label.toUpperCase(), width - pad * 2 - rowHeight * 1.6),
        pad + rowHeight * 1.1,
        y + rowHeight / 2
      )

      if (row > 0) {
        ctx.strokeStyle = withAlpha(palette.goldDim, 0.12)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pad, y)
        ctx.lineTo(width - pad, y)
        ctx.stroke()
      }
    }

    if (spinning) this.drawProgressRule(height - footerHeight * 0.4, progress)
    if (resolved && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      if (label) this.drawStampAt(width / 2, height - footerHeight * 0.5, width * 0.74, label)
    }

    void now
  }

  // -------------------------------------------------------------- attrition

  /**
   * RITE OF ATTRITION — records are redacted until one survives.
   *
   * The inverse of the others: it does not choose a winner, it forgets the
   * losers. Records are struck through and blacked out one at a time until a
   * single file is left standing, which is the selection.
   *
   * The order is derived from the spin id rather than rolled locally, so the
   * console and the broadcast strike the same record at the same moment. The
   * curve decelerates rather than accelerating: the last elimination is the one
   * that decides it, so it gets the longest beat.
   */
  private drawAttrition(
    now: number,
    spin: SpinCommand | null,
    count: number,
    progress: number,
    spinning: boolean,
    revealIndex: number | null,
    resolved: boolean
  ): void {
    const { context: ctx, palette, width, height } = this
    const pad = width * 0.06
    const headerHeight = height * 0.1
    const footerHeight = resolved ? height * 0.16 : height * 0.06
    const listHeight = height - headerHeight - footerHeight

    const visible = Math.min(count, DOCKET_VISIBLE_ROWS)
    const rowHeight = listHeight / visible

    const order = spin ? attritionOrder(spin) : []
    const struck = spin ? attritionStruckAt(spin, Date.now()) : 0
    const redacted = new Set(order.slice(0, struck))

    ctx.font = `${Math.max(8, height * 0.028)}px ${palette.display}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(palette.gold, 0.7)
    ctx.fillText('ATTRITION', pad, headerHeight * 0.5)
    ctx.textAlign = 'right'
    ctx.fillStyle = redacted.size > 0 ? palette.crimsonBright : palette.labelDim
    ctx.fillText(`${count - redacted.size} REMAIN`, width - pad, headerHeight * 0.5)
    ctx.textAlign = 'left'

    ctx.strokeStyle = palette.wedgeEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, headerHeight)
    ctx.lineTo(width - pad, headerHeight)
    ctx.stroke()

    // Survivors are kept in place rather than closing the gap, so the eye can
    // follow one record down the list instead of re-reading a shifting one.
    for (let index = 0; index < visible; index += 1) {
      const petition = this.state.petitions[index]
      if (!petition) continue

      const y = headerHeight + index * rowHeight
      const isRedacted = redacted.has(index)
      const isWinner = resolved && index === revealIndex

      const numberSize = Math.max(7, rowHeight * 0.3)
      const labelSize = Math.max(9, rowHeight * 0.4)
      const labelX = pad + rowHeight * 1.1
      const labelText = this.fitText(
        petition.label.toUpperCase(),
        width - pad * 2 - rowHeight * 1.6
      )

      if (isWinner) {
        ctx.fillStyle = withAlpha(palette.crimson, 0.32)
        ctx.fillRect(pad, y, width - pad * 2, rowHeight)
        ctx.fillStyle = palette.crimsonBright
        ctx.fillRect(pad, y, 3, rowHeight)
      }

      ctx.font = `${numberSize}px ${palette.mono}`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isRedacted
        ? withAlpha(palette.labelDim, 0.3)
        : withAlpha(palette.gold, isWinner ? 0.95 : 0.6)
      ctx.fillText(String(index + 1).padStart(2, '0'), pad + rowHeight * 0.34, y + rowHeight / 2)

      ctx.font = `${labelSize}px ${palette.display}`
      ctx.fillStyle = isRedacted
        ? withAlpha(palette.labelDim, 0.34)
        : isWinner
          ? palette.label
          : palette.labelDim
      ctx.fillText(labelText, labelX, y + rowHeight / 2)

      if (isRedacted) {
        const textWidth = ctx.measureText(labelText).width
        // Struck through, then blacked over: the record is not removed, it is
        // made unreadable, which is the whole point of the mechanism.
        ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.7)
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(labelX, y + rowHeight / 2)
        ctx.lineTo(labelX + textWidth, y + rowHeight / 2)
        ctx.stroke()

        ctx.fillStyle = withAlpha(palette.wedgeA, 0.72)
        ctx.fillRect(labelX, y + rowHeight * 0.24, textWidth, rowHeight * 0.52)
      }

      if (index > 0) {
        ctx.strokeStyle = withAlpha(palette.goldDim, 0.12)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pad, y)
        ctx.lineTo(width - pad, y)
        ctx.stroke()
      }
    }

    if (spinning) this.drawProgressRule(height - footerHeight * 0.4, progress)
    if (resolved && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      if (label) this.drawStampAt(width / 2, height - footerHeight * 0.5, width * 0.74, label)
    }

    void now
  }

  // ----------------------------------------------------------------- shared

  /** Elapsed rule, for the presentations with no arc to carry progress. */
  private drawProgressRule(y: number, progress: number): void {
    const { context: ctx, palette, width } = this
    const w = width * 0.6
    const x = (width - w) / 2

    ctx.fillStyle = withAlpha(palette.brass, 0.6)
    ctx.fillRect(x, y, w, 1)
    ctx.fillStyle = palette.gold
    ctx.fillRect(x, y, w * Math.min(Math.max(progress, 0), 1), 1)
  }

  /**
   * `SANCTIONED`, positioned by the caller.
   *
   * The ring stamps beneath itself; the linear presentations stamp inside their
   * own footers, so the placement is a parameter rather than derived from a
   * radius.
   */
  private drawStampAt(centreX: number, centreY: number, maxWidth: number, label: string): void {
    const { context: ctx, palette } = this

    const age =
      this.motion && this.state.spin
        ? Math.max(
            Date.now() - (this.state.spin.startedAt + totalSpinDurationMs(this.state.spin)),
            0
          )
        : STAMP_MS
    const u = Math.min(age / STAMP_MS, 1)
    const scale = u >= 1 ? 1 : 1.18 - 0.18 * (1 - (1 - u) * (1 - u) * (1 - u))
    const alpha = Math.min(u * 1.6, 1)

    const width = maxWidth
    const height = Math.max(this.height * 0.09, 26)

    ctx.save()
    ctx.translate(centreX, centreY)
    ctx.scale(scale, scale)
    ctx.rotate(-0.014)
    ctx.globalAlpha = alpha

    ctx.fillStyle = withAlpha(palette.crimsonDeep, 0.88)
    ctx.fillRect(-width / 2, -height / 2, width, height)
    ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.9)
    ctx.lineWidth = 2
    ctx.strokeRect(-width / 2, -height / 2, width, height)

    const titleSize = Math.max(8, height * 0.26)
    const labelSize = Math.max(9, height * 0.34)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(palette.gold, 0.9)
    ctx.font = `${titleSize}px ${palette.display}`
    ctx.fillText('SANCTIONED', 0, -height * 0.24)

    ctx.fillStyle = palette.label
    ctx.font = `${labelSize}px ${palette.display}`
    ctx.fillText(this.fitText(label.toUpperCase(), width - 24), 0, height * 0.16)

    ctx.restore()
    ctx.textAlign = 'left'
  }
}
