import type { ConcordLayout, ConcordOption, ConcordState } from '@shared/domain/concord'
import {
  TALLY_SMOOTHING,
  WIDGET_MAX_ROWS,
  agitationFor,
  castFrameAt,
  concordFrameAt,
  concordAtRest,
  concordRestingProjection,
  concordRevealAt,
  leadingOptions,
  lotPosition,
  optionShare,
  totalCastDurationMs,
  totalTally,
  voteInstruction
} from '@shared/domain/concord.constants'
import { clamp01 } from '@shared/domain/rite.constants'
import { readCustomProperty, withAlpha } from '@renderer/overlays/colour'
import { createField, paintResonanceField } from '@renderer/overlays/resonance-field'

/**
 * THE CONCORD's face.
 *
 * Framework-free, for the same reason the rite ring and the countdown face are:
 * the console previews it inside React and the OBS browser source draws it from
 * a plain script, and both are on screen at once in front of an audience. So
 * there is exactly one implementation of the layout, the smoothing and the
 * palette, and both surfaces drive it from the same state.
 *
 * Canvas rather than DOM because the tally is in continuous motion for the whole
 * of a poll — every bar chasing a target that moves eight times a second, over a
 * plexus of some 2,700 link tests a frame. That is precisely where retained-mode
 * DOM falls over.
 *
 * ### Composition
 *
 * Follows the world brief. One focal object: the tally, or during a deadlock the
 * lots. Options are told apart by **engraving, numbering and bar length — never
 * by hue**, because a multi-coloured poll would be the single most off-model
 * object this application could contain. Crimson appears in exactly three
 * places: the option in front, live urgency, and the lot that gets lifted.
 */

export interface ConcordFaceOptions {
  /**
   * Ambient and vote motion. When disabled the face paints one resting frame
   * rather than nothing, so the composition still reads as intended.
   */
  motion?: boolean
  /** Tightens type and rule weights for the smaller host-side preview. */
  compact?: boolean
  /**
   * How much of the frame to occupy.
   *
   * A property of the surface rather than of the poll, which is why it arrives
   * here and not on the state: the browser source pinned to `/concord-widget`
   * draws a corner plate while the one at `/concord` draws a full scene, from
   * the same live poll.
   */
  layout?: ConcordLayout
}

/** Nodes in the field behind the tally. Matches the ring's, so they read alike. */
const FIELD_NODES = 74

/** Seconds for one revolution of the field. Slow: it is texture, not action. */
const FIELD_PERIOD_SECONDS = 96

/**
 * How long the winner's stamp takes to arrive, from the instant of resolution.
 */
const STAMP_MS = 520

const TAU = Math.PI * 2

const FALLBACK = {
  slab: '#0c0c0c',
  slabRaised: '#171517',
  slabEdge: 'rgba(210, 169, 97, 0.34)',
  backdrop: '#08080a',
  gold: '#d2a961',
  goldBright: '#e3c286',
  goldDim: '#976b30',
  brass: '#45351f',
  text: '#ddcfb2',
  textDim: '#8a8071',
  textFaint: '#5a544a',
  crimson: '#a32b23',
  crimsonBright: '#c4453a',
  crimsonDeep: '#43120f',
  crimsonVoid: '#24090a',
  display: "'Bahnschrift', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
  mono: "'Cascadia Mono', 'Consolas', ui-monospace, monospace"
}

/**
 * Resolves the palette from the document.
 *
 * Each entry reads an overlay-semantic property first (`--ch-concord-slab`) and
 * falls back to the underlying material. That is what lets the fixed
 * presentation presets re-skin the face by declaring a handful of properties,
 * while the console — which declares none of them — keeps the material defaults.
 *
 * The focal crimson is never themed: the brief reserves the one saturated colour
 * for the focal point in every arrangement, so a preset cannot spend it.
 */
function readPalette(root: HTMLElement): typeof FALLBACK {
  const styles = getComputedStyle(root)
  const read = (names: readonly string[], fallback: string): string =>
    readCustomProperty(styles, names, fallback)

  return {
    slab: read(['--ch-concord-slab', '--ch-obsidian-800'], FALLBACK.slab),
    slabRaised: read(['--ch-concord-slab-raised', '--ch-obsidian-600'], FALLBACK.slabRaised),
    slabEdge: read(['--ch-concord-edge', '--ch-line-gold'], FALLBACK.slabEdge),
    backdrop: read(['--ch-concord-backdrop', '--ch-obsidian-900'], FALLBACK.backdrop),
    gold: read(['--ch-concord-rim', '--ch-gold-300'], FALLBACK.gold),
    goldBright: read(['--ch-concord-rim-bright', '--ch-gold-200'], FALLBACK.goldBright),
    goldDim: read(['--ch-concord-rim-dim', '--ch-gold-500'], FALLBACK.goldDim),
    brass: read(['--ch-concord-track', '--ch-brass-700'], FALLBACK.brass),
    text: read(['--ch-concord-label', '--ch-alabaster-300'], FALLBACK.text),
    textDim: read(['--ch-concord-label-dim', '--ch-concrete-400'], FALLBACK.textDim),
    textFaint: read(['--ch-text-muted'], FALLBACK.textFaint),
    crimson: read(['--ch-crimson-500'], FALLBACK.crimson),
    crimsonBright: read(['--ch-crimson-400'], FALLBACK.crimsonBright),
    crimsonDeep: read(['--ch-crimson-800'], FALLBACK.crimsonDeep),
    crimsonVoid: read(['--ch-crimson-900'], FALLBACK.crimsonVoid),
    display: read(['--ch-font-display'], FALLBACK.display),
    mono: read(['--ch-font-mono'], FALLBACK.mono)
  }
}

/** A bar's drawn length, which lags its true tally. */
interface Chase {
  shown: number
}

export class ConcordFace {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly field = createField(FIELD_NODES)
  private palette: typeof FALLBACK
  private compact: boolean
  private motion: boolean
  private layout: ConcordLayout

  private state: ConcordState | null = null

  private width = 0
  private height = 0
  /**
   * Reference length every type size is derived from.
   *
   * **Not the canvas width**, which is what this originally used and which was
   * wrong in a way that only showed up off the recommended dimensions: a browser
   * source opened at 1900x880 scaled the masthead to ~118px while the ring stayed
   * constrained by height, so the title dwarfed the object it was labelling.
   *
   * Taking the smaller of the content width and a fraction of the height means a
   * tall panel is governed by its width and a wide, short frame by its height —
   * so the type stays the same physical size across both instead of tracking one
   * axis off to absurdity. Computed once per frame in `paint`.
   */
  private typeScale = 0
  private frame = 0
  private running = false
  private lastFrameAt = 0
  private fieldRotation = 0

