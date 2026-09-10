import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import type { AudioPreset } from '@shared/domain/auditorium'
import { Logomark } from '@renderer/components/sigil/Logomark'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { PEAK_STRIDE } from '../lib/survey'
import type { ZoomLevel } from '../lib/zoom'
import styles from '../AuditoriumPage.module.scss'

export interface VisualiserProps {
  analyserRef: RefObject<AnalyserNode | null>
  /** The surveyed file envelope, read each frame by the overview. */
  peaksRef: RefObject<Float32Array | null>
  /** Seconds of file across the stage, or 0 for the whole of it. */
  zoom: ZoomLevel
  /** Read directly for the playhead, so it moves at frame rate rather than 4 Hz. */
  elementRef: RefObject<HTMLAudioElement | null>
  preset: AudioPreset
  playing: boolean
  /** No file open: the stage draws its resting state instead. */
  idle: boolean
  /** The file is being decoded; the overview says so rather than drawing blank. */
  surveying: boolean
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
 * The ramp at `position`, interpolated.
 *
 * Interpolated rather than stepped, because the overview colours every column
 * independently: against five hard stops, a track drifting gradually brighter
 * would band into five blocks instead of shading through them.
 */
function ramp(position: number): readonly [number, number, number] {
  const clamped = Math.min(Math.max(position, 0), 1) * (RAMP.length - 1)
  const index = Math.min(Math.floor(clamped), RAMP.length - 2)
  const mix = clamped - index
  const from = RAMP[index]
  const to = RAMP[index + 1]

  return [
    Math.round(from[0] + (to[0] - from[0]) * mix),
    Math.round(from[1] + (to[1] - from[1]) * mix),
    Math.round(from[2] + (to[2] - from[2]) * mix)
  ]
}

function rgba(position: number, alpha: number): string {
  const [red, green, blue] = ramp(position)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
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
  surveying
}: VisualiserProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const animated = useAnimationsEnabled()

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

      if (mode === 'waveform') {
        const peaks = peaksRef.current
        if (peaks && dated) {
          drawOverview(context, peaks, at, duration, span, width, height)
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

/** The playhead. */
function drawPlayhead(context: CanvasRenderingContext2D, x: number, height: number): void {
  context.strokeStyle = 'rgba(227, 194, 134, 0.9)'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(x, 0)
  context.lineTo(x, height)
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
  height: number
): void {
  // One tick a second becomes a picket fence once the window is wide.
  const step = window <= 8 ? 1 : window <= 16 ? 2 : 5

  context.strokeStyle = `rgba(${LINE}, 0.07)`
  context.lineWidth = 1

  const first = Math.ceil(from / step) * step
  for (let seconds = first; seconds < from + window; seconds += step) {
    const x = ((seconds - from) / window) * width
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
}

/** Scratch buffers for the envelope, grown as needed and reused every frame. */
let columnLow = new Float32Array(0)
let columnHigh = new Float32Array(0)
let columnTone = new Float32Array(0)

/**
 * WAVEFORM — the file's own envelope.
 *
 * Two renders behind one preset, chosen by the zoom. Wound out to ALL the
 * picture is fixed and the playhead travels across it, which is how the shape
 * of an arrangement is read. At every other setting the playhead is nailed to
 * the centre of the stage and the material slides through it, right to left,
 * which is how the next few seconds are read. Those are genuinely different
 * questions rather than two magnifications of one, which is why both are kept.
 *
 * Every column is drawn at the colour of its own frequency content: crimson
 * where the low end is carrying, gold where the top is. That is what makes this
 * worth more than a plain envelope — a drop and a breakdown are different
 * colours, so the arrangement is legible without playing it.
 *
 * Each pixel column takes the extremes of *every* survey column that falls
 * under it, rather than sampling one of them. The distinction is the whole
 * difference between a waveform and a picket fence: at ALL there are a dozen or
 * more survey columns per pixel, and picking one at random from each group
 * aliases the peaks into a comb of spikes that changes shape as the window
 * resizes. Aggregating gives the solid body an envelope is supposed to have,
 * and costs one pass over the survey.
 */
function drawOverview(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  at: number,
  duration: number,
  zoom: number,
  width: number,
  height: number
): void {
  const buckets = Math.floor(peaks.length / PEAK_STRIDE)
  const middle = height / 2
  // Short of the full half-height, so a full-scale master does not touch the
  // panel edge and read as clipped by the frame rather than by the mix.
  const reach = height * 0.42

  const from = zoom === 0 ? 0 : at - zoom / 2
  const window = zoom === 0 ? duration : zoom
  const playhead = zoom === 0 ? (at / duration) * width : width / 2

  const columns = Math.max(1, Math.floor(width))
  const columnWidth = width / columns
  const perSecond = buckets / duration

  if (columnLow.length < columns) {
    columnLow = new Float32Array(columns)
    columnHigh = new Float32Array(columns)
    columnTone = new Float32Array(columns)
  }

  for (let column = 0; column < columns; column += 1) {
    const startSeconds = from + (column / columns) * window
    const endSeconds = from + ((column + 1) / columns) * window

    let low = 0
    let high = 0
    let tone = 0

    // Before the start and past the end there is no file, and the column stays
    // flat: an envelope that simply stops is the honest way to show a boundary.
    if (endSeconds > 0 && startSeconds < duration) {
      const firstBucket = Math.max(0, Math.floor(startSeconds * perSecond))
      const lastBucket = Math.min(
        buckets - 1,
        Math.max(firstBucket, Math.ceil(endSeconds * perSecond) - 1)
      )

      let weight = 0
      for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
        const index = bucket * PEAK_STRIDE
        if (peaks[index] < low) low = peaks[index]
        if (peaks[index + 1] > high) high = peaks[index + 1]
        // Tone is averaged rather than taken from the loudest bucket: colour is
        // a property of the stretch of music under the column, and one bright
        // transient should not repaint a bar of bass.
        tone += peaks[index + 2]
        weight += 1
      }
      if (weight > 0) tone /= weight
    }

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
    if (seconds < 0 || seconds > duration) continue

    const x = column * columnWidth
    const top = middle - columnHigh[column] * reach
    const bottom = middle - columnLow[column] * reach

    context.fillStyle = rgba(columnTone[column], seconds <= at ? 0.92 : 0.26)
    // A minimum of one pixel: silence is a line through the axis, not a gap in
    // the file, and a gap reads as damage.
    context.fillRect(x, top, Math.max(columnWidth, 1), Math.max(bottom - top, 1))
  }

  context.strokeStyle = `rgba(${LINE}, 0.14)`
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(0, middle)
  context.lineTo(width, middle)
  context.stroke()

  if (zoom !== 0) drawSecondTicks(context, from, window, width, height)
  drawPlayhead(context, playhead, height)
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
