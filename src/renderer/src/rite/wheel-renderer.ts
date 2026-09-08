import type { RiteMechanism, RitePhase, SpinCommand } from '@shared/domain/rite'
import { LOGOMARK_PATH, LOGOMARK_VIEWBOX } from '@renderer/components/sigil/logomark.path'
import {
  POINTER_ANGLE,
  PROCESSION_EASING,
  REEL_OVERSHOOT_PLATES,
  TAU,
  clamp01,
  reelFrameAt,
  reelPetitionIndex,
  segmentAngle,
  spinFrameAt,
  tickIndexAt,
  totalSpinDurationMs
} from '@shared/domain/rite.constants'
import type { DescentPlan } from '@shared/domain/rite.descent'
import {
  DESCENT_COURSE,
  MOTE_RADIUS,
  descentFrameAt,
  descentPlan,
  motePosition,
  shaftRadius,
  vaneAngle
} from '@shared/domain/rite.descent'
import { readCustomProperty, withAlpha } from '@renderer/overlays/colour'
import { createField, paintResonanceField } from '@renderer/overlays/resonance-field'

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

/** Nodes in the resonance field surrounding the ring. */
const FIELD_NODES = 74

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

/*
 * THE DESCENT's camera.
 *
 * Fixed, and shallow on purpose. Enough pitch that the shaft's rings read as
 * ellipses and a mote's depth is legible, not so much that the drop stops
 * reading as a drop. `FOCAL` matching `CAM_DIST` puts unit scale at the look
 * point, which makes `shaftSpan` mean exactly "pixels per shaft radius at the
 * middle of the fall" and keeps the layout arithmetic honest.
 */
const DESCENT_PITCH = 0.42
const DESCENT_SIN = Math.sin(DESCENT_PITCH)
const DESCENT_COS = Math.cos(DESCENT_PITCH)
const DESCENT_CAM_DIST = 3.1
const DESCENT_FOCAL = 3.1
const DESCENT_LOOK_Y = 0.45

/** Rings down the shaft wall, and ribs around it. */
const DESCENT_WALL_RINGS = 22
const DESCENT_RIBS = 12
const DESCENT_ELLIPSE_STEPS = 40

/** Depth-sorted item kinds. Plain numbers: this is a hot switch. */
const DESCENT_PEG = 0
const DESCENT_PILLAR = 1
const DESCENT_VANE = 2
const DESCENT_MOTE = 3

interface DescentItem {
  kind: number
  depth: number
  x: number
  y: number
  x2: number
  y2: number
  radius: number
  mote: number
}

const DESCENT_ITEM = (): DescentItem => ({
  kind: 0,
  depth: 0,
  x: 0,
  y: 0,
  x2: 0,
  y2: 0,
  radius: 0,
  mote: -1
})

/**
 * The named zones, for the gauge down the left edge.
 *
 * Depths mirror the course laid out in `rite.descent.ts`. Kept here rather than
 * there because they are captions — the simulation has no opinion about what
 * its obstacles are called.
 */
