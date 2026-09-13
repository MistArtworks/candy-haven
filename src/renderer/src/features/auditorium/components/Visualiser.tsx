import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject
} from 'react'
import type { AudioPreset } from '@shared/domain/auditorium'
import { Logomark } from '@renderer/components/sigil/Logomark'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { PEAK_STRIDE } from '../lib/survey'
import { windowStart } from '../lib/zoom'
import styles from '../AuditoriumPage.module.scss'

export interface VisualiserProps {
  analyserRef: RefObject<AnalyserNode | null>
  /** The surveyed file envelope, read each frame by the overview. */
  peaksRef: RefObject<Float32Array | null>
  /** Seconds of file across the stage. Continuous; see `lib/zoom.ts`. */
  zoom: number
  /** Read directly for the playhead, so it moves at frame rate rather than 4 Hz. */
  elementRef: RefObject<HTMLAudioElement | null>
  preset: AudioPreset
  playing: boolean
  /** No file open: the stage draws its resting state instead. */
  idle: boolean
  /** The file is being decoded; the overview says so rather than drawing blank. */
  surveying: boolean
  /**
   * Where a press on the render should move the playhead to.
   *
   * Handled here rather than by a click on a wrapper, and that is a change of
   * ownership rather than a tidy-up: the stage now has two time axes on it —
   * the window across the top and the whole file along the strip — and only
   * the thing that drew them knows which one a given pixel belongs to.
   */
  onSeek?: (seconds: number) => void
  /** A wheel notch over the stage, in the event's own units. */
  onZoom?: (deltaY: number) => void
}

/*
 * The palette, as canvas needs it.
 *
 * Hard-coded rather than read from the custom properties, and deliberately: a
 * `getComputedStyle` per frame is a forced style recalculation sixty times a
 * second, and these are the same sampled values the stylesheet holds.
 *
 * The ramp runs dark crimson -> crimson -> gold -> light gold, which is the
 * reference boards' own palette strip. It is also why the analysers here are
 * not the magenta-and-cyan of the renders this was modelled on: those read low
 * as pink and high as blue, and blue is the one thing the brief will not have.
 * Low is crimson and high is gold, which carries the same reading — heavy at
 * one end, bright at the other — inside the five materials.
 */
const RAMP: readonly (readonly [number, number, number])[] = [
  [72, 20, 18],
  [122, 30, 26],
  [163, 43, 35],
  [185, 139, 71],
  [227, 194, 134]
]

const LINE = '182, 158, 124'

/**
 * A ramp at `position`, interpolated.
 *
 * Interpolated rather than stepped, because the render colours every column
 * independently: against a handful of hard stops, a track drifting gradually
 * brighter would band into blocks instead of shading through them.
 */
function mix(
  stops: readonly (readonly [number, number, number])[],
  position: number
): readonly [number, number, number] {
  const clamped = Math.min(Math.max(position, 0), 1) * (stops.length - 1)
  const index = Math.min(Math.floor(clamped), stops.length - 2)
  const blend = clamped - index
  const from = stops[index]
  const to = stops[index + 1]

  return [
    Math.round(from[0] + (to[0] - from[0]) * blend),
    Math.round(from[1] + (to[1] - from[1]) * blend),
    Math.round(from[2] + (to[2] - from[2]) * blend)
  ]
}

function ramp(position: number): readonly [number, number, number] {
  return mix(RAMP, position)
}

