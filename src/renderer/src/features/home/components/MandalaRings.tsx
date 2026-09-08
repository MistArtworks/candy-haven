import { useEffect, useRef, type ReactNode } from 'react'
import { animate, stagger } from 'animejs'
import { SECTIONS } from '@shared/domain/navigation'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import styles from './MandalaRings.module.scss'

export interface MandalaRingsProps {
  className?: string
}

/*
 * A square, 0-based viewBox with an explicit centre.
 *
 * It was `-200 -200 400 400` at first, which left `transform-origin: center`
 * dependent on how the reference box resolves for an SVG group — and the bands
 * rotated about a point that was not the horizon. With a 0-based box, `center`,
 * `50% 50%` and `SIZE / 2` are all the same coordinate, so no interpretation
 * can put the rotation anywhere else.
 */
const SIZE = 400
const C = SIZE / 2

function polar(radius: number, degrees: number): { x: number; y: number } {
  // -90 puts zero at the top, which is where a dial's origin belongs.
  const radians = ((degrees - 90) * Math.PI) / 180
  return { x: C + Math.cos(radians) * radius, y: C + Math.sin(radians) * radius }
}

/** Path for a circular arc, used for the broken outer bands. */
function arc(radius: number, fromDegrees: number, toDegrees: number): string {
  const from = polar(radius, fromDegrees)
  const to = polar(radius, toDegrees)
  const large = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
}

const ARC_SPANS: [number, number][] = [
  [4, 82],
  [98, 158],
  [186, 262],
  [278, 344]
]

const ARC_ENDS = [4, 82, 98, 158, 186, 262, 278, 344]

/**
 * Sigil marks set around a band.
 *
 * Twelve variations on one figure, so the ring reads as an inscription rather
 * than as a repeated stamp. Each is drawn in a local 0,0-centred frame and
 * placed by transform, which keeps the geometry legible in source.
 */
const SIGILS: string[] = [
  'M-3 -3 L3 3 M3 -3 L-3 3',
  'M0 -4 L0 4 M-3 0 L3 0',
  'M0 -4 L3.4 2 L-3.4 2 Z',
  'M-3 -2 L3 -2 L0 3.4 Z',
  'M0 -4 L2 0 L0 4 L-2 0 Z',
  'M-3.4 0 A3.4 3.4 0 0 1 3.4 0',
  'M-3 -3 H3 V3 H-3 Z',
  'M0 -4 V4 M-2.6 -2 L2.6 2 M2.6 -2 L-2.6 2',
  'M-3.6 -1.4 H3.6 M-2.2 1.8 H2.2',
  'M0 -3.6 L0 1 M-2.6 1 L2.6 1 M0 1 L0 3.6',
  'M-3.4 2.4 A4 4 0 0 1 3.4 2.4 M0 -1.6 V2.4',
  'M0 -4 L0 -1 M0 1 L0 4 M-4 0 L-1 0 M1 0 L4 0'
]