const DESCENT_ZONES: readonly { y: number; label: string; focal?: boolean }[] = [
  { y: -0.04, label: 'RELEASE' },
  { y: 0.2, label: 'THE LATTICE' },
  { y: 0.44, label: 'THE VANES' },
  { y: 0.63, label: 'THE COLONNADE' },
  { y: 0.87, label: 'THE THROAT' },
  { y: 1, label: 'NAYARA', focal: true }
]

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
  const read = (names: readonly string[], fallback: string): string =>
    readCustomProperty(styles, names, fallback)

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

  /** Memo for `fitText`, keyed by text, measure width and font. */
  private readonly fitted = new Map<string, string>()

  /*
   * THE DESCENT's working state.
   *
   * Scratch rather than locals because `project` is called several hundred
   * times a frame and the item pool is rebuilt every frame; both would
   * otherwise allocate continuously for a mechanism that is on screen for
   * minutes at a time.
   */
  private shaftSpan = 0
  private shaftX = 0
  private shaftY = 0
  private pX = 0
  private pY = 0
  private pUnit = 0
  private pDepth = 0
  private readonly descentItems: DescentItem[] = []
  private readonly descentOrder: number[] = []
  /**
   * This frame's absorption and approach, shared by the passes below.
   *
   * Set once at the top of `drawDescent` rather than by whichever pass computes
   * them first: the aperture is drawn before the motes, so having the mote pass
   * assign these left Nayara glowing one frame behind the thing it was
   * swallowing.
   */
  private descentAbsorbed = 0
  private descentApproach = 0
  private readonly plexusX: number[] = []
  private readonly plexusY: number[] = []
  private readonly plexusFog: number[] = []

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
    // Render at device resolution so hairlines and small caps stay crisp.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    /*
     * The canvas is not assumed square.
     *
     * The ring is, and still draws into `size` — the shorter axis — centred in
     * whatever box it is given. The linear mechanisms want the whole box: a
     * rail is wide and a shaft is tall, and squaring the canvas would throw
     * away most of the frame they have.
     *
     * Both dimensions have to be recorded here. They are what `paint` clears
     * and what the ring's centring offset is derived from, so leaving them at
     * zero clears nothing — every frame accumulates on the last — and offsets
     * the ring by half its own size into the corner.
     */
    this.width = Math.max(rect.width, 1)
    this.height = Math.max(rect.height, 1)
    this.size = Math.max(Math.min(this.width, this.height), 1)

    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
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

  /**
   * The instant a spin command should be evaluated at.
   *
   * The wall clock while motion is on: both surfaces read the same one, which
   * is what lets an overlay that connects halfway through a spin pick the
   * animation up at the correct offset instead of starting over.
   *
   * With motion off there is no frame loop, so the command is evaluated at its
   * end instead and every presentation paints one resting frame on the winner.
   * Reading the live clock in that mode meant the single paint froze the strip
   * wherever the spin happened to be at that instant — mark on one slab, stamp
   * naming another — because nothing would ever repaint to move it.
   */
  private spinClock(spin: SpinCommand): number {
    return this.motion ? Date.now() : spin.startedAt + totalSpinDurationMs(spin)
  }

  private paint(now: number): void {
    const { context: ctx, size } = this
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now

    /*
     * All three dimensions are checked, not just `size`.
     *
     * They are assigned together in `resize`, so any one of them being zero
     * means the canvas box was never recorded — and drawing anyway is worse
     * than drawing nothing: `clearRect(0, 0, 0, 0)` clears nothing, so every
     * frame accumulates on the last and the ring is offset by half its own
     * size into the corner. A blank canvas is at least diagnosable.
     */
    if (this.width <= 0 || this.height <= 0 || size <= 0) return

    ctx.clearRect(0, 0, this.width, this.height)

    const centre = size / 2
    const radius = size * 0.38
    const count = this.state.petitions.length

    // Where is the ring, and how hard is it working?
    let rotation = 0
    let velocity = 0
    let progress = 0
    let settled = true

    if (this.state.spin && this.state.phase !== 'idle') {
      const frame = spinFrameAt(this.state.spin, this.spinClock(this.state.spin))
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

    /*
     * The mechanism is a presentation choice over one draw.
     *
     * Every branch renders the same predetermined result from the same spin
     * command, so switching between them changes only how the selection is
     * watched — never what is selected.
     *
     * Decided before anything is drawn, and before the empty-roster branch.
     * Both of those are ring-specific: the resonance field belongs to the ring
     * and has no business behind a rail, and returning early on an empty
     * roster meant the mechanism could not be previewed until a petition had
     * been filed — which is exactly when an operator wants to look at it.
     */
    const mechanism = this.state.mechanism ?? 'ring'
    if (mechanism !== 'ring') {
      this.drawLinear(mechanism, now, settled, progress, spinning)
      return
    }

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
    paintResonanceField(
      this.context,
      this.field,
      {
        centreX: centre,
        centreY: centre,
        radius,
        rotation: this.fieldRotation,
        energy: velocity,
        now
      },
      { line: this.palette.gold, node: this.palette.goldBright }
    )
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

  /**
   * Truncates to fit, memoised on the answer rather than the question.
   *
   * The uncached path is a `measureText` per character shaved off, and the rail
   * runs it for every slab on screen on every frame — the same handful of
   * labels, at the same size, sixty times a second. The answer only changes
   * when the roster, the layout or the font does, so it is cached against all
   * three and the loop becomes a map lookup.
   */
  private fitText(text: string, maxWidth: number): string {
    const ctx = this.context
    const key = `${ctx.font}|${Math.round(maxWidth)}|${text}`
    const cached = this.fitted.get(key)
    if (cached !== undefined) return cached

    let result = text
    if (ctx.measureText(text).width > maxWidth) {
      let trimmed = text
      while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1)
      }
      result = `${trimmed}…`
    }

    // Bounded, because the font size and the width both scale with the canvas
    // box: a window dragged to resize would otherwise add an entry per frame.
    if (this.fitted.size > 512) this.fitted.clear()
    this.fitted.set(key, result)
    return result
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
  // The presentations that are not a ring
  //
  // The ring turns; the procession carries a strip past a mark; the descent
  // drops the whole roster down a shaft. All three answer to the same spin
  // command, so the winner, the timing and the settle are shared and only the
  // shape differs — and the descent needs a whole simulation to get there, so
  // it is the one that proves the point rather than assuming it.
  // ==========================================================================

  private drawLinear(
    mechanism: Exclude<RiteMechanism, 'ring'>,
    now: number,
    settled: boolean,
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
        this.drawProcession(now, spin, count, progress, spinning, revealIndex, resolved)
        break
      case 'descent':
        this.drawDescent(now, spin, count, progress, spinning, revealIndex, resolved)
        break
    }
  }

  // ------------------------------------------------------------- procession

  /**
   * THE PROCESSION — petitions stream past a fixed mark and one is held.
   *
   * A colonnade rather than a carousel. Numbered stone slabs are carried
   * through a recessed channel between a lintel and a plinth, past one fixed
   * gold mark with a crimson core. The mark is the composition's single focal
   * object and the only saturated thing on screen until a slab is held, which
   * is the brief's rule rather than a preference: one focal point, one accent.
   * Slabs are told apart by engraving and by their filed number, never by hue.
   *
   * The strip is drawn from a window around the current position rather than
   * built as a list, so a roster of two reads as endless as a roster of forty
   * and nothing has to be duplicated to fill the rail. Slabs dim toward the
   * edges of the frame, so the procession recedes into the dark rather than
   * being cropped by it — and the mark stays the brightest thing on screen.
   */
  private drawProcession(
    now: number,
    spin: SpinCommand | null,
    count: number,
    progress: number,
    spinning: boolean,
    revealIndex: number | null,
    resolved: boolean
  ): void {
    const { context: ctx, palette, width, height } = this
    const centreX = width / 2

    /*
     * A stale command is worse than no command.
     *
     * `removeOnSelect` rewrites the roster the instant a result is recorded,
     * while the command that positions the strip still carries the roster size
     * it was armed with. The reel wraps modulo the roster, so one plate of
     * arithmetic later the mark is over a different petition than the one the
     * stamp names — precisely the mismatch this presentation exists to make
     * legible. Fall back to the resting strip and let the stamp carry the
     * result on its own.
     */
    const command = spin && spin.segmentCount === count ? spin : null
    const at = command ? this.spinClock(command) : 0
    const frame = command ? reelFrameAt(command, at, PROCESSION_EASING) : null
    const plates = frame?.plates ?? 0

    /*
     * How fast the strip is running, in slabs per second.
     *
     * `velocity` is a multiple of the curve's average rate, so scaling it by the
     * average turns it into something the composition can actually reason
     * about. The procession's curve peaks near nine times its average, and a
     * slab that crosses the mark in a couple of frames cannot be read at any
     * size — so past that the engraving is dropped rather than smeared. That
     * costs nothing to look at and saves the most expensive pass in the loop at
     * exactly the moment the frame budget is tightest.
     */
    const pace =
      command && frame
        ? (frame.velocity *
            (command.revolutions * count + command.targetIndex + REEL_OVERSHOOT_PLATES)) /
          (command.durationMs / 1000)
        : 0
    const crisp = 1 - clamp01((pace - 3) / 6)

    // Layout. Sized off both axes so the rail fills the frame it is given
    // rather than a square inside it, and seated a little above centre to leave
    // the stamp a footer of its own.
    const plateWidth = Math.min(width * 0.17, height * 0.3)
    const plateHeight = plateWidth * 1.5
    const step = plateWidth * 1.1
    const inset = plateHeight * 0.11
    const channelTop = height * 0.46 - plateHeight / 2 - inset
    const channelHeight = plateHeight + inset * 2
    const railY = channelTop + inset

    /*
     * Which slab the mark is over, and how far off its centre the mark sits.
     *
     * Every ignition and every tick below is derived from these two numbers, so
     * what lights up and what the mark is pointing at cannot disagree — which
     * they previously could, because the highlight was gated on the spin having
     * finished while the mark was still mid-overshoot.
     */
    const markIndex = Math.round(plates)
    // Whether the mark is over a slab's face or the gap beside it. Slabs take
    // up `plateWidth / step` of their pitch, so past half of that from a centre
    // the mark is over the channel floor rather than over stone.
    const onSlab = Math.abs(markIndex - plates) < plateWidth / step / 2

    /*
     * Ignition tracks the mark, not the clock.
     *
     * The mark reaches the winner when the strip begins its settle, and then
     * creeps the last fraction of a slab home across the settle's full length.
     * Lighting the slab only once the motion had stopped left it dark for that
     * whole beat and then lit it after the movement had visibly ended, which
     * reads as the mark having come to rest and the result being substituted
     * afterwards.
     *
     * Gated on the settle having started, or the winner's slab would flash
     * every time it passed under the mark during the spin.
     */
    const arriving = command !== null && at - command.startedAt >= command.durationMs
    const holdIndex = revealIndex ?? (arriving && command ? command.targetIndex : null)
    const held =
      command !== null &&
      holdIndex !== null &&
      (arriving || resolved) &&
      onSlab &&
      reelPetitionIndex(markIndex, count) === holdIndex

    this.drawProcessionCourse(centreX, channelTop, channelHeight, step)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, channelTop, width, channelHeight)
    ctx.clip()

    /*
     * Only the slabs that can actually land inside the channel are drawn.
     *
     * A symmetric span around the mark kept drawing a couple past each edge,
     * and every one of those costs a rotated text pass for nothing. Negative
     * reel indices are drawn rather than skipped: `reelPetitionIndex` wraps
     * them correctly, and skipping them left the whole left half of the rail
     * empty until the strip had travelled far enough to fill it.
     */
    const half = plateWidth / 2
    const first = Math.floor(plates - (centreX + half) / step)
    const last = Math.ceil(plates + (width - centreX + half) / step)
    const reach = Math.max(centreX, width - centreX) + half

    const slabs: { index: number; x: number; alpha: number; lit: boolean }[] = []
    for (let reelIndex = first; reelIndex <= last; reelIndex += 1) {
      const centre = centreX + (reelIndex - plates) * step
      const fade = Math.min(Math.abs(centre - centreX) / reach, 1)
      slabs.push({
        index: reelPetitionIndex(reelIndex, count),
        x: centre - half,
        alpha: 1 - fade * fade * 0.72,
        lit: held && reelIndex === markIndex
      })
    }

    /*
     * Three passes rather than everything per slab.
     *
     * The bodies, then every filed number with the font set once, then every
     * label with it set once again. Canvas state changes — font in particular —
     * are what this loop actually costs, not the fills.
     */
    for (const slab of slabs) {
      this.drawSlab(slab.x, railY, plateWidth, plateHeight, slab, crisp, now)
    }

    if (crisp > 0.02) {
      const numberSize = Math.max(8, plateWidth * 0.115)
      ctx.font = `${numberSize}px ${palette.mono}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      for (const slab of slabs) {
        ctx.fillStyle = withAlpha(
          slab.lit ? palette.goldBright : palette.gold,
          slab.alpha * crisp * 0.8
        )
        ctx.fillText(
          String(slab.index + 1).padStart(2, '0'),
          slab.x + plateWidth * 0.11,
          railY + plateHeight * 0.075
        )
      }

      const labelSize = Math.max(9, plateWidth * 0.145)
      const labelMax = plateHeight * 0.72
      ctx.font = `${labelSize}px ${palette.display}`
      ctx.textBaseline = 'middle'
      for (const slab of slabs) {
        const petition = this.state.petitions[slab.index]
        if (!petition) continue
        const text = this.fitText(petition.label.toUpperCase(), labelMax)

        ctx.save()
        ctx.translate(slab.x + plateWidth * 0.61, railY + plateHeight * 0.88)
        ctx.rotate(-Math.PI / 2)
        // Engraved rather than printed: the incision's shadow first, then the
        // lit face a hair above it. Two fills, and the label stops reading as
        // ink on a surface and starts reading as cut into one.
        ctx.fillStyle = withAlpha(palette.wedgeA, slab.alpha * crisp * 0.85)
        ctx.fillText(text, 0, 1)
        ctx.fillStyle = withAlpha(palette.label, slab.alpha * crisp)
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }
    }

    ctx.restore()

    this.drawProcessionMark(
      centreX,
      channelTop,
      channelHeight,
      plateWidth,
      this.plateTick(plates, now, spinning),
      held,
      now
    )

    // Footer: the progress rule while it runs, the stamp once it has landed.
    const footer = channelTop + channelHeight
    if (spinning) {
      this.drawProgressRule(footer + Math.max((height - footer) * 0.18, 10), progress)
    }
    if (resolved && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      if (label) {
        this.drawStampAt(centreX, (footer + height) / 2, Math.min(width * 0.6, step * 3.6), label)
      }
    }
  }

  /**
   * The course the procession is carried through: recess, lintel, plinth.
   *
   * Flat bands of stone with a hairline gold lip and a notch on the slabs' own
   * interval. Repetition rather than ornament — the rail should read as
   * standing infrastructure that was here before this spin and will be here
   * after it, which is the whole difference between an altar and a widget.
   */
  private drawProcessionCourse(
    centreX: number,
    channelTop: number,
    channelHeight: number,
    step: number
  ): void {
    const { context: ctx, palette, width } = this
    const bottom = channelTop + channelHeight
    const band = Math.max(channelHeight * 0.075, 5)

    // The recess itself, a shade under the slabs that sit in it.
    ctx.fillStyle = withAlpha(palette.wedgeA, 0.92)
    ctx.fillRect(0, channelTop, width, channelHeight)

    // Lintel above, plinth below.
    ctx.fillStyle = withAlpha(palette.brass, 0.32)
    ctx.fillRect(0, channelTop - band, width, band)
    ctx.fillRect(0, bottom, width, band)

    // Both lips catch the light, but the recess is lit from above, so the upper
    // one reads as an edge and the lower one only glints.
    ctx.fillStyle = withAlpha(palette.gold, 0.5)
    ctx.fillRect(0, channelTop - 1, width, 1)
    ctx.fillStyle = withAlpha(palette.gold, 0.24)
    ctx.fillRect(0, bottom, width, 1)

    // Notches, phased to the gaps between slabs so the structure and the
    // procession are visibly measured against one another.
    const notch = band * 0.62
    ctx.fillStyle = withAlpha(palette.goldDim, 0.36)
    const from = Math.ceil(-centreX / step - 0.5)
    const to = Math.floor((width - centreX) / step + 0.5)
    for (let i = from; i <= to; i += 1) {
      const x = Math.round(centreX + (i + 0.5) * step)
      ctx.fillRect(x, channelTop - band, 1, notch)
      ctx.fillRect(x, bottom + band - notch, 1, notch)
    }
  }

  /**
   * One slab on the rail: cut stone, numbered elsewhere, lit only if it is held.
   *
   * Carries no text of its own — the numbers and labels are drawn in their own
   * passes so the font is set twice a frame instead of twice a slab.
   *
   * `crisp` falls toward zero as the strip outruns the eye, and takes the carved
   * detail with it: the bevel and the edge are what make a slab read as a
   * discrete block, so holding them at full strength through the burst turns the
   * rail into a strobing picket fence. Fading them lets the procession blur into
   * a band of stone, which is what it should look like at speed.
   */
  private drawSlab(
    x: number,
    y: number,
    plateWidth: number,
    plateHeight: number,
    slab: { index: number; alpha: number; lit: boolean },
    crisp: number,
    now: number
  ): void {
    const { context: ctx, palette } = this

    ctx.globalAlpha = slab.alpha

    if (slab.lit) {
      // Crimson appears here and on the mark and nowhere else.
      const gradient = ctx.createLinearGradient(x, y, x, y + plateHeight)
      gradient.addColorStop(0, withAlpha(palette.crimson, 0.66))
      gradient.addColorStop(1, withAlpha(palette.crimsonDeep, 0.95))
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, plateWidth, plateHeight)
    } else {
      ctx.fillStyle = slab.index % 2 === 0 ? palette.wedgeA : palette.wedgeB
      ctx.fillRect(x, y, plateWidth, plateHeight)

      // Low warm key from above against cold stone. Two thin washes rather than
      // a full-height gradient: the slab should look lit, not tinted.
      const key = ctx.createLinearGradient(x, y, x, y + plateHeight * 0.45)
      key.addColorStop(0, withAlpha(palette.gold, 0.075))
      key.addColorStop(1, withAlpha(palette.gold, 0))
      ctx.fillStyle = key
      ctx.fillRect(x, y, plateWidth, plateHeight * 0.45)
    }

    // Bevel: a lit top and left, a shadowed bottom and right. This is what
    // makes the slab read as a block with thickness rather than a filled box.
    ctx.fillStyle = withAlpha(palette.gold, (slab.lit ? 0.34 : 0.13) * crisp)
    ctx.fillRect(x, y, plateWidth, 1)
    ctx.fillRect(x, y, 1, plateHeight)
    ctx.fillStyle = withAlpha(palette.wedgeA, 0.75 * crisp)
    ctx.fillRect(x, y + plateHeight - 1, plateWidth, 1)
    ctx.fillRect(x + plateWidth - 1, y, 1, plateHeight)

    // The held slab keeps its outline whatever the pace: by the time anything
    // is held the strip is crawling, and the ignition is the one edge in the
    // composition that must never be ambiguous.
    ctx.globalAlpha = slab.alpha * (slab.lit ? 1 : 0.35 + crisp * 0.65)
    ctx.strokeStyle = slab.lit
      ? withAlpha(palette.crimsonBright, 0.7 + Math.sin(now / 520) * 0.18)
      : palette.wedgeEdge
    ctx.lineWidth = slab.lit ? 1.6 : 1
    ctx.strokeRect(x + 0.5, y + 0.5, plateWidth - 1, plateHeight - 1)

    ctx.globalAlpha = 1
  }

  /**
   * The mark: the one fixed thing in the composition, and its focal object.
   *
   * A gold blade over a crimson core, capped at each end by a chevron seated in
   * a short bar so it reads as a fixture bolted through the lintel and the
   * plinth rather than an arrow floating over a list. The wash behind it
   * widens on each tick and breathes once a slab is held, which lets the mark
   * carry the rhythm of the spin without ever moving.
   */
  private drawProcessionMark(
    centreX: number,
    channelTop: number,
    channelHeight: number,
    plateWidth: number,
    tick: number,
    held: boolean,
    now: number
  ): void {
    const { context: ctx, palette } = this
    const lit = tick > 0.02

    const glow = held ? 0.17 + Math.sin(now / 520) * 0.05 : 0.08 + tick * 0.1
    const spread = plateWidth * (0.4 + tick * 0.15)
    const wash = ctx.createLinearGradient(centreX - spread, 0, centreX + spread, 0)
    wash.addColorStop(0, withAlpha(palette.crimson, 0))
    wash.addColorStop(0.5, withAlpha(palette.crimson, glow))
    wash.addColorStop(1, withAlpha(palette.crimson, 0))
    ctx.fillStyle = wash
    ctx.fillRect(centreX - spread, channelTop, spread * 2, channelHeight)

    const top = channelTop - channelHeight * 0.1
    const bottom = channelTop + channelHeight * 1.1

    // A dim sheath under a warm core, so the blade holds an edge against both
    // the dark slab and the lit one.
    ctx.strokeStyle = withAlpha(palette.goldDim, 0.5)
    ctx.lineWidth = lit ? 4.5 : 3.5
    ctx.beginPath()
    ctx.moveTo(centreX, top)
    ctx.lineTo(centreX, bottom)
    ctx.stroke()

    ctx.strokeStyle = lit ? palette.goldBright : palette.gold
    ctx.lineWidth = lit ? 1.8 : 1.2
    ctx.beginPath()
    ctx.moveTo(centreX, top)
    ctx.lineTo(centreX, bottom)
    ctx.stroke()

    const chevron = Math.max(plateWidth * 0.085, 7)
    const bar = chevron * 2.4
    ctx.fillStyle = lit ? palette.goldBright : palette.gold
    for (const [y, direction] of [
      [top, 1],
      [bottom, -1]
    ] as const) {
      ctx.fillRect(centreX - bar / 2, y - 1, bar, 2)
      ctx.beginPath()
      ctx.moveTo(centreX, y + chevron * direction)
      ctx.lineTo(centreX - chevron * 0.78, y)
      ctx.lineTo(centreX + chevron * 0.78, y)
      ctx.closePath()
      ctx.fill()
    }
  }

  /**
   * Boundary-crossing detector for the rail, counted in plates.
   *
   * Slab `k` is centred on the mark when the strip has travelled exactly `k`
   * plates, so a gap crosses the mark at every half — which is what this
   * counts.
   *
   * Deliberately not `tickIndexAt`. That measures a ring against a pointer at
   * twelve o'clock, so feeding it a fabricated rotation folded `POINTER_ANGLE`
   * into the answer as a `count / 4` plate offset: on eight petitions the mark
   * struck when a slab was centred beneath it instead of when a gap passed,
   * and on five it struck three-quarters of the way across a slab.
   */
  private plateTick(plates: number, now: number, spinning: boolean): number {
    if (spinning) {
      const index = Math.floor(plates + 0.5)
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

  // ---------------------------------------------------------------- descent

  /**
   * THE DESCENT — the motes are loosed and Nayara takes one.
   *
   * One mote per petition is released into a vertical shaft, falls through a
   * gauntlet of lattice, vanes and colonnade, and the first to break the
   * planet's surface is taken. The physics is real, unrigged and simulated once
   * per command in `rite.descent.ts`; read the header there for how a live
   * simulation is reconciled with a winner that was drawn before it started.
   *
   * Drawn in perspective rather than flat, because the shaft's whole point is
   * depth: a mote's `z` decides whether it clears a peg, and a flat projection
   * throws away the axis that decides the result. The camera is fixed — no
   * orbit — so the composition stays symmetrical and both surfaces frame the
   * event identically. The plexus behind it supplies the only ambient motion,
   * exactly as it does on the ring and the boot screen.
   */
  private drawDescent(
    now: number,
    spin: SpinCommand | null,
    count: number,
    progress: number,
    spinning: boolean,
    revealIndex: number | null,
    resolved: boolean
  ): void {
    const { context: ctx, palette, width, height } = this

    // Same staleness guard the procession uses: `removeOnSelect` rewrites the
    // roster the moment a result lands, and a plan baked for a different roster
    // size would put the wrong petition on the mote Nayara took.
    const command = spin && spin.segmentCount === count ? spin : null

    /*
     * Camera. Sized so the shaft's mouth spans the frame with the throat
     * comfortably inside it.
     *
     * The mouth projects wider than the shaft is tall — perspective spreads the
     * near end — which is what makes a tall structure sit properly in a 16:9
     * frame instead of leaving two dead columns beside it.
     */
    this.shaftSpan = Math.min(width / 2.36, height / 1.2)
    this.shaftX = width / 2
    this.shaftY = height * 0.46

    const plan = command ? descentPlan(command, count) : null
    const frame = plan && command ? descentFrameAt(plan, command, this.spinClock(command)) : null
    this.descentAbsorbed = frame?.absorbed ?? 0
    // How close the descent is to ending, for the aperture's anticipation.
    this.descentApproach = frame ? clamp01(frame.progress * 1.15) : 0

    this.drawShaftPlexus()
    this.drawNayara(command, now)
    this.drawShaftWall()

    this.collectDescent(plan, frame ? frame.frame : 0, count)
    this.paintDescent(plan, revealIndex)

    this.drawDescentGauge()

    // Footer, on the same rhythm as the procession's.
    if (spinning) this.drawProgressRule(height - height * 0.055, progress)
    if (resolved && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      if (label) {
        this.drawStampAt(width / 2, height * 0.9, Math.min(width * 0.56, height * 0.9), label)
      }
    }

    if (!command) {
      ctx.font = `${Math.max(8, this.shaftSpan * 0.026)}px ${palette.mono}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = withAlpha(palette.labelDim, 0.7)
      ctx.fillText('THE PORTS ARE SEALED', width / 2, height * 0.9)
      ctx.textAlign = 'left'
    }
  }

  /**
   * World to screen.
   *
   * Writes into scratch fields rather than returning a point: this runs several
   * hundred times a frame once the plexus links are counted, and a fresh object
   * for each one is a megabyte a second of garbage for no benefit.
   */
  private project(x: number, y: number, z: number): void {
    const dy = y - DESCENT_LOOK_Y
    const depth = DESCENT_CAM_DIST + dy * DESCENT_SIN + z * DESCENT_COS
    // Clamped off zero: a point behind the camera would otherwise invert, and
    // the near plane sits well outside the shaft anyway.
    const unit = (DESCENT_FOCAL / Math.max(depth, 0.35)) * this.shaftSpan
    this.pDepth = depth
    this.pUnit = unit
    this.pX = this.shaftX + x * unit
    this.pY = this.shaftY + (dy * DESCENT_COS - z * DESCENT_SIN) * unit
  }

  /** Depth cue: 0 at the near wall, 1 at the far one. */
  private fog(depth: number): number {
    return clamp01((depth - (DESCENT_CAM_DIST - 1.1)) / 2.2)
  }

  /**
   * The resonance field, reshaped to line the shaft.
   *
   * The same node cloud the ring uses, stretched from a sphere into a tall
   * column and projected through the descent's camera, so the plexus reads as
   * the shaft's own hum rather than a backdrop pasted behind it. Omun is a
   * resonance event originating inside the planet; this is the one place in the
   * console where that is literally what is being drawn.
   */
  private drawShaftPlexus(): void {
    const { context: ctx, palette } = this
    const cos = Math.cos(this.fieldRotation)
    const sin = Math.sin(this.fieldRotation)

    const px: number[] = this.plexusX
    const py: number[] = this.plexusY
    const pf: number[] = this.plexusFog
    let n = 0

    for (const node of this.field) {
      // Sphere to column: the radius is pushed out past the shaft wall and the
      // vertical axis is stretched over the whole drop, so the nodes surround
      // the course instead of sitting inside it.
      const x = (node.x * cos - node.z * sin) * 1.24 * node.jitter
      const z = (node.x * sin + node.z * cos) * 1.24 * node.jitter
      const y = 0.5 + node.y * 0.78

      this.project(x, y, z)
      px[n] = this.pX
      py[n] = this.pY
      pf[n] = this.fog(this.pDepth)
      n += 1
    }

    // Links first, so the nodes sit on top of their own web.
    ctx.lineWidth = 1
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = px[i] - px[j]
        const dy = py[i] - py[j]
        const span = this.shaftSpan * 0.2
        const distSq = dx * dx + dy * dy
        if (distSq > span * span) continue

        const near = 1 - Math.sqrt(distSq) / span
        const dim = 1 - (pf[i] + pf[j]) * 0.5
        ctx.strokeStyle = withAlpha(palette.goldDim, near * dim * 0.16)
        ctx.beginPath()
        ctx.moveTo(px[i], py[i])
        ctx.lineTo(px[j], py[j])
        ctx.stroke()
      }
    }

    for (let i = 0; i < n; i += 1) {
      ctx.fillStyle = withAlpha(palette.gold, (1 - pf[i]) * 0.34)
      ctx.beginPath()
      ctx.arc(px[i], py[i], 1.5, 0, TAU)
      ctx.fill()
    }
  }

  /**
   * The shaft: stacked rings and vertical ribs.
   *
   * The rings are what make the throat legible — you can see the shaft close
   * before any mote reaches it — and the ribs are the brief's golden ribbing,
   * which is also the only thing that tells the eye the structure is a
   * cylinder rather than a stack of unrelated ellipses.
   */
  private drawShaftWall(): void {
    const { context: ctx, palette } = this

    for (let step = 0; step <= DESCENT_WALL_RINGS; step += 1) {
      const y = (step / DESCENT_WALL_RINGS) * 1.02 - 0.06
      const radius = shaftRadius(y)
      // A ring at the throat is a quarter the mouth's size, so its line has to
      // carry more weight or the bottom of the shaft dissolves.
      const emphasis = 0.5 + (1 - radius) * 0.7
      this.ellipse(0, y, radius)
      ctx.strokeStyle = withAlpha(palette.goldDim, 0.1 + emphasis * 0.14)
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.lineWidth = 1
    for (let rib = 0; rib < DESCENT_RIBS; rib += 1) {
      const angle = (rib / DESCENT_RIBS) * TAU
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      ctx.beginPath()
      for (let step = 0; step <= DESCENT_WALL_RINGS; step += 1) {
        const y = (step / DESCENT_WALL_RINGS) * 1.02 - 0.06
        const radius = shaftRadius(y)
        this.project(cos * radius, y, sin * radius)
        if (step === 0) ctx.moveTo(this.pX, this.pY)
        else ctx.lineTo(this.pX, this.pY)
      }
      // Ribs on the far side read as behind the course; near ones frame it.
      const front = (sin + 1) / 2
      ctx.strokeStyle = withAlpha(palette.goldDim, 0.08 + front * 0.16)
      ctx.stroke()
    }
  }

  /** A horizontal circle in the shaft, as a screen-space path. */
  private ellipse(y: number, atY: number, radius: number): void {
    const ctx = this.context
    ctx.beginPath()
    for (let i = 0; i <= DESCENT_ELLIPSE_STEPS; i += 1) {
      const angle = (i / DESCENT_ELLIPSE_STEPS) * TAU
      this.project(Math.cos(angle) * radius + y, atY, Math.sin(angle) * radius)
      if (i === 0) ctx.moveTo(this.pX, this.pY)
      else ctx.lineTo(this.pX, this.pY)
    }
    ctx.closePath()
  }

  /**
   * Nayara, and the aperture into it.
   *
   * The planet is the composition's floor: a dark limb across the bottom of the
   * frame with a warm rim where the shaft's light reaches it, and the aperture
   * as the one crimson thing on screen until a mote is taken. That is the
   * single-focal-object rule applied literally — the whole descent is a
   * hundred small objects converging on one.
   *
   * On capture the surface answers with Omun: rings of resonance travelling out
   * from the aperture across the limb.
   */
  private drawNayara(command: SpinCommand | null, now: number): void {
    const { context: ctx, palette, width, height } = this

    // The limb. Drawn as a wide, shallow arc so it reads as a body far larger
    // than the frame rather than a bowl sitting in it.
    this.project(0, 1, 0)
    const surfaceY = this.pY
    const unit = this.pUnit
    const curve = unit * 2.4

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-width, height + 10)
    ctx.lineTo(-width, surfaceY + curve * 0.42)
    ctx.quadraticCurveTo(width / 2, surfaceY - curve * 0.06, width * 2, surfaceY + curve * 0.42)
    ctx.lineTo(width * 2, height + 10)
    ctx.closePath()
    ctx.clip()

    const body = ctx.createLinearGradient(0, surfaceY - unit * 0.1, 0, height)
    body.addColorStop(0, withAlpha(palette.wedgeB, 0.98))
    body.addColorStop(1, withAlpha(palette.wedgeA, 1))
    ctx.fillStyle = body
    ctx.fillRect(0, surfaceY - unit * 0.2, width, height)

    // Omun: the planet answering. Only after it has taken something.
    const absorbed = this.descentAbsorbed
    if (absorbed > 0) {
      for (let ring = 0; ring < 3; ring += 1) {
        const phase = clamp01(absorbed * 1.6 - ring * 0.22)
        if (phase <= 0 || phase >= 1) continue
        ctx.strokeStyle = withAlpha(palette.crimson, (1 - phase) * 0.5)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(
          width / 2,
          surfaceY,
          unit * 0.34 + phase * unit * 2.6,
          (unit * 0.34 + phase * unit * 2.6) * DESCENT_SIN,
          0,
          0,
          TAU
        )
        ctx.stroke()
      }
    }
    ctx.restore()

    // The horizon: a warm rim where the shaft's light grazes the surface.
    ctx.strokeStyle = withAlpha(palette.gold, 0.34)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(0, surfaceY + curve * 0.42 * (1 - 0) - 0)
    ctx.quadraticCurveTo(width / 2, surfaceY - curve * 0.06, width, surfaceY + curve * 0.42)
    ctx.stroke()

    /*
     * The aperture. Crimson, and brighter the closer the descent is to ending —
     * the planet is not passive, it is waiting.
     *
     * It breathes even with nothing falling, on the same slow period as the
     * ring's orb. A shaft with a dead aperture reads as a diagram of a
     * mechanism rather than a mechanism that is switched on.
     */
    const breath = 0.5 + Math.sin(now / 1400) * 0.5
    const glow = command
      ? 0.18 + this.descentApproach * 0.34 + absorbed * 0.45 + breath * 0.06
      : 0.1 + breath * 0.08
    const apertureR = shaftRadius(1) * unit
    const halo = ctx.createRadialGradient(
      width / 2,
      surfaceY,
      0,
      width / 2,
      surfaceY,
      apertureR * 2.6
    )
    halo.addColorStop(0, withAlpha(palette.crimson, Math.min(glow, 0.9)))
    halo.addColorStop(0.42, withAlpha(palette.crimsonDeep, glow * 0.5))
    halo.addColorStop(1, withAlpha(palette.crimsonVoid, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.ellipse(width / 2, surfaceY, apertureR * 2.6, apertureR * 2.6 * DESCENT_SIN, 0, 0, TAU)
    ctx.fill()

    this.ellipse(0, 1, shaftRadius(1))
    ctx.fillStyle = withAlpha(palette.crimsonVoid, 0.92)
    ctx.fill()
    ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.5 + absorbed * 0.4)
    ctx.lineWidth = 1.6
    ctx.stroke()
  }

  /**
   * Gathers everything with a depth into one list, so it can be drawn in order.
   *
   * A single sorted pass rather than a pass per category. Motes are spread
   * across the shaft's whole depth, so drawing all the structure and then all
   * the motes puts a mote at the back of the shaft on top of a peg at the
   * front — and since the mote's depth is exactly what decided its path, that
   * is the one cue this presentation cannot afford to get wrong.
   *
   * The item pool is reused between frames. At a full roster this is around two
   * hundred items, and reallocating them sixty times a second is pure waste.
   */
  private collectDescent(plan: DescentPlan | null, frame: number, count: number): void {
    const { pegs, pillars, vanes } = DESCENT_COURSE
    let n = 0

    const push = (
      kind: number,
      x: number,
      y: number,
      radius: number,
      depth: number,
      x2 = 0,
      y2 = 0,
      mote = -1
    ): void => {
      const item = this.descentItems[n] ?? (this.descentItems[n] = DESCENT_ITEM())
      item.kind = kind
      item.x = x
      item.y = y
      item.radius = radius
      item.depth = depth
      item.x2 = x2
      item.y2 = y2
      item.mote = mote
      n += 1
    }

    for (const peg of pegs) {
      this.project(peg.x, peg.y, peg.z)
      push(DESCENT_PEG, this.pX, this.pY, peg.r * this.pUnit, this.pDepth)
    }

    for (const pillar of pillars) {
      this.project(pillar.x, pillar.top, pillar.z)
      const topX = this.pX
      const topY = this.pY
      const unit = this.pUnit
      const depth = this.pDepth
      this.project(pillar.x, pillar.bottom, pillar.z)
      push(
        DESCENT_PILLAR,
        topX,
        topY,
        pillar.r * (unit + this.pUnit) * 0.5,
        (depth + this.pDepth) * 0.5,
        this.pX,
        this.pY
      )
    }

    for (const vane of vanes) {
      const angle = vaneAngle(vane, frame)
      for (let arm = 0; arm < vane.arms; arm += 1) {
        const a = angle + (arm / vane.arms) * TAU
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        this.project(cos * vane.inner, vane.y, sin * vane.inner)
        const innerX = this.pX
        const innerY = this.pY
        const unit = this.pUnit
        const depth = this.pDepth
        this.project(cos * vane.outer, vane.y, sin * vane.outer)
        push(
          DESCENT_VANE,
          innerX,
          innerY,
          vane.r * (unit + this.pUnit) * 0.5,
          (depth + this.pDepth) * 0.5,
          this.pX,
          this.pY
        )
      }
    }

    if (plan) {
      for (let mote = 0; mote < count; mote += 1) {
        if (frame < plan.releaseFrame[mote]) continue
        const at = motePosition(plan, mote, frame)
        this.project(at.x, at.y, at.z)
        push(DESCENT_MOTE, this.pX, this.pY, MOTE_RADIUS * this.pUnit, this.pDepth, 0, 0, mote)
      }
    }

    const order = this.descentOrder
    order.length = n
    for (let i = 0; i < n; i += 1) order[i] = i
    // Back to front, so nearer things overwrite further ones.
    order.sort((a, b) => this.descentItems[b].depth - this.descentItems[a].depth)
  }

  /** Draws the collected course and motes in depth order. */
  private paintDescent(plan: DescentPlan | null, revealIndex: number | null): void {
    const { context: ctx, palette } = this
    const takenMote = plan?.capturedMote ?? -1
    const numberSize = Math.max(7, this.shaftSpan * 0.03)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (const index of this.descentOrder) {
      const item = this.descentItems[index]
      const dim = 1 - this.fog(item.depth) * 0.72

      switch (item.kind) {
        case DESCENT_PEG: {
          // Lit from above, like everything else in this world: a warm crown
          // and a cold body, which is what makes a flat disc read as a sphere.
          const shade = ctx.createLinearGradient(
            item.x,
            item.y - item.radius,
            item.x,
            item.y + item.radius
          )
          shade.addColorStop(0, withAlpha(palette.brass, dim * 0.95))
          shade.addColorStop(1, withAlpha(palette.wedgeA, dim))
          ctx.fillStyle = shade
          ctx.beginPath()
          ctx.arc(item.x, item.y, item.radius, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = withAlpha(palette.gold, dim * 0.4)
          ctx.lineWidth = 1
          ctx.stroke()
          break
        }

        case DESCENT_PILLAR: {
          ctx.strokeStyle = withAlpha(palette.wedgeA, dim)
          ctx.lineWidth = item.radius * 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(item.x, item.y)
          ctx.lineTo(item.x2, item.y2)
          ctx.stroke()
          // A gold edge down one side only — a pillar lit from the shaft's
          // axis, not a tube with an outline.
          ctx.strokeStyle = withAlpha(palette.goldDim, dim * 0.55)
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(item.x - item.radius * 0.55, item.y)
          ctx.lineTo(item.x2 - item.radius * 0.55, item.y2)
          ctx.stroke()
          break
        }

        case DESCENT_VANE: {
          ctx.strokeStyle = withAlpha(palette.brass, dim)
          ctx.lineWidth = item.radius * 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(item.x, item.y)
          ctx.lineTo(item.x2, item.y2)
          ctx.stroke()
          ctx.strokeStyle = withAlpha(palette.gold, dim * 0.7)
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(item.x, item.y)
          ctx.lineTo(item.x2, item.y2)
          ctx.stroke()
          break
        }

        default: {
          if (!plan) break
          const petition = plan.petitionOf[item.mote]
          const isTaken = item.mote === takenMote
          const lit = isTaken && this.descentAbsorbed > 0

          // The taken mote is drawn into the aperture over the settle: it
          // shrinks and ignites rather than simply stopping, so the moment
          // Nayara closes on it is a movement and not a caption.
          const shrink = lit ? 1 - this.descentAbsorbed * 0.55 : 1
          const radius = Math.max(item.radius * shrink, 1)

          if (lit) {
            const bloom = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, radius * 4)
            bloom.addColorStop(0, withAlpha(palette.crimson, 0.5))
            bloom.addColorStop(1, withAlpha(palette.crimson, 0))
            ctx.fillStyle = bloom
            ctx.beginPath()
            ctx.arc(item.x, item.y, radius * 4, 0, TAU)
            ctx.fill()
          }

          // Motes that lost fade back once the result is in, so the frame ends
          // on one object.
          const spent = this.descentAbsorbed > 0 && !isTaken ? 1 - this.descentAbsorbed * 0.7 : 1
          const shell = ctx.createLinearGradient(item.x, item.y - radius, item.x, item.y + radius)
          if (lit) {
            shell.addColorStop(0, withAlpha(palette.crimsonBright, dim))
            shell.addColorStop(1, withAlpha(palette.crimsonDeep, dim))
          } else {
            shell.addColorStop(0, withAlpha(palette.label, dim * spent * 0.92))
            shell.addColorStop(1, withAlpha(palette.brass, dim * spent))
          }
          ctx.fillStyle = shell
          ctx.beginPath()
          ctx.arc(item.x, item.y, radius, 0, TAU)
          ctx.fill()

          ctx.strokeStyle = withAlpha(
            lit ? palette.crimsonBright : palette.gold,
            dim * spent * (lit ? 0.95 : 0.62)
          )
          ctx.lineWidth = lit ? 1.6 : 1
          ctx.stroke()

          // The filed number, the same anchor the rail and the roster use. Only
          // while the mote is big enough on screen to hold it.
          if (radius > numberSize * 0.62 && petition !== undefined) {
            ctx.font = `${numberSize}px ${palette.mono}`
            ctx.fillStyle = withAlpha(lit ? palette.label : palette.wedgeA, dim * spent * 0.95)
            ctx.fillText(String(petition + 1).padStart(2, '0'), item.x, item.y + 0.5)
          }
          break
        }
      }
    }

    ctx.lineCap = 'butt'
    ctx.textAlign = 'left'

    // The winner's name, carried by the mote rather than only by the stamp, so
    // the eye can follow the result back to the object that earned it.
    if (plan && this.descentAbsorbed > 0.35 && revealIndex !== null) {
      const label = this.state.winnerLabel ?? this.state.petitions[revealIndex]?.label
      const at = motePosition(plan, takenMote, plan.capturedFrame)
      if (label) {
        this.project(at.x, at.y, at.z)
        const size = Math.max(9, this.shaftSpan * 0.036)
        ctx.font = `${size}px ${palette.display}`
        ctx.textAlign = 'center'
        ctx.fillStyle = withAlpha(palette.label, clamp01((this.descentAbsorbed - 0.35) * 2.4))
        ctx.fillText(
          this.fitText(label.toUpperCase(), this.shaftSpan * 0.9),
          this.pX,
          this.pY - size * 1.8
        )
        ctx.textAlign = 'left'
      }
    }
  }

  /**
   * The depth gauge down the left edge.
   *
   * Every zone of the gauntlet named and measured, in the register this world
   * uses for everything else: an institution does not build a hazard and leave
   * it unlabelled. It also does real work — it tells a viewer who joined
   * mid-descent how far there is left to fall.
   */
  private drawDescentGauge(): void {
    const { context: ctx, palette } = this
    const size = Math.max(6, this.shaftSpan * 0.022)
    const x = Math.max(this.shaftX - this.shaftSpan * 1.16, size)

    ctx.font = `${size}px ${palette.mono}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    this.project(0, -0.06, 0)
    const top = this.pY
    this.project(0, 1, 0)
    const bottom = this.pY

    ctx.strokeStyle = withAlpha(palette.goldDim, 0.3)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()

    for (const zone of DESCENT_ZONES) {
      this.project(0, zone.y, 0)
      const y = this.pY
      ctx.strokeStyle = withAlpha(palette.gold, 0.42)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + size * 0.7, y)
      ctx.stroke()
      ctx.fillStyle = withAlpha(zone.focal ? palette.crimsonBright : palette.gold, 0.62)
      ctx.fillText(zone.label, x + size * 1.1, y)
    }
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