function rgba(position: number, alpha: number): string {
  const [red, green, blue] = ramp(position)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

/*
 * The envelope's two ramps, built once and looked up thereafter.
 *
 * `rgba` composes a template string, and the envelope sets `fillStyle` once per
 * pixel column — twelve hundred strings a frame, seventy thousand a second, all
 * of them immediately garbage. Quantising the tone to forty-eight steps and
 * keeping the strings costs six kilobytes and makes the colour of a column a
 * pair of array reads.
 *
 * Forty-eight steps is well past the point of visibility: the ramp spans five
 * stops, so this is nearly ten intermediate colours between each of them, and
 * the difference between neighbours is under two values in each channel.
 */
const SHADES = 48
const PLAYED: string[] = []
const COMING: string[] = []
for (let step = 0; step < SHADES; step += 1) {
  PLAYED.push(rgba(step / (SHADES - 1), 0.92))
  COMING.push(rgba(step / (SHADES - 1), 0.26))
}

/** A column's colour, from its tone and whether the playhead has passed it. */
function toneShade(tone: number, played: boolean): string {
  const index = Math.min(SHADES - 1, Math.max(0, Math.round(tone * (SHADES - 1))))
  return played ? PLAYED[index] : COMING[index]
}

/**
 * The stage.
 *
 * One canvas, four renders, and the mark held at the centre of all of them.
 * This is the department's single focal object, which is why the panels around
 * it are drawn plain — the brief allows one per view and this is it.
 *
 * The loop never touches React state and never reads it either: everything that
 * changes per frame arrives through a ref. Level is written back out as a CSS
 * custom property, so the mark's scale is driven by the compositor rather than
 * by sixty re-renders a second.
 */
export function Visualiser({
  analyserRef,
  peaksRef,
  elementRef,
  preset,
  zoom,
  playing,
  idle,
  surveying,
  onSeek,
  onZoom
}: VisualiserProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const animated = useAnimationsEnabled()

  /**
   * Where the render put the strip, written by the loop and read by the
   * pointer handler.
   *
   * The two axes on this stage are laid out by the draw, not by the layout
   * engine — there is one canvas and the strip is a region of it — so the only
   * thing that knows where the boundary is, is whatever last drew it. Null for
   * every render that has no strip, which is the same thing as "the whole
   * stage is the window".
   */
  const layoutRef = useRef<StageLayout | null>(null)

  /**
   * The window a drag started in.
   *
   * Held for the length of the gesture rather than recomputed per move, and it
   * has to be. Seeking recentres the window on the new playhead, so a drag that
   * mapped each pointer position through the *current* window would move the
   * ground under itself: the second sample of a drag lands somewhere the first
   * one put it rather than where the pointer is. Freezing the mapping at
   * pointer-down makes the gesture mean what it looks like it means.
   */
  const dragRef = useRef<{ strip: boolean; from: number; window: number } | null>(null)

  /** The callbacks, mirrored so the wheel listener never has to rebind. */
  const handlers = useRef({ onSeek, onZoom })
  useEffect(() => {
    handlers.current = { onSeek, onZoom }
  })

  /*
   * What the loop reads each frame.
   *
   * Kept out of the effect's dependencies deliberately: changing the preset or
   * starting playback must not tear down and rebuild the frame loop, which
   * would take the spectrogram's accumulated history with it. Written in an
   * effect rather than during render, because a ref mutated mid-render is torn
   * by a concurrent render that is later discarded.
   */
  const latest = useRef({ preset, zoom, playing, idle, surveying })
  useEffect(() => {
    latest.current = { preset, zoom, playing, idle, surveying }
  })

  /*
   * The wheel, bound natively rather than through React.
   *
   * It has to call `preventDefault`, and React's own wheel listener is attached
   * to the root as passive — calling it from a synthetic handler is a no-op
   * with a console warning, and the page scrolls out from under the operator
   * while they are trying to zoom. A non-passive listener on the element is the
   * only way to say no to that.
   */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = (event: WheelEvent): void => {
      const zoomer = handlers.current.onZoom
      if (!zoomer || !layoutRef.current) return
      event.preventDefault()
      zoomer(event.deltaY)
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  /**
   * A press, and then a drag, on either of the stage's two time axes.
   *
   * Above the strip the pointer is reading the window; on the strip it is
   * reading the whole file. Same gesture, two scales, and the layout the last
   * frame wrote is what decides which.
   */
  const seekFrom = useCallback((clientX: number, box: DOMRect): void => {
    const seeker = handlers.current.onSeek
    const drag = dragRef.current
    if (!seeker || !drag) return

    const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1)
    seeker(drag.from + fraction * drag.window)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const element = elementRef.current
      const duration = element?.duration ?? Number.NaN
      if (!handlers.current.onSeek || !element) return
      if (!Number.isFinite(duration) || duration <= 0) return

      const layout = layoutRef.current
      if (!layout) return

      const box = event.currentTarget.getBoundingClientRect()
      const strip = event.clientY - box.top >= layout.stripTop

      dragRef.current = strip
        ? { strip, from: 0, window: duration }
        : {
            strip,
            from: windowStart(element.currentTime, duration, latest.current.zoom),
            window: Math.min(latest.current.zoom, duration)
          }

      event.currentTarget.setPointerCapture(event.pointerId)
      seekFrom(event.clientX, box)
    },
    [elementRef, seekFrom]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!dragRef.current) return
      seekFrom(event.clientX, event.currentTarget.getBoundingClientRect())
    },
    [seekFrom]
  )

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    const context = canvas.getContext('2d')
    if (!context) return

    /*
     * The spectrogram's history.
     *
     * An offscreen canvas holding what has already been drawn, scrolled a
     * couple of columns left each frame and topped up on the right. Keeping the
     * history as pixels rather than as an array of past spectra is what makes
     * it cheap.
     *
     * Discarded on resize. The history is in pixels and cannot be rescaled
     * without smearing, and a spectrogram that regrows over the next few
     * seconds is a far better outcome than one that is quietly wrong.
     */
    let history: HTMLCanvasElement | null = null
    let historyContext: CanvasRenderingContext2D | null = null

    // Held here rather than at module scope so it belongs to this stage and dies
    // with it — the department page and the detached player are separate
    // renderers, but the mini player is not, and two of these sharing one cache
    // would repaint it for each other on alternate frames.
    const strip: StripCache = {
      canvas: null,
      context: null,
      peaks: null,
      width: 0,
      height: 0,
      ratio: 1
    }

    let width = 0
    let height = 0
    let frame = 0
    const started = performance.now()
    /** Damped level, so the mark breathes rather than flickers. */
    let level = 0

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return

      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width
      height = box.height
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      // A fresh history at the new size. Rescaling the old one would smear it,
      // and a spectrogram that regrows over a few seconds beats a wrong one.
      history = document.createElement('canvas')
      history.width = Math.max(1, Math.round(width))
      history.height = Math.max(1, Math.round(height))
      historyContext = history.getContext('2d')

      /*
       * The strip's canvas, at device resolution.
       *
       * Backed at the same ratio as the stage and drawn back at CSS size, so
       * the blit is one to one on the physical display rather than a CSS-pixel
       * image resampled up — which on a 2× screen is the difference between a
       * crisp envelope and a soft one. Marked stale rather than repainted here:
       * whichever frame next wants it is the one that knows the file.
       */
      strip.canvas = document.createElement('canvas')
      strip.context = strip.canvas.getContext('2d')
      strip.context?.setTransform(ratio, 0, 0, ratio, 0, 0)
      strip.peaks = null
      strip.width = 0
      strip.height = 0
      strip.ratio = ratio
    })
    observer.observe(stage)

    const time = new Uint8Array(4096)
    const spectrum = new Uint8Array(2048)

    const render = (now: number): void => {
      frame = requestAnimationFrame(render)
      if (width === 0 || height === 0) return

      const elapsed = (now - started) / 1000
      const analyser = analyserRef.current
      const {
        preset: mode,
        zoom: span,
        playing: sounding,
        idle: empty,
        surveying: reading
      } = latest.current
      const live = analyser !== null && sounding && mode !== 'static'

      context.clearRect(0, 0, width, height)

      let energy = 0

      if (live && analyser) {
        analyser.getByteTimeDomainData(time.subarray(0, analyser.fftSize))
        analyser.getByteFrequencyData(spectrum.subarray(0, analyser.frequencyBinCount))

        // RMS about the 128 centre point, which is silence in a byte-domain
        // buffer. Peak would make the mark jump on a single sample.
        let sum = 0
        for (let index = 0; index < analyser.fftSize; index += 1) {
          const value = (time[index] - 128) / 128
          sum += value * value
        }
        energy = Math.sqrt(sum / analyser.fftSize)
      }

      // Asymmetric damping: quick to rise so a transient reads, slow to fall so
      // the mark settles instead of stuttering between beats.
      level += (energy - level) * (energy > level ? 0.35 : 0.06)

      const element = elementRef.current
      const duration = element?.duration ?? Number.NaN
      const dated = element !== null && Number.isFinite(duration) && duration > 0
      const at = element?.currentTime ?? 0

      // Cleared every frame and set only by the render that has a strip, so a
      // pointer landing on the stage in SPECTRUM cannot hit a boundary left
      // behind by the last WAVEFORM frame.
      layoutRef.current = null

      if (mode === 'waveform') {
        const peaks = peaksRef.current
        if (peaks && dated) {
          layoutRef.current = drawWaveform(context, strip, peaks, at, duration, span, width, height)
        } else {
          drawAxis(context, width, height, level)
          drawNotice(context, width, height, waitingFor(reading, empty))
        }
      } else if (mode === 'spectral' && live && analyser && history && historyContext) {
        drawSpectrogram(
          context,
          historyContext,
          history,
          spectrum,
          analyser.frequencyBinCount,
          analyser.context.sampleRate,
          width,
          height
        )
      } else if (mode === 'spectrum' && live && analyser) {
        drawSpectrum(
          context,
          spectrum,
          analyser.frequencyBinCount,
          analyser.context.sampleRate,
          width,
          height
        )
      } else if (mode === 'spectrum' || mode === 'spectral') {
        // Both live renders are fed by playback, so neither has anything to
        // show until the transport runs. Saying which of the two reasons it is
        // beats an empty stage that could equally be a fault.
        drawAxis(context, width, height, level)
        drawNotice(context, width, height, empty ? 'NO FILE ADMITTED' : 'HELD — SOUND TO READ')
      } else {
        drawAxis(context, width, height, level)
        drawResting(context, width, height, animated ? elapsed : 0, empty)
      }

      stage.style.setProperty('--ch-level', level.toFixed(4))
    }

    if (animated) {
      frame = requestAnimationFrame(render)
    } else {
      // Motion off: one frame, so the stage is composed rather than blank.
      render(performance.now())
      cancelAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [analyserRef, peaksRef, elementRef, animated])

  return (
    <div
      className={styles.stage}
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-idle={idle || undefined}
      // The mark is the whole render in STATIC and a watermark behind the data
      // in the other three. The same element either way, so it never reflows.
      data-mark={preset === 'static' ? 'focal' : 'watermark'}
    >
      <canvas className={styles.canvas} ref={canvasRef} aria-hidden="true" />

      <div className={styles.mark}>
        <Logomark width={150} title="Candy Haven" />
      </div>
    </div>
  )
}

