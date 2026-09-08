import { useEffect, useRef, type ReactNode } from 'react'
import { animate, stagger } from 'animejs'
import { BOOT_STAGES } from '@shared/domain/boot.constants'
import type { BootSnapshot, BootStageStatus } from '@shared/domain/boot'
import { Logomark } from '@renderer/components/sigil/Logomark'
import { ResonanceWeb } from './ResonanceWeb'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import styles from './BootRing.module.scss'

const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = 132

/** Polar-to-cartesian on the ring, with 12 o'clock as zero. */
function pointOnRing(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius
  }
}

function toneFor(status: BootStageStatus): string {
  switch (status) {
    case 'complete':
      return styles.complete
    case 'active':
      return styles.active
    case 'failed':
      return styles.failed
    case 'skipped':
      return styles.skipped
    default:
      return styles.pending
  }
}

/**
 * The boot sequence rendered as a ring of stage ticks around a crimson focal
 * orb — the composition rule of the reference boards (one suspended object in a
 * symmetrical field) applied to a progress display.
 *
 * Each tick is one real boot stage. anime.js drives the tick stagger on mount
 * and the pulse when a stage completes; everything else is CSS state.
 */
export function BootRing({ snapshot }: { snapshot: BootSnapshot }): ReactNode {
  const ticksRef = useRef<SVGGElement>(null)
  const animationsEnabled = useAnimationsEnabled()
  const completedRef = useRef(0)

  const total = BOOT_STAGES.length
  const completed = snapshot.stages.filter(
    (stage) => stage.status === 'complete' || stage.status === 'skipped'
  ).length

  // Entrance: ticks resolve outward from the centre, staggered around the ring.
  useEffect(() => {
    if (!animationsEnabled || !ticksRef.current) return

    const nodes = ticksRef.current.querySelectorAll(`.${styles.tickGroup}`)
    const animation = animate(nodes, {
      opacity: [0, 1],
      scale: [0.4, 1],
      duration: 700,
      delay: stagger(55, { start: 220 }),
      ease: 'outExpo'
    })

    return () => {
      animation.pause()
    }
  }, [animationsEnabled])

  // Each newly completed stage pulses its tick once — a discrete confirmation
  // rather than continuous ambient motion.
  useEffect(() => {
    if (!animationsEnabled || !ticksRef.current) return
    if (completed <= completedRef.current) {
      completedRef.current = completed
      return
    }
    completedRef.current = completed

    const node = ticksRef.current.querySelector(`[data-tick-index="${completed - 1}"]`)
    if (!node) return

    const animation = animate(node, {
      scale: [1, 1.55, 1],
      duration: 620,
      ease: 'outElastic(1, 0.6)'
    })

    return () => {
      animation.pause()
    }
  }, [completed, animationsEnabled])

  const progressCircumference = 2 * Math.PI * (RADIUS - 22)

  return (
    <div className={styles.wrapper}>
      {/* The focal orb. Sits behind the ring, glowing through it. */}
      <div className={styles.orb} data-phase={snapshot.phase}>
        <span className={styles.orbCore} />
        <span className={styles.orbGlow} />
      </div>

      <svg
        className={styles.ring}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
      >
        {/* Structural rings */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS} className={styles.guide} />
        <circle cx={CENTER} cy={CENTER} r={RADIUS - 22} className={styles.guideFaint} />

        {/* Weighted overall progress, drawn as an arc from 12 o'clock */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS - 22}
          className={styles.progress}
          strokeDasharray={progressCircumference}
          strokeDashoffset={progressCircumference * (1 - snapshot.overall)}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />

        <g ref={ticksRef}>
          {BOOT_STAGES.map((stage, index) => {
            const state = snapshot.stages.find((entry) => entry.id === stage.id)
            const status = state?.status ?? 'pending'
            const outer = pointOnRing(index, total, RADIUS + 9)
            const inner = pointOnRing(index, total, RADIUS - 9)

            return (
              <g
                key={stage.id}
                className={`${styles.tickGroup} ${toneFor(status)}`}
                data-tick-index={index}
                style={{ transformOrigin: `${outer.x}px ${outer.y}px` }}
              >
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className={styles.tick} />
                <circle cx={outer.x} cy={outer.y} r={2.6} className={styles.tickDot} />
              </g>
            )
          })}
        </g>
      </svg>

      {/* The Candy Haven mark, suspended at the centre of the orb. It turns
          continuously while the sequence runs and settles once ready — the
          vortex is the visual of resonance being gathered. */}
      {/* The resonance field: a rotating point-cloud web wrapping the orb */}
      <ResonanceWeb phase={snapshot.phase} size={340} className={styles.webLayer} />

      <div className={styles.sigil} data-phase={snapshot.phase}>
        <Logomark width={132} />
      </div>
    </div>
  )
}
