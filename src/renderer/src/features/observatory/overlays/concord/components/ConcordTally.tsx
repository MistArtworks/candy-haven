import { useEffect, useRef, type ReactNode } from 'react'
import type { ConcordLayout, ConcordState } from '@shared/domain/concord'
import { leadingOptions } from '@shared/domain/concord.constants'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { ConcordFace } from '@renderer/concord/tally-renderer'
import styles from './ConcordTally.module.scss'

export interface ConcordTallyProps {
  state: ConcordState
  /**
   * Which address's layout to preview.
   *
   * Not read from the poll's config, because layout is not a property of the
   * poll — each browser source pins its own. So the console previews one at a
   * time and the operator picks which.
   */
  layout: ConcordLayout
  /** Tightens type and rule weights for the host-side preview. */
  compact?: boolean
  className?: string
}

/**
 * React mount for the shared Concord renderer.
 *
 * Thin on purpose. The layout, the smoothing and the palette all live in
 * `concord/tally-renderer.ts` so the OBS browser source — which has no React —
 * renders an identical face from the same code. This component's only job is
 * lifecycle: create, feed state, resize, tear down.
 */
export function ConcordTally({
  state,
  layout,
  compact = false,
  className
}: ConcordTallyProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<ConcordFace | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    /*
     * Layout is deliberately *not* passed here.
     *
     * Reading it in this effect would mean either re-creating the renderer on
     * every preview toggle — restarting the plexus and discarding the chased bar
     * positions, so the bars would visibly redraw from zero — or lying to the
     * dependency array. The effect below owns it instead, and runs before the
     * one that first feeds in state, so nothing is ever painted at the wrong
     * layout.
     */
    const face = new ConcordFace(canvas, { compact, motion: animationsEnabled })
    faceRef.current = face
    face.start()

    // The canvas sizes itself from its container, which changes with the panel
    // and the window; observing is the only way to keep the backing store at
    // device resolution without polling.
    const observer = new ResizeObserver(() => face.resize())
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      face.destroy()
      faceRef.current = null
    }
    // `compact` is a layout decision fixed at the call site; re-creating the
    // renderer when the motion preference changes is correct, since that decides
    // whether there is a frame loop at all.
  }, [compact, animationsEnabled])

  useEffect(() => {
    faceRef.current?.setLayout(layout)
  }, [layout])

  useEffect(() => {
    faceRef.current?.setState(state)
  }, [state])

  // The stage's aspect ratio follows the configured layout, so the preview
  // frames the poll the way OBS will. A portrait stage around a corner widget
  // would be a reassuring lie about how much room it takes.
  return (
    <div className={[styles.stage, className ?? ''].filter(Boolean).join(' ')} data-layout={layout}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {/*
        The face is decorative to a screen reader — a canvas of moving bars
        conveys nothing. The state it represents is announced here instead, and
        politely, so a tally ticking eight times a second does not interrupt
        whatever is being read.
      */}
      <p className={styles.announce} role="status" aria-live="polite">
        <Announcement state={state} />
      </p>
    </div>
  )
}

/**
 * The face, in words.
 *
 * Deliberately does *not* narrate the running tally: at eight updates a second
 * that would be unusable even on a polite live region. It announces the phase
 * and the settled outcome, which is what a non-sighted operator actually needs.
 */
function Announcement({ state }: { state: ConcordState }): ReactNode {
  if (state.phase === 'casting') {
    return <>The chamber is divided. Casting {state.cast?.tiedIds.length ?? 0} lots.</>
  }

  if (state.phase === 'resolved') {
    if (!state.result) return <>Voting closed with no votes filed.</>
    return (
      <>
        Carried: {state.result.label}, with {state.result.tally} of {state.result.total} votes
        {state.result.decidedByCasting ? ', settled by the casting of lots' : ''}.
      </>
    )
  }

  if (state.phase === 'open') {
    const leading = leadingOptions(state.options)
    const front =
      leading.ids.length === 1
        ? state.options.find((option) => option.id === leading.ids[0])?.label
        : null
    return (
      <>
        Voting open on {state.options.length} options. {state.voters} citizens have voted.
        {front ? ` ${front} leads.` : leading.ids.length > 1 ? ' The chamber is tied.' : ''}
      </>
    )
  }

  return <>{state.options.length} options on the ballot. Voting has not opened.</>
}