/** The vertical axis the mark is intersected by, and the horizontal rule. */
function drawAxis(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  level: number
): void {
  context.strokeStyle = `rgba(${LINE}, ${0.08 + level * 0.1})`
  context.lineWidth = 1

  context.beginPath()
  context.moveTo(width / 2, 0)
  context.lineTo(width / 2, height)
  context.moveTo(0, height / 2)
  context.lineTo(width, height / 2)
  context.stroke()
}

/** Says why the stage is empty, in the register's voice. */
function drawNotice(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  message: string
): void {
  context.font = '600 10px Bahnschrift, "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = `rgba(${LINE}, 0.38)`
  // Chromium supports `letterSpacing` on a 2D context, so the institutional
  // tracking survives into the one place in this app that draws text without
  // CSS. Reset afterwards: the property is part of the context's state.
  context.letterSpacing = '3px'
  context.fillText(message, width / 2, height - 24)
  context.letterSpacing = '0px'
}

/** Why a surveyed render has nothing to draw yet. */
function waitingFor(reading: boolean, empty: boolean): string {
  if (empty) return 'NO FILE ADMITTED'
  return reading ? 'READING THE FILE' : 'NOT SURVEYED'
}

/** The playhead, between two heights rather than down the whole stage. */
function drawPlayhead(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number
): void {
  context.strokeStyle = 'rgba(227, 194, 134, 0.9)'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(Math.round(x) + 0.5, top)
  context.lineTo(Math.round(x) + 0.5, bottom)
  context.stroke()
}

