import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  createMeters,
  drawImager,
  drawScope,
  type Loudness,
  type MeterReading,
  type Meters
} from '@shared/consult/audio'
import { IMAGER_PALETTE, SCOPE_PALETTE } from '../lib/palette'
import styles from '../Consultation.module.scss'

/** The bar's span, in LUFS, and the mark at what streaming services play to. */
const FLOOR = -36
const CEILING = 0
const TARGET = -14
/** How often the numbers are rewritten, in ms. */
const NUMBERS_MS = 100

const SILENT: Loudness = { momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity }

const lufs = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '—')
const share = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, (value - FLOOR) / (CEILING - FLOOR))) : 0

/** A canvas sized to its box at the screen's density, cleared; its context. */
function prepare(
  canvas: HTMLCanvasElement | null
): { context: CanvasRenderingContext2D; width: number; height: number } | null {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return null
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width === 0 || height === 0) return null
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  return { context, width, height }
}

/**
 * Three readings of the track as it is heard, under the waveform as the
 * website's page has them: loudness in LUFS (short-term large, momentary and
 * integrated beside it), an oscilloscope, and a stereo imager with the two
 * sides' correlation. Made from the transport's own analyser, after the
 * insert, so they measure their settings or the track as it is, whichever is
 * on. That is after the Level fader too, so the readings put it back: the
 * loudness is the track's, not the level it is played at.
 */
export function MeterRow({
  analyserRef,
  live,
  volume
}: {
  analyserRef: RefObject<AnalyserNode | null>
  /** Whether this track is playing through the transport now. */
  live: boolean
  /** The transport's Level, which the readings are taken after. */
  volume: number
}): ReactNode {
  const metersRef = useRef<Meters | null>(null)
  const scopeRef = useRef<HTMLCanvasElement | null>(null)
  const imagerRef = useRef<HTMLCanvasElement | null>(null)
  const lastRef = useRef<MeterReading | null>(null)
  const [loudness, setLoudness] = useState<Loudness>(SILENT)

  // The level, undone: a picture drawn back up, decibels added back.
  const scale = volume > 0.001 ? 1 / volume : 0
  const correction = volume > 0.001 ? -20 * Math.log10(volume) : -Infinity

  // Made once the transport has an analyser; let go with the page.
  useEffect(
    () => () => {
      metersRef.current?.dispose()
      metersRef.current = null
    },
    []
  )

  const draw = useCallback(
    (reading: MeterReading | null): void => {
      const left = reading?.left ?? new Float32Array(2)
      const right = reading?.right ?? new Float32Array(2)
      const scope = prepare(scopeRef.current)
      if (scope)
        drawScope(scope.context, scope.width, scope.height, left, right, SCOPE_PALETTE, scale)
      const imager = prepare(imagerRef.current)
      if (imager)
        drawImager(
          imager.context,
          imager.width,
          imager.height,
          left,
          right,
          reading?.correlation ?? NaN,
          IMAGER_PALETTE,
          scale
        )
    },
    [scale]
  )

  useEffect(() => {
    if (!live) return
    let last = 0
    let frame = requestAnimationFrame(function loop(time) {
      const analyser = analyserRef.current
      if (!metersRef.current && analyser)
        metersRef.current = createMeters(analyser.context, analyser)
      const reading = metersRef.current?.read(true) ?? null
      lastRef.current = reading
      draw(reading)
      if (reading && time - last >= NUMBERS_MS) {
        last = time
        setLoudness(reading.loudness)
      }
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [analyserRef, draw, live])

  useEffect(() => {
    draw(lastRef.current)
    const observer = new ResizeObserver(() => draw(lastRef.current))
    for (const canvas of [scopeRef.current, imagerRef.current]) if (canvas) observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  const shortTerm = loudness.shortTerm + correction

  return (
    <div className={styles.meterRow}>
      <div className={styles.meterCell}>
        <span className={styles.meterLabel}>
          Loudness <span className={styles.meterUnit}>LUFS</span>
        </span>
        <span className={styles.meterBig}>
          <span className={styles.meterKey}>S</span>
          {lufs(shortTerm)}
        </span>
        <span className={styles.meterSmall}>
          <span>
            <span className={styles.meterKey}>M</span>
            {lufs(loudness.momentary + correction)}
          </span>
          <button
            type="button"
            className={styles.meterReset}
            title="Start the integrated reading again"
            onClick={() => {
              metersRef.current?.reset()
              setLoudness((current) => ({ ...current, integrated: -Infinity }))
            }}
          >
            <span className={styles.meterKey}>I</span>
            {lufs(loudness.integrated + correction)}
          </button>
        </span>
        <span className={styles.meterBar} aria-hidden="true">
          <span className={styles.meterFill} style={{ width: `${share(shortTerm) * 100}%` }} />
          <span className={styles.meterTarget} style={{ left: `${share(TARGET) * 100}%` }} />
        </span>
      </div>
      <div className={styles.meterCell}>
        <span className={styles.meterLabel}>Scope</span>
        <canvas ref={scopeRef} className={styles.meterCanvas} aria-hidden="true" />
      </div>
      <div className={styles.meterCell}>
        <span className={styles.meterLabel}>
          Stereo <span className={styles.meterUnit}>Phase</span>
        </span>
        <canvas ref={imagerRef} className={styles.meterCanvas} aria-hidden="true" />
      </div>
    </div>
  )
}
