import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { describeBand, viewFrequencies, type EqBand } from '@shared/consult/engine'
import {
  drawEqCurve,
  drawEqGrid,
  drawEqPoints,
  drawSpectrum,
  eqResponse
} from '@shared/consult/audio'
import { EQ_PALETTE, SPECTRUM_PALETTE } from '../lib/palette'
import styles from '../Consultation.module.scss'

export interface EqCurveProps {
  bands: readonly EqBand[]
  /**
   * The transport's analyser, to draw the track sounding behind the curve
   * as the website's EQ does. Read only while `live`.
   */
  analyserRef?: RefObject<AnalyserNode | null>
  /** Whether this track is playing through the transport now: drawn every frame then. */
  live?: boolean
  className?: string
}

/**
 * A producer's EQ, as its curve: worked out from the very filters that make
 * the sound (`curve.ts`), so the picture is what is heard. Read-only here;
 * the points are where they put them. Given the transport's analyser, the
 * track's spectrum moves behind it while it plays.
 */
export function EqCurve({ bands, analyserRef, live = false, className }: EqCurveProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const draw = useCallback((): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    drawEqGrid(context, width, height, EQ_PALETTE)
    const analyser = live ? analyserRef?.current : null
    if (analyser) {
      const bins = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(bins)
      drawSpectrum(context, width, height, bins, analyser.context.sampleRate, SPECTRUM_PALETTE)
    }
    const response = eqResponse(bands, viewFrequencies(Math.max(2, Math.round(width / 2))))
    drawEqCurve(context, width, height, response, EQ_PALETTE)
    drawEqPoints(context, width, height, bands, null, EQ_PALETTE)
  }, [bands, analyserRef, live])

  useEffect(() => {
    draw()
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  // While the track plays, the spectrum behind the curve moves with it.
  useEffect(() => {
    if (!live) return
    let frame = requestAnimationFrame(function loop() {
      draw()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [draw, live])

  return (
    <canvas
      ref={canvasRef}
      className={[styles.eq, className ?? ''].filter(Boolean).join(' ')}
      role="img"
      aria-label={`EQ: ${bands.map(describeBand).join('; ')}`}
    />
  )
}
