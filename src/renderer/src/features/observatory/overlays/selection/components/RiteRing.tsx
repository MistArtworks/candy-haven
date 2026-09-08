import { useEffect, useRef, type ReactNode } from 'react'
import type { RiteState } from '@shared/domain/rite'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { RiteWheel } from '@renderer/rite/wheel-renderer'
import styles from './RiteRing.module.scss'

export interface RiteRingProps {
  state: RiteState
  /** Tightens type and rim weights for the host-side preview. */
  compact?: boolean
  className?: string
}

/**
 * React mount for the shared ring renderer.
 *
 * Thin on purpose. The drawing, the easing and the palette all live in
 * `rite/wheel-renderer.ts` so the OBS browser source — which has no React —
 * renders an identical ring from the same code. This component's only job is
 * lifecycle: create, feed state, resize, tear down.
 */
export function RiteRing({ state, compact = false, className }: RiteRingProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wheelRef = useRef<RiteWheel | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const wheel = new RiteWheel(canvas, { compact, motion: animationsEnabled })
    wheelRef.current = wheel
    wheel.start()

    // The canvas sizes itself from its container, which changes with the panel
    // and the window; observing is the only way to keep the backing store at
    // device resolution without polling.
    const observer = new ResizeObserver(() => wheel.resize())
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      wheel.destroy()
      wheelRef.current = null
    }
    // `compact` is a layout decision fixed at the call site; re-creating the
    // renderer when the motion preference changes is correct, since that
    // decides whether there is a frame loop at all.
  }, [compact, animationsEnabled])

  useEffect(() => {
    wheelRef.current?.setState({
      petitions: state.petitions,
      phase: state.phase,
      spin: state.spin,
      winnerIndex: state.winner?.index ?? null,
      winnerLabel: state.winner?.label ?? null
    })
  }, [state])

  return (
    <div className={[styles.stage, className ?? ''].filter(Boolean).join(' ')}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {/*
        The ring itself is decorative to a screen reader — a rotating canvas
        conveys nothing. The state it represents is announced here instead, and
        politely, so a spin does not interrupt whatever is being read.
      */}
      <p className={styles.announce} role="status" aria-live="polite">
        {state.phase === 'spinning'
          ? `Selecting from ${state.petitions.length} petitions.`
          : state.winner
            ? `Selected: ${state.winner.label}.`
            : `${state.petitions.length} petitions filed.`}
      </p>
    </div>
  )
}
