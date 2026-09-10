import type { AntechamberConfig } from '@shared/domain/antechamber'
import { readCustomProperty, withAlpha } from '@renderer/overlays/colour'

/**
 * THE ANTECHAMBER — the waiting field.
 *
 * The screen a broadcast opens on, before anything is being said. It carries no
 * text, no clock and no readout: the countdown, the chat and the now-playing
 * are separate browser sources composited over it in OBS, and duplicating any
 * of them here would mean two of everything to keep in step.
 *
 * So this is *only* the field, and it fills whatever it is given.
 *
 * ## What it draws, back to front
 *
 * 1. **Wash** — two enormous radial blooms drifting on slow, mutually prime
 *    orbits, so the composition never repeats within a sitting.
 * 2. **Ribbons** — long sine-driven bands, stroked several times at falling
 *    alpha to fake a glow.
 * 3. **Field** — a plexus of nodes with a connection threshold, the same idea
 *    as the one behind the rite ring, taken to full frame.
 * 4. **Rings** — pulses emitted from the drifting focus and expanding out.
 * 5. **Grain and vignette** — the house texture, which is what stops the
 *    gradients banding on a compressed stream.
 *
 * ## Why it is written this way
 *
 * `shadowBlur` is the obvious way to glow and is not used anywhere here: it is
 * per-stroke and murderously slow at 1080p, and a source that drops frames
 * while nothing is happening is worse than one that glows less. Everything soft
 * is done with overlapping strokes at falling alpha, which the GPU handles as
 * ordinary fills.
 *
 * Nothing allocates per frame. Nodes, ribbons and rings are pooled at
 * construction and mutated in place — this runs for twenty minutes before a
 * stream, and a per-frame allocation is a garbage collection pause the audience
 * sees as a stutter.
 */

const TAU = Math.PI * 2

const FALLBACK = {
  crimson: '#a32b23',
  crimsonBright: '#c4453a',
  gold: '#b98b47',
  goldBright: '#d2a961',
  obsidian: '#08080a',
  alabaster: '#ddcfb2'
}

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  /** Drives the size and brightness cycle, so nodes do not pulse in lockstep. */
  phase: number
}

interface Ribbon {
  /** Vertical position as a fraction of height. */
  y: number
  amplitude: number
  /** Cycles across the frame. Fractional, so bands do not align. */
  frequency: number
  speed: number
  thickness: number
  phase: number
  /** 0 for the first palette colour, 1 for the second. */
  tint: number
}

interface Ring {
  /** 0..1 through its life. Reset rather than reallocated. */
  age: number
  life: number
  tint: number
}

export interface AntechamberFaceOptions {
  motion?: boolean
}

export class AntechamberFace {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private palette: typeof FALLBACK

  private config: AntechamberConfig
  private motion: boolean

  private width = 0
  private height = 0
  private running = false
  private frameHandle = 0
  private lastFrameAt = 0

  /** Seconds of drawn time. Every motion here is a function of this alone. */
  private clock = 0

  private nodes: Node[] = []
  private ribbons: Ribbon[] = []
  private rings: Ring[] = []

  /**
   * The grain, drawn once into a small tile and repeated.
   *
   * Generating noise per frame at full resolution costs more than everything
   * else combined. A 128px tile repeated across the frame is indistinguishable
   * once it is over a moving gradient, and it is one pattern fill.
   */
  private grain: CanvasPattern | null = null

  constructor(
    canvas: HTMLCanvasElement,
    config: AntechamberConfig,
    options: AntechamberFaceOptions = {}
  ) {
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.config = config
    this.motion = options.motion ?? true
    this.palette = readPalette(document.documentElement)

    this.buildGrain()
    this.resize()
  }

  setConfig(config: AntechamberConfig): void {
    const densityChanged = config.density !== this.config.density
    this.config = config
    if (densityChanged) this.seed()
  }

