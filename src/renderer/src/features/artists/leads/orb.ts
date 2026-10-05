import { TEMPERATURE_BANDS, type TemperatureBand } from '@shared/domain/leads.constants'

/**
 * The temperature orb: how warm a relationship is, drawn as a small sphere.
 *
 * Frozen, it's ice: frost grows in from the rim, sparkles catch in it, snow
 * falls past and light sweeps across. Neutral, it's calm, ringed in gold. Hot,
 * it burns: rays, churning heat, embers and sparks, and at supernova a
 * white-hot core and shock rings. Ported from the approved prototype with its
 * numbers as they were, so the orb on a lead's sheet and the ones down the
 * list are the ones that were signed off.
 *
 * One `Orb` draws one canvas. One loop drives every orb, and only the ones on
 * screen, allowed to move by the motion preference, and still changing.
 */

// ---------------------------------------------------------------- the scale

type Rgb = readonly [number, number, number]

/** The four colours an orb is drawn in at one temperature. */
interface Palette {
  /** The lit centre. */
  core: Rgb
  mid: Rgb
  /** The shadowed rim. */
  edge: Rgb
  /** The glow around it, its rim when hot, and its sparks. */
  glow: Rgb
}

/** Core, mid, edge and glow, by position, so each stop below stays on one row. */
const tint = (core: Rgb, mid: Rgb, edge: Rgb, glow: Rgb): Palette => ({ core, mid, edge, glow })

/**
 * The colours at each named stop. Keyed by the band's name rather than listed
 * with the values again, so leads.constants stays the one place the stops are
 * placed.
 */
const COLOURS: Record<TemperatureBand['label'], Palette> = {
  Frozen: tint([244, 251, 255], [150, 214, 250], [22, 66, 116], [120, 200, 255]),
  Cold: tint([222, 240, 255], [104, 170, 228], [22, 54, 100], [96, 166, 236]),
  Cool: tint([204, 216, 230], [102, 132, 168], [28, 42, 64], [104, 140, 186]),
  Neutral: tint([221, 207, 178], [138, 128, 113], [34, 30, 28], [182, 158, 124]),
  Warm: tint([255, 228, 174], [224, 150, 72], [98, 42, 16], [232, 150, 70]),
  Hot: tint([255, 240, 208], [255, 128, 52], [138, 30, 18], [255, 108, 48]),
  Supernova: tint([255, 255, 255], [255, 214, 128], [214, 62, 40], [255, 184, 104])
}

const STOPS = TEMPERATURE_BANDS.map((band) => ({ value: band.value, ...COLOURS[band.label] }))

const TAU = Math.PI * 2

