import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { decodeWaveform, type Note } from '@shared/consult/engine'
import { drawWaveform } from '@shared/consult/audio'
import { WAVEFORM_PALETTE } from '../lib/palette'
import styles from '../Consultation.module.scss'

export interface FeedbackWaveformProps {
  /** The compact waveform the link was shared with, as base64. */
  waveform: string | null
  /** The track's length, in seconds. */
  duration: number
  notes: readonly Note[]
  /** The note picked out, drawn brighter. */
  active: string | null
  /** The transport's element, read for the playhead while this track is the one loaded. */
  elementRef: RefObject<HTMLAudioElement | null>
  /** Whether this track is the one the transport has. */
  loaded: boolean
  playing: boolean
  /** The transport's position, which moves the playhead when seeking while held. */
  position: number
  /** Pressed at this many seconds in. */
  onPress: (seconds: number) => void
}

/**
 * The shared track, drawn as the producer saw it on the page: the waveform
 * with their moments as pins and their sections as bands, the one picked
 * out brighter. Pressing it plays from there.
 *
 * Drawn every frame while this track plays, from the element's own clock
 * rather than the transport's reported position, which only moves a few
 * times a second; held, it is drawn when what it shows changes.
 */
export function FeedbackWaveform({
  waveform,
  duration,
  notes,
  active,
  elementRef,
  loaded,
  playing,
  position,
  onPress
}: FeedbackWaveformProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const data = useMemo(() => decodeWaveform(waveform) ?? new Uint8Array(0), [waveform])

  const draw = useCallback((): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawWaveform(
      context,
      width,
      height,
      {
        data,
        duration,
        position: loaded ? (elementRef.current?.currentTime ?? 0) : 0,
        notes,
        active
      },
      WAVEFORM_PALETTE
    )
  }, [data, duration, loaded, elementRef, notes, active])

  useEffect(() => {
    draw()
    if (!loaded || !playing) return
    let frame = requestAnimationFrame(function loop() {
      draw()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [draw, loaded, playing, position])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className={styles.waveform}
      role="img"
      aria-label="The track, with their notes on it. Press it to play from there."
      onPointerDown={(event) => {
        if (event.button !== 0 || duration <= 0) return
        const box = event.currentTarget.getBoundingClientRect()
        const fraction = (event.clientX - box.left) / Math.max(1, box.width)
        onPress(Math.min(Math.max(fraction, 0), 1) * duration)
      }}
    />
  )
}