  setMotion(enabled: boolean): void {
    this.motion = enabled
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
    /*
     * Backing store at CSS pixels, not device pixels.
     *
     * A browser source in OBS is captured at the size it is configured at, so
     * there is no retina to serve — and at 1080p a devicePixelRatio of 2 would
     * quadruple the fill cost for nothing anyone will ever see.
     */
    const width = Math.max(Math.round(rect.width), 1)
    const height = Math.max(Math.round(rect.height), 1)

    if (width === this.width && height === this.height) return

    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height

    this.seed()
  }

  // ------------------------------------------------------------------ seeding

  /**
   * Lays out the pools for the current size and density.
   *
   * Called on resize as well as on a density change, because a node count that
   * suits a 1920-wide frame is a snowstorm in a 480-wide preview — the count
   * scales with area rather than being fixed.
   */
  private seed(): void {
    const area = (this.width * this.height) / 1_000_000
    const nodeCount = Math.round(clamp(area, 0.15, 4) * 26 * this.config.density)

    this.nodes = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      // Slow. These are meant to read as drift, not as a screensaver.
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      phase: Math.random() * TAU
    }))

    const ribbonCount = Math.max(3, Math.round(6 * this.config.density))
    this.ribbons = Array.from({ length: ribbonCount }, (_, index) => ({
      y: (index + 0.5) / ribbonCount,
      amplitude: 0.05 + Math.random() * 0.13,
      // Deliberately irrational-ish so bands never come back into alignment.
      frequency: 0.7 + Math.random() * 1.6,
      speed: 0.06 + Math.random() * 0.14,
      thickness: 1 + Math.random() * 2.4,
      phase: Math.random() * TAU,
      tint: index % 2
    }))

    this.rings = Array.from({ length: 5 }, (_, index) => ({
      // Staggered at birth, so the first five do not leave together.
      age: index / 5,
      life: 9 + Math.random() * 7,
      tint: index % 2
    }))
  }

  /** A tile of monochrome noise, built once. */
  private buildGrain(): void {
    const size = 128
    const tile = document.createElement('canvas')
    tile.width = size
    tile.height = size

    const ctx = tile.getContext('2d')
    if (!ctx) return

    const image = ctx.createImageData(size, size)
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 128 + (Math.random() - 0.5) * 255
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)

    this.grain = this.context.createPattern(tile, 'repeat')
  }

  // -------------------------------------------------------------------- frame

  private frame(now: number): void {
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now
    if (this.motion) this.clock += delta * this.config.speed

    const { context: ctx } = this
    if (this.width <= 0 || this.height <= 0) return

    ctx.clearRect(0, 0, this.width, this.height)

    /*
     * The backdrop is opaque unless the operator asks otherwise.
     *
     * This is the bottom of a scene rather than furniture laid over one — the
     * whole point is that nothing shows through. `transparent` is there for the
     * case where it is composited over a capture instead.
     */
    if (!this.config.transparent) {
      ctx.fillStyle = this.palette.obsidian
      ctx.fillRect(0, 0, this.width, this.height)
    }

    this.drawWash()
    if (this.config.ribbons) this.drawRibbons()
    if (this.config.field) this.drawField(delta)
    if (this.config.rings) this.drawRings(delta)
    if (this.config.grain) this.drawGrain()
    this.drawVignette()
  }

  /** The two colours in play, resolved from the chosen palette. */
  private tints(): [string, string] {
    const { crimsonBright, goldBright, alabaster } = this.palette

    switch (this.config.palette) {
      case 'crimson':
        return [crimsonBright, this.palette.crimson]
      case 'gold':
        return [goldBright, this.palette.gold]
      case 'ash':
        return [alabaster, this.palette.gold]
      default:
        return [crimsonBright, goldBright]
    }
  }

  /**
   * Where the composition is centred at this instant.
   *
   * Two sine pairs at unrelated periods, which traces a Lissajous path that
   * does not close — so the focus wanders indefinitely rather than orbiting.
   */
  private focus(): { x: number; y: number } {
    const t = this.clock
    return {
      x: this.width * (0.5 + 0.22 * Math.sin(t * 0.037) + 0.08 * Math.sin(t * 0.011)),
      y: this.height * (0.5 + 0.18 * Math.cos(t * 0.029) + 0.07 * Math.sin(t * 0.017))
    }
  }

  private drawWash(): void {
    const { context: ctx } = this
    const [first, second] = this.tints()
    const focus = this.focus()
    const reach = Math.max(this.width, this.height)
    const strength = this.config.intensity

    ctx.globalCompositeOperation = 'lighter'

    // The near bloom, on the focus.
    const near = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, reach * 0.75)
    near.addColorStop(0, withAlpha(first, 0.42 * strength))
    near.addColorStop(0.35, withAlpha(first, 0.14 * strength))
    near.addColorStop(1, withAlpha(first, 0))
    ctx.fillStyle = near
    ctx.fillRect(0, 0, this.width, this.height)

    // The far bloom, counter-drifting, so the two cross rather than travel
    // together — which is what stops the frame reading as one moving light.
    const t = this.clock
    const fx = this.width * (0.5 - 0.26 * Math.sin(t * 0.023))
    const fy = this.height * (0.5 - 0.2 * Math.cos(t * 0.019))
    const far = ctx.createRadialGradient(fx, fy, 0, fx, fy, reach * 0.6)
    far.addColorStop(0, withAlpha(second, 0.3 * strength))
    far.addColorStop(0.4, withAlpha(second, 0.1 * strength))
    far.addColorStop(1, withAlpha(second, 0))
    ctx.fillStyle = far
    ctx.fillRect(0, 0, this.width, this.height)

    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * Long horizontal bands, glowing.
   *
   * Each is stroked three times — wide and faint, then narrower and brighter —
   * which reads as a glow and costs three fills rather than a shadow blur.
   */
  private drawRibbons(): void {
    const { context: ctx } = this
    const tints = this.tints()
    const step = Math.max(this.width / 90, 8)

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    for (const ribbon of this.ribbons) {
      const colour = tints[ribbon.tint]
      const drift = this.clock * ribbon.speed + ribbon.phase

      ctx.beginPath()
      for (let x = -step; x <= this.width + step; x += step) {
        const u = x / this.width
        const y =
          this.height *
          (ribbon.y +
            ribbon.amplitude * Math.sin(u * TAU * ribbon.frequency + drift) +
            ribbon.amplitude * 0.35 * Math.sin(u * TAU * ribbon.frequency * 2.3 - drift * 1.7))

        if (x <= -step) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      const scale = Math.min(this.width, this.height) / 600
      for (const [width, alpha] of [
        [ribbon.thickness * 9 * scale, 0.05],
        [ribbon.thickness * 3.5 * scale, 0.09],
        [ribbon.thickness * 1.1 * scale, 0.22]
      ]) {
        ctx.lineWidth = Math.max(width, 0.6)
        ctx.strokeStyle = withAlpha(colour, alpha * this.config.intensity)
        ctx.stroke()
      }
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * The plexus: nodes that drift and connect when they are close.
   *
   * The connection pass is the expensive part — it is quadratic in node count —
   * so the count is bounded by `seed` and the inner loop starts at `i + 1` so a
   * pair is considered once rather than twice.
   */
  private drawField(delta: number): void {
    const { context: ctx } = this
    const [first, second] = this.tints()
    const reach = Math.min(this.width, this.height) * 0.18
    const reachSquared = reach * reach
    const drift = this.motion ? delta * this.config.speed : 0

    for (const node of this.nodes) {
      node.x += node.vx * drift
      node.y += node.vy * drift
      node.phase += drift * 0.6

      // Wrapped rather than bounced. A bounce puts a visible edge on the frame;
      // wrapping keeps the field looking larger than what is shown.
      if (node.x < -reach) node.x = this.width + reach
      if (node.x > this.width + reach) node.x = -reach
      if (node.y < -reach) node.y = this.height + reach
      if (node.y > this.height + reach) node.y = -reach
    }

    ctx.globalCompositeOperation = 'lighter'

    ctx.lineWidth = Math.max(Math.min(this.width, this.height) / 1400, 0.5)
    for (let i = 0; i < this.nodes.length; i += 1) {
      const a = this.nodes[i]

      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const b = this.nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = dx * dx + dy * dy
        if (distance > reachSquared) continue

        // Fades to nothing at the threshold, so a connection appears and goes
        // without the flicker a hard cutoff produces.
        const strength = 1 - distance / reachSquared
        ctx.strokeStyle = withAlpha(first, strength * strength * 0.18 * this.config.intensity)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    const unit = Math.max(Math.min(this.width, this.height) / 900, 0.8)
    for (const node of this.nodes) {
      const pulse = 0.6 + 0.4 * Math.sin(node.phase)
      ctx.fillStyle = withAlpha(second, 0.5 * pulse * this.config.intensity)
      ctx.beginPath()
      ctx.arc(node.x, node.y, unit * (1.1 + pulse), 0, TAU)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  /** Pulses expanding from the focus, each fading as it goes. */
  private drawRings(delta: number): void {
    const { context: ctx } = this
    const tints = this.tints()
    const focus = this.focus()
    const reach = Math.max(this.width, this.height) * 0.9
    const advance = this.motion ? delta * this.config.speed : 0

    ctx.globalCompositeOperation = 'lighter'

    for (const ring of this.rings) {
      ring.age += advance / ring.life
      if (ring.age >= 1) {
        // Reset in place. Pooled for the whole session; see the class note.
        ring.age = 0
        ring.life = 9 + Math.random() * 7
      }

      // Eased so a ring leaves quickly and then slows, which reads as depth.
      const progress = 1 - (1 - ring.age) * (1 - ring.age)
      const radius = progress * reach
      const fade = (1 - ring.age) * (1 - ring.age)

      ctx.strokeStyle = withAlpha(tints[ring.tint], fade * 0.22 * this.config.intensity)
      ctx.lineWidth = Math.max((1 - ring.age) * 3 * (Math.min(this.width, this.height) / 700), 0.4)
      ctx.beginPath()
      ctx.arc(focus.x, focus.y, radius, 0, TAU)
      ctx.stroke()
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * Film grain, and it earns its cost.
   *
   * A stream encoder turns a large smooth gradient into visible banding. Noise
   * over the top dithers it, so the wash stays smooth after compression — which
   * is the one place this looks worse than it does in the preview without it.
   */
  private drawGrain(): void {
    if (!this.grain) return

    const { context: ctx } = this
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.035
    // Offset each frame so the grain shimmers rather than sitting still, which
    // is what makes it read as film rather than as a dirty lens.
    ctx.translate(-Math.floor(Math.random() * 128), -Math.floor(Math.random() * 128))
    ctx.fillStyle = this.grain
    ctx.fillRect(0, 0, this.width + 128, this.height + 128)
    ctx.restore()
  }

  /** Corners pulled down, so the eye settles in the middle. */
  private drawVignette(): void {
    const { context: ctx } = this
    const reach = Math.max(this.width, this.height) * 0.75
    const cx = this.width / 2
    const cy = this.height / 2

    const gradient = ctx.createRadialGradient(cx, cy, reach * 0.35, cx, cy, reach)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, `rgba(0,0,0,${0.55 * this.config.vignette})`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, this.width, this.height)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** The five materials, read from CSS so the overlay and the console agree. */
function readPalette(root: HTMLElement): typeof FALLBACK {
  const styles = getComputedStyle(root)
  const read = (names: readonly string[], fallback: string): string =>
    readCustomProperty(styles, names, fallback)

  return {
    crimson: read(['--ch-crimson-500'], FALLBACK.crimson),
    crimsonBright: read(['--ch-crimson-400'], FALLBACK.crimsonBright),
    gold: read(['--ch-gold-500'], FALLBACK.gold),
    goldBright: read(['--ch-gold-300'], FALLBACK.goldBright),
    obsidian: read(['--ch-obsidian-900'], FALLBACK.obsidian),
    alabaster: read(['--ch-alabaster-300'], FALLBACK.alabaster)
  }
}