  /**
   * Per-option drawn share, chasing the true one.
   *
   * Keyed by option id rather than index so reordering the ballot does not make
   * one bar inherit another's position and visibly swap.
   */
  private readonly chase = new Map<string, Chase>()

  /**
   * When the current result arrived, for the stamp's entrance.
   *
   * Read off the state each frame rather than tracked here. It used to be
   * inferred from `result.at` the first time a new result was seen, which was
   * wrong for a poll that settled with nobody having voted — there is no result
   * to take an instant from — and made the entrance depend on when this face
   * happened to be told rather than on when the poll actually settled.
   */
  private resolvedAt: number | null = null

  private readonly fitted = new Map<string, string>()

  constructor(canvas: HTMLCanvasElement, options: ConcordFaceOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.compact = options.compact ?? false
    this.motion = options.motion ?? true
    this.layout = options.layout ?? 'full'
    this.palette = readPalette(document.documentElement)
    this.resize()
  }

  setState(state: ConcordState): void {
    const previous = this.state
    this.state = state

    // A fresh poll must not inherit the last one's bar positions, or the bars
    // visibly drain from the previous result instead of growing from nothing.
    if (previous && previous.phase !== 'open' && state.phase === 'open') {
      this.chase.clear()
    }

    if (!this.running) this.paint(performance.now())
  }

