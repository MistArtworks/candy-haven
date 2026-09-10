import { useEffect, useRef, type ReactNode } from 'react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import type { SceneProps } from './scenes'
import {
  TAU,
  aimCamera,
  createCamera,
  createPlexus,
  createStarShell,
  drawPlexus,
  drawStars,
  mountScene,
  onSphere,
  project,
  softSprite,
  stamp,
  tint,
  type PlexusNode,
  type Projected,
  type Star,
  type Vec3
} from './scene-kit'
import styles from '../GenesisField.module.scss'

/**
 * THE DETONATION — a nebula, moments after.
 *
 * Something the size of a star has just come apart. A shell of shocked gas is
 * still expanding through the frame, the debris is streaking outward along the
 * plane it blew out on, and the light has not finished arriving.
 *
 * The one scene of the four with no object in it at all — no world, no horizon,
 * no figure. It is the brief's *"we do not question the shape of the universe"*
 * taken at its word: an event, seen, with nothing to hold on to.
 *
 * ## Composition
 *
 * Framed to the reference: the energy lies in a band straight across the middle
 * of the frame, edge to edge, with the shell centred in it and darkness above
 * and below. That horizontal read is the whole picture, and it is why the
 * ejecta are biased along the plane rather than thrown evenly — an even
 * explosion is a ball, and a ball is not this.
 *
 * ## The shell
 *
 * Latitude rings and meridians in real 3D, expanding and thinning. Projected
 * point by point rather than fitted as ellipses, so it foreshortens correctly
 * as the camera drifts and the near half genuinely passes in front of the
 * ejecta while the far half passes behind.
 */

/** Seconds for one full cycle: detonation, expansion, and the next collapse. */
const CYCLE = 19

interface Ember extends Vec3 {
  vx: number
  vy: number
  vz: number
  /** Previous screen position, for the streak. */
  px: number
  py: number
  seen: boolean
  glow: number
  age: number
  life: number
}