/** One SVG per band, so each band can carry its own 3D transform. */
function Plate({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg className={styles.plate} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

/**
 * The mandala.
 *
 * Five concentric bands around the singularity, each tumbling on its own axis
 * in real perspective — an armillary sphere over an accretion disc. The ribbed
 * golden portal of the OMEGA CORE board crossed with the sacred-geometry
 * diagram of ESOTERIC RETROFUTURISM.
 *
 * **Each band is its own `<svg>` inside its own HTML wrapper**, and that
 * structure is load-bearing rather than incidental. CSS 3D transforms are not
 * reliable on `<g>` elements inside a single SVG: SVG children do not establish
 * a 3D rendering context, so `perspective` on an ancestor is ignored and a
 * `rotateX` degenerates into a flat skew. Promoting each band to its own SVG in
 * a `div` gives every band a real 3D context, at the cost of six elements
 * sharing one viewBox and one centre.
 *
 * The bands tumble by *precession*: each holds a fixed tilt while its rotation
 * about the vertical sweeps, which is what opens and closes the ellipse. A ring
 * spinning about its own normal would be just as three-dimensional and yet look
 * completely static, because a circle rotated within its own plane is
 * unchanged. Each band also keeps a slow in-plane spin of its graduations, so
 * ticks and sigils travel around a ring that is itself turning.
 *
 * One thing here is not ornament: the seven markers on the register band are
 * the seven departments, gold where a department is in service and faint where
 * it is still reserved. Same principle as the boot ring carrying one tick per
 * boot stage — the geometry states something true, so the mark can be read.
 */
export function MandalaRings({ className }: MandalaRingsProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    if (!animationsEnabled) return
    const root = rootRef.current
    if (!root) return

    // Entrance: the graduated ticks resolve around the dial, then the sigils
    // strike in, then the department markers settle. anime.js drives it because
    // this is a stagger over ~100 SVG primitives, which is what it is best at.
    // The queries span every band, since those are now separate SVGs.
    const ticks = animate(root.querySelectorAll(`.${styles.tick}`), {
      opacity: [0, 1],
      duration: 560,
      delay: stagger(7, { start: 120 }),
      ease: 'outQuad'
    })

    const sigils = animate(root.querySelectorAll(`.${styles.sigil}`), {
      opacity: [0, 1],
      duration: 700,
      delay: stagger(46, { start: 620 }),
      ease: 'outExpo'
    })

    const markers = animate(root.querySelectorAll(`.${styles.marker}`), {
      opacity: [0, 1],
      duration: 820,
      delay: stagger(84, { start: 1150 }),
      ease: 'outExpo'
    })

    return () => {
      ticks.pause()
      sigils.pause()
      markers.pause()
    }
  }, [animationsEnabled])

  return (
    <div
      ref={rootRef}
      className={[styles.rings, className ?? ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {/* --------------------------------------------- band 1 · graduated dial */}
      <div className={`${styles.band} ${styles.bandDial}`}>
        <Plate>
          <g className={styles.spinSlow}>
            <circle className={styles.ringHair} cx={C} cy={C} r={192} />
            <circle className={styles.ringFaint} cx={C} cy={C} r={183} />

            <g className={styles.ticks}>
              {Array.from({ length: 96 }, (_, index) => {
                const degrees = (index / 96) * 360
                const major = index % 8 === 0
                const inner = polar(major ? 172 : 178, degrees)
                const outer = polar(183, degrees)

                return (
                  <line
                    key={degrees}
                    className={styles.tick}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    strokeWidth={major ? 1.2 : 0.5}
                    opacity={major ? 0.6 : 0.26}
                  />
                )
              })}
            </g>
          </g>
        </Plate>
      </div>

      {/* ----------------------------------------------- band 2 · broken arcs */}
      <div className={`${styles.band} ${styles.bandArcs}`}>
        <Plate>
          <g className={styles.spinMedium}>
            {ARC_SPANS.map(([from, to]) => (
              <path key={from} className={styles.arcHeavy} d={arc(163, from, to)} />
            ))}

            {/* Terminators at each arc end, as the boards cap their ribbing. */}
            {ARC_ENDS.map((degrees) => {
              const at = polar(163, degrees)
              const out = polar(170, degrees)
              return (
                <line
                  key={degrees}
                  className={styles.arcCap}
                  x1={at.x}
                  y1={at.y}
                  x2={out.x}
                  y2={out.y}
                />
              )
            })}
          </g>
        </Plate>
      </div>

      {/* --------------------------------------------- band 3 · the sigil ring */}
      <div className={`${styles.band} ${styles.bandSigils}`}>
        <Plate>
          <g className={styles.spinSlowReverse}>
            <circle className={styles.ringDashed} cx={C} cy={C} r={140} />

            {SIGILS.map((path, index) => {
              const degrees = (index / SIGILS.length) * 360
              const at = polar(140, degrees)
              return (
                <g
                  key={path}
                  className={styles.sigil}
                  // Rotated to face outward, so the inscription runs around the
                  // band rather than every mark standing upright.
                  transform={`translate(${at.x.toFixed(2)} ${at.y.toFixed(2)}) rotate(${degrees})`}
                >
                  <path d={path} />
                </g>
              )
            })}
          </g>
        </Plate>
      </div>

      {/* ---------------------------------------- band 4 · department register */}
      <div className={`${styles.band} ${styles.bandRegister}`}>
        <Plate>
          <g className={styles.spinMediumReverse}>
            <circle className={styles.ringHair} cx={C} cy={C} r={112} />

            {SECTIONS.map((section, index) => {
              // Distributed in registry order, so the arrangement matches the rail.
              const degrees = (index / SECTIONS.length) * 360
              const at = polar(112, degrees)
              const spoke = polar(103, degrees)

              return (
                <g
                  key={section.id}
                  className={styles.marker}
                  data-live={section.implemented || undefined}
                >
                  <line
                    className={styles.markerSpoke}
                    x1={spoke.x}
                    y1={spoke.y}
                    x2={at.x}
                    y2={at.y}
                  />
                  <circle className={styles.markerRing} cx={at.x} cy={at.y} r={5} />
                  <circle className={styles.markerCore} cx={at.x} cy={at.y} r={1.8} />
                </g>
              )
            })}
          </g>
        </Plate>
      </div>

      {/* ---------------------------------------- band 5 · inner containment */}
      <div className={`${styles.band} ${styles.bandInner}`}>
        <Plate>
          <g className={styles.spinFastReverse}>
            <circle className={styles.ringFaint} cx={C} cy={C} r={86} />

            {/* Two opposed triangles — the convergence figure of the Sonoalchemy
                mark, restated at portal scale. */}
            <path className={styles.figure} d="M200 122 L267.5 239 L132.5 239 Z" />
            <path className={styles.figure} d="M200 278 L132.5 161 L267.5 161 Z" />
          </g>
        </Plate>
      </div>

      {/* The axes the array is measured against. Left flat and unrotated, so
          there is one fixed reference among the tumbling bands. */}
      <div className={styles.band}>
        <Plate>
          <g className={styles.axes}>
            <line x1={C - 192} y1={C} x2={C - 86} y2={C} />
            <line x1={C + 86} y1={C} x2={C + 192} y2={C} />
            <line x1={C} y1={C - 192} x2={C} y2={C - 86} />
            <line x1={C} y1={C + 86} x2={C} y2={C + 192} />
          </g>
        </Plate>
      </div>
    </div>
  )
}