/**
 * Second markers, so a scrolling render has a scale.
 *
 * Without them the material slides past with no sense of how fast; with them
 * four seconds is visibly four seconds. Drawn on whole seconds *of the file*
 * rather than at fixed intervals across the stage, so they travel with the
 * material instead of standing still while it moves.
 */
function drawSecondTicks(
  context: CanvasRenderingContext2D,
  from: number,
  window: number,
  width: number,
  top: number,
  bottom: number
): void {
  /*
   * The step, chosen from the window rather than fixed.
   *
   * One tick a second is a picket fence once the window is wide and nothing at
   * all once it is narrow. The zoom is continuous now, so this has to cover the
   * whole range instead of the four settings that used to exist: the step
   * climbs through the ordinary divisions of a clock and stops at the first one
   * that keeps the ticks under forty across the stage.
   */
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const step = steps.find((candidate) => window / candidate <= 40) ?? 600

  context.strokeStyle = `rgba(${LINE}, 0.07)`
  context.lineWidth = 1

  const first = Math.ceil(from / step) * step
  for (let seconds = first; seconds < from + window; seconds += step) {
    const x = ((seconds - from) / window) * width
    context.beginPath()
    context.moveTo(Math.round(x) + 0.5, top)
    context.lineTo(Math.round(x) + 0.5, bottom)
    context.stroke()
  }
}

/** Where the render put the strip, so a press can be sent to the right axis. */
export interface StageLayout {
  /** Top edge of the overview strip, in CSS pixels down the stage. */
  stripTop: number
  stripHeight: number
}

/**
 * The strip, kept as pixels between frames.
 *
 * The strip draws the *whole file* at one column per pixel, and the whole file
 * does not change sixty times a second — only the playhead over it and the box
 * marking the window do. Redrawing it every frame put a second full pass over
 * the survey and twelve hundred more fills on top of the band's, which is
 * exactly the sort of thing that turns a render into a stutter on a long file.
 *
 * So it is painted into its own canvas when the file or the size changes, and
 * blitted after that. What is left per frame is one `drawImage`, one rectangle
 * to hold back the part that has not played, and the two marks that move.
 */