  /** Switches layout in place, for the console's preview toggle. */
  setLayout(layout: ConcordLayout): void {
    if (this.layout === layout) return
    this.layout = layout
    this.fitted.clear()
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

    // Both dimensions have to be recorded: they are what `paint` clears, and
    // leaving them at zero clears nothing — every frame would accumulate on the
    // last. The rite's canvas shipped with exactly that bug.
    this.width = Math.max(rect.width, 1)
    this.height = Math.max(rect.height, 1)

    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.fitted.clear()

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

  // ---------------------------------------------------------------- painting

  private paint(now: number): void {
    const { context: ctx } = this
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now

    if (this.width <= 0 || this.height <= 0) return
    ctx.clearRect(0, 0, this.width, this.height)

    const live = this.state
    if (!live) return

    const wall = Date.now()

    /*
     * The resting composition, derived rather than pushed.
     *
     * THE CONCORD is present in its scene at all times — the operator asked for
     * it to behave like the rest of the kit, which does not appear and vanish
     * around the operator's actions. Between polls it draws its masthead over
     * an empty ballot rather than painting nothing.
     *
     * A settled poll returns here on its own once the result has had its
     * linger, so the last tally does not stand indefinitely. The projection is
     * for drawing only: the service still holds the resolved poll, and the
     * console still shows it.
     */
    const state = concordAtRest(live, wall) ? concordRestingProjection(live) : live

    this.resolvedAt = state.resolvedAt
    ctx.globalAlpha = concordRevealAt(state, wall)
    const cast = state.cast
    const castFrame = cast ? castFrameAt(cast, this.castClock(cast)) : null

    // The field's energy is the poll's energy: chat's arrival rate while voting,
    // and the casting's agitation while lots are tumbling. Two sources, one
    // dial, so the composition never has competing rhythms.
    const energy =
      state.phase === 'casting' && castFrame
        ? castFrame.tumble * 1.4
        : state.phase === 'open'
          ? agitationFor(state.voteRate)
          : 0

    if (this.motion) {
      this.fieldRotation = (this.fieldRotation + (delta * TAU) / FIELD_PERIOD_SECONDS) % TAU
    }

    if (this.layout === 'widget') {
      this.drawWidget(state, cast, castFrame, delta, wall)
      ctx.globalAlpha = 1
      return
    }

    const pad = Math.max(Math.min(this.width, this.height) * 0.045, 12)
    // Nothing is drawn into the reserve: it is dead space so a chat panel and a
    // camera can be composited there in OBS.
    const usable = this.width * (1 - clamp01(state.config.reserveRight))
    const left = pad
    const right = Math.max(usable - pad, left + 40)
    const contentWidth = right - left
    this.typeScale = Math.min(contentWidth, this.height * 0.72)

    if (!state.config.transparent) this.drawBackdrop()

    if (state.config.showField) {
      paintResonanceField(
        ctx,
        this.field,
        {
          centreX: left + contentWidth / 2,
          centreY: this.height / 2,
          radius: Math.min(contentWidth, this.height) * 0.52,
          rotation: this.fieldRotation,
          energy,
          now,
          // Pulled well back during a casting so the lots are unmistakably the
          // one focal object rather than competing with the plexus.
          opacity: state.phase === 'casting' ? 0.55 : 1
        },
        { line: this.palette.gold, node: this.palette.goldBright }
      )
    }

    let y = pad

    if (state.config.showMasthead) {
      y = this.drawMasthead(state, left, y, contentWidth)
    }

    const footerHeight = this.footerHeight(state)
    const bodyTop = y
    const bodyBottom = this.height - pad - footerHeight
    const bodyHeight = Math.max(bodyBottom - bodyTop, 60)

    const frame = concordFrameAt(state, wall)
    if (frame.timed) {
      const barY = this.drawCountdown(frame, left, bodyTop, contentWidth)
      y = barY
    }

    if (state.options.length === 0) {
      this.drawEmpty(left, bodyTop + bodyHeight / 2, contentWidth)
    } else if (state.phase === 'casting' && cast && castFrame) {
      this.drawCasting(state, cast, castFrame, left, y, contentWidth, bodyBottom - y)
    } else {
      this.smoothChase(state, delta)
      if (state.config.presentation === 'council') {
        this.drawCouncil(state, left, y, contentWidth, bodyBottom - y)
      } else {
        this.drawTally(state, left, y, contentWidth, bodyBottom - y, wall)
      }
    }

    this.drawFooter(state, left, this.height - pad, contentWidth)
    ctx.globalAlpha = 1
  }

  // ------------------------------------------------------------------ widget

  /**
   * THE CONCORD as a corner plate.
   *
   * Deliberately *not* the full layout scaled down. The brief's composition
   * rules — one focal object suspended in a vast symmetrical field — are rules
   * for composing a scene, and this is furniture bolted over someone else's
   * content. So the plexus, the eyebrow and the empty field all go, and a
   * bordered plate arrives in their place: a shrunken scene reads as a mistake,
   * whereas a plate reads as an instrument.
   *
   * The plate is drawn even when `transparent` is set. That flag means "do not
   * paint a backdrop over the whole scene", and it has to keep meaning that here
   * — but text laid straight onto gameplay is unreadable, so the plate itself
   * stays and simply carries less opacity.
   */
  private drawWidget(
    state: ConcordState,
    cast: ConcordState['cast'],
    castFrame: ReturnType<typeof castFrameAt> | null,
    delta: number,
    wall: number
  ): void {
    const { context: ctx, palette } = this
    const pad = Math.max(Math.min(this.width, this.height) * 0.04, 6)
    const x = pad
    const y = pad
    const w = Math.max(this.width - pad * 2, 40)
    const h = Math.max(this.height - pad * 2, 30)

    // The type scale is the plate, not the canvas — a widget in a wide source
    // should not grow its type just because the source is wide.
    this.typeScale = Math.min(w, h * 1.4)

    // The plate.
    ctx.fillStyle = withAlpha(palette.slab, state.config.transparent ? 0.78 : 0.94)
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = palette.slabEdge
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    const inset = Math.max(Math.min(w, h) * 0.055, 8)
    const left = x + inset
    const width = w - inset * 2
    let cursor = y + inset

    // --- header: title, and the clock if there is one ----------------------
    const titleSize = Math.max(this.typeScale * 0.042, 10)
    const clockSize = Math.max(this.typeScale * 0.04, 10)
    const frame = concordFrameAt(state, wall)

    if (state.config.showMasthead) {
      const clock = frame.timed
        ? `${String(Math.floor(frame.seconds / 60)).padStart(2, '0')}:${String(frame.seconds % 60).padStart(2, '0')}`
        : ''

      ctx.font = `${clockSize}px ${palette.mono}`
      const clockWidth = clock.length > 0 ? ctx.measureText(clock).width : 0

      ctx.fillStyle = palette.text
      this.tracked(
        this.fit(
          (state.config.title || 'THE CONCORD').toUpperCase(),
          width - clockWidth - inset,
          titleSize,
          0.12,
          'display'
        ),
        left,
        cursor + titleSize,
        titleSize,
        0.12,
        'display'
      )

      if (clock.length > 0) {
        ctx.fillStyle = frame.finalCall ? palette.crimsonBright : withAlpha(palette.textDim, 0.95)
        ctx.textAlign = 'right'
        ctx.font = `${clockSize}px ${palette.mono}`
        ctx.fillText(clock, left + width, cursor + titleSize)
        ctx.textAlign = 'left'
      }

      cursor += titleSize * 1.7

      /*
       * The rule *is* the countdown.
       *
       * A separate progress bar would cost a row of a plate that has very few,
       * and the header rule is already exactly where the eye goes first. Gold
       * through most of the window, crimson inside the final call.
       */
      const remaining = frame.timed ? 1 - clamp01(frame.progress) : 1
      ctx.fillStyle = withAlpha(palette.brass, 0.5)
      ctx.fillRect(left, cursor, width, 1)
      ctx.fillStyle = frame.finalCall ? palette.crimson : withAlpha(palette.gold, 0.85)
      ctx.fillRect(left, cursor, width * remaining, 1)
      cursor += Math.max(titleSize * 0.6, 8)
    }

    // --- footer text, measured first so the body knows its room ------------
    const footSize = Math.max(this.typeScale * 0.032, 8)
    const footRoom = state.config.showInstruction ? footSize * 2.1 : 0
    const bodyTop = cursor
    const bodyHeight = Math.max(y + h - inset - footRoom - bodyTop, 20)

    if (state.options.length === 0) {
      ctx.fillStyle = withAlpha(palette.textFaint, 0.85)
      this.tracked('NO QUESTION PUT', left, bodyTop + bodyHeight / 2, footSize, 0.24, 'display')
    } else if (state.phase === 'casting' && cast && castFrame) {
      this.drawCasting(state, cast, castFrame, left, bodyTop, width, bodyHeight)
    } else {
      this.smoothChase(state, delta)
      if (state.config.presentation === 'council') {
        this.drawCouncil(state, left, bodyTop, width, bodyHeight)
      } else {
        this.drawWidgetRows(state, left, bodyTop, width, bodyHeight)
      }
    }

    // --- footer -------------------------------------------------------------
    if (state.config.showInstruction) {
      const baseline = y + h - inset
      if (state.phase === 'open') {
        ctx.fillStyle = withAlpha(palette.gold, 0.9)
        this.tracked(
          this.fit(voteInstruction(state.config), width, footSize, 0.18, 'display'),
          left,
          baseline,
          footSize,
          0.18,
          'display'
        )
      } else if (state.result) {
        ctx.fillStyle = withAlpha(palette.textDim, 0.95)
        const line = state.result.decidedByCasting
          ? 'SETTLED BY LOT'
          : `CARRIED — ${Math.round(state.result.share * 100)}%`
        this.tracked(line, left, baseline, footSize, 0.18, 'display')
      } else if (state.phase === 'resolved') {
        ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
        this.tracked('NO VOTES FILED', left, baseline, footSize, 0.18, 'display')
      }

      if (state.config.showVoterCount && state.voters > 0) {
        ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
        ctx.textAlign = 'right'
        ctx.font = `${footSize}px ${palette.mono}`
        ctx.fillText(String(state.voters), left + width, y + h - inset)
        ctx.textAlign = 'left'
      }
    }
  }

  /**
   * The widget's ballot rows.
   *
   * A row is a numeral, a label, a count and a hairline bar — no per-row slab or
   * border, because the plate already supplies the frame and repeating it three
   * more times inside makes a small object look like a table.
   *
   * A long ballot is *truncated* rather than compressed. Six rows in a corner
   * plate are readable and ten are not, and an audience being shown four options
   * they cannot read is worse served than one shown six and a count of the rest.
   */
  private drawWidgetRows(
    state: ConcordState,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const { context: ctx, palette } = this
    const total = totalTally(state.options)
    const leading = leadingOptions(state.options)
    const leadingSet = new Set(leading.tally > 0 ? leading.ids : [])
    const resolvedId = state.phase === 'resolved' ? state.result?.optionId : undefined

    const hidden = Math.max(state.options.length - WIDGET_MAX_ROWS, 0)
    const shown = state.options.slice(0, WIDGET_MAX_ROWS)
    const overflowRoom = hidden > 0 ? Math.max(this.typeScale * 0.04, 9) : 0

    const gap = Math.max(height * 0.04, 3)
    /*
     * Rows are capped against the type scale, not only against the room.
     *
     * Dividing the available height by the row count is what the full layout
     * does, and it is wrong here: a three-option ballot in a shallow plate got
     * 62px rows, whose numerals came out *larger* than the full layout's on a
     * source three times the size. A widget row has a size it wants to be, and
     * spare vertical room should stay empty rather than inflate it.
     */
    const rowHeight = Math.max(
      Math.min(
        (height - overflowRoom - gap * (shown.length - 1)) / shown.length,
        this.typeScale * 0.085
      ),
      12
    )

    shown.forEach((option, index) => {
      const top = y + index * (rowHeight + gap)
      const share = clamp01(this.shownShare(option, total))
      const lit =
        resolvedId !== undefined
          ? option.id === resolvedId
          : leadingSet.has(option.id) && leading.tally > 0

      const plate = state.config.showTokens ? rowHeight * 0.82 : 0
      const textLeft = x + plate + (plate > 0 ? Math.max(rowHeight * 0.28, 5) : 0)
      const labelSize = Math.max(Math.min(rowHeight * 0.44, this.typeScale * 0.034), 8)

      if (plate > 0) {
        ctx.fillStyle = withAlpha(lit ? palette.crimsonDeep : palette.slabRaised, 0.95)
        ctx.fillRect(x, top, plate, plate)
        ctx.strokeStyle = lit ? withAlpha(palette.crimson, 0.6) : withAlpha(palette.goldDim, 0.4)
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, top + 0.5, plate - 1, plate - 1)

        ctx.fillStyle = lit ? palette.crimsonBright : palette.gold
        ctx.font = `${plate * 0.6}px ${palette.mono}`
        ctx.textAlign = 'center'
        ctx.fillText(option.token, x + plate / 2, top + plate * 0.72)
        ctx.textAlign = 'left'
      }

      const readout = state.config.showPercentages
        ? `${option.tally}  ${Math.round(optionShare(option.tally, total) * 100)}%`
        : String(option.tally)
      ctx.font = `${labelSize}px ${palette.mono}`
      const readoutWidth = ctx.measureText(readout).width

      ctx.fillStyle = lit ? palette.text : withAlpha(palette.text, 0.88)
      this.tracked(
        this.fit(
          option.label.toUpperCase(),
          Math.max(x + width - textLeft - readoutWidth - labelSize, 20),
          labelSize,
          0.1,
          'display'
        ),
        textLeft,
        top + labelSize,
        labelSize,
        0.1,
        'display'
      )

      ctx.fillStyle = lit ? palette.crimsonBright : withAlpha(palette.textDim, 0.95)
      ctx.font = `${labelSize}px ${palette.mono}`
      ctx.textAlign = 'right'
      ctx.fillText(readout, x + width, top + labelSize)
      ctx.textAlign = 'left'

      const barY = top + rowHeight - Math.max(rowHeight * 0.22, 3)
      const barHeight = Math.max(rowHeight * 0.13, 2)
      ctx.fillStyle = withAlpha(palette.brass, 0.45)
      ctx.fillRect(textLeft, barY, x + width - textLeft, barHeight)

      const filled = (x + width - textLeft) * share
      if (filled > 0.5) {
        ctx.fillStyle = lit ? palette.crimson : withAlpha(palette.goldDim, 0.8)
        ctx.fillRect(textLeft, barY, filled, barHeight)
        ctx.fillStyle = lit ? palette.crimsonBright : withAlpha(palette.gold, 0.85)
        ctx.fillRect(textLeft + filled - 1.2, barY, 1.2, barHeight)
      }
    })

    if (hidden > 0) {
      const size = Math.max(this.typeScale * 0.03, 8)
      ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
      this.tracked(`AND ${hidden} MORE ON THE BALLOT`, x, y + height - 1, size, 0.2, 'display')
    }
  }

