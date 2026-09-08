import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import gsap from 'gsap'
import { BOOT_STAGES } from '@shared/domain/boot.constants'
import type { BootSnapshot } from '@shared/domain/boot'
import { APP_NAME, APP_SUBTITLE } from '@shared/constants'
import { formatDuration, formatIndex } from '@renderer/lib/format'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { bootExitVariants } from '@renderer/motion/transitions'
import { BootRing } from './components/BootRing'
import { BootLog } from './components/BootLog'
import styles from './BootScreen.module.scss'

export interface BootScreenProps {
  snapshot: BootSnapshot
  /** Called once the operator (or auto-advance) commits to entering the console. */
  onEnter: () => void
  /** Skips the hold-at-ready state and enters as soon as the sequence completes. */
  fastBoot: boolean
}

/**
 * The boot sequence, staged as a monument.
 *
 * Composition follows the reference boards directly: a vast symmetrical field,
 * one suspended focal object at centre, small institutional type at the edges.
 * Every value shown is real — stage states, timings and log lines all come from
 * the main process, so this is an honest progress display rather than a timed
 * animation that happens to end when the app is ready.
 */
export function BootScreen({ snapshot, onEnter, fastBoot }: BootScreenProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const animationsEnabled = useAnimationsEnabled()
  const [entering, setEntering] = useState(false)

  const activeStage = snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)
  const activeDefinition = BOOT_STAGES.find((stage) => stage.id === snapshot.activeStageId)
  const isReady = snapshot.phase === 'ready'
  const isFailed = snapshot.phase === 'failed'

  // Only read in the ready branch, where completedAt is always populated.
  // Falling back to Date.now() here would be an impure render.
  const elapsed =
    snapshot.startedAt !== null && snapshot.completedAt !== null
      ? snapshot.completedAt - snapshot.startedAt
      : 0

  const enter = useCallback(() => {
    if (entering) return
    setEntering(true)
    void window.candy.boot.enter()
    onEnter()
  }, [entering, onEnter])

  // Entrance cinematic. GSAP owns this because it is a precisely sequenced
  // timeline across several independent elements — exactly what it is best at.
  useEffect(() => {
    if (!animationsEnabled || !rootRef.current) return

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } })

      timeline
        .from(`.${styles.wordmark}`, { opacity: 0, y: 22, duration: 1.1 })
        .from(`.${styles.subtitle}`, { opacity: 0, y: 12, duration: 0.9 }, '-=0.8')
        .from(`.${styles.ringHolder}`, { opacity: 0, scale: 0.9, duration: 1.4 }, '-=0.9')
        .from(`.${styles.readouts}`, { opacity: 0, y: 16, duration: 0.9 }, '-=1.0')
        .from(`.${styles.corner}`, { opacity: 0, duration: 0.8, stagger: 0.08 }, '-=0.7')
    }, rootRef)

    return () => context.revert()
  }, [animationsEnabled])

  // Auto-advance when the operator has opted into fast boot.
  useEffect(() => {
    if (!isReady || !fastBoot || entering) return
    const timer = setTimeout(enter, 420)
    return () => clearTimeout(timer)
  }, [isReady, fastBoot, entering, enter])

  // Enter on any key once the sequence is ready — the console should never
  // require a mouse to reach.
  useEffect(() => {
    if (!isReady || fastBoot) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
        event.preventDefault()
        enter()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isReady, fastBoot, enter])

  return (
    <motion.div
      ref={rootRef}
      className={styles.screen}
      data-phase={snapshot.phase}
      variants={bootExitVariants}
      initial="initial"
      exit="exit"
    >
      {/* Structural field: two monolithic slabs flanking the focal object */}
      <div className={styles.monolith} aria-hidden="true">
        <span className={styles.slab} data-side="left" />
        <span className={styles.slab} data-side="right" />
        <span className={styles.floor} />
      </div>

      <div className={styles.corner} data-corner="tl">
        <span className={styles.cornerLabel}>SONOALCHEMY</span>
        <span className={styles.cornerValue}>RESONANCE CONTROL</span>
      </div>

      <div className={styles.corner} data-corner="tr">
        <span className={styles.cornerLabel}>SEQUENCE</span>
        <span className={styles.cornerValue}>
          {formatIndex(snapshot.stages.filter((s) => s.status === 'complete').length)} /{' '}
          {formatIndex(BOOT_STAGES.length)}
        </span>
      </div>

      <header className={styles.masthead}>
        <h1 className={styles.wordmark}>{APP_NAME}</h1>
        <p className={styles.subtitle}>{APP_SUBTITLE}</p>
      </header>

      <div className={styles.ringHolder}>
        <BootRing snapshot={snapshot} />
      </div>

      <section className={styles.readouts}>
        {isFailed ? (
          <div className={styles.failure} role="alert">
            <p className={styles.failureLabel}>SEQUENCE HALTED</p>
            <p className={styles.failureMessage}>{snapshot.failure?.message}</p>
            {snapshot.failure?.hint ? (
              <p className={styles.failureHint}>{snapshot.failure.hint}</p>
            ) : null}
            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={() => void window.candy.boot.retry()}
                disabled={snapshot.failure?.recoverable === false}
              >
                Reinitiate sequence
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.stageLine}>
              <span className={styles.stageLabel}>
                {isReady
                  ? 'HARMONIC SYNCHRONISATION COMPLETE'
                  : (activeDefinition?.label ?? 'STANDBY')}
              </span>
              <span className={styles.stageDetail}>
                {isReady
                  ? `All systems nominal — ${formatDuration(elapsed)}`
                  : (activeStage?.detail ?? activeDefinition?.description ?? '')}
              </span>
            </div>

            <Meter
              value={snapshot.overall}
              tone={isReady ? 'gold' : 'accent'}
              readout={`${Math.round(snapshot.overall * 100)}%`}
            />

            <BootLog entries={snapshot.logs} />

            {isReady && !fastBoot ? (
              <div className={styles.actions}>
                <Button variant="primary" onClick={enter} busy={entering}>
                  Enter console
                </Button>
                <span className={styles.hint}>Press Enter</span>
              </div>
            ) : null}
          </>
        )}
      </section>

      <footer className={styles.corner} data-corner="bl">
        <span className={styles.cornerValue}>HARMONY IS MAINTAINED</span>
      </footer>
    </motion.div>
  )
}