interface StripCache {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  /** What is painted in it. Identity, not a hash: the array *is* the file. */
  peaks: Float32Array | null
  width: number
  height: number
  /** The backing ratio, so the blit can be drawn back at CSS size. */
  ratio: number
}

/** The overview strip: its height, and the air between it and the band. */
const STRIP_HEIGHT = 42
const STRIP_GAP = 16

/**
 * WAVEFORM — the window, over the whole file.
 *
 * Two readings stacked, at two scales. The band across the top is the window:
 * the envelope of a few seconds of file, drawn as it actually is, with the
 * playhead through the middle of it. The strip along the bottom is the whole
 * file at a glance, with a lit box showing which part of it the band is looking
 * at — which is the one thing a zoomed render cannot tell you about itself.
 *
 * Both are coloured by frequency content: crimson where the low end is
 * carrying, gold where it is not. A version of the band drawn as discrete
 * segmented bars coloured by level was tried and withdrawn. It was not what
 * this render should look like — wound out, a couple of hundred cell-stacked
 * bars are a wall of pixels rather than a waveform, and the arrangement stops
 * being legible at the exact zoom where reading the arrangement is the point —
 * and it was not cheap either, which is the other half of why it went.
 */
function drawWaveform(
  context: CanvasRenderingContext2D,
  cache: StripCache,
  peaks: Float32Array,
  at: number,
  duration: number,
  span: number,
  width: number,
  height: number
): StageLayout {
  const stripHeight = Math.max(20, Math.min(STRIP_HEIGHT, height * 0.16))
  const stripTop = height - stripHeight
  const bandBottom = Math.max(2, stripTop - STRIP_GAP)

  const from = windowStart(at, duration, span)
  const window = Math.min(span, duration)

  drawEnvelope(context, peaks, at, duration, from, window, width, 0, bandBottom)
  drawStrip(context, cache, peaks, at, duration, from, window, width, stripTop, stripHeight)

  return { stripTop, stripHeight }
}

/**
 * One slice of the envelope, reused.
 *
 * `aggregate` is called fifteen hundred times a frame — once per bar and once
 * per pixel of the strip — and a fresh object from each of them is ninety
 * thousand allocations a second for three numbers that are read immediately and
 * never kept. The scratch is the same shape the return used to be; the only
 * difference is that nothing is handed to the collector.
 */
const slice = { low: 0, high: 0, tone: 0 }

/** The extremes and the mean tone of the envelope between two instants. */
function aggregate(
  peaks: Float32Array,
  buckets: number,
  perSecond: number,
  startSeconds: number,
  endSeconds: number,
  duration: number
): typeof slice {
  slice.low = 0
  slice.high = 0
  slice.tone = 0

  if (endSeconds <= 0 || startSeconds >= duration) return slice

  const first = Math.max(0, Math.floor(startSeconds * perSecond))
  const last = Math.min(buckets - 1, Math.max(first, Math.ceil(endSeconds * perSecond) - 1))

  let low = 0
  let high = 0
  let tone = 0
  let weight = 0

  /*
   * Every survey column under the bar, not one sampled from them.
   *
   * The distinction is the whole difference between an envelope and a picket
   * fence: wound out there are a dozen or more survey columns per bar, and
   * picking one from each group aliases the peaks into a comb that changes
   * shape as the window resizes.
   */
  for (let bucket = first; bucket <= last; bucket += 1) {
    const index = bucket * PEAK_STRIDE
    if (peaks[index] < low) low = peaks[index]
    if (peaks[index + 1] > high) high = peaks[index + 1]
    // Tone is averaged rather than taken from the loudest column: colour is a
    // property of the stretch of music under the bar, and one bright transient
    // should not repaint a bar of bass.
    tone += peaks[index + 2]
    weight += 1
  }

  slice.low = low
  slice.high = high
  slice.tone = weight > 0 ? tone / weight : 0
  return slice
}

/** Scratch for the window's columns, grown as needed and reused every frame. */
let columnLow = new Float32Array(0)
let columnHigh = new Float32Array(0)
let columnTone = new Float32Array(0)