const clamp = (x: number, min = 0, max = 1): number => Math.min(max, Math.max(min, x))
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f
const mix = (a: Rgb, b: Rgb, f: number): Rgb => [
  lerp(a[0], b[0], f),
  lerp(a[1], b[1], f),
  lerp(a[2], b[2], f)
]
const rgba = (c: Rgb, alpha = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`

/** 0 below `from`, 1 above `to`, and an S-curve between. */
function smooth(from: number, to: number, x: number): number {
  const t = clamp((x - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** The colours at any temperature, blended between the stops either side of it. */
function palette(value: number): Palette {
  let i = 0
  while (i < STOPS.length - 2 && value > STOPS[i + 1].value) i += 1
  const a = STOPS[i]
  const b = STOPS[i + 1]
  const f = clamp((value - a.value) / (b.value - a.value))
  return {
    core: mix(a.core, b.core, f),
    mid: mix(a.mid, b.mid, f),
    edge: mix(a.edge, b.edge, f),
    glow: mix(a.glow, b.glow, f)
  }
}

/** The glow's colour at a temperature, as CSS, for anything that should glow with the orb. */
export function temperatureColour(value: number): string {
  return rgba(palette(clamp(value, 0, 100)).glow)
}

/**
 * A small seeded random (mulberry32). Seeded so the frost comes out the same
 * on every redraw and every resize, rather than regrowing somewhere new.
 */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A seed from a name (FNV-1a), so each lead's frost grows its own way, and
 * the same way every time it's drawn, rather than every lead's ice matching.
 */
export function orbSeed(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

const DISPLAY_FALLBACK =
  "'Bahnschrift', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif"
let display: string | null = null

/** The console's display face, for the initials. Read from the theme once. */
function displayFont(): string {
  display ??=
    getComputedStyle(document.documentElement).getPropertyValue('--ch-font-display').trim() ||
    DISPLAY_FALLBACK
  return display
}

// ------------------------------------------------------------------ the orb

/**
 * The prototype's two orbs: the one on a lead's sheet, and the small ones down
 * the list. `detail` thins the arms, rays and particles out; `reach` is the
 * sphere's radius as a share of the canvas, the rest being room for its glow.
 */
const LOOKS = {
  focal: { detail: 1, reach: 0.235 },
  compact: { detail: 0.35, reach: 0.25 }
} as const

/** One stroke of frost, in CSS px from the centre. */
interface FrostSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** How grown the frost has to be before this stroke shows, 0 to 1. */
  birth: number
  w: number
  phase: number
}

/** A glint in the ice. */
interface Sparkle {
  x: number
  y: number
  birth: number
  speed: number
  phase: number
  r: number
}

interface Particle {
  kind: 'spark' | 'ember' | 'snow'
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds lived, and seconds to live. */
  life: number
  max: number
  r: number
  /** Snow only: where in its sway a flake starts. */
  sway: number
}

export interface OrbSetup {
  /** 0 to 100. */
  value: number
  /** CSS px, square. */
  size: number
  initials: string
  /** The small list orb: fewer arms, rays and particles. */
  compact: boolean
  /** From `orbSeed`. */
  seed: number
  /** Whether the motion preference lets it move. */
  motion: boolean
}

export class Orb {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly detail: number
  private readonly reach: number
  private readonly seed: number
  private readonly initials: string
  private motion: boolean
  private onScreen = false

  /** Where it's going, and where it's drawn: `shown` eases after `value`. */
  private value: number
  private shown: number
  /** How far the frost has grown, 0 to 1. */
  private frostGrowth: number

  /** In CSS px, at the pixel ratio the canvas was last fitted at. */
  private size = 0
  private ratio = 0
  /** The sphere's radius. */
  private R = 0
  private frost: FrostSegment[] = []
  private sparkles: Sparkle[] = []
  private particles: Particle[] = []
  /** Particles owed, kept between frames so a slow rate still spawns some. */
  private readonly spawn = { spark: 0, ember: 0, snow: 0 }

  constructor(canvas: HTMLCanvasElement, setup: OrbSetup) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    const look = setup.compact ? LOOKS.compact : LOOKS.focal

    this.canvas = canvas
    this.ctx = ctx
    this.detail = look.detail
    this.reach = look.reach
    this.seed = setup.seed
    this.initials = setup.initials
    this.motion = setup.motion
    // It arrives at its temperature; only a change after that eases.
    this.value = clamp(setup.value, 0, 100)
    this.shown = this.value
    this.frostGrowth = this.frostTarget()

    alive.add(this)
    if (alive.size === 1) watchRatio()
    this.setSize(setup.size)
  }

  // ------------------------------------------------------- what it's told

  setValue(value: number): void {
    const next = clamp(value, 0, 100)
    if (next === this.value) return
    this.value = next
    // Eased while it can be seen moving. Otherwise it's drawn where it's going
    // straight away, even off screen, so an orb scrolled back into view never
    // shows its old temperature while the observer catches up.
    if (this.motion && this.onScreen) wake(this)
    else this.drawNow()
  }

  /** Fits the canvas to `size` CSS px at the screen's pixel ratio. */
  setSize(size: number): void {
    const ratio = pixelRatio()
    const next = Math.max(0, size)
    if (next === this.size && ratio === this.ratio) return
    this.size = next
    this.ratio = ratio
    this.canvas.width = Math.round(next * ratio)
    this.canvas.height = Math.round(next * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.R = next * this.reach
    const rand = random(this.seed)
    this.frost = this.makeFrost(rand)
    this.sparkles = this.makeSparkles(rand)
    // They were placed for the old size.
    this.particles = []
    // Resizing cleared the canvas, so it's drawn again without waiting.
    this.drawNow()
  }

  /** Whether the motion preference lets it move. Without it, it's drawn still. */
  setMotion(motion: boolean): void {
    if (motion === this.motion) return
    this.motion = motion
    if (!motion) {
      rest(this)
      this.drawNow()
    } else if (this.onScreen) {
      wake(this)
    }
  }

  /** Whether any of it can be seen. Off screen it keeps its last frame and stops. */
  setOnScreen(visible: boolean): void {
    this.onScreen = visible
    if (visible && this.motion) wake(this)
    else rest(this)
  }

  /** Fits the canvas again, for a new pixel ratio. */
  refit(): void {
    this.setSize(this.size)
  }

  destroy(): void {
    rest(this)
    alive.delete(this)
    if (alive.size === 0) watchRatio()
    this.particles = []
  }

  // ------------------------------------------------------------ the frame

  /** The loop's call: ease, grow or melt the frost, move the particles, draw. */
  step(dt: number, now: number): void {
    const s = now / 1000
    this.shown += (this.value - this.shown) * (1 - Math.pow(0.0015, dt))
    // Snapped once within a hundredth, so it can arrive and rest.
    if (Math.abs(this.value - this.shown) < 0.01) this.shown = this.value
    // Grows and melts at the one rate, so the ice never jumps.
    const rate = dt * 0.85
    this.frostGrowth += clamp(this.frostTarget() - this.frostGrowth, -rate, rate)
    this.move(dt, s)
    this.draw(s)
    if (this.atRest()) rest(this)
  }

  /**
   * Whether the next frame would look like this one: arrived, no frost, no
   * particles, and not warm enough to throw embers. Only an orb near neutral
   * gets here, and it leaves the loop until it's told something new.
   */
  private atRest(): boolean {
    if (this.shown !== this.value || this.particles.length > 0) return false
    const heat = clamp((this.shown / 100 - 0.5) / 0.5)
    return heat <= 0.08 && this.frostGrowth <= 0.002 && this.frostTarget() <= 0.002
  }

  /** Where it's going, at once: what a still frame shows. */
  private settle(): void {
    this.shown = this.value
    this.frostGrowth = this.frostTarget()
    this.particles = []
    this.spawn.spark = 0
    this.spawn.ember = 0
    this.spawn.snow = 0
  }

  /**
   * Draws now, without waiting for the loop. Outside the loop it settles
   * first, and with motion off it's drawn at one fixed moment, so a still
   * frame is the same picture however often it's redrawn.
   */
  private drawNow(): void {
    if (awake.has(this)) {
      this.draw(performance.now() / 1000)
      return
    }
    this.settle()
    this.draw(this.motion ? performance.now() / 1000 : 0)
  }

  // ---------------------------------------------------------- the picture

  private frostTarget(): number {
    return smooth(0.06, 0.92, clamp((0.5 - this.shown / 100) / 0.5))
  }

  /** Ice creeping in from the rim: branches with side shoots at sixty degrees. */
  private makeFrost(rand: () => number): FrostSegment[] {
    const R = this.R
    const segments: FrostSegment[] = []
    const arms = Math.round(lerp(8, 18, this.detail))
    for (let a = 0; a < arms; a += 1) {
      const angle = (a / arms) * TAU + rand() * 0.35
      let x = Math.cos(angle) * R
      let y = Math.sin(angle) * R
      let dir = angle + Math.PI + (rand() - 0.5) * 0.6
      const steps = 9
      const step = (R * (0.35 + rand() * 0.45)) / steps
      for (let s = 0; s < steps; s += 1) {
        const nx = x + Math.cos(dir) * step
        const ny = y + Math.sin(dir) * step
        const birth = (s / steps) * 0.88 + rand() * 0.08
        segments.push({
          x1: x,
          y1: y,
          x2: nx,
          y2: ny,
          birth,
          w: 1.5 - s * 0.11,
          phase: rand() * 6.28
        })
        for (const side of [-1, 1]) {
          if (s === 0 || rand() < 0.45) continue
          const length = step * (1.7 - s * 0.13) * (0.5 + rand() * 0.6)
          const bend = dir + side * (Math.PI / 3)
          segments.push({
            x1: nx,
            y1: ny,
            x2: nx + Math.cos(bend) * length,
            y2: ny + Math.sin(bend) * length,
            birth: birth + 0.05,
            w: 0.85,
            phase: rand() * 6.28
          })
        }
        x = nx
        y = ny
        dir += (rand() - 0.5) * 0.3
      }
    }
    return segments
  }

  private makeSparkles(rand: () => number): Sparkle[] {
    const R = this.R
    const sparkles: Sparkle[] = []
    const count = Math.round(lerp(5, 22, this.detail))
    for (let i = 0; i < count; i += 1) {
      const angle = rand() * TAU
      const dist = R * (0.35 + rand() * 0.6)
      sparkles.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        birth: 1 - dist / R,
        speed: 1.4 + rand() * 2.2,
        phase: rand() * 6.28,
        r: (1.8 + rand() * 2.4) * (R / 90)
      })
    }
    return sparkles
  }

  private move(dt: number, s: number): void {
    const t = this.shown / 100
    const heat = clamp((t - 0.5) / 0.5)
    const cold = clamp((0.5 - t) / 0.5)
    const { size, R } = this
    const cx = size / 2
    const cy = size / 2
    const d = this.detail

    this.spawn.spark += smooth(0.45, 1, heat) * 90 * d * dt
    while (this.spawn.spark >= 1) {
      this.spawn.spark -= 1
      const a = Math.random() * TAU
      const speed = R * (0.8 + Math.random() * 1.8)
      this.particles.push({
        kind: 'spark',
        x: cx + Math.cos(a) * R * 0.97,
        y: cy + Math.sin(a) * R * 0.97,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0,
        max: 0.45 + Math.random() * 0.7,
        r: (0.6 + Math.random() * 1.3) * Math.max(0.6, R / 90),
        sway: 0
      })
    }

    this.spawn.ember += smooth(0.08, 0.55, heat) * (1 - 0.5 * smooth(0.85, 1, heat)) * 16 * d * dt
    while (this.spawn.ember >= 1) {
      this.spawn.ember -= 1
      this.particles.push({
        kind: 'ember',
        x: cx + (Math.random() - 0.5) * R * 1.4,
        y: cy + R * (0.1 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * R * 0.1,
        vy: -R * (0.18 + Math.random() * 0.3),
        life: 0,
        max: 1.4 + Math.random() * 1.6,
        r: (0.7 + Math.random() * 1.2) * Math.max(0.6, R / 90),
        sway: 0
      })
    }

    this.spawn.snow += smooth(0.3, 1, cold) * 12 * d * dt
    while (this.spawn.snow >= 1) {
      this.spawn.snow -= 1
      this.particles.push({
        kind: 'snow',
        x: Math.random() * size,
        y: -4,
        vx: 0,
        vy: size * (0.05 + Math.random() * 0.07),
        life: 0,
        max: 30,
        r: (0.8 + Math.random() * 1.4) * Math.max(0.5, R / 90),
        sway: Math.random() * 6.28
      })
    }

    for (const p of this.particles) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'snow') p.x += Math.sin(s * 1.3 + p.sway) * size * 0.02 * dt
      if (p.kind === 'spark') {
        p.vx *= 1 - dt * 0.8
        p.vy *= 1 - dt * 0.8
      }
    }
    this.particles = this.particles
      .filter((p) => p.life < p.max && p.y < size + 6)
      .slice(-Math.round(500 * d + 40))
  }

  private draw(s: number): void {
    const { ctx, size, R } = this
    ctx.clearRect(0, 0, size, size)
    // Too small to draw; the rim's radius would go below zero.
    if (R <= 1) return

    const cx = size / 2
    const cy = size / 2
    const v = this.shown
    const t = v / 100
    const heat = clamp((t - 0.5) / 0.5)
    const cold = clamp((0.5 - t) / 0.5)
    const calm = 1 - Math.max(heat, cold)
    const pal = palette(v)
    const nova = smooth(0.72, 1, heat)
    // Everything outside the sphere fades out before the canvas edge, so no
    // glow or ray is ever cut off square.
    const edge = size * 0.49

    // The glow around it.
    const pulse = 1 + Math.sin(s * 2.4) * 0.07 * nova
    const haloR = Math.min(R * (1.5 + heat * 1.2 + cold * 0.35) * pulse, edge)
    let g = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, haloR)
    g.addColorStop(0, rgba(pal.glow, 0.1 + heat * 0.55 + cold * 0.24))
    g.addColorStop(1, rgba(pal.glow, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, haloR, 0, TAU)
    ctx.fill()

    // The corona: rays that lengthen and flicker as it heats.
    const corona = smooth(0.25, 1, heat)
    if (corona > 0.01) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const n = Math.round(lerp(14, 56, this.detail))
      for (let i = 0; i < n; i += 1) {
        const base = (i / n) * TAU + s * 0.08 * (i % 2 ? 1 : -1)
        const flick = 0.55 + 0.45 * Math.sin(s * (1.7 + (i % 5) * 0.37) + i * 2.1)
        const len = Math.min(
          R * (1.06 + corona * (0.35 + 0.9 * flick) * (i % 3 === 0 ? 1.35 : 1)),
          edge
        )
        const half = (Math.PI / n) * (0.55 + 0.3 * flick)
        const tipX = cx + Math.cos(base) * len
        const tipY = cy + Math.sin(base) * len
        const rg = ctx.createLinearGradient(cx, cy, tipX, tipY)
        rg.addColorStop(0, rgba(pal.core, 0))
        rg.addColorStop(clamp(R / len, 0, 0.98), rgba(mix(pal.mid, pal.core, 0.5), 0.55 * corona))
        rg.addColorStop(1, rgba(pal.edge, 0))
        ctx.fillStyle = rg
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(base - half) * R * 0.92, cy + Math.sin(base - half) * R * 0.92)
        ctx.lineTo(tipX, tipY)
        ctx.lineTo(cx + Math.cos(base + half) * R * 0.92, cy + Math.sin(base + half) * R * 0.92)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    // Supernova: shock rings rolling out.
    if (nova > 0.01) {
      for (let k = 0; k < 2; k += 1) {
        const phase = (s / 2.2 + k * 0.5) % 1
        const ringR = R * (1.02 + phase * 1.5)
        if (ringR >= edge) continue
        const fade = clamp((edge - ringR) / (R * 0.5))
        ctx.strokeStyle = rgba(pal.glow, (1 - phase) * 0.55 * nova * fade)
        ctx.lineWidth = (1.5 + (1 - phase) * 2.5) * Math.max(0.5, R / 90)
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, TAU)
        ctx.stroke()
      }
    }

    // The sphere.
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, TAU)
    ctx.clip()
    g = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.38, R * 0.05, cx, cy, R * 1.05)
    g.addColorStop(0, rgba(pal.core))
    g.addColorStop(0.5, rgba(pal.mid))
    g.addColorStop(1, rgba(pal.edge))
    ctx.fillStyle = g
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

    // Heat churning inside it.
    const plasma = smooth(0.12, 1, heat)
    if (plasma > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 6; i += 1) {
        const a = s * (0.35 + i * 0.07) + i * 1.9
        const rr = R * (0.25 + 0.4 * (((i * 37) % 10) / 10))
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a * 1.3) * rr
        const pr = R * (0.35 + 0.15 * Math.sin(s * 1.1 + i))
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr)
        pg.addColorStop(0, rgba(pal.core, 0.3 * plasma))
        pg.addColorStop(1, rgba(pal.core, 0))
        ctx.fillStyle = pg
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // A white-hot core, beating.
    if (nova > 0.01) {
      const beat = 0.75 + 0.25 * Math.sin(s * 3.1)
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      cg.addColorStop(0, `rgba(255,255,255,${0.85 * nova * beat})`)
      cg.addColorStop(0.55, `rgba(255,250,235,${0.35 * nova})`)
      cg.addColorStop(1, 'rgba(255,240,220,0)')
      ctx.fillStyle = cg
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    }

    // The lead's initials, under any ice. Dark on a bright sphere, light on a
    // dark one, so they read at every temperature.
    if (this.initials) {
      const centre = mix(pal.core, pal.mid, 0.55)
      const light = centre[0] * 0.299 + centre[1] * 0.587 + centre[2] * 0.114
      ctx.fillStyle = light > 160 || nova > 0.4 ? 'rgba(24,16,12,0.72)' : 'rgba(255,248,236,0.88)'
      ctx.font = `600 ${Math.round(R * 0.6)}px ${displayFont()}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = `${Math.round(R * 0.04)}px`
      ctx.fillText(this.initials, cx, cy + R * 0.04)
    }

    if (this.frostGrowth > 0.002) this.drawFrost(s)

    // Light catching the ice as it sweeps across.
    if (cold > 0.4) {
      const sweep = (s / 3.6) % 1
      const sx = cx - R * 1.6 + sweep * R * 3.2
      const sg = ctx.createLinearGradient(sx - R * 0.3, cy - R, sx + R * 0.3, cy + R)
      sg.addColorStop(0, 'rgba(255,255,255,0)')
      sg.addColorStop(0.5, `rgba(235,250,255,${0.24 * smooth(0.4, 1, cold)})`)
      sg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = sg
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    }
    ctx.restore()

    // The rim: ice blue when cold, gold when calm, fire when hot.
    ctx.lineWidth = Math.max(1, R * 0.025)
    const rim = (colour: string): void => {
      ctx.strokeStyle = colour
      ctx.beginPath()
      ctx.arc(cx, cy, R - ctx.lineWidth / 2, 0, TAU)
      ctx.stroke()
    }
    if (cold > 0.02) rim(`rgba(190,235,255,${0.75 * cold})`)
    if (calm > 0.02) rim(`rgba(210,169,97,${0.4 * calm})`)
    if (heat > 0.02) rim(rgba(pal.glow, 0.7 * heat))

    // The highlight: sharp on ice, soft in fire.
    const hx = cx - R * 0.36
    const hy = cy - R * 0.42
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.34)
    hg.addColorStop(0, `rgba(255,255,255,${clamp(0.4 + cold * 0.3 - heat * 0.25)})`)
    hg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = hg
    ctx.beginPath()
    ctx.ellipse(hx, hy, R * 0.34, R * 0.24, -0.6, 0, TAU)
    ctx.fill()

    // Sparks, embers and snow, over everything.
    ctx.save()
    for (const p of this.particles) {
      const age = p.life / p.max
      if (p.kind === 'snow') {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = `rgba(236,248,255,${0.7 * cold})`
      } else {
        ctx.globalCompositeOperation = 'lighter'
        const alpha = p.kind === 'spark' ? 1 - age : Math.sin(Math.PI * age) * 0.9
        const colour = p.kind === 'spark' ? mix(pal.core, pal.glow, age) : pal.glow
        ctx.fillStyle = rgba(colour, alpha * Math.max(heat, 0.3))
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawFrost(s: number): void {
    const { ctx, size, R } = this
    const grow = this.frostGrowth
    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.lineCap = 'round'
    for (const seg of this.frost) {
      if (seg.birth > grow) continue
      const fresh = clamp((grow - seg.birth) / 0.08)
      const shimmer = 0.82 + 0.18 * Math.sin(s * 2 + seg.phase)
      ctx.strokeStyle = `rgba(236,250,255,${0.78 * fresh * shimmer})`
      ctx.lineWidth = Math.max(0.5, seg.w * (R / 90))
      ctx.beginPath()
      ctx.moveTo(seg.x1, seg.y1)
      ctx.lineTo(seg.x2, seg.y2)
      ctx.stroke()
    }
    const haze = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R)
    haze.addColorStop(0, 'rgba(230,248,255,0)')
    haze.addColorStop(1, `rgba(230,248,255,${0.45 * grow})`)
    ctx.fillStyle = haze
    ctx.fillRect(-R, -R, R * 2, R * 2)
    for (const sp of this.sparkles) {
      if (sp.birth > grow) continue
      const twinkle = Math.max(0, Math.sin(s * sp.speed + sp.phase))
      const alpha = twinkle * twinkle * 0.9 * grow
      if (alpha < 0.05) continue
      const len = sp.r * (0.6 + twinkle)
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sp.x - len, sp.y)
      ctx.lineTo(sp.x + len, sp.y)
      ctx.moveTo(sp.x, sp.y - len)
      ctx.lineTo(sp.x, sp.y + len)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ----------------------------------------------------------------- the loop

/**
 * The orbs that want frames: on screen, allowed to move, and not at rest. One
 * requestAnimationFrame serves them all, and none is asked for while this is
 * empty, so a page of still orbs costs nothing.
 */
const awake = new Set<Orb>()
let frame = 0
let last = 0

function tick(now: number): void {
  frame = 0
  // Capped, so the frame after a stall or a hidden window is a step rather
  // than a leap. Floored, because a frame's timestamp can come from just
  // before the moment the loop was woken.
  const dt = clamp((now - last) / 1000, 0, 0.05)
  last = now
  for (const orb of awake) orb.step(dt, now)
  if (awake.size > 0) frame = requestAnimationFrame(tick)
}

function wake(orb: Orb): void {
  if (awake.size === 0) last = performance.now()
  awake.add(orb)
  if (frame === 0) frame = requestAnimationFrame(tick)
}

function rest(orb: Orb): void {
  awake.delete(orb)
  if (awake.size === 0 && frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }
}

// ---------------------------------------------------------- the pixel ratio

/** Every orb alive, so a new pixel ratio can refit them all. */
const alive = new Set<Orb>()
let ratioQuery: MediaQueryList | null = null

/** Device pixels per CSS px, capped at 2: past that the soft glows gain nothing. */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2)
}

/**
 * Listens for the pixel ratio moving: the window crossing to another screen,
 * or the interface scale changing, since that's the frame's zoom. A media
 * query only answers for the ratio it was made with, so it's made again after
 * each change, and dropped once no orb is left.
 */
function watchRatio(): void {
  ratioQuery?.removeEventListener('change', onRatioChange)
  ratioQuery =
    alive.size > 0 ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`) : null
  ratioQuery?.addEventListener('change', onRatioChange)
}

function onRatioChange(): void {
  for (const orb of alive) orb.refit()
  watchRatio()
}
