import type { NowPlayingState, NowPlayingTrack } from '@shared/domain/nowplaying'
import {
  formatArtists,
  formatTrackTime,
  isSampleStale,
  trackProgressAt,
  trackProgressRatio
} from '@shared/domain/nowplaying.constants'

/**
 * The NOW TRANSMITTING face.
 *
 * Framework-free, like the rite ring and the countdown face, so the console
 * preview and the OBS browser source render identically from one implementation.
 *
 * The timeline is the point of interest: Spotify is polled every few seconds,
 * but the playhead is interpolated locally from the sample's timestamp, so the
 * bar glides rather than stepping. It advances only while the sample said
 * playback was running, which means pausing in Spotify visibly pauses the
 * overlay instead of letting the bar drift on past the truth.
 *
 * Four presentations of the same information in the same five materials — a
 * plate, a portrait monolith, a thin strip and a turning disc — so one can be
 * dropped into a corner, a lower third, a sidebar or a plate without
 * re-laying anything out.
 *
 * The background is never painted: this composites onto a scene.
 */

const FALLBACK = {
  panel: 'rgba(10, 9, 11, 0.72)',
  slab: '#0c0c0c',
  line: 'rgba(182, 158, 124, 0.12)',
  lineGold: 'rgba(210, 169, 97, 0.34)',
  gold: '#d2a961',
  goldBright: '#e3c286',
  goldDim: '#976b30',
  brass: '#45351f',
  text: '#ddcfb2',
  textDim: '#8a8071',
  textFaint: '#3d3931',
  crimson: '#a32b23',
  crimsonBright: '#c4453a',
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
    panel: FALLBACK.panel,
    slab: read('--ch-obsidian-800', FALLBACK.slab),
    line: read('--ch-line', FALLBACK.line),
    lineGold: read('--ch-line-gold', FALLBACK.lineGold),
    gold: read('--ch-gold-300', FALLBACK.gold),
    goldBright: read('--ch-gold-200', FALLBACK.goldBright),
    goldDim: read('--ch-gold-500', FALLBACK.goldDim),
    brass: read('--ch-brass-700', FALLBACK.brass),
    text: read('--ch-alabaster-300', FALLBACK.text),
    textDim: read('--ch-concrete-400', FALLBACK.textDim),
    textFaint: read('--ch-text-faint', FALLBACK.textFaint),
    crimson: read('--ch-crimson-500', FALLBACK.crimson),
    crimsonBright: read('--ch-crimson-400', FALLBACK.crimsonBright),
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

/** Entrance and exit of the whole face, and of a changed track. */
const REVEAL_MS = 620
/** How long a new track's text slides in for. */
const CHANGE_MS = 520
/** Marquee speed, pixels per second. Slow enough to read. */
const MARQUEE_SPEED = 34
/** Pause at each end of a marquee cycle. */
const MARQUEE_HOLD_MS = 1_400
/** One revolution of the disc. A record is 33⅓ rpm; this is unhurried. */
const DISC_PERIOD_SECONDS = 12

export interface NowPlayingFaceOptions {
  motion?: boolean
  compact?: boolean
}

export class NowPlayingFace {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private palette: typeof FALLBACK
  private compact: boolean
  private motion: boolean

  private state: NowPlayingState | null = null

  private width = 0
  private height = 0
  private frameHandle = 0
  private running = false
  private lastFrameAt = 0

  /** Cover art, decoded once per data URL. */
  private cover: HTMLImageElement | null = null
  private coverKey: string | null = null

  private discRotation = 0
  /** When the current track first appeared, for the change animation. */
  private trackId: string | null = null
  private trackChangedAt = 0
  /** When the face last became visible or hidden, for the reveal. */
  private visibleSince = 0
  private wasVisible = false

  constructor(canvas: HTMLCanvasElement, options: NowPlayingFaceOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable.')

    this.canvas = canvas
    this.context = context
    this.compact = options.compact ?? false
    this.motion = options.motion ?? true
    this.palette = readPalette(document.documentElement)
    this.resize()
  }

  setState(state: NowPlayingState): void {
    this.state = state

    const id = state.track?.id ?? null
    if (id !== this.trackId) {
      this.trackId = id
      this.trackChangedAt = performance.now()
    }

    const key = state.track?.coverDataUrl ?? null
    if (key !== this.coverKey) {
      this.coverKey = key
      this.cover = null
      if (key) {
        const image = new Image()
        // Decoded off the paint path; the frame that needs it will find it set.
        image.onload = () => {
          if (this.coverKey === key) this.cover = image
        }
        image.src = key
      }
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
    this.lastFrameAt = performance.now()
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
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now

    ctx.clearRect(0, 0, width, height)
    if (!state) return

    const track = state.track
    const playing = track !== null && !isSampleStale(track, Date.now())
    const visible = playing || !state.config.hideWhenIdle

    // The whole face fades in and out rather than snapping, so a track ending
    // between songs does not flash the scene.
    if (visible !== this.wasVisible) {
      this.wasVisible = visible
      this.visibleSince = now
    }
    const age = now - this.visibleSince
    const reveal = this.motion ? Math.min(age / REVEAL_MS, 1) : 1
    const opacity = visible ? easeOutExpo(reveal) : 1 - easeOutExpo(reveal)
    if (opacity <= 0.002) return

    if (state.config.spinCover && playing && track.isPlaying) {
      this.discRotation += (delta * Math.PI * 2) / DISC_PERIOD_SECONDS
    }

    ctx.save()
    ctx.globalAlpha = opacity

    if (!track) {
      this.drawIdle()
    } else {
      switch (state.config.style) {
        case 'plate':
          this.drawPlate(track, now)
          break
        case 'monolith':
          this.drawMonolith(track, now)
          break
        case 'strip':
          this.drawStrip(track, now)
          break
        case 'disc':
          this.drawDisc(track, now)
          break
      }
    }

    ctx.restore()
  }

  private get accent(): string {
    return this.state?.config.accent === 'crimson' ? this.palette.crimsonBright : this.palette.gold
  }

  /** Institutional caps with hand-applied tracking; canvas has no letter-spacing. */
  private tracked(
    text: string,
    x: number,
    y: number,
    spacing: number,
    align: 'left' | 'centre'
  ): void {
    const ctx = this.context
    const characters = [...text]
    const widths = characters.map((character) => ctx.measureText(character).width)
    const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (characters.length - 1)

    let cursor = align === 'centre' ? x - total / 2 : x
    const previous = ctx.textAlign
    ctx.textAlign = 'left'
    characters.forEach((character, index) => {
      ctx.fillText(character, cursor, y)
      cursor += widths[index] + spacing
    })
    ctx.textAlign = previous
  }

  /**
   * Draws text that scrolls when it will not fit.
   *
   * Clipped to its cell and paused at each end, so a long title is legible
   * rather than perpetually gliding. Falls back to truncation when the operator
   * has turned the marquee off, because a clipped word is worse than an ellipsis.
   */
  private scrolling(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    now: number,
    lineHeight: number
  ): void {
    const ctx = this.context
    const width = ctx.measureText(text).width

    if (width <= maxWidth) {
      ctx.fillText(text, x, y)
      return
    }

    if (!this.state?.config.marquee || !this.motion) {
      let trimmed = text
      while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1)
      }
      ctx.fillText(`${trimmed}…`, x, y)
      return
    }

    const travel = width - maxWidth
    const legDuration = (travel / MARQUEE_SPEED) * 1000
    const cycle = (legDuration + MARQUEE_HOLD_MS) * 2
    const phase = (now - this.trackChangedAt) % cycle

    let offset: number
    if (phase < MARQUEE_HOLD_MS) offset = 0
    else if (phase < MARQUEE_HOLD_MS + legDuration) {
      offset = ((phase - MARQUEE_HOLD_MS) / legDuration) * travel
    } else if (phase < MARQUEE_HOLD_MS * 2 + legDuration) offset = travel
    else offset = travel - ((phase - MARQUEE_HOLD_MS * 2 - legDuration) / legDuration) * travel

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y - lineHeight, maxWidth, lineHeight * 2)
    ctx.clip()
    ctx.fillText(text, x - offset, y)
    ctx.restore()
  }

  /** New tracks slide their text in from the right by a few pixels. */
  private changeOffset(now: number): number {
    if (!this.motion) return 0
    const t = Math.min((now - this.trackChangedAt) / CHANGE_MS, 1)
    return (1 - easeOutExpo(t)) * 14
  }

  private drawCover(x: number, y: number, size: number, rounded = false): void {
    const { context: ctx, palette } = this

    ctx.save()
    if (rounded) {
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
      ctx.clip()
    }

    if (this.cover) {
      ctx.drawImage(this.cover, x, y, size, size)
    } else {
      // A plate rather than a gap, so the layout does not shift when the art
      // arrives a frame or two after the metadata.
      ctx.fillStyle = palette.slab
      ctx.fillRect(x, y, size, size)
      ctx.strokeStyle = palette.line
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
    }
    ctx.restore()

    if (!rounded) {
      ctx.strokeStyle = palette.lineGold
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
    }
  }

  /**
   * Linear timeline with elapsed and remaining figures.
   *
   * The head is a slab rather than a dot: square is the house shape, and it
   * reads at a glance against a busy capture behind it.
   */
  private drawTimeline(
    track: NowPlayingTrack,
    x: number,
    y: number,
    width: number,
    showTimes: boolean,
    timeSize?: number
  ): void {
    const { context: ctx, palette } = this
    if (!this.state?.config.showTimeline) return

    const now = Date.now()
    const ratio = trackProgressRatio(track, now)
    const elapsed = trackProgressAt(track, now)
    // Callers laying type out proportionally pass their own size; the plate and
    // strip keep the fixed one they were tuned with.
    const size = timeSize ?? (this.compact ? 9 : 10)

    ctx.fillStyle = withAlpha(palette.brass, 0.7)
    ctx.fillRect(x, y, width, 2)
    ctx.fillStyle = this.accent
    ctx.fillRect(x, y, width * ratio, 2)

    // Playhead.
    const headX = x + width * ratio
    ctx.fillRect(headX - 1, y - 3, 2, 8)

    if (!showTimes) return

    ctx.font = `${size}px ${palette.mono}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = palette.textDim
    ctx.textAlign = 'left'
    ctx.fillText(formatTrackTime(elapsed), x, y + 9)
    ctx.textAlign = 'right'
    ctx.fillText(
      this.state.config.showRemaining
        ? `-${formatTrackTime(track.durationMs - elapsed)}`
        : formatTrackTime(track.durationMs),
      x + width,
      y + 9
    )
    ctx.textAlign = 'left'
  }

  /**
   * The institutional label above the record.
   *
   * `size` is passed by the styles that lay type out proportionally; the
   * default is the fixed size the plate and strip were tuned with.
   */
  private drawLabel(x: number, y: number, align: 'left' | 'centre', size?: number): number {
    const { context: ctx, palette } = this
    if (!this.state?.config.showLabel) return 0

    const resolved = size ?? (this.compact ? 8 : 9)
    ctx.font = `${resolved}px ${palette.display}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = this.accent
    this.tracked(this.state.config.label.toUpperCase(), x, y, resolved * 0.3, align)
    return resolved * 2.1
  }

  private drawExplicit(x: number, y: number, size: number): void {
    const { context: ctx, palette } = this
    ctx.save()
    ctx.strokeStyle = withAlpha(palette.textDim, 0.7)
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, size, size)
    ctx.fillStyle = palette.textDim
    ctx.font = `${size * 0.72}px ${palette.display}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('E', x + size / 2, y + size / 2 + 0.5)
    ctx.textAlign = 'left'
    ctx.restore()
  }

  private drawIdle(): void {
    const { context: ctx, palette, width, height } = this
    const size = this.compact ? 9 : 11
    ctx.font = `${size}px ${palette.display}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = palette.textFaint
    this.tracked('TRANSMISSION IDLE', width / 2, height / 2, size * 0.3, 'centre')
  }

  // ------------------------------------------------------------- 1. plate

  /** Cover slab left, record right, timeline beneath. The default lower third. */
  private drawPlate(track: NowPlayingTrack, now: number): void {
    const { context: ctx, palette, width, height } = this
    const config = this.state!.config
    const pad = Math.min(height * 0.12, 22)
    const shift = this.changeOffset(now)

    ctx.fillStyle = palette.panel
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

    const coverSize = config.showCover ? height - pad * 2 : 0
    if (config.showCover) this.drawCover(pad, pad, coverSize)

    const textX = pad + (config.showCover ? coverSize + pad : 0) + shift
    const textWidth = width - textX - pad
    let y = pad

    y += this.drawLabel(textX, y, 'left')

    const titleSize = Math.min(height * 0.17, 26)
    ctx.font = `${titleSize}px ${palette.display}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = palette.text
    this.scrolling(track.title.toUpperCase(), textX, y, textWidth, now, titleSize * 1.3)
    y += titleSize * 1.36

    const metaSize = Math.min(height * 0.1, 14)
    ctx.font = `${metaSize}px ${palette.display}`
    ctx.fillStyle = palette.textDim
    const artistText = formatArtists(track.artists)
    this.scrolling(artistText, textX, y, textWidth - 22, now, metaSize * 1.3)

    if (config.showExplicit && track.explicit) {
      const badge = metaSize * 0.86
      this.drawExplicit(
        textX + Math.min(ctx.measureText(artistText).width + 8, textWidth - badge - 2),
        y,
        badge
      )
    }
    y += metaSize * 1.5

    if (config.showAlbum && track.album) {
      const albumSize = metaSize * 0.82
      ctx.font = `${albumSize}px ${palette.mono}`
      ctx.fillStyle = palette.textFaint
      this.scrolling(track.album, textX, y, textWidth, now, albumSize * 1.3)
    }

    this.drawTimeline(track, textX, height - pad - 12, textWidth, true)
  }

  // ---------------------------------------------------------- 2. monolith

  /**
   * Portrait column: cover above the record. For a sidebar.
   *
   * Type is proportional to the canvas with no pixel ceiling. The sizes here
   * were capped — `min(width * 0.1, 24)` and friends — which was tuned against
   * the small console preview and left 24px of title on a 420px-wide browser
   * source. The preview shares the source's aspect ratio, so proportional
   * sizing reads the same at both scales and the cap only ever hurt.
   *
   * The cover is bounded by both a share of the frame *and* whatever the text
   * has left over. It used to take a flat 52% of the height with the timeline
   * pinned to the bottom edge, so any slack showed up as dead space between the
   * art, the record and the timeline. Sizing it from the remainder and centring
   * the whole column removes those gaps by construction.
   */
  private drawMonolith(track: NowPlayingTrack, now: number): void {
    const { context: ctx, palette, width, height } = this
    const config = this.state!.config
    const pad = width * 0.07
    const gap = width * 0.05

    ctx.fillStyle = palette.panel
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

    const labelSize = width * 0.034
    const titleSize = width * 0.115
    const metaSize = width * 0.062
    const albumSize = width * 0.046

    const labelBlock = config.showLabel ? labelSize * 2.1 : 0
    const titleBlock = titleSize * 1.24
    const artistBlock = metaSize * 1.45
    const albumBlock = config.showAlbum && track.album ? albumSize * 1.5 : 0
    const timelineBlock = config.showTimeline ? metaSize * 2.2 : 0
    const textBlock =
      titleBlock + artistBlock + albumBlock + (timelineBlock > 0 ? gap * 0.7 + timelineBlock : 0)

    const coverSize = config.showCover
      ? Math.max(
          Math.min(
            width - pad * 2,
            // A share of the frame, so a tall source does not turn into a
            // poster with a caption.
            height * 0.42,
            height - pad * 2 - labelBlock - gap - textBlock
          ),
          0
        )
      : 0

    // Centred as one column, so leftover height is split above and below rather
    // than pooling in one gap.
    const contentHeight = labelBlock + coverSize + (coverSize > 0 ? gap : 0) + textBlock
    let y = Math.max((height - contentHeight) / 2, pad)

    if (config.showLabel) y += this.drawLabel(width / 2, y, 'centre', labelSize)

    if (coverSize > 0) {
      this.drawCover((width - coverSize) / 2, y, coverSize)
      y += coverSize + gap
    }

    const shift = this.changeOffset(now)
    const textWidth = width - pad * 2

    ctx.font = `${titleSize}px ${palette.display}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillStyle = palette.text
    // Centred text cannot marquee cleanly, so it truncates here instead.
    this.centredFit(track.title.toUpperCase(), width / 2 + shift, y, textWidth)
    y += titleBlock

    ctx.font = `${metaSize}px ${palette.display}`
    ctx.fillStyle = palette.textDim
    this.centredFit(formatArtists(track.artists), width / 2 + shift, y, textWidth)
    y += artistBlock

    if (albumBlock > 0) {
      ctx.font = `${albumSize}px ${palette.mono}`
      ctx.fillStyle = palette.textFaint
      this.centredFit(track.album, width / 2, y, textWidth)
      y += albumBlock
    }

    ctx.textAlign = 'left'
    // Flows after the text rather than being pinned to the bottom edge.
    if (timelineBlock > 0)
      this.drawTimeline(track, pad, y + gap * 0.7, textWidth, true, metaSize * 0.7)
  }

  private centredFit(text: string, x: number, y: number, maxWidth: number): void {
    const ctx = this.context
    let trimmed = text
    while (trimmed.length > 1 && ctx.measureText(trimmed).width > maxWidth) {
      trimmed = trimmed.slice(0, -1)
    }
    ctx.fillText(trimmed === text ? text : `${trimmed.trimEnd()}…`, x, y)
  }

  // ------------------------------------------------------------- 3. strip

  /** Thin lower third with a hairline timeline along the bottom edge. */
  private drawStrip(track: NowPlayingTrack, now: number): void {
    const { context: ctx, palette, width, height } = this
    const config = this.state!.config
    const pad = Math.min(height * 0.2, 14)
    const shift = this.changeOffset(now)

    ctx.fillStyle = palette.panel
    ctx.fillRect(0, 0, width, height)
    // A single accent rule down the leading edge — the strip's only ornament.
    ctx.fillStyle = this.accent
    ctx.fillRect(0, 0, 2, height)

    const coverSize = config.showCover ? height - pad * 2 : 0
    if (config.showCover) this.drawCover(pad + 4, pad, coverSize)

    const textX = pad + 4 + (config.showCover ? coverSize + pad : 0) + shift
    const centreY = height / 2
    const titleSize = Math.min(height * 0.3, 18)
    const metaSize = titleSize * 0.72

    // The two lines are set about the centreline so the strip reads as one bar.
    ctx.textBaseline = 'alphabetic'
    ctx.font = `${titleSize}px ${palette.display}`
    ctx.fillStyle = palette.text
    const available = width - textX - pad - 64
    this.scrolling(track.title.toUpperCase(), textX, centreY - 2, available, now, titleSize * 1.2)

    ctx.font = `${metaSize}px ${palette.display}`
    ctx.fillStyle = palette.textDim
    this.scrolling(
      formatArtists(track.artists),
      textX,
      centreY + metaSize * 1.15,
      available,
      now,
      metaSize * 1.2
    )

    // Remaining time, right-aligned, because a strip has no room for both.
    if (config.showTimeline) {
      const elapsed = trackProgressAt(track, Date.now())
      ctx.font = `${metaSize}px ${palette.mono}`
      ctx.textAlign = 'right'
      ctx.fillStyle = palette.textDim
      ctx.fillText(
        config.showRemaining
          ? `-${formatTrackTime(track.durationMs - elapsed)}`
          : formatTrackTime(elapsed),
        width - pad,
        centreY + metaSize * 0.4
      )
      ctx.textAlign = 'left'

      const ratio = trackProgressRatio(track, Date.now())
      ctx.fillStyle = withAlpha(palette.brass, 0.7)
      ctx.fillRect(0, height - 2, width, 2)
      ctx.fillStyle = this.accent
      ctx.fillRect(0, height - 2, width * ratio, 2)
    }
  }

  // -------------------------------------------------------------- 4. disc

  /**
   * The cover as a turning record inside a timeline ring.
   *
   * The most on-model of the four: it reuses the ring vocabulary the rite and
   * the arc countdown already established, so the broadcast kit reads as one
   * rack of instruments. The record only turns while playback is running, which
   * makes pausing legible without any text.
   *
   * The record is deliberately smaller than the frame allows, and the type is
   * proportional rather than capped. Sized off the available height alone, the
   * disc grew to fill the canvas and squeezed the record beneath it into
   * unreadable 22px type — which does not survive being scaled down inside an
   * OBS scene.
   */
  private drawDisc(track: NowPlayingTrack, now: number): void {
    const { context: ctx, palette, width, height } = this
    const config = this.state!.config
    const centreX = width / 2
    const TAU = Math.PI * 2

    const pad = width * 0.06
    const gap = width * 0.045
    const labelSize = width * 0.032
    const titleSize = width * 0.078
    const metaSize = width * 0.05
    const timeSize = width * 0.038

    const labelBlock = config.showLabel ? labelSize * 2.1 : 0
    const titleBlock = titleSize * 1.26
    const artistBlock = metaSize * 1.45
    const timeBlock = config.showTimeline ? timeSize * 1.7 : 0
    const textBlock = titleBlock + artistBlock + timeBlock

    const available = height - pad * 2 - labelBlock - textBlock - gap
    // Bounded by a share of the width as well as by the space left, so the
    // record stays an object in a field rather than filling the frame.
    const radius = Math.max(Math.min(width * 0.33, available * 0.5), 1)

    const contentHeight = labelBlock + radius * 2 + gap + textBlock
    let y = Math.max((height - contentHeight) / 2, pad)

    if (config.showLabel) {
      ctx.textAlign = 'left'
      y += this.drawLabel(centreX, y, 'centre', labelSize)
    }

    const centreY = y + radius

    if (config.showCover) {
      ctx.save()
      ctx.translate(centreX, centreY)
      ctx.rotate(this.discRotation)
      this.drawCover(-radius * 0.78, -radius * 0.78, radius * 1.56, true)
      ctx.restore()

      // Spindle: a small obsidian hole with a gold rim, so it reads as a record
      // rather than as a rotating square photograph.
      ctx.fillStyle = palette.slab
      ctx.beginPath()
      ctx.arc(centreX, centreY, radius * 0.12, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = withAlpha(palette.gold, 0.5)
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Timeline ring, with graduations as a fixed bezel to read it against.
    if (config.showTimeline) {
      const ringRadius = radius * 0.92
      ctx.strokeStyle = withAlpha(palette.brass, 0.6)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(centreX, centreY, ringRadius, 0, TAU)
      ctx.stroke()

      ctx.strokeStyle = withAlpha(palette.goldDim, 0.26)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let angle = 0; angle < TAU - 1e-9; angle += (7.5 * Math.PI) / 180) {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        ctx.moveTo(centreX + cos * ringRadius * 1.05, centreY + sin * ringRadius * 1.05)
        ctx.lineTo(centreX + cos * ringRadius * 1.09, centreY + sin * ringRadius * 1.09)
      }
      ctx.stroke()

      const ratio = trackProgressRatio(track, Date.now())
      const top = -Math.PI / 2
      ctx.strokeStyle = this.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(centreX, centreY, ringRadius, top, top + TAU * Math.max(ratio, 0.001))
      ctx.stroke()
    }

    // Record beneath.
    const shift = this.changeOffset(now)
    y = centreY + radius + gap
    const textWidth = width - pad * 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `${titleSize}px ${palette.display}`
    ctx.fillStyle = palette.text
    this.centredFit(track.title.toUpperCase(), centreX + shift, y, textWidth)
    y += titleBlock

    ctx.font = `${metaSize}px ${palette.display}`
    ctx.fillStyle = palette.textDim
    this.centredFit(formatArtists(track.artists), centreX + shift, y, textWidth)
    y += artistBlock

    if (config.showTimeline) {
      const elapsed = trackProgressAt(track, Date.now())
      ctx.font = `${timeSize}px ${palette.mono}`
      ctx.fillStyle = palette.textFaint
      ctx.fillText(
        config.showRemaining
          ? `${formatTrackTime(elapsed)}  \u2212${formatTrackTime(track.durationMs - elapsed)}`
          : `${formatTrackTime(elapsed)} / ${formatTrackTime(track.durationMs)}`,
        centreX,
        y
      )
    }

    ctx.textAlign = 'left'
  }
}