/**
 * The window, as the envelope it is.
 *
 * One column per pixel, taking the extremes of *every* survey column that falls
 * under it rather than sampling one of them. The distinction is the whole
 * difference between a waveform and a picket fence: wound out there are a dozen
 * or more survey columns per pixel, and picking one from each group aliases the
 * peaks into a comb of spikes that changes shape as the window resizes.
 *
 * Trough and crest are kept apart rather than mirrored from one magnitude, so
 * the envelope is drawn as the signal actually is — asymmetric where the
 * material is — instead of as the same sausage every overview draws.
 */
function drawEnvelope(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  at: number,
  duration: number,
  from: number,
  window: number,
  width: number,
  top: number,
  bottom: number
): void {
  const buckets = Math.floor(peaks.length / PEAK_STRIDE)
  const perSecond = buckets / duration
  const middle = (top + bottom) / 2
  // Short of the full half-height, so a full-scale master does not touch the
  // edge of the band and read as clipped by the frame rather than by the mix.
  const reach = ((bottom - top) / 2) * 0.92

  const columns = Math.max(1, Math.floor(width))
  const columnWidth = width / columns

  if (columnLow.length < columns) {
    columnLow = new Float32Array(columns)
    columnHigh = new Float32Array(columns)
    columnTone = new Float32Array(columns)
  }

  for (let column = 0; column < columns; column += 1) {
    const startSeconds = from + (column / columns) * window
    const endSeconds = from + ((column + 1) / columns) * window
    const { low, high, tone } = aggregate(
      peaks,
      buckets,
      perSecond,
      startSeconds,
      endSeconds,
      duration
    )

    // Read out of the scratch on the spot: the next column overwrites it.
    columnLow[column] = low
    columnHigh[column] = high
    columnTone[column] = tone
  }

  /*
   * A light three-tap smoothing, and only when the view is wound out.
   *
   * Aggregation removes the aliasing; this removes the last of the jitter, so a
   * sustained passage reads as one block instead of a row of teeth. It is off
   * at the tighter zooms, where a column is a few milliseconds and every edge
   * in it is real information rather than noise.
   */
  if (window / columns > 0.05) {
    for (let column = 1; column < columns - 1; column += 1) {
      columnLow[column] =
        (columnLow[column - 1] + columnLow[column] * 2 + columnLow[column + 1]) / 4
      columnHigh[column] =
        (columnHigh[column - 1] + columnHigh[column] * 2 + columnHigh[column + 1]) / 4
    }
  }

  for (let column = 0; column < columns; column += 1) {
    const seconds = from + (column / columns) * window
    // Past either end of the file there is nothing to draw. A render that
    // simply stops is the honest way to show a boundary.
    if (seconds < 0 || seconds > duration) continue

    const x = column * columnWidth
    const crest = middle - columnHigh[column] * reach
    const trough = middle - columnLow[column] * reach

    context.fillStyle = toneShade(columnTone[column], seconds <= at)
    // A minimum of one pixel: silence is a line through the axis, not a gap in
    // the file, and a gap reads as damage.
    context.fillRect(x, crest, Math.max(columnWidth, 1), Math.max(trough - crest, 1))
  }

  context.strokeStyle = `rgba(${LINE}, 0.14)`
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(0, middle)
  context.lineTo(width, middle)
  context.stroke()

  drawSecondTicks(context, from, window, width, top, bottom)
  drawPlayhead(context, ((at - from) / window) * width, top, bottom)
}

/**
 * The whole file along the bottom, with the window marked on it.
 *
 * This is the reading the band gives up when it zooms: a continuous envelope of
 * the entire programme, coloured by tone, with the played portion lit. It is
 * small on purpose — it is a map, not a view — and it is the only thing in the
 * department that says where the window is in the file.
 *
 * The envelope itself comes out of the cache. Only the three things that
 * actually move are drawn here.
 */
