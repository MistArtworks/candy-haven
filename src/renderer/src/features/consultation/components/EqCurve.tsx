import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { describeBand, viewFrequencies, type EqBand } from '@shared/consult/engine'
import { drawEqCurve, drawEqGrid, drawEqPoints, eqResponse } from '@shared/consult/audio'
import { EQ_PALETTE } from '../lib/palette'
import styles from '../Consultation.module.scss'

/**
 * A producer's EQ, as its curve: worked out from the very filters that make
 * the sound (`curve.ts`), so the picture is what is heard. Read-only here;
 * the points are where they put them.
 */
export function EqCurve({ bands }: { bands: readonly EqBand[] }): ReactNode {
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
    const response = eqResponse(bands, viewFrequencies(Math.max(2, Math.round(width / 2))))
    drawEqCurve(context, width, height, response, EQ_PALETTE)
    drawEqPoints(context, width, height, bands, null, EQ_PALETTE)
  }, [bands])

  useEffect(() => {
    draw()
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className={styles.eq}
      role="img"
      aria-label={`EQ: ${bands.map(describeBand).join('; ')}`}
    />
  )
}
