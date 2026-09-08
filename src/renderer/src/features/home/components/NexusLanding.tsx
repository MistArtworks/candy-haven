import { useCallback, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react'
import { SECTIONS } from '@shared/domain/navigation'
import type { ArchiveState } from '@shared/domain/archive'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { formatDuration } from '@renderer/lib/format'
import { FOCUS_Y, GenesisField, type PointerLean } from './GenesisField'
import { MandalaRings } from './MandalaRings'
import styles from './NexusLanding.module.scss'

export interface NexusLandingProps {
  archiveState: ArchiveState
  archiveVersion: string | null
  latencyMs: number | null
  bootDurationMs: number | null
  appVersion: string | null
  /** Scrolls the overview into view. */
  onDescend: () => void
}

/**
 * Five resonance glyphs.
 *
 * Every reference board carries a row of these along its footer, and they are
 * all variations on one figure: a containment circle with a different internal
 * geometry. Built from a table rather than five hand-drawn files, because that
 * is what they are — one mark under transformation.
 */
const GLYPHS: { id: string; label: string; paths: ReactNode }[] = [
  {
    id: 'convergence',
    label: 'Convergence',
    paths: (
      <>
        <path d="M12 4 L12 20 M4 12 L20 12" />
        <path d="M12 7.5 L14.6 12 L12 16.5 L9.4 12 Z" />
      </>
    )
  },
  {
    id: 'frequency',
    label: 'Frequency',
    paths: (
      <>
        <path d="M5 12 Q8.5 6.5 12 12 T19 12" />
        <path d="M12 5.5 L12 8 M12 16 L12 18.5" />
      </>
    )
  },
  {
    id: 'structure',
    label: 'Structure',
    paths: (
      <>
        <path d="M12 5.5 L18.6 16.5 L5.4 16.5 Z" />
        <path d="M12 10.5 L12 16.5" />
      </>
    )
  },
  {
    id: 'harmony',
    label: 'Harmony',
    paths: (
      <>
        <circle cx="12" cy="9.6" r="3.4" />
        <circle cx="12" cy="14.4" r="3.4" />
      </>
    )
  },
  {
    id: 'convection',
    label: 'Convection',
    paths: (
      <>
        <path d="M12 5 A7 7 0 1 1 5.2 13.4" />
        <path d="M12 9.2 A2.8 2.8 0 1 0 14.8 12" />
      </>
    )
  }
]

/** The five materials of the world, in the brief's own order. */
const PALETTE = [
  { name: 'Obsidian', token: 'var(--ch-obsidian-800)' },
  { name: 'Concrete', token: 'var(--ch-concrete-500)' },
  { name: 'Aged brass', token: 'var(--ch-brass-600)' },
  { name: 'Brushed gold', token: 'var(--ch-gold-500)' },
  { name: 'Crimson glass', token: 'var(--ch-crimson-700)' },
  { name: 'Alabaster', token: 'var(--ch-alabaster-500)' }
]

const STATE_COPY: Record<ArchiveState, string> = {
  offline: 'The core is dark.',
  locating: 'Locating the archive runtime.',
  provisioning: 'Provisioning the archive runtime.',
  starting: 'The core is spinning up.',
  connecting: 'Opening the archive link.',
  online: 'All systems resonant.',
  degraded: 'Harmonic drift detected.',
  error: 'Collapse. The core has failed.'
}

/**
 * The landing.
 *
 * Composed to the single-focal-object rule the whole brief turns on — except
 * that here the focal object is an *absence*. A collapsing cloud winds into an
 * accretion disc around an event horizon that emits nothing, and a flat golden
 * mandala is laid over it. Everything visible describes the shape of the one
 * thing that is not.
 *
 * Three layers, back to front:
 *
 *   1. `GenesisField`  Canvas 2D — stars, nebula arms, infall, disc, horizon
 *   2. `MandalaRings`  SVG — five counter-rotating bands of sacred geometry
 *   3. this component  the institutional chrome: masthead, readouts, band
 *
 * The footer band is lifted directly from the boards, which all close the same
 * way: a caption bottom-left, a row of resonance glyphs, and a strip of the
 * locked palette.
 */
export function NexusLanding({
  archiveState,
  archiveVersion,
  latencyMs,
  bootDurationMs,
  appVersion,
  onDescend
}: NexusLandingProps): ReactNode {
  const sectionRef = useRef<HTMLElement>(null)
  // The project's own hook, not motion's `useReducedMotion`: this one honours
  // the in-app Motion control in Regulation as well as the OS setting.
  const animationsEnabled = useAnimationsEnabled()

  /*
   * Scroll-linked parallax.
   *
   * `offset` measures from the landing's top meeting the viewport's top, to its
   * bottom meeting the top — so progress runs 0..1 exactly as the hero leaves.
   * The layers move at different rates, which is what sells the depth: the hall
   * barely shifts, the orb lifts and dims, the chrome clears quickly.
   */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start']
  })

  /*
   * Cursor parallax.
   *
   * Two springs hold a normalised -1..1 pointer position. Springing them rather
   * than binding the raw value is the whole effect: the array should lean after
   * the cursor and settle, the way a heavy instrument on a gimbal would, not
   * snap to it frame by frame.
   *
   * The layers respond by different amounts and in different ways — the field
   * only slides, the armature also tilts in perspective — which is what reads
   * as depth between two flat surfaces.
   */
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)

  /*
   * The same cursor position, also written to a plain ref for the canvas.
   *
   * The scene inside it parallaxes its layers by different amounts, which has
   * to happen in the draw loop rather than as one transform on the element —
   * a single CSS transform can only pan the whole image, and a star field that
   * travels as far as the singularity is a pan, not depth. A ref keeps that
   * per-frame read off React's render path entirely.
   */
  const leanRef = useRef<PointerLean>({ x: 0, y: 0 })
  const leanX = useSpring(pointerX, { stiffness: 42, damping: 18, mass: 0.9 })
  const leanY = useSpring(pointerY, { stiffness: 42, damping: 18, mass: 0.9 })

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1

      pointerX.set(x)
      pointerY.set(y)
      leanRef.current = { x, y }
    },
    [pointerX, pointerY]
  )

  // Returning to rest when the cursor leaves, rather than holding the last
  // lean, keeps the composition symmetrical whenever it is not being touched.
  const onPointerLeave = useCallback(() => {
    pointerX.set(0)
    pointerY.set(0)
    leanRef.current = { x: 0, y: 0 }
  }, [pointerX, pointerY])

  const mandalaShiftX = useTransform(leanX, [-1, 1], [-26, 26])
  const mandalaShiftY = useTransform(leanY, [-1, 1], [-18, 18])
  const mandalaTiltY = useTransform(leanX, [-1, 1], [-7, 7])
  const mandalaTiltX = useTransform(leanY, [-1, 1], [6, -6])
  const mandalaSpin = useTransform(leanX, [-1, 1], [-3.5, 3.5])

  const fieldY = useTransform(scrollYProgress, [0, 1], ['0%', '12%'])
  const coreY = useTransform(scrollYProgress, [0, 1], ['0%', '-22%'])
  const coreScale = useTransform(scrollYProgress, [0, 1], [1, 1.14])
  const coreOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const chromeOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0])
  const chromeY = useTransform(scrollYProgress, [0, 1], ['0%', '-40%'])

  // With reduced motion the parallax is dropped entirely rather than damped:
  // a scroll-driven transform is exactly what the preference asks us not to do.
  const parallax = animationsEnabled
    ? {
        // Scroll only. Cursor parallax for this layer happens inside the
        // canvas, per element, so that the stars, the gas and the singularity
        // can travel by different amounts.
        field: { y: fieldY },
        core: {
          y: coreY,
          scale: coreScale,
          opacity: coreOpacity,
          x: mandalaShiftX,
          translateY: mandalaShiftY,
          rotate: mandalaSpin,
          rotateX: mandalaTiltX,
          rotateY: mandalaTiltY
        }
      }
    : {}

  const chrome = animationsEnabled ? { opacity: chromeOpacity, y: chromeY } : {}

  const unstable =
    archiveState !== 'online' && archiveState !== 'connecting' && archiveState !== 'starting'
  const tone = unstable ? 'unstable' : 'nominal'

  const commissioned = SECTIONS.filter((section) => section.implemented).length

  return (
    <section
      ref={sectionRef}
      className={styles.landing}
      // The focal point is published to CSS from the one place it is defined,
      // so the armature's anchor and the canvas's horizon are the same number.
      style={{ '--ch-focus-y': `${FOCUS_Y * 100}%` } as CSSProperties}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* ------------------------------------------------------------ layers */}

      <motion.div className={styles.fieldLayer} style={parallax.field}>
        <GenesisField tone={tone} leanRef={leanRef} />
      </motion.div>

      {/* Twin slabs. Pure CSS: they are silhouettes, and a silhouette does not
          need geometry — only an edge and a gradient. */}
      <div className={styles.monoliths} aria-hidden="true">
        <span className={styles.monolithLeft} />
        <span className={styles.monolithRight} />
      </div>

      {/*
        The anchor centres the array on the focal point and never animates; the
        layer inside it carries every transform. Keeping those on separate
        elements is what stops a motion-driven `transform` from clobbering the
        centring translate.
      */}
      <div className={styles.coreAnchor} aria-hidden="true">
        <motion.div className={styles.coreLayer} style={parallax.core}>
          <MandalaRings className={styles.mandala} />
        </motion.div>
      </div>

      {/* A cold wash over the lower half, so the type below the orb sits on
          something and the floor does not compete with it. */}
      <div className={styles.floorWash} aria-hidden="true" />

      {/* ------------------------------------------------------------ chrome */}

      <motion.div className={styles.chrome} style={chrome}>
        {/*
          Both corner labels live in one row.

          They were previously separate grid children both claiming `grid-row:
          1`, which auto-placed the second into an *implicit second column* —
          halving column one, so the masthead, band and descend all centred
          inside the left half of the page instead of the page.
        */}
        <div className={styles.corners}>
          <header className={styles.corner}>
            <span className={styles.cornerIndex}>01</span>
            <div>
              <p className={styles.cornerLabel}>Nexus</p>
              <p className={styles.cornerMeta}>
                brutalist · institutional · resonant
                <br />
                central node · harmonic distribution
              </p>
            </div>
          </header>

          <div className={styles.cornerRight}>
            <p className={styles.cornerLabel}>Sonoalchemy</p>
            <p className={styles.cornerMeta}>
              Science of resonance
              <br />
              Art of consciousness
            </p>
          </div>
        </div>

        <div className={styles.masthead}>
          <h1 className={styles.wordmark}>
            <span>Candy</span>
            <span className={styles.wordmarkGap} />
            <span>Haven</span>
          </h1>

          <p className={styles.statement}>{STATE_COPY[archiveState]}</p>

          <dl className={styles.readouts}>
            <div>
              <dt>Archive</dt>
              <dd data-unstable={unstable || undefined}>{archiveState.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{latencyMs !== null ? `${latencyMs}ms` : '—'}</dd>
            </div>
            <div>
              <dt>Boot</dt>
              <dd>{bootDurationMs !== null ? formatDuration(bootDurationMs) : '—'}</dd>
            </div>
            <div>
              <dt>Departments</dt>
              <dd>
                {commissioned} / {SECTIONS.length}
              </dd>
            </div>
          </dl>
        </div>

        {/* ------------------------------------------------- the boards' band */}

        <footer className={styles.band}>
          <p className={styles.caption}>
            We do not question
            <br />
            the shape of the universe.
          </p>

          <div className={styles.glyphs}>
            {GLYPHS.map((glyph) => (
              <svg
                key={glyph.id}
                className={styles.glyph}
                viewBox="0 0 24 24"
                fill="none"
                role="img"
                aria-label={glyph.label}
              >
                <title>{glyph.label}</title>
                <circle cx="12" cy="12" r="10.4" className={styles.glyphRing} />
                {glyph.paths}
              </svg>
            ))}
          </div>

          <div className={styles.rightCluster}>
            <div className={styles.palette} role="img" aria-label="The five materials">
              {PALETTE.map((material) => (
                <span
                  key={material.name}
                  className={styles.swatch}
                  style={{ background: material.token }}
                  title={material.name}
                />
              ))}
            </div>

            <p className={styles.stamp}>
              {archiveVersion ? `MONGODB ${archiveVersion}` : 'ARCHIVE OFFLINE'}
              {appVersion ? ` · BUILD ${appVersion}` : ''}
            </p>
          </div>
        </footer>

        <button type="button" className={styles.descend} onClick={onDescend}>
          <span className={styles.descendRule} aria-hidden="true" />
          <span className={styles.descendLabel}>Descend</span>
          <span className={styles.descendChevron} aria-hidden="true" />
        </button>
      </motion.div>
    </section>
  )
}
