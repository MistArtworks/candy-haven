import type { TimerFrame, TimerState } from '@shared/domain/timer'
import {
  BLINK_PERIOD_MS,
  clockDigits,
  formatClock,
  timerFrameAt
} from '@shared/domain/timer.constants'

/**
 * The countdown face.
 *
 * Framework-free for the same reason the rite ring is: the console previews it
 * inside React and the OBS browser source draws it from a plain script, and
 * both must agree to the frame. The clock is derived here from the state's start
 * instant, so nothing has to be pushed per tick.
 *
 * Five presentations, all built from the same five materials and all sharing the
 * readout. They differ only in what carries the passage of time — engraved
 * plates turning over, bare numerals rolling, a draining arc, an emptying
 * column, or a pulse on the second.
 * Crimson appears only past zero, which is the palette's rule for the one
 * saturated colour and also happens to be the exact moment it should mean
 * something.
 *
 * The background is never painted. These overlays composite onto a scene, so
 * transparency is the default and there is no theme to choose.
 */

export type TimerKind = 'interval' | 'convene'

export interface TimerFaceOptions {
  motion?: boolean
  /** Tightens type for the console preview. */
  compact?: boolean
}

const FALLBACK = {
  slab: '#0c0c0c',
  slabEdge: 'rgba(210, 169, 97, 0.34)',
  gold: '#d2a961',
  goldBright: '#e3c286',
  goldDim: '#976b30',
  brass: '#45351f',
  concrete: '#6f6656',
  concreteDim: '#3b372f',
  text: '#ddcfb2',
  textDim: '#8a8071',
  crimson: '#a32b23',
  crimsonBright: '#c4453a',
  crimsonDeep: '#43120f',
  display: "'Bahnschrift', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
  mono: "'Cascadia Mono', 'Consolas', ui-monospace, monospace"
}

function readPalette(root: HTMLElement): typeof FALLBACK {
  const styles = getComputedStyle(root)
  const read = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim()
    return value.length > 0 && !value.includes('var(') ? value : fallback
  }

  return {
    slab: read('--ch-obsidian-800', FALLBACK.slab),
    slabEdge: read('--ch-line-gold', FALLBACK.slabEdge),
    gold: read('--ch-gold-300', FALLBACK.gold),
    goldBright: read('--ch-gold-200', FALLBACK.goldBright),
    goldDim: read('--ch-gold-500', FALLBACK.goldDim),
    brass: read('--ch-brass-700', FALLBACK.brass),
    concrete: read('--ch-concrete-500', FALLBACK.concrete),
    concreteDim: read('--ch-concrete-700', FALLBACK.concreteDim),
    text: read('--ch-alabaster-300', FALLBACK.text),
    textDim: read('--ch-concrete-400', FALLBACK.textDim),
    crimson: read('--ch-crimson-500', FALLBACK.crimson),
    crimsonBright: read('--ch-crimson-400', FALLBACK.crimsonBright),
    crimsonDeep: read('--ch-crimson-800', FALLBACK.crimsonDeep),
    display: read('--ch-font-display', FALLBACK.display),
    mono: read('--ch-font-mono', FALLBACK.mono)
  }
}