  /**
   * The instant a cast command should be evaluated at.
   *
   * The wall clock while motion is on, so a browser source attaching mid-casting
   * picks it up at the right offset. With motion off there is no frame loop, so
   * the command is evaluated at its end instead and the face paints one resting
   * frame on the lifted lot — reading the live clock in that mode would freeze
   * the lots wherever they happened to be, mid-tumble, forever.
   */
  private castClock(cast: NonNullable<ConcordState['cast']>): number {
    return this.motion ? Date.now() : cast.startedAt + totalCastDurationMs(cast)
  }

  private drawBackdrop(): void {
    const { context: ctx, palette } = this
    ctx.fillStyle = palette.backdrop
    ctx.fillRect(0, 0, this.width, this.height)

    // A vignette rather than a flat field: the reference boards all place their
    // object in a vast dark space that falls off at the edges.
    const gradient = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      0,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.7
    )
    gradient.addColorStop(0, withAlpha(palette.slab, 0.5))
    gradient.addColorStop(1, withAlpha(palette.backdrop, 0.9))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, this.width, this.height)
  }

  /**
   * Smooths every bar toward its true share.
   *
   * Frame-rate normalised, so the motion is identical at 30fps in an OBS source
   * and at 144 in the console. `TALLY_SMOOTHING` is expressed per 60fps frame,
   * which is what the exponent converts from.
   *
   * This exists because the tally arrives in coalesced steps eight times a
   * second: snapping to each one would read as eight stutters, while chasing
   * turns the same data into continuous motion.
   */
  private smoothChase(state: ConcordState, delta: number): void {
    const total = totalTally(state.options)
    const frames = Math.max((delta * 1000) / (1000 / 60), 0)
    const k = frames <= 0 ? 0 : 1 - Math.pow(1 - TALLY_SMOOTHING, frames)

    for (const option of state.options) {
      const target = optionShare(option.tally, total)
      const entry = this.chase.get(option.id)
      if (!entry) {
        this.chase.set(option.id, { shown: this.motion ? 0 : target })
        continue
      }
      entry.shown += (target - entry.shown) * (this.motion ? k : 1)
    }

    // Options removed from the ballot must not keep a chase entry alive, or a
    // long session slowly accumulates them.
    if (this.chase.size > state.options.length) {
      const live = new Set(state.options.map((option) => option.id))
      for (const id of [...this.chase.keys()]) {
        if (!live.has(id)) this.chase.delete(id)
      }
    }
  }

  private shownShare(option: ConcordOption, total: number): number {
    return this.chase.get(option.id)?.shown ?? optionShare(option.tally, total)
  }

  // ---------------------------------------------------------------- masthead

  private drawMasthead(state: ConcordState, x: number, y: number, width: number): number {
    const { context: ctx, palette } = this
    const scale = this.compact ? 0.82 : 1
    const type = this.typeScale
    let cursor = y

    const eyebrowSize = Math.max(type * 0.016 * scale, 8)
    ctx.fillStyle = withAlpha(palette.goldDim, 0.9)
    this.tracked('OBSERVATORY / THE CONCORD', x, cursor + eyebrowSize, eyebrowSize, 0.28, 'display')
    cursor += eyebrowSize * 2.4

    const titleSize = Math.max(type * 0.05 * scale, 15)
    ctx.fillStyle = palette.text
    this.tracked(
      this.fit(state.config.title.toUpperCase(), width, titleSize, 0.1, 'display'),
      x,
      cursor + titleSize * 0.86,
      titleSize,
      0.1,
      'display'
    )
    cursor += titleSize * 1.42

    if (state.config.prompt.trim().length > 0) {
      const promptSize = Math.max(type * 0.021 * scale, 9)
      ctx.fillStyle = withAlpha(palette.textDim, 0.95)
      this.tracked(
        this.fit(state.config.prompt.toUpperCase(), width, promptSize, 0.2, 'display'),
        x,
        cursor + promptSize,
        promptSize,
        0.2,
        'display'
      )
      cursor += promptSize * 2.1
    }

    this.hairline(x, cursor, width, 0.26)
    return cursor + Math.max(type * 0.03, 12)
  }

  // --------------------------------------------------------------- countdown

  /**
   * The voting window, as a draining hairline.
   *
   * Gold for most of it and crimson inside the final call — which is the
   * palette's rule for the one saturated colour and also, conveniently, the
   * exact moment it should mean something.
   */
  private drawCountdown(
    frame: ReturnType<typeof concordFrameAt>,
    x: number,
    y: number,
    width: number
  ): number {
    const { context: ctx, palette } = this
    const thickness = this.compact ? 2 : 3
    const remaining = 1 - clamp01(frame.progress)
    const urgent = frame.finalCall

    ctx.fillStyle = withAlpha(palette.brass, 0.55)
    ctx.fillRect(x, y, width, thickness)

    ctx.fillStyle = urgent ? palette.crimson : palette.gold
    ctx.fillRect(x, y, width * remaining, thickness)

    // Quarter ticks, so the window is readable as a proportion and not only as
    // a length — the same convention the Meter primitive uses.
    for (let i = 1; i < 4; i += 1) {
      ctx.fillStyle = withAlpha(palette.goldDim, 0.5)
      ctx.fillRect(x + (width * i) / 4, y - 2, 1, thickness + 4)
    }

    const labelSize = Math.max(this.typeScale * 0.018, 8)
    const seconds = frame.seconds
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

    ctx.fillStyle = urgent ? palette.crimsonBright : withAlpha(palette.textDim, 0.9)
    ctx.textAlign = 'right'
    ctx.font = `${labelSize * 1.2}px ${palette.mono}`
    ctx.fillText(clock, x + width, y + thickness + labelSize * 2)
    ctx.textAlign = 'left'

    ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
    this.tracked(
      urgent ? 'FINAL CALL' : 'VOTING OPEN',
      x,
      y + thickness + labelSize * 2,
      labelSize,
      0.24,
      'display'
    )

    return y + thickness + labelSize * 3.1
  }

  // ------------------------------------------------------------------- tally

  /**
   * THE TALLY — engraved slabs, each filling as votes are filed.
   *
   * The slab vocabulary is the PROCESSION's, reused deliberately: the
   * catalogue should read as one department's work rather than as several
   * people's, and a poll is a docket of slabs if it is anything.
   */
  private drawTally(
    state: ConcordState,
    x: number,
    y: number,
    width: number,
    height: number,
    now: number
  ): void {
    const options = state.options
    const total = totalTally(options)
    const leading = leadingOptions(options)
    const leadingSet = new Set(leading.ids)
    const resolvedId = state.phase === 'resolved' ? state.result?.optionId : undefined

    const gap = Math.max(height * 0.02, 4)
    const slabHeight = Math.max((height - gap * (options.length - 1)) / options.length, 18)

    options.forEach((option, index) => {
      const top = y + index * (slabHeight + gap)
      if (top + slabHeight > y + height + 1) return

      const share = this.shownShare(option, total)
      // Only ignite while it means something. A leading option mid-poll is live
      // state; once resolved only the winner is, and before any vote is filed
      // nothing is — a crimson bar on a zero tally would be asserting a leader
      // that does not exist.
      const lit =
        resolvedId !== undefined
          ? option.id === resolvedId
          : leadingSet.has(option.id) && leading.tally > 0

      this.drawSlab(option, top, x, width, slabHeight, share, lit, total, state, now)
    })
  }

  private drawSlab(
    option: ConcordOption,
    top: number,
    x: number,
    width: number,
    height: number,
    share: number,
    lit: boolean,
    total: number,
    state: ConcordState,
    now: number
  ): void {
    const { context: ctx, palette } = this
    const plate = Math.min(height * 0.9, this.typeScale * 0.09)
    const textLeft = x + plate + Math.max(this.typeScale * 0.02, 8)
    const barLeft = textLeft
    const barRight = x + width

    // The slab.
    ctx.fillStyle = withAlpha(palette.slab, 0.82)
    ctx.fillRect(x, top, width, height)
    ctx.strokeStyle = lit ? withAlpha(palette.crimson, 0.5) : palette.slabEdge
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, top + 0.5, width - 1, height - 1)

    // The numeral plate. Drawn as the token itself rather than a two-digit
    // house-style index: this is the character an audience has to type, and
    // printing `01` where `1` is expected would be a poll that miscounts by
    // design.
    if (state.config.showTokens) {
      ctx.fillStyle = withAlpha(lit ? palette.crimsonDeep : palette.slabRaised, 0.95)
      ctx.fillRect(x, top, plate, height)
      ctx.strokeStyle = lit ? withAlpha(palette.crimson, 0.6) : withAlpha(palette.goldDim, 0.42)
      ctx.strokeRect(x + 0.5, top + 0.5, plate - 1, height - 1)

      const tokenSize = Math.min(height * 0.46, plate * 0.52)
      ctx.fillStyle = lit ? palette.crimsonBright : palette.gold
      ctx.font = `${tokenSize}px ${palette.mono}`
      ctx.textAlign = 'center'
      ctx.fillText(option.token, x + plate / 2, top + height / 2 + tokenSize * 0.36)
      ctx.textAlign = 'left'
    }

    const labelSize = Math.max(Math.min(height * 0.26, this.typeScale * 0.026), 8)
    const readoutSize = Math.max(Math.min(height * 0.24, this.typeScale * 0.024), 8)

    // Counts first, so the label can be fitted to what is left.
    const percent = `${Math.round(optionShare(option.tally, total) * 100)}%`
    const readout = state.config.showPercentages
      ? `${option.tally}  ${percent}`
      : String(option.tally)

    ctx.font = `${readoutSize}px ${palette.mono}`
    const readoutWidth = ctx.measureText(readout).width
    const labelRoom = Math.max(barRight - barLeft - readoutWidth - labelSize, 24)

    ctx.fillStyle = lit ? palette.text : withAlpha(palette.text, 0.86)
    this.tracked(
      this.fit(option.label.toUpperCase(), labelRoom, labelSize, 0.12, 'display'),
      textLeft,
      top + height * 0.42,
      labelSize,
      0.12,
      'display'
    )

    ctx.fillStyle = lit ? palette.crimsonBright : withAlpha(palette.textDim, 0.95)
    ctx.font = `${readoutSize}px ${palette.mono}`
    ctx.textAlign = 'right'
    ctx.fillText(readout, barRight, top + height * 0.42)
    ctx.textAlign = 'left'

    // The bar. Engraved track, then the fill.
    const barY = top + height * 0.62
    const barHeight = Math.max(height * 0.16, 3)
    const barWidth = barRight - barLeft

    ctx.fillStyle = withAlpha(palette.brass, 0.45)
    ctx.fillRect(barLeft, barY, barWidth, barHeight)

    const filled = barWidth * clamp01(share)
    if (filled > 0.5) {
      if (lit) {
        const gradient = ctx.createLinearGradient(barLeft, barY, barLeft + filled, barY)
        gradient.addColorStop(0, withAlpha(palette.crimsonDeep, 0.95))
        gradient.addColorStop(1, palette.crimson)
        ctx.fillStyle = gradient
      } else {
        ctx.fillStyle = withAlpha(palette.goldDim, 0.75)
      }
      ctx.fillRect(barLeft, barY, filled, barHeight)

      // A bright leading edge, so a moving bar reads as moving.
      ctx.fillStyle = lit ? palette.crimsonBright : withAlpha(palette.gold, 0.8)
      ctx.fillRect(barLeft + filled - 1.5, barY, 1.5, barHeight)
    }

    if (state.phase === 'resolved' && lit) this.drawStamp(x, top, width, height, now)
  }

  /**
   * The winner's mark.
   *
   * A struck seal rather than a flourish — this is a department recording an
   * outcome. Entrance is measured from the result's own timestamp, so the
   * console and the broadcast strike it at the same instant.
   */
  private drawStamp(x: number, top: number, width: number, height: number, now: number): void {
    const { context: ctx, palette } = this
    if (this.resolvedAt === null) return

    const u = clamp01((now - this.resolvedAt) / STAMP_MS)
    if (u <= 0) return

    const inset = Math.max(this.typeScale * 0.006, 2)
    ctx.save()
    ctx.globalAlpha = u
    ctx.strokeStyle = withAlpha(palette.crimsonBright, 0.7)
    ctx.lineWidth = this.compact ? 1 : 1.5
    ctx.strokeRect(
      x - inset + 0.5,
      top - inset + 0.5,
      width + inset * 2 - 1,
      height + inset * 2 - 1
    )
    ctx.restore()
  }

  // ----------------------------------------------------------------- council

  /**
   * THE COUNCIL — an equal seat for every option, filling as votes are filed.
   *
   * Equal wedges rather than wedges sized by share, which is the whole point of
   * the presentation: the chamber's shape is fixed and immutable, and what
   * changes is how much of each seat is occupied. A pie chart would say the
   * opposite — that the institution reshapes itself around opinion — and would
   * also need a colour per slice, which the palette does not have.
   */
  private drawCouncil(
    state: ConcordState,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const { context: ctx, palette } = this
    const options = state.options
    const total = totalTally(options)
    const leading = leadingOptions(options)
    const leadingSet = new Set(leading.ids)
    const resolvedId = state.phase === 'resolved' ? state.result?.optionId : undefined

    const size = Math.min(width, height)
    const cx = x + width / 2
    const cy = y + height / 2
    const outer = size * 0.44
    const inner = size * 0.17
    const wedge = TAU / options.length

    ctx.save()
    ctx.translate(cx, cy)

    options.forEach((option, index) => {
      // Started at twelve o'clock so option 1 is where a reader looks first.
      const start = -Math.PI / 2 + index * wedge
      const end = start + wedge
      const share = clamp01(this.shownShare(option, total))
      const lit =
        resolvedId !== undefined
          ? option.id === resolvedId
          : leadingSet.has(option.id) && leading.tally > 0

      const reach = inner + (outer - inner) * share

      if (share > 0.001) {
        ctx.beginPath()
        ctx.arc(0, 0, reach, start + 0.012, end - 0.012)
        ctx.arc(0, 0, inner, end - 0.012, start + 0.012, true)
        ctx.closePath()
        if (lit) {
          const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, outer)
          gradient.addColorStop(0, withAlpha(palette.crimsonDeep, 0.95))
          gradient.addColorStop(1, withAlpha(palette.crimson, 0.9))
          ctx.fillStyle = gradient
        } else {
          ctx.fillStyle = withAlpha(palette.goldDim, 0.6)
        }
        ctx.fill()
      }

      // The empty seat, always drawn, so the chamber is legible at zero votes.
      ctx.beginPath()
      ctx.arc(0, 0, outer, start + 0.012, end - 0.012)
      ctx.arc(0, 0, inner, end - 0.012, start + 0.012, true)
      ctx.closePath()
      ctx.strokeStyle = lit ? withAlpha(palette.crimson, 0.55) : withAlpha(palette.goldDim, 0.34)
      ctx.lineWidth = 1
      ctx.stroke()

      // Token and label on the rim, rotated to sit along it.
      const mid = start + wedge / 2
      const labelRadius = outer + size * 0.045
      const lx = Math.cos(mid) * labelRadius
      const ly = Math.sin(mid) * labelRadius
      const tokenSize = Math.max(size * 0.034, 10)

      ctx.fillStyle = lit ? palette.crimsonBright : palette.gold
      ctx.font = `${tokenSize * 1.15}px ${palette.mono}`
      ctx.textAlign = 'center'
      ctx.fillText(state.config.showTokens ? option.token : '', lx, ly)

      const labelSize = Math.max(size * 0.024, 8)
      ctx.fillStyle = lit ? palette.text : withAlpha(palette.textDim, 0.9)
      ctx.font = `${labelSize}px ${palette.display}`
      ctx.fillText(
        this.fit(option.label.toUpperCase(), size * 0.34, labelSize, 0, 'display'),
        lx,
        ly + labelSize * 1.7
      )

      if (state.config.showPercentages && total > 0) {
        ctx.fillStyle = withAlpha(palette.textFaint, 0.95)
        ctx.font = `${labelSize}px ${palette.mono}`
        ctx.fillText(
          `${Math.round(optionShare(option.tally, total) * 100)}%`,
          lx,
          ly + labelSize * 3.1
        )
      }
      ctx.textAlign = 'left'
    })

    // The centre holds the total — the one number the chamber is accumulating.
    const totalSize = Math.max(size * 0.075, 14)
    ctx.textAlign = 'center'
    ctx.fillStyle = palette.text
    ctx.font = `${totalSize}px ${palette.mono}`
    ctx.fillText(String(total), 0, totalSize * 0.34)

    ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
    const capSize = Math.max(size * 0.019, 7)
    ctx.font = `${capSize}px ${palette.display}`
    ctx.fillText('VOTES', 0, totalSize * 0.34 + capSize * 2)
    ctx.textAlign = 'left'

    ctx.restore()
  }

  // ----------------------------------------------------------------- casting

  /**
   * THE CASTING — lots in a vessel, one of which is lifted.
   *
   * Everything drawn here derives from the `CastCommand`, so both surfaces lift
   * the same lot at the same instant. This is the one part of the face that is
   * correctness rather than presentation: a console and a broadcast disagreeing
   * about which lot rose, in front of an audience, is unrecoverable.
   */
  private drawCasting(
    state: ConcordState,
    cast: NonNullable<ConcordState['cast']>,
    frame: ReturnType<typeof castFrameAt>,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const { context: ctx, palette } = this
    const size = Math.min(width, height)
    const cx = x + width / 2
    const cy = y + height * 0.5
    const span = size * 0.34
    const elapsed = this.castClock(cast) - cast.startedAt

    // The eyebrow says what is happening, because a viewer who looked away needs
    // to know the vote ended in a deadlock rather than that the poll broke.
    const capSize = Math.max(this.typeScale * 0.019, 9)
    ctx.textAlign = 'center'
    ctx.fillStyle = palette.crimsonBright
    this.trackedCentred('THE CASTING', cx, y + capSize * 1.6, capSize, 0.34, 'display')
    ctx.fillStyle = withAlpha(palette.textDim, 0.9)
    this.trackedCentred(
      `THE CHAMBER IS DIVIDED — ${cast.tiedIds.length} LOTS, ONE IS TAKEN`,
      cx,
      y + capSize * 3.4,
      capSize * 0.72,
      0.2,
      'display'
    )
    ctx.textAlign = 'left'

    // The vessel: a shallow ellipse the lots are held in.
    const tilt = 0.42
    const project = (p: {
      x: number
      y: number
      z: number
    }): { sx: number; sy: number; d: number } => {
      const depth = p.z
      const perspective = 1.7 / (1.7 - depth * 0.45)
      return {
        sx: cx + p.x * span * perspective,
        sy: cy + (p.y * Math.cos(tilt) + depth * Math.sin(tilt) * 0.55) * span * perspective,
        d: depth
      }
    }

    ctx.strokeStyle = withAlpha(palette.goldDim, 0.32)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, cy + span * 0.42, span * 1.06, span * 0.44, 0, 0, TAU)
    ctx.stroke()

    ctx.strokeStyle = withAlpha(palette.goldDim, 0.16)
    ctx.beginPath()
    ctx.ellipse(cx, cy + span * 0.2, span * 1.16, span * 0.5, 0, 0, TAU)
    ctx.stroke()

    // Lots, painted back to front so the group reads as having depth.
    const lots = cast.tiedIds.map((id, index) => {
      const chosen = index === cast.targetIndex
      const point = lotPosition(index, cast.tiedIds.length, elapsed, frame, chosen)
      return { id, index, chosen, ...project(point) }
    })
    lots.sort((a, b) => a.d - b.d)

    const radius = Math.max(span * 0.16, 6)

    for (const lot of lots) {
      const option = state.options.find((entry) => entry.id === lot.id)
      const near = (lot.d + 1) / 2
      const scale = 0.82 + near * 0.32
      const r = radius * scale * (lot.chosen ? 1 + frame.lift * 0.28 : 1 - frame.lift * 0.2)

      // Every lot is crimson glass: they are indistinguishable until one is
      // taken, which is the whole conceit. Only the lift tells them apart.
      const dim = lot.chosen ? 1 : 1 - frame.lift * 0.75
      const gradient = ctx.createRadialGradient(
        lot.sx - r * 0.3,
        lot.sy - r * 0.4,
        r * 0.1,
        lot.sx,
        lot.sy,
        r
      )
      gradient.addColorStop(0, withAlpha(palette.crimson, 0.95 * dim))
      gradient.addColorStop(1, withAlpha(palette.crimsonVoid, 0.92 * dim))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(lot.sx, lot.sy, r, 0, TAU)
      ctx.fill()

      // The gold rim — the boot orb's material, reused so the lot reads as the
      // same kind of object the app has established.
      ctx.strokeStyle = withAlpha(
        lot.chosen && frame.lift > 0 ? palette.goldBright : palette.goldDim,
        (0.4 + near * 0.4) * dim + (lot.chosen ? frame.lift * 0.5 : 0)
      )
      ctx.lineWidth = lot.chosen && frame.lift > 0.4 ? 1.6 : 1
      ctx.beginPath()
      ctx.arc(lot.sx, lot.sy, r, 0, TAU)
      ctx.stroke()

      if (lot.chosen && frame.lift > 0.35) {
        const halo = clamp01((frame.lift - 0.35) / 0.65)
        const glow = ctx.createRadialGradient(lot.sx, lot.sy, r, lot.sx, lot.sy, r * 3)
        glow.addColorStop(0, withAlpha(palette.crimson, 0.3 * halo))
        glow.addColorStop(1, withAlpha(palette.crimsonVoid, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(lot.sx, lot.sy, r * 3, 0, TAU)
        ctx.fill()

        if (option) {
          const nameSize = Math.max(this.typeScale * 0.024, 10)
          ctx.textAlign = 'center'
          ctx.globalAlpha = halo
          ctx.fillStyle = palette.text
          this.trackedCentred(
            this.fit(option.label.toUpperCase(), width * 0.8, nameSize, 0.14, 'display'),
            lot.sx,
            lot.sy - r * 1.9,
            nameSize,
            0.14,
            'display'
          )
          ctx.globalAlpha = 1
          ctx.textAlign = 'left'
        }
      }
    }

    // The odds, stated plainly. The rite quotes its pool size for the same
    // reason: a draw an audience cannot audit is a draw they can resent.
    const oddsSize = Math.max(this.typeScale * 0.017, 8)
    ctx.textAlign = 'center'
    ctx.fillStyle = withAlpha(palette.textFaint, 0.95)
    this.trackedCentred(
      `EQUAL LOTS — 1 IN ${cast.tiedIds.length}`,
      cx,
      y + height - oddsSize,
      oddsSize,
      0.26,
      'display'
    )
    ctx.textAlign = 'left'
  }

  // ------------------------------------------------------------------ footer

  private footerHeight(state: ConcordState): number {
    const unit = Math.max(this.typeScale * 0.018, 9)
    let lines = 0
    if (state.config.showInstruction) lines += 1
    if (state.config.showVoterCount) lines += 1
    if (state.config.showStatus) lines += 1
    return lines === 0 ? 0 : unit * (lines * 1.9 + 0.8)
  }

  private drawFooter(state: ConcordState, x: number, bottom: number, width: number): void {
    const { context: ctx, palette } = this
    const unit = Math.max(this.typeScale * 0.018, 9)
    let cursor = bottom

    if (state.config.showStatus) {
      ctx.fillStyle = withAlpha(palette.textFaint, 0.7)
      /*
       * Idle splits in two.
       *
       * Idle with a ballot on it is the question being prepared and the chamber
       * not yet sitting, which is a different thing to say than idle with
       * nothing filed — and the operator watching the source while they type
       * needs to be told which of the two they are looking at.
       */
      const phase =
        state.phase === 'open'
          ? 'ATTENDING'
          : state.phase === 'casting'
            ? 'CASTING LOTS'
            : state.phase === 'resolved'
              ? 'ENTERED INTO THE RECORD'
              : state.options.length > 0
                ? 'THE CHAMBER IS NOT YET SITTING'
                : 'AWAITING THE QUESTION'
      this.tracked(phase, x, cursor, unit * 0.82, 0.24, 'display')
      cursor -= unit * 1.9
    }

    if (state.config.showVoterCount) {
      const voters = `${state.voters} ${state.voters === 1 ? 'CITIZEN' : 'CITIZENS'}`
      ctx.fillStyle = withAlpha(palette.textDim, 0.9)
      this.tracked(voters, x, cursor, unit * 0.92, 0.2, 'display')

      ctx.textAlign = 'right'
      ctx.fillStyle = withAlpha(palette.textDim, 0.9)
      ctx.font = `${unit}px ${palette.mono}`
      ctx.fillText(`${state.totalVotes} VOTES`, x + width, cursor)
      ctx.textAlign = 'left'
      cursor -= unit * 1.9
    }

    // The directive. An audience cannot vote in a syntax nobody told them, and
    // an institution issuing an instruction is exactly the right register.
    if (state.config.showInstruction && state.phase === 'open') {
      ctx.fillStyle = withAlpha(palette.gold, 0.92)
      this.tracked(
        this.fit(voteInstruction(state.config), width, unit * 0.92, 0.22, 'display'),
        x,
        cursor,
        unit * 0.92,
        0.22,
        'display'
      )
    } else if (state.config.showInstruction && state.phase === 'resolved' && state.result) {
      ctx.fillStyle = withAlpha(palette.textDim, 0.9)
      const line = state.result.decidedByCasting
        ? 'SETTLED BY THE CASTING OF LOTS'
        : `CARRIED WITH ${Math.round(state.result.share * 100)}% OF THE CHAMBER`
      this.tracked(line, x, cursor, unit * 0.92, 0.22, 'display')
    } else if (state.config.showInstruction && state.phase === 'resolved' && !state.result) {
      // Nobody voted. Said plainly rather than dressed up as a result.
      ctx.fillStyle = withAlpha(palette.textFaint, 0.9)
      this.tracked('THE CHAMBER DID NOT SPEAK', x, cursor, unit * 0.92, 0.22, 'display')
    }
  }

  private drawEmpty(x: number, y: number, width: number): void {
    const { context: ctx, palette } = this
    const size = Math.max(this.typeScale * 0.022, 10)
    ctx.textAlign = 'center'
    ctx.fillStyle = withAlpha(palette.textFaint, 0.8)
    this.trackedCentred('NO QUESTION HAS BEEN PUT', x + width / 2, y, size, 0.3, 'display')
    ctx.textAlign = 'left'
  }

  // ------------------------------------------------------------- typography

  private hairline(x: number, y: number, width: number, alpha: number): void {
    const { context: ctx, palette } = this
    ctx.fillStyle = withAlpha(palette.gold, alpha)
    ctx.fillRect(x, y, width, 1)
  }

  /**
   * Draws tracked uppercase text, one glyph at a time.
   *
   * Canvas has `letterSpacing`, and it is deliberately not used: an OBS browser
   * source runs an embedded Chromium that can lag Electron's by years, and this
   * face has to render identically on both. Laying the glyphs out by hand is
   * version-proof, and it is what the countdown face already does.
   */
  private tracked(
    text: string,
    x: number,
    baseline: number,
    size: number,
    tracking: number,
    face: 'display' | 'mono'
  ): void {
    const { context: ctx, palette } = this
    ctx.font = `${size}px ${face === 'mono' ? palette.mono : palette.display}`
    const spacing = size * tracking
    let cursor = x
    for (const glyph of text) {
      ctx.fillText(glyph, cursor, baseline)
      cursor += ctx.measureText(glyph).width + spacing
    }
  }

  /** As `tracked`, centred on `x`. */
  private trackedCentred(
    text: string,
    x: number,
    baseline: number,
    size: number,
    tracking: number,
    face: 'display' | 'mono'
  ): void {
    const { context: ctx, palette } = this
    ctx.font = `${size}px ${face === 'mono' ? palette.mono : palette.display}`
    const spacing = size * tracking
    const width = [...text].reduce(
      (sum, glyph) => sum + ctx.measureText(glyph).width + spacing,
      -spacing
    )
    const previous = ctx.textAlign
    ctx.textAlign = 'left'
    this.tracked(text, x - width / 2, baseline, size, tracking, face)
    ctx.textAlign = previous
  }

  /**
   * Truncates to fit, with an ellipsis.
   *
   * Memoised, because this runs for every option on every frame and
   * `measureText` is not free. Keyed on everything that changes the answer, and
   * cleared on resize.
   */
  private fit(
    text: string,
    maxWidth: number,
    size: number,
    tracking: number,
    face: 'display' | 'mono'
  ): string {
    const key = `${face}|${size.toFixed(1)}|${tracking}|${maxWidth.toFixed(0)}|${text}`
    const cached = this.fitted.get(key)
    if (cached !== undefined) return cached

    const { context: ctx, palette } = this
    ctx.font = `${size}px ${face === 'mono' ? palette.mono : palette.display}`
    const spacing = size * tracking
    const measure = (value: string): number =>
      [...value].reduce((sum, glyph) => sum + ctx.measureText(glyph).width + spacing, -spacing)

    let result = text
    if (measure(text) > maxWidth) {
      let trimmed = text
      while (trimmed.length > 1 && measure(`${trimmed}…`) > maxWidth) {
        trimmed = trimmed.slice(0, -1)
      }
      result = `${trimmed}…`
    }

    // Bounded so a long session cannot grow this without limit.
    if (this.fitted.size > 512) this.fitted.clear()
    this.fitted.set(key, result)
    return result
  }
}