function drawStrip(
  context: CanvasRenderingContext2D,
  cache: StripCache,
  peaks: Float32Array,
  at: number,
  duration: number,
  from: number,
  window: number,
  width: number,
  top: number,
  height: number
): void {
  context.fillStyle = 'rgba(9, 9, 9, 0.55)'
  context.fillRect(0, top, width, height)

  if (cache.canvas && cache.context) {
    if (cache.peaks !== peaks || cache.width !== width || cache.height !== height) {
      cache.canvas.width = Math.max(1, Math.round(width * cache.ratio))
      cache.canvas.height = Math.max(1, Math.round(height * cache.ratio))
      // Sizing a canvas resets its transform, so it goes back on afterwards.
      cache.context.setTransform(cache.ratio, 0, 0, cache.ratio, 0, 0)
      paintStrip(cache.context, peaks, duration, width, height)

      cache.peaks = peaks
      cache.width = width
      cache.height = height
    }

    context.drawImage(cache.canvas, 0, top, width, height)
  }

  /*
   * What has not played, held back.
   *
   * One rectangle over the cached envelope rather than a second colour per
   * column, which is what lets the envelope be cached at all — the played
   * boundary moves continuously and the file behind it does not.
   */
  const passed = Math.max(0, Math.min(width, (at / duration) * width))
  context.fillStyle = 'rgba(9, 9, 9, 0.62)'
  context.fillRect(passed, top, width - passed, height)

  /*
   * The window, as a lit box.
   *
   * Filled as well as ruled, because at a tight zoom the box is two pixels wide
   * and a pair of hairlines that close is indistinguishable from one. The fill
   * is what keeps a narrow window reading as a region.
   */
  const x0 = (from / duration) * width
  const x1 = ((from + window) / duration) * width

  context.fillStyle = 'rgba(210, 169, 97, 0.1)'
  context.fillRect(x0, top, Math.max(x1 - x0, 2), height)

  context.strokeStyle = 'rgba(210, 169, 97, 0.55)'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(Math.round(x0) + 0.5, top)
  context.lineTo(Math.round(x0) + 0.5, top + height)
  context.moveTo(Math.round(x1) - 0.5, top)
  context.lineTo(Math.round(x1) - 0.5, top + height)
  context.stroke()

  drawPlayhead(context, passed, top, top + height)

  context.strokeStyle = `rgba(${LINE}, 0.16)`
  context.strokeRect(0.5, top + 0.5, width - 1, height - 1)
}

/**
 * The strip's envelope, painted into the cache.
 *
 * Runs when a file is admitted and when the stage is resized, and not otherwise
 * — so the cost of a pass over the whole survey is paid twice a file instead of
 * sixty times a second. Drawn at full weight throughout; the part that has not
 * played is darkened at blit time.
 */
function paintStrip(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  duration: number,
  width: number,
  height: number
): void {
  const buckets = Math.floor(peaks.length / PEAK_STRIDE)
  const perSecond = buckets / duration
  const middle = height / 2
  const reach = (height / 2) * 0.82

  context.clearRect(0, 0, width, height)

  const columns = Math.max(1, Math.floor(width))
  for (let column = 0; column < columns; column += 1) {
    const startSeconds = (column / columns) * duration
    const endSeconds = ((column + 1) / columns) * duration
    const { low, high, tone } = aggregate(
      peaks,
      buckets,
      perSecond,
      startSeconds,
      endSeconds,
      duration
    )

    context.fillStyle = toneShade(tone, true)
    context.fillRect(column, middle - high * reach, 1, Math.max((high - low) * reach, 1))
  }
}

/** Maps a frequency onto an analyser bin, given the analyser's own rate. */
function binAt(hertz: number, bins: number, nyquist: number): number {
  return Math.min(bins - 1, Math.max(0, Math.round((hertz / nyquist) * (bins - 1))))
}

/**
 * SPECTRUM — frequency content, as it passes.
 *
 * Logarithmic in frequency, so an octave occupies the same width wherever it
 * falls; a linear sweep of an FFT spends three quarters of the stage on the top
 * two octaves, where there is almost never anything to look at. The body is
 * filled from the ramp and the instantaneous curve drawn over it in alabaster,
 * so the two readings stay separable at a glance.
 */
function drawSpectrum(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  bins: number,
  sampleRate: number,
  width: number,
  height: number
): void {
  const nyquist = sampleRate / 2
  const floor = Math.log2(20)
  const span = Math.log2(nyquist) - floor
  const base = height * 0.94
  const ceiling = height * 0.06

  const magnitudeAt = (fraction: number): number =>
    data[binAt(2 ** (floor + fraction * span), bins, nyquist)] / 255

  const columns = Math.max(2, Math.floor(width / 2))

  context.beginPath()
  context.moveTo(0, base)
  for (let column = 0; column <= columns; column += 1) {
    const fraction = column / columns
    context.lineTo(fraction * width, base - magnitudeAt(fraction) * (base - ceiling))
  }
  context.lineTo(width, base)
  context.closePath()

  const fill = context.createLinearGradient(0, ceiling, 0, base)
  fill.addColorStop(0, rgba(1, 0.55))
  fill.addColorStop(0.45, rgba(0.62, 0.4))
  fill.addColorStop(1, rgba(0.1, 0.12))
  context.fillStyle = fill
  context.fill()

  context.beginPath()
  for (let column = 0; column <= columns; column += 1) {
    const fraction = column / columns
    const y = base - magnitudeAt(fraction) * (base - ceiling)
    if (column === 0) context.moveTo(0, y)
    else context.lineTo(fraction * width, y)
  }
  context.strokeStyle = 'rgba(221, 207, 178, 0.9)'
  context.lineWidth = 1.2
  context.stroke()

  // Decade rules, so the axis reads as frequency rather than as width.
  context.lineWidth = 1
  context.strokeStyle = `rgba(${LINE}, 0.08)`
  for (const hertz of [100, 1000, 10000]) {
    if (hertz >= nyquist) continue
    const x = ((Math.log2(hertz) - floor) / span) * width
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, base)
    context.stroke()
  }

  context.strokeStyle = `rgba(${LINE}, 0.16)`
  context.beginPath()
  context.moveTo(0, base)
  context.lineTo(width, base)
  context.stroke()
}