export function DetonationScene({ tone, leanRef, className }: SceneProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationsEnabled = useAnimationsEnabled()

  const toneRef = useRef(tone)
  useEffect(() => {
    toneRef.current = tone
  }, [tone])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const camera = createCamera()
    const scratch: Projected = { x: 0, y: 0, scale: 0, depth: 0 }

    const spark = softSprite(32, 'goldHot', [
      [0, 1],
      [0.3, 0.42],
      [1, 0]
    ])
    const heart = softSprite(256, 'goldHot', [
      [0, 1],
      [0.1, 0.6],
      [0.32, 0.16],
      [1, 0]
    ])
    const bandCrimson = softSprite(256, 'crimson', [
      [0, 0.55],
      [0.4, 0.14],
      [1, 0]
    ])
    const bandGold = softSprite(256, 'gold', [
      [0, 0.5],
      [0.4, 0.13],
      [1, 0]
    ])

    let stars: Star[] = []
    let embers: Ember[] = []
    let filaments: PlexusNode[] = []
    let band: { at: number; size: number; sprite: HTMLCanvasElement; phase: number }[] = []

    /**
     * One piece of ejecta.
     *
     * Velocity is squashed hard in y and stretched in x, which is what puts the
     * debris in a plane. A uniform sphere of directions reads as a dandelion;
     * the reference is a *disc* seen edge-on, and this is that.
     */
    const makeEmber = (age: number): Ember => {
      const dir = onSphere(1)
      const speed = 240 + Math.random() * 620

      return {
        x: dir.x * 40,
        y: dir.y * 40,
        z: dir.z * 40,
        vx: dir.x * speed * 1.35,
        vy: dir.y * speed * 0.16,
        vz: dir.z * speed * 1.35,
        px: 0,
        py: 0,
        seen: false,
        glow: 0.35 + Math.random() * 0.65,
        age,
        life: 5 + Math.random() * 7
      }
    }

    const resize = (): void => {
      stars = createStarShell(300, 3000, 6000)
      embers = Array.from({ length: 900 }, () => makeEmber(Math.random()))

      // The plexus lives inside the shell: the resonance still holding the
      // remains together, which is the lore's whole claim about matter.
      filaments = createPlexus(96, () => onSphere(220 + Math.random() * 620))

      // The band, as a row of overlapping sprites across the full width.
      band = Array.from({ length: 15 }, (_, i) => ({
        at: i / 14,
        size: 0.34 + Math.random() * 0.3,
        sprite: i % 2 === 0 ? bandCrimson : bandGold,
        phase: Math.random() * TAU
      }))
    }

    const teardown = mountScene(canvas, {
      animated: animationsEnabled,
      leanRef,
      toneRef,
      onResize: resize,
      onFrame: ({ context, width, height, elapsed, delta, leanX, leanY, intensity }) => {
        const centreX = width * 0.5 - leanX * 30
        const centreY = height * 0.5 - leanY * 20

        /*
         * The cycle, derived from the clock rather than scheduled.
         *
         * `pulse` peaks at the instant of detonation and decays; `bloom` is the
         * shell's radius, easing out so it leaves fast and then slows, which is
         * what reads as something enormous rather than something quick.
         */
        const phase = (elapsed % CYCLE) / CYCLE
        const pulse = Math.pow(1 - phase, 5)
        const bloom = 1 - Math.pow(1 - phase, 2.6)

        aimCamera(camera, {
          yaw: elapsed * 0.035 + leanX * 0.09,
          pitch: 0.06 * Math.sin(elapsed * 0.02) + leanY * 0.06,
          focal: Math.min(width, height) * 1.25,
          originX: centreX,
          originY: centreY,
          distance: 1700
        })

        context.globalCompositeOperation = 'lighter'

        drawStars(context, camera, stars, spark, elapsed, intensity, scratch)

        // ------------------------------------------------------------- the band

        /*
         * Laid across the frame before anything else, so the shell and the
         * ejecta sit *in* it rather than on top of it.
         *
         * Each sprite is stretched horizontally with a non-uniform draw, which
         * is one blit — building an elliptical gradient per sprite per frame
         * would cost fifteen gradients a frame for the same result.
         */
        for (const piece of band) {
          const breath = 0.7 + 0.3 * Math.sin(elapsed * 0.5 + piece.phase)
          // Brightest in the middle, tailing off to the edges of the frame.
          const fromCentre = Math.abs(piece.at - 0.5) * 2
          const strength = (1 - fromCentre * 0.72) * breath * (0.45 + pulse * 0.55)
          const w = width * piece.size * 1.5
          const h = height * piece.size * 0.42

          context.globalAlpha = Math.min(strength * intensity, 1)
          context.drawImage(
            piece.sprite,
            piece.at * width - w / 2 - leanX * 12,
            centreY - h / 2 - leanY * 8,
            w,
            h
          )
        }
        context.globalAlpha = 1

        // ------------------------------------------------------------ the ejecta

        context.lineCap = 'round'

        for (const ember of embers) {
          ember.age += delta / ember.life
          if (ember.age >= 1) {
            Object.assign(ember, makeEmber(0))
            continue
          }

          ember.x += ember.vx * delta
          ember.y += ember.vy * delta
          ember.z += ember.vz * delta

          const p = project(camera, ember.x, ember.y, ember.z, scratch)
          if (!p) {
            ember.seen = false
            continue
          }

          const fade = Math.min(ember.age * 8, 1) * (1 - Math.pow(ember.age, 2))
          const alpha = ember.glow * fade * (0.5 + pulse * 0.5) * intensity

          // The streak: a line back to where it was last frame, which is a
          // true motion blur for the cost of one stroke and needs no history.
          if (ember.seen && alpha > 0.01) {
            context.strokeStyle = tint('goldHot', alpha * 0.55)
            context.lineWidth = Math.max(p.scale * 2.2, 0.5)
            context.beginPath()
            context.moveTo(ember.px, ember.py)
            context.lineTo(p.x, p.y)
            context.stroke()
          }

          stamp(context, spark, p.x, p.y, Math.max(spark.width * p.scale * 0.7, 1), alpha)

          ember.px = p.x
          ember.py = p.y
          ember.seen = true
        }

        // ------------------------------------------------------------ the shell

        /*
         * Latitude rings and meridians, in world space.
         *
         * Drawn as polylines through projected points. A projected circle on a
         * tilted sphere is not an ellipse, so fitting one would be both harder
         * and wrong; sampling the real curve foreshortens correctly for free
         * and lets the near half cross in front of the ejecta.
         */
        const shell = 240 + bloom * 1500
        const thinning = Math.pow(1 - phase, 1.5)

        context.lineWidth = Math.max(Math.min(width, height) / 850, 0.6)

        for (let ring = 1; ring < 9; ring += 1) {
          const lat = -Math.PI / 2 + (ring / 9) * Math.PI
          const r = Math.cos(lat) * shell
          const y = Math.sin(lat) * shell

          context.beginPath()
          let started = false
          for (let i = 0; i <= 60; i += 1) {
            const angle = (i / 60) * TAU
            const p = project(camera, Math.cos(angle) * r, y, Math.sin(angle) * r, scratch)
            if (!p) {
              started = false
              continue
            }
            if (started) context.lineTo(p.x, p.y)
            else {
              context.moveTo(p.x, p.y)
              started = true
            }
          }
          context.strokeStyle = tint('crimsonHot', 0.38 * thinning * intensity)
          context.stroke()
        }

        for (let meridian = 0; meridian < 14; meridian += 1) {
          const lon = (meridian / 14) * TAU
          context.beginPath()
          let started = false
          for (let i = 0; i <= 40; i += 1) {
            const lat = -Math.PI / 2 + (i / 40) * Math.PI
            const r = Math.cos(lat) * shell
            const p = project(
              camera,
              Math.cos(lon) * r,
              Math.sin(lat) * shell,
              Math.sin(lon) * r,
              scratch
            )
            if (!p) {
              started = false
              continue
            }
            if (started) context.lineTo(p.x, p.y)
            else {
              context.moveTo(p.x, p.y)
              started = true
            }
          }
          context.strokeStyle = tint('gold', 0.24 * thinning * intensity)
          context.stroke()
        }

        /*
         * A second front, behind the first.
         *
         * One expanding ring reads as a diagram of an explosion. Two at
         * different radii read as a blast with a thickness to it — the outer
         * shock and the slower ejecta wall following it out.
         */
        const inner = 120 + bloom * 780
        context.lineWidth = Math.max(Math.min(width, height) / 1100, 0.5)
        for (let ring = 1; ring < 6; ring += 1) {
          const lat = -Math.PI / 2 + (ring / 6) * Math.PI
          const r = Math.cos(lat) * inner
          const y = Math.sin(lat) * inner

          context.beginPath()
          let started = false
          for (let i = 0; i <= 48; i += 1) {
            const angle = (i / 48) * TAU
            const p = project(camera, Math.cos(angle) * r, y, Math.sin(angle) * r, scratch)
            if (!p) {
              started = false
              continue
            }
            if (started) context.lineTo(p.x, p.y)
            else {
              context.moveTo(p.x, p.y)
              started = true
            }
          }
          context.strokeStyle = tint('goldHot', 0.2 * thinning * intensity)
          context.stroke()
        }

        // --------------------------------------------------------- the filaments

        drawPlexus(context, camera, filaments, spark, {
          reach: 380,
          elapsed,
          intensity,
          line: 'goldLit',
          node: 'goldHot',
          strength: 0.6 + pulse * 0.6,
          scratch
        })

        // -------------------------------------------------------------- the heart

        // What is left at the middle, brightest at the moment of the blast.
        const core = project(camera, 0, 0, 0, scratch)
        if (core) {
          const size = Math.min(width, height) * (0.34 + pulse * 0.5) * core.scale
          stamp(context, heart, core.x, core.y, size, (0.5 + pulse * 0.5) * intensity)

          // A hard white-hot centre for the first instant only.
          if (pulse > 0.05) {
            context.fillStyle = tint('goldHot', pulse * 0.85 * intensity)
            context.beginPath()
            context.arc(core.x, core.y, Math.min(width, height) * 0.012 * pulse * 6, 0, TAU)
            context.fill()
          }
        }

        context.globalCompositeOperation = 'source-over'
      }
    })

    return teardown
  }, [animationsEnabled, leanRef])

  return <canvas ref={canvasRef} className={className ?? styles.field} aria-hidden="true" />
}