function withAlpha(colour: string, alpha: number): string {
  const hex = colour.trim()
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/** How long a plate takes to turn over. */
const FLIP_MS = 300
/** How long a digit takes to roll over. Slower than the flip — it travels further. */
const ROLL_MS = 380
/** Lifetime of one emitted pulse ring. */
const PULSE_MS = 1_500
/** Terminal word entrance. */
const TERMINAL_MS = 520

interface Pulse {
  at: number
}

export class TimerFace {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private palette: typeof FALLBACK
  private compact: boolean
  private motion: boolean

  private state: TimerState | null = null
  private kind: TimerKind = 'interval'

  private width = 0
  private height = 0
  private frameHandle = 0
  private running = false

  /** Per-position digit history, so only the positions that changed animate. */
  private digits: string[] = []
  private digitChangedAt: number[] = []
  /** The numeral being rolled out, held for the length of the roll. */
  private previousDigits: string[] = []

  private pulses: Pulse[] = []
  private lastPulseSecond: number | null = null
  /** When the timer last crossed into `elapsed`, for the terminal animation. */
  private elapsedAt: number | null = null

  constructor(canvas: HTMLCanvasElement, options: TimerFaceOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.compact = options.compact ?? false
    this.motion = options.motion ?? true
    this.palette = readPalette(document.documentElement)
    this.resize()
  }

  setState(state: TimerState, kind: TimerKind): void {
    const previous = this.state
    this.state = state
    this.kind = kind

    // A reset or a restart must not replay the previous run's beats. Compared
    // against the *previous* state, which is why it is captured above — reading
    // `this.state` here would always compare the new state with itself.
    const restarted =
      previous === null ||
      previous.id !== state.id ||
      previous.startedAt !== state.startedAt ||
      (previous.phase !== 'idle' && state.phase === 'idle')

    if (restarted) {
      this.pulses = []
      this.lastPulseSecond = null
      this.elapsedAt = null
    }
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

  refreshPalette(): void {
    this.palette = readPalette(document.documentElement)
    if (!this.running) this.paint(performance.now())
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    this.width = Math.max(rect.width, 1)
    this.height = Math.max(rect.height, 1)
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
    const loop = (now: number): void => {
      if (!this.running) return
      this.paint(now)
      this.frameHandle = requestAnimationFrame(loop)
    }
    this.frameHandle = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
  }

  destroy(): void {
    this.stop()
  }

  // ---------------------------------------------------------------- painting

  private paint(now: number): void {
    const { context: ctx, width, height, state } = this
    ctx.clearRect(0, 0, width, height)
    if (!state) return

    const frame = timerFrameAt(state, Date.now())
    const inGrace = frame.phase === 'grace'
    const elapsed = frame.phase === 'elapsed'

    if (elapsed && this.elapsedAt === null) this.elapsedAt = now
    if (!elapsed) this.elapsedAt = null

    // Grace reads in crimson and counts its own remainder down, so overrunning
    // looks like overrunning rather than like a stopped clock.
    const shownMs = inGrace ? frame.graceRemainingMs : Math.max(frame.remainingMs, 0)
    const accent = inGrace || elapsed ? this.palette.crimsonBright : this.palette.gold

    this.trackPulses(frame, now, shownMs)

    const label = state.config.showLabel ? state.config.label : null
    const bandTop = label ? this.labelHeight() : 0
    if (label) this.drawLabel(label, inGrace ? 'GRACE' : null, accent)

    // A convene countdown resolves to a word; an interval blinks a spent clock.
    if (elapsed && this.kind === 'convene') {
      this.drawTerminal(state.config.terminalWord, now, bandTop)
      return
    }

    const region = { top: bandTop, height: this.height - bandTop }
    switch (state.config.animation) {
      case 'plates':
        this.drawPlates(shownMs, frame, now, region, accent, elapsed)
        break
      case 'roll':
        this.drawRoll(shownMs, frame, now, region, accent, inGrace, elapsed)
        break
      case 'arc':
        this.drawArc(shownMs, frame, now, region, accent, inGrace, elapsed)
        break
      case 'column':
        this.drawColumn(shownMs, frame, now, region, accent, inGrace, elapsed)
        break
      case 'pulse':
        this.drawPulse(shownMs, frame, now, region, accent, elapsed)
        break
    }
  }

  /**
   * Blink factor once the time is gone.
   *
   * A square wave rather than a sine: an institutional fault lamp, not a fade.
   */
  private blink(now: number, elapsed: boolean): number {
    if (!elapsed || !this.state?.config.blinkOnElapsed) return 1
    if (!this.motion) return 1
    return (now % BLINK_PERIOD_MS) / BLINK_PERIOD_MS < 0.55 ? 1 : 0.22
  }

  private labelHeight(): number {
    return Math.max(this.height * 0.14, this.compact ? 18 : 26)
  }

  private drawLabel(label: string, badge: string | null, accent: string): void {
    const { context: ctx, palette, width } = this
    const size = Math.max(this.compact ? 9 : 11, this.height * 0.036)

    ctx.font = `${size}px ${palette.display}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = palette.textDim

    // Wide institutional tracking, applied by hand — canvas has no
    // letter-spacing, so the glyphs are placed individually.
    const tracked = label.toUpperCase()
    const y = this.labelHeight() / 2
    this.drawTracked(tracked, width / 2, y, size * 0.28)

    if (badge) {
      ctx.fillStyle = accent
      ctx.font = `${size * 0.85}px ${palette.display}`
      this.drawTracked(badge, width / 2, y + size * 1.5, size * 0.3)
    }
  }

  /** Draws text with manual letter-spacing, centred on `x`. */
  private drawTracked(text: string, x: number, y: number, spacing: number): void {
    const ctx = this.context
    const characters = [...text]
    const widths = characters.map((character) => ctx.measureText(character).width)
    const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (characters.length - 1)

    let cursor = x - total / 2
    const previousAlign = ctx.textAlign
    ctx.textAlign = 'left'
    characters.forEach((character, index) => {
      ctx.fillText(character, cursor, y)
      cursor += widths[index] + spacing
    })
    ctx.textAlign = previousAlign
  }

  // ------------------------------------------------------------ 1. plates

  /**
   * SPLIT PLATES — each digit on an engraved slab that turns over on change.
   *
   * The flip is a vertical squeeze through zero: the outgoing digit compresses
   * to a line and the incoming one opens from it. Only the positions that
   * actually changed animate, which is what makes the seconds column tick while
   * the minutes column sits still — the thing that makes a departure board read
   * as mechanical rather than as a fading crossfade.
   */
  private drawPlates(
    ms: number,
    frame: TimerFrame,
    now: number,
    region: { top: number; height: number },
    accent: string,
    elapsed: boolean
  ): void {
    const { context: ctx, width } = this
    const digits = clockDigits(ms)

    if (this.digits.length !== digits.length) {
      this.digits = [...digits]
      this.digitChangedAt = digits.map(() => 0)
    }
    digits.forEach((digit, index) => {
      if (this.digits[index] !== digit) {
        this.digits[index] = digit
        this.digitChangedAt[index] = now
      }
    })

    const count = digits.length
    const gap = Math.min(region.height * 0.05, 10)
    const separatorWidth = Math.min(region.height * 0.12, 22)
    // A separator sits before each pair after the first.
    const separators = Math.floor(count / 2) - 1
    const available = width * 0.94 - gap * (count - 1) - separatorWidth * separators
    const plateWidth = Math.min(available / count, region.height * 0.62)
    const plateHeight = Math.min(plateWidth * 1.42, region.height * 0.82)
    const totalWidth = plateWidth * count + gap * (count - 1) + separatorWidth * separators
    const centreY = region.top + region.height / 2
    const alpha = this.blink(now, elapsed)

    let x = (width - totalWidth) / 2
    ctx.save()
    ctx.globalAlpha = alpha

    digits.forEach((digit, index) => {
      if (index > 0 && index % 2 === 0) {
        // Separator: two stacked gold squares, not a colon glyph.
        const size = Math.max(plateHeight * 0.055, 2)
        ctx.fillStyle = withAlpha(accent, 0.85)
        ctx.fillRect(x + separatorWidth / 2 - size / 2, centreY - plateHeight * 0.16, size, size)
        ctx.fillRect(
          x + separatorWidth / 2 - size / 2,
          centreY + plateHeight * 0.16 - size,
          size,
          size
        )
        x += separatorWidth
      }

      const age = now - (this.digitChangedAt[index] ?? 0)
      const flipping = this.motion && age < FLIP_MS
      // 0..1 across the flip; the halfway point is the plate edge-on.
      const t = flipping ? age / FLIP_MS : 1
      const squeeze = flipping ? Math.abs(1 - 2 * easeOutCubic(t)) : 1

      this.drawPlate(x, centreY, plateWidth, plateHeight, digit, squeeze, accent)
      x += plateWidth + gap
    })

    ctx.restore()

    // Remaining time as a hairline under the plates, so the presentation still
    // carries progress without a second readout.
    this.drawUnderRule(
      region.top + region.height / 2 + plateHeight / 2 + gap * 1.6,
      1 - frame.progress,
      accent,
      alpha
    )
  }

  private drawPlate(
    x: number,
    centreY: number,
    plateWidth: number,
    plateHeight: number,
    digit: string,
    squeeze: number,
    accent: string
  ): void {
    const { context: ctx, palette } = this
    const height = Math.max(plateHeight * squeeze, 1)

    ctx.save()
    ctx.translate(x, centreY - height / 2)

    // The slab.
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, palette.slab)
    gradient.addColorStop(1, '#08080a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, plateWidth, height)

    ctx.strokeStyle = palette.slabEdge
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, plateWidth - 1, height - 1)

    // The hinge line across the middle — what makes it a split-flap plate.
    ctx.strokeStyle = withAlpha(accent, 0.22)
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(plateWidth, height / 2)
    ctx.stroke()

    if (squeeze > 0.16) {
      ctx.save()
      // Scale the glyph with the plate so the digit squeezes with it rather
      // than sitting at full height inside a collapsing slab.
      ctx.translate(plateWidth / 2, height / 2)
      ctx.scale(1, squeeze)
      ctx.font = `${plateHeight * 0.62}px ${palette.mono}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = palette.text
      ctx.fillText(digit, 0, 0)
      ctx.restore()
    }

    ctx.restore()
  }

  private drawUnderRule(y: number, remaining: number, accent: string, alpha: number): void {
    const { context: ctx, palette, width } = this
    const w = width * 0.7
    const x = (width - w) / 2
    if (y > this.height - 2) return

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = withAlpha(palette.brass, 0.6)
    ctx.fillRect(x, y, w, 1)
    ctx.fillStyle = accent
    ctx.fillRect(x, y, w * Math.max(remaining, 0), 1)
    ctx.restore()
  }

  // -------------------------------------------------------------- 2. roll

  /**
   * ROLLING DIGITS — bare numerals on an odometer.
   *
   * No slab and no housing: just the clock, with each changed digit rolling
   * over. The spent numeral rises out of its cell while the next arrives from
   * below, both clipped to the cell so they pass behind an edge rather than
   * floating over the scene. Only the positions that changed move, so the
   * seconds roll while the minutes sit still.
   *
   * The most legible of the five at small sizes, and the one that suits a
   * transparent overlay dropped into a corner — there is nothing to it but the
   * numbers.
   */
  private drawRoll(
    ms: number,
    frame: TimerFrame,
    now: number,
    region: { top: number; height: number },
    accent: string,
    inGrace: boolean,
    elapsed: boolean
  ): void {
    const { context: ctx, palette, width } = this
    const digits = clockDigits(ms)

    if (this.digits.length !== digits.length) {
      this.digits = [...digits]
      this.digitChangedAt = digits.map(() => 0)
    }
    digits.forEach((digit, index) => {
      if (this.digits[index] !== digit) {
        // Captured *before* the overwrite: the outgoing numeral is the one
        // still on screen, and it has to survive the length of the roll.
        this.previousDigits[index] = this.digits[index]
        this.digits[index] = digit
        this.digitChangedAt[index] = now
      }
    })

    const alpha = this.blink(now, elapsed)
    const glyphSize = Math.min(region.height * 0.56, width * 0.2)
    ctx.font = `${glyphSize}px ${palette.mono}`

    const cellWidth = ctx.measureText('0').width * 1.06
    const cellHeight = glyphSize * 1.12
    const separatorWidth = cellWidth * 0.44
    const separators = Math.floor(digits.length / 2) - 1
    const totalWidth = cellWidth * digits.length + separatorWidth * separators
    const centreY = region.top + region.height / 2

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = inGrace || elapsed ? palette.crimsonBright : palette.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    let x = (width - totalWidth) / 2

    digits.forEach((digit, index) => {
      if (index > 0 && index % 2 === 0) {
        const dot = Math.max(glyphSize * 0.055, 2)
        ctx.save()
        ctx.fillStyle = withAlpha(accent, 0.8)
        ctx.fillRect(x + separatorWidth / 2 - dot / 2, centreY - glyphSize * 0.2, dot, dot)
        ctx.fillRect(x + separatorWidth / 2 - dot / 2, centreY + glyphSize * 0.2 - dot, dot, dot)
        ctx.restore()
        x += separatorWidth
      }

      const age = now - (this.digitChangedAt[index] ?? 0)
      const rolling = this.motion && age < ROLL_MS
      const t = rolling ? easeOutExpo(age / ROLL_MS) : 1

      ctx.save()
      // Clipped to the cell: the numerals slide behind its edges, which is what
      // makes it read as a wheel turning rather than as text moving.
      ctx.beginPath()
      ctx.rect(x, centreY - cellHeight / 2, cellWidth, cellHeight)
      ctx.clip()

      const centreX = x + cellWidth / 2

      if (rolling) {
        // Outgoing rises out of the top.
        const outgoing = this.previousDigits[index]
        if (outgoing !== undefined) {
          ctx.save()
          ctx.globalAlpha = alpha * (1 - t)
          ctx.fillText(outgoing, centreX, centreY - cellHeight * t)
          ctx.restore()
        }
      }

      // Incoming arrives from below, settling on the centreline.
      ctx.fillText(digit, centreX, centreY + cellHeight * (1 - t))
      ctx.restore()

      x += cellWidth
    })

    ctx.restore()

    this.drawUnderRule(centreY + cellHeight * 0.62, 1 - frame.progress, accent, alpha)
  }

  // --------------------------------------------------------------- 2. arc

  /**
   * RESONANCE ARC — a graduated ring draining around the readout.
   *
   * Shares the rite ring's bezel vocabulary deliberately: the two overlays
   * should read as instruments from the same rack. The arc depletes clockwise
   * from twelve, and refills in crimson for the grace period so the overrun has
   * its own visible budget rather than silently continuing.
   */
  private drawArc(
    ms: number,
    frame: TimerFrame,
    now: number,
    region: { top: number; height: number },
    accent: string,
    inGrace: boolean,
    elapsed: boolean
  ): void {
    const { context: ctx, palette, width } = this
    const centreX = width / 2
    const centreY = region.top + region.height / 2
    const radius = Math.min(width, region.height) * 0.42
    const alpha = this.blink(now, elapsed)
    const TAU = Math.PI * 2
    const top = -Math.PI / 2

    ctx.save()
    ctx.globalAlpha = alpha

    // Rail.
    ctx.strokeStyle = withAlpha(palette.brass, 0.55)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centreX, centreY, radius, 0, TAU)
    ctx.stroke()

    // Graduations every 6° — a fixed bezel the depleting arc is read against.
    ctx.strokeStyle = withAlpha(palette.goldDim, 0.3)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let angle = 0; angle < TAU - 1e-9; angle += (6 * Math.PI) / 180) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.moveTo(centreX + cos * radius * 1.03, centreY + sin * radius * 1.03)
      ctx.lineTo(centreX + cos * radius * 1.06, centreY + sin * radius * 1.06)
    }
    ctx.stroke()

    // Quarter marks, longer.
    ctx.strokeStyle = withAlpha(palette.gold, 0.5)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const angle = top + (quarter * Math.PI) / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.moveTo(centreX + cos * radius * 1.0, centreY + sin * radius * 1.0)
      ctx.lineTo(centreX + cos * radius * 1.09, centreY + sin * radius * 1.09)
    }
    ctx.stroke()

    // The depleting arc. In grace it becomes the grace budget instead.
    const graceTotal = this.state?.config.graceMs ?? 0
    const sweep = inGrace
      ? graceTotal > 0
        ? frame.graceRemainingMs / graceTotal
        : 0
      : 1 - frame.progress

    if (sweep > 0) {
      ctx.strokeStyle = accent
      ctx.lineWidth = 3
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.arc(centreX, centreY, radius, top, top + TAU * sweep)
      ctx.stroke()

      // The leading head, so the eye can find the edge of the arc at a glance.
      const headAngle = top + TAU * sweep
      ctx.fillStyle = palette.goldBright
      ctx.beginPath()
      ctx.arc(
        centreX + Math.cos(headAngle) * radius,
        centreY + Math.sin(headAngle) * radius,
        2.4,
        0,
        TAU
      )
      ctx.fill()
    }

    this.drawReadout(formatClock(ms), centreX, centreY, radius * 0.62, inGrace, elapsed)
    ctx.restore()
  }

  // ------------------------------------------------------------ 3. column

  /**
   * SEDIMENT COLUMN — a brutalist stack emptying downward.
   *
   * The slab is banded into minute-sized courses so the eye can count what is
   * left rather than estimate it, and the fill face carries a bright lip that
   * descends as time is spent. Reads as material draining out of a structure,
   * which is the most literal of the four.
   */
  private drawColumn(
    ms: number,
    frame: TimerFrame,
    now: number,
    region: { top: number; height: number },
    accent: string,
    inGrace: boolean,
    elapsed: boolean
  ): void {
    const { context: ctx, palette, width } = this
    const alpha = this.blink(now, elapsed)

    const columnWidth = Math.min(width * 0.14, 70)
    const columnHeight = region.height * 0.78
    const x = width * 0.5 - Math.min(width * 0.42, 240)
    const y = region.top + (region.height - columnHeight) / 2
    const remaining = inGrace
      ? (this.state?.config.graceMs ?? 0) > 0
        ? frame.graceRemainingMs / (this.state?.config.graceMs ?? 1)
        : 0
      : Math.max(1 - frame.progress, 0)

    ctx.save()
    ctx.globalAlpha = alpha

    // Housing.
    ctx.fillStyle = withAlpha(palette.slab, 0.75)
    ctx.fillRect(x, y, columnWidth, columnHeight)
    ctx.strokeStyle = palette.slabEdge
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, columnWidth - 1, columnHeight - 1)

    // The material.
    const fillHeight = columnHeight * remaining
    const fillTop = y + columnHeight - fillHeight
    const fill = ctx.createLinearGradient(x, fillTop, x, y + columnHeight)
    fill.addColorStop(0, inGrace || elapsed ? palette.crimson : palette.concrete)
    fill.addColorStop(1, inGrace || elapsed ? palette.crimsonDeep : palette.concreteDim)
    ctx.fillStyle = fill
    ctx.fillRect(x, fillTop, columnWidth, fillHeight)

    if (fillHeight > 1) {
      // The lip: the one bright edge, descending as the column empties.
      ctx.fillStyle = accent
      ctx.fillRect(x, fillTop, columnWidth, 2)
    }

    // Minute courses, so what remains is countable.
    const totalMs = inGrace
      ? (this.state?.config.graceMs ?? 0)
      : (this.state?.config.durationMs ?? 0)
    const minutes = Math.floor(totalMs / 60_000)
    if (minutes > 1 && minutes <= 30) {
      ctx.strokeStyle = withAlpha(palette.goldDim, 0.22)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let minute = 1; minute < minutes; minute += 1) {
        const ly = Math.round(y + columnHeight * (minute / minutes)) + 0.5
        ctx.moveTo(x, ly)
        ctx.lineTo(x + columnWidth, ly)
      }
      ctx.stroke()
    }

    // Readout to the right of the column, on its centreline.
    const readoutX = x + columnWidth + Math.min(width * 0.06, 34)
    ctx.font = `${Math.min(region.height * 0.34, width * 0.16)}px ${palette.mono}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = inGrace || elapsed ? palette.crimsonBright : palette.text
    ctx.fillText(formatClock(ms), readoutX, region.top + region.height / 2)

    ctx.restore()
  }

  // -------------------------------------------------------------- 4. pulse

  /**
   * HARMONIC PULSE — a ring emitted on every whole second.
   *
   * The most restrained of the four and the one that suits a stream opening:
   * nothing but the readout and a ring expanding outward on the beat, so the
   * overlay reads as a resonance rather than as a widget. The rings accelerate
   * inside the final ten seconds, which is the only warning a silent countdown
   * gets to give.
   */
  private drawPulse(
    ms: number,
    frame: TimerFrame,
    now: number,
    region: { top: number; height: number },
    accent: string,
    elapsed: boolean
  ): void {
    const { context: ctx, palette, width } = this
    const centreX = width / 2
    const centreY = region.top + region.height / 2
    const maxRadius = Math.min(width, region.height) * 0.48
    const alpha = this.blink(now, elapsed)
    const urgent = frame.remainingMs > 0 && frame.remainingMs <= 10_000

    ctx.save()
    ctx.globalAlpha = alpha

    for (const pulse of this.pulses) {
      const age = now - pulse.at
      const life = age / (urgent ? PULSE_MS * 0.6 : PULSE_MS)
      if (life >= 1) continue

      const radius = maxRadius * (0.34 + easeOutExpo(life) * 0.72)
      ctx.strokeStyle = withAlpha(accent, (1 - life) * 0.5)
      ctx.lineWidth = 1 + (1 - life) * 1.4
      ctx.beginPath()
      ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    // A resting ring, so the composition holds between beats.
    ctx.strokeStyle = withAlpha(palette.goldDim, 0.24)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centreX, centreY, maxRadius * 0.3, 0, Math.PI * 2)
    ctx.stroke()

    // The readout takes a small kick on each beat, so the pulse is felt in the
    // digits too rather than only around them.
    const sinceBeat = this.pulses.length > 0 ? now - this.pulses[this.pulses.length - 1].at : 9_999
    const kick = sinceBeat < 260 && this.motion ? 1 + (1 - easeOutCubic(sinceBeat / 260)) * 0.05 : 1

    ctx.save()
    ctx.translate(centreX, centreY)
    ctx.scale(kick, kick)
    this.drawReadout(formatClock(ms), 0, 0, maxRadius * 0.66, false, elapsed)
    ctx.restore()

    ctx.restore()
  }

  /** Emits a pulse on each whole-second boundary while running. */
  private trackPulses(frame: TimerFrame, now: number, shownMs: number): void {
    if (!this.motion) return
    const running = frame.phase === 'running' || frame.phase === 'grace'
    if (!running) return

    const second = Math.ceil(shownMs / 1000)
    if (this.lastPulseSecond === null) {
      this.lastPulseSecond = second
      return
    }
    if (second === this.lastPulseSecond) return

    this.lastPulseSecond = second
    this.pulses.push({ at: now })
    // Bounded: only rings still inside their lifetime can be visible.
    if (this.pulses.length > 8) this.pulses.shift()
  }

  // ---------------------------------------------------------------- shared

  /** The centred clock, sized to fit a target width. */
  private drawReadout(
    text: string,
    x: number,
    y: number,
    targetWidth: number,
    inGrace: boolean,
    elapsed: boolean
  ): void {
    const { context: ctx, palette } = this

    let size = targetWidth * 0.62
    ctx.font = `${size}px ${palette.mono}`
    const measured = ctx.measureText(text).width
    if (measured > targetWidth * 1.5) {
      size *= (targetWidth * 1.5) / measured
      ctx.font = `${size}px ${palette.mono}`
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = inGrace || elapsed ? palette.crimsonBright : palette.text
    ctx.fillText(text, x, y)
  }

  /**
   * The terminal word — `NOW` for a stream opening.
   *
   * Scales in past its final size and settles, so the countdown resolves into a
   * statement rather than the clock simply stopping at zero.
   */
  private drawTerminal(word: string, now: number, top: number): void {
    const { context: ctx, palette, width } = this
    const age = this.elapsedAt === null ? TERMINAL_MS : now - this.elapsedAt
    const t = this.motion ? Math.min(age / TERMINAL_MS, 1) : 1
    const scale = 1.22 - 0.22 * easeOutExpo(t)
    const centreY = top + (this.height - top) / 2

    ctx.save()
    ctx.globalAlpha = Math.min(t * 1.8, 1)
    ctx.translate(width / 2, centreY)
    ctx.scale(scale, scale)

    const size = Math.min((this.height - top) * 0.46, width * 0.28)
    ctx.font = `${size}px ${palette.display}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = palette.text
    ctx.shadowColor = withAlpha(palette.goldBright, 0.4)
    ctx.shadowBlur = size * 0.3
    this.drawTracked(word.toUpperCase(), 0, 0, size * 0.14)
    ctx.restore()

    // A rule beneath, drawing outward as the word settles.
    const ruleWidth = width * 0.34 * easeOutCubic(t)
    ctx.save()
    ctx.globalAlpha = Math.min(t * 1.8, 1)
    ctx.fillStyle = withAlpha(palette.gold, 0.6)
    ctx.fillRect(width / 2 - ruleWidth / 2, centreY + size * 0.52, ruleWidth, 1)
    ctx.restore()
  }
}