/**
 * SPECTRAL — a spectrogram, scrolling.
 *
 * Frequency up the vertical, low at the bottom, on the same logarithmic axis
 * the spectrum uses so the two presets agree about where a note is. Level is
 * carried by the ramp: dark crimson at the floor, gold for what is loud.
 *
 * Fed by the live analyser and scrolling from the right, which means it draws
 * only what has already been heard. A version built from an offline survey was
 * tried, so the playhead could sit at the centre with the coming material to
 * the right of it as WAVEFORM does — it was not what this preset should look
 * like, and the live render was restored on the operator's call.
 *
 * The history is scrolled by blitting the offscreen canvas onto itself, which
 * is one copy per frame rather than several hundred fills.
 * `globalCompositeOperation = 'copy'` is load-bearing: drawing a canvas onto
 * itself under the default `source-over` composites the old pixels through the
 * new ones, and the whole thing fogs over within a few seconds.
 */
function drawSpectrogram(
  context: CanvasRenderingContext2D,
  historyContext: CanvasRenderingContext2D,
  history: HTMLCanvasElement,
  data: Uint8Array,
  bins: number,
  sampleRate: number,
  width: number,
  height: number
): void {
  const step = 2

  historyContext.globalCompositeOperation = 'copy'
  historyContext.drawImage(history, -step, 0)
  historyContext.globalCompositeOperation = 'source-over'

  const nyquist = sampleRate / 2
  const floor = Math.log2(20)
  // Read to 16 kHz rather than to Nyquist. The top of a 48k analyser is 24 kHz,
  // which is a couple of rows of nothing at the top of every column; stopping
  // here gives the stage to the octaves that have material in them.
  const span = Math.log2(Math.min(16000, nyquist)) - floor
  const rows = Math.max(1, Math.floor(height))

  for (let row = 0; row < rows; row += 1) {
    // Row 0 is the top of the canvas and the top of the band, so the axis runs
    // low at the bottom — which is how a spectrogram is read.
    const fraction = 1 - row / rows
    const magnitude = data[binAt(2 ** (floor + fraction * span), bins, nyquist)] / 255

    if (magnitude <= 0.02) continue
    historyContext.fillStyle = rgba(magnitude, Math.min(1, 0.15 + magnitude * 1.2))
    historyContext.fillRect(width - step, row, step, 1)
  }

  context.drawImage(history, 0, 0, width, height)
}

/**
 * The resting state: STATIC, or anything paused.
 *
 * Two rings on their own slow clock. This is what the department looks like on
 * a second screen while the operator works elsewhere, so it is deliberately
 * close to still — a room with the lights on, not a screensaver.
 */
function drawResting(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  idle: boolean
): void {
  const cx = width / 2
  const cy = height / 2
  const base = Math.min(width, height)
  const breath = Math.sin(elapsed * 0.6) * 0.5 + 0.5

  for (const [index, factor] of [0.21, 0.3].entries()) {
    const radius = base * factor + breath * (index === 0 ? 3 : 6)
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.strokeStyle = idle
      ? `rgba(${LINE}, ${0.08 + breath * 0.04})`
      : rgba(0.5, 0.16 + breath * 0.1)
    context.lineWidth = 1
    context.stroke()
  }

  // Cardinal ticks, echoing the sigil's axis marks at stage scale.
  context.strokeStyle = `rgba(${LINE}, 0.2)`
  for (let index = 0; index < 4; index += 1) {
    const angle = (index * Math.PI) / 2
    const from = base * 0.34
    const to = base * 0.37
    context.beginPath()
    context.moveTo(cx + Math.cos(angle) * from, cy + Math.sin(angle) * from)
    context.lineTo(cx + Math.cos(angle) * to, cy + Math.sin(angle) * to)
    context.stroke()
  }
}
