import { useEffect, useRef, type ReactNode } from 'react'
import type { TimerState } from '@shared/domain/timer'
import { TIMER_KIND } from '@shared/domain/timer.constants'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { TimerFace } from '@renderer/timer/timer-renderer'
import styles from './TimerFacePreview.module.scss'

export interface TimerFacePreviewProps {
  state: TimerState
  className?: string
}

/**
 * React mount for the shared countdown face.
 *
 * Thin on purpose, as the rite's ring wrapper is: the drawing and the clock
 * live in `timer/timer-renderer.ts` so the OBS browser source renders an
 * identical face from the same code. This component only handles lifecycle.
 *
 * The preview is drawn on a sunken plate rather than on nothing, because the
 * overlay itself is transparent and a transparent face on a dark panel would
 * misrepresent how it composites onto a scene.
 */
export function TimerFacePreview({ state, className }: TimerFacePreviewProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<TimerFace | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const face = new TimerFace(canvas, { compact: true, motion: animationsEnabled })
    faceRef.current = face
    face.start()

    const observer = new ResizeObserver(() => face.resize())
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      face.destroy()
      faceRef.current = null
    }
  }, [animationsEnabled])

  useEffect(() => {
    faceRef.current?.setState(state, TIMER_KIND[state.id])
  }, [state])

  return (
    <div className={[styles.stage, className ?? ''].filter(Boolean).join(' ')}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}
