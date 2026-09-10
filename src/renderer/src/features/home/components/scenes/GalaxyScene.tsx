import { useEffect, useRef, type ReactNode } from 'react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import type { SceneProps } from './scenes'
import {
  TAU,
  aimCamera,
  createCamera,
  createStarShell,
  drawStars,
  onSphere,
  mountScene,
  project,
  softSprite,
  stamp,
  tint,
  type Projected,
  type Star,
  type Vec3
} from './scene-kit'
import styles from '../GenesisField.module.scss'

/**
 * THE GALAXY — a barred spiral, wired.
 *
 * A whole galaxy seen from above and to one side, turning. Two logarithmic arms
 * off a central bar, a bright bulge, dust lanes cutting the arms, a halo of old
 * stars around it — and a resonance plexus threaded through the entire disc.
 *
 * The plexus is the point rather than the decoration. The lore's one biological
 * claim is that every living thing shares an underlying frequency; the
 * OBSERVATORY exists for "cosmic observation and planetary surveillance". A
 * galaxy drawn as a *network* — nodes across the arms, joined where they are
 * close, light travelling between them — is those two ideas in one picture:
 * something enormous, and something being watched by an institution that has
 * already mapped it.
 *
 * ## How it is built
 *
 * Everything is a real 3D point on a disc, projected. The arms are a
 * logarithmic spiral with scatter that grows outward, so they fray at the rim
 * the way a real one does instead of staying a clean curve. The disc turns
 * about its own axis independently of the camera, so the arms sweep while the
 * viewpoint drifts.
 *
 * Depth does the rest: nearer stars are larger and brighter, the far side of
 * the halo sits behind the bulge, and the near arm passes in front of it. None
 * of that is sorted or z-buffered — the field is additive, so it commutes, and
 * only the dust lanes are drawn as an occluder.
 */

/** Radius of the disc in world units. Everything else is sized against it. */
const DISC = 1250

/** How far the galaxy is tipped toward the viewer. Near the reference's angle. */
const TILT = 0.62

interface Grain extends Vec3 {
  glow: number
  /** Distance from the middle, 0..1. Drives colour and size. */
  t: number
  phase: number
}

interface Node extends Vec3 {
  glow: number
  phase: number
  screenX: number
  screenY: number
  screenScale: number
  visible: boolean
}

interface Lane {
  /** Sampled points along the lane, on the disc plane. */
  points: Vec3[]
  alpha: number
}

export function GalaxyScene({ tone, leanRef, className }: SceneProps): ReactNode {
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
    const emberSprite = softSprite(32, 'crimsonHot', [
      [0, 1],
      [0.3, 0.4],
      [1, 0]
    ])
    const bulge = softSprite(256, 'goldLit', [
      [0, 0.85],
      [0.16, 0.34],
      [0.44, 0.08],
      [1, 0]
    ])
    const haze = softSprite(256, 'brass', [
      [0, 0.34],
      [0.42, 0.1],
      [1, 0]
    ])
    const emberHaze = softSprite(256, 'crimson', [
      [0, 0.3],
      [0.42, 0.09],
      [1, 0]
    ])
    // Star-forming knots: the crimson beads strung along a real spiral arm.
    const nursery = softSprite(128, 'crimsonHot', [
      [0, 0.8],
      [0.18, 0.3],
      [0.5, 0.07],
      [1, 0]
    ])
    // Globular clusters: old stars in the halo, off the disc entirely.
    const cluster = softSprite(96, 'alabasterLit', [
      [0, 0.7],
      [0.2, 0.24],
      [1, 0]
    ])
    // A node's own halo, so the network reads over a bright disc.
    const nodeGlow = softSprite(96, 'goldHot', [
      [0, 0.85],
      [0.18, 0.28],
      [1, 0]
    ])

    let stars: Star[] = []
    let grains: Grain[] = []
    let nodes: Node[] = []
    let lanes: Lane[] = []
    let clouds: { p: Vec3; size: number; sprite: HTMLCanvasElement; phase: number }[] = []
    let nurseries: { p: Vec3; size: number; phase: number }[] = []
    let clusters: { p: Vec3; size: number; glow: number }[] = []
    let bar: Vec3[] = []

    /**
     * A point on the spiral.
     *
     * `angle = t * SWEEP` with radius growing as a power of `t` is a
     * logarithmic spiral, which is the shape a real galaxy's arms take. The
     * scatter grows with radius because the arms are a density wave rather than
     * a solid structure — tight at the bar, ragged at the rim.
     */
    const onArm = (t: number, arm: number, scatter: number): Vec3 => {
      const radius = 130 + Math.pow(t, 0.78) * DISC
      const angle = arm + t * 4.1
      const spread = (0.06 + t * 0.34) * scatter

      return {
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * radius * spread,
        // The disc has thickness, and it flares outward.
        y: (Math.random() - 0.5) * (46 + t * 120),
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * radius * spread
      }
    }

    const resize = (): void => {
      stars = createStarShell(260, 3200, 6400)

      /*
       * The disc: mostly arm stars, with a scattering between them.
       *
       * `pow(random, 0.55)` biases outward, which counteracts the fact that an
       * even spread in `t` crowds the middle once the radius is a power of it.
       */
      grains = Array.from({ length: 4200 }, (_, i) => {
        const inArm = i % 5 !== 0
        const t = Math.pow(Math.random(), 0.55)
        const arm = (i % 2) * Math.PI
        const point = inArm ? onArm(t, arm, 1) : onArm(t, Math.random() * TAU, 3.6)

        return {
          ...point,
          t,
          glow: (inArm ? 0.4 : 0.22) + Math.random() * 0.6,
          phase: Math.random() * TAU
        }
      })

      /*
       * The plexus, laid across the whole disc.
       *
       * Deliberately many, and deliberately spread by the same spiral the stars
       * follow — so the network sits *on* the arms rather than floating over
       * them as an unrelated lattice. The count is what the operator asked for:
       * the disc should read as wired, not as sprinkled.
       */
      nodes = Array.from({ length: 210 }, (_, i) => {
        const t = Math.pow(Math.random(), 0.62)
        const arm = (i % 2) * Math.PI
        return {
          ...onArm(t, arm, 1.6),
          glow: 0.45 + Math.random() * 0.55,
          phase: Math.random() * TAU,
          screenX: 0,
          screenY: 0,
          screenScale: 0,
          visible: false
        }
      })

      // Dust lanes, tracing just inside each arm — the dark side of the same
      // density wave that piles the stars up.
      lanes = [0, Math.PI].map((arm) => ({
        alpha: 0.5,
        points: Array.from({ length: 46 }, (_, i) => {
          const t = i / 45
          const radius = 150 + Math.pow(t, 0.78) * DISC
          const angle = arm + t * 4.1 - 0.16
          return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius }
        })
      }))

      /*
       * The bar.
       *
       * A barred spiral, which is what ours is — the arms spring from the ends
       * of a straight bar through the middle rather than from the nucleus. It
       * is the single feature that most distinguishes this shape from a
       * pinwheel, and it costs one line of stars.
       */
      bar = Array.from({ length: 420 }, () => {
        const along = (Math.random() - 0.5) * 2
        return {
          x: along * 430 + (Math.random() - 0.5) * 90,
          y: (Math.random() - 0.5) * 60,
          z: (Math.random() - 0.5) * 150
        }
      })

      // Star-forming regions: crimson beads strung along the arms, which is
      // where a real galaxy's young stars actually are.
      nurseries = Array.from({ length: 60 }, (_, i) => {
        const t = 0.12 + Math.random() * 0.88
        return {
          p: onArm(t, (i % 2) * Math.PI, 0.5),
          size: 60 + Math.random() * 150,
          phase: Math.random() * TAU
        }
      })

      // Globular clusters, off the disc: the old halo population.
      clusters = Array.from({ length: 26 }, () => {
        const point = onSphere(700 + Math.random() * 1500)
        return { p: point, size: 26 + Math.random() * 46, glow: 0.4 + Math.random() * 0.6 }
      })

      // Gas along the arms, giving the disc some body between the points.
      clouds = Array.from({ length: 66 }, (_, i) => {
        const t = Math.pow(Math.random(), 0.6)
        return {
          p: onArm(t, (i % 2) * Math.PI, 1.2),
          size: 240 + Math.random() * 420,
          // Crimson toward the middle where it is hot, brass further out.
          sprite: t < 0.42 ? emberHaze : haze,
          phase: Math.random() * TAU
        }
      })
    }

    /** Rotates a disc point by the galaxy's own spin, then by its tilt. */
    const place = (p: Vec3, cos: number, sin: number, out: Vec3): Vec3 => {
      const x = p.x * cos - p.z * sin
      const z = p.x * sin + p.z * cos
      out.x = x
      out.y = p.y * Math.cos(TILT) - z * Math.sin(TILT)
      out.z = p.y * Math.sin(TILT) + z * Math.cos(TILT)
      return out
    }

    const worldScratch: Vec3 = { x: 0, y: 0, z: 0 }

    const teardown = mountScene(canvas, {
      animated: animationsEnabled,
      leanRef,
      toneRef,
      onResize: resize,
      onFrame: ({ context, width, height, elapsed, leanX, leanY, intensity }) => {
        // Differential rotation would be more correct and looks worse: the arms
        // wind up into a spring within a minute. One rigid spin, very slow.
        const spin = elapsed * 0.028
        const cos = Math.cos(spin)
        const sin = Math.sin(spin)

        aimCamera(camera, {
          // The camera drifts a little of its own accord, so the view is never
          // quite the same twice even before the cursor moves it.
          yaw: 0.35 + elapsed * 0.008 + leanX * 0.1,
          pitch: 0.05 + 0.03 * Math.sin(elapsed * 0.015) + leanY * 0.07,
          focal: Math.min(width, height) * 1.5,
          originX: width * 0.5 - leanX * 26,
          originY: height * 0.46 - leanY * 18,
          distance: 2900
        })

        context.globalCompositeOperation = 'lighter'

        drawStars(context, camera, stars, spark, elapsed, intensity, scratch)

        // -------------------------------------------------------------- the gas

        for (const cloud of clouds) {
          const w = place(cloud.p, cos, sin, worldScratch)
          const p = project(camera, w.x, w.y, w.z, scratch)
          if (!p) continue

          const breath = 0.75 + 0.25 * Math.sin(elapsed * 0.14 + cloud.phase)
          stamp(
            context,
            cloud.sprite,
            p.x,
            p.y,
            cloud.size * p.scale * 2.6,
            0.5 * breath * intensity
          )
        }

        // ------------------------------------------------------------ the bar

        for (const point of bar) {
          const w = place(point, cos, sin, worldScratch)
          const p = project(camera, w.x, w.y, w.z, scratch)
          if (!p) continue
          stamp(
            context,
            spark,
            p.x,
            p.y,
            Math.max(spark.width * p.scale * 0.72, 1),
            0.4 * intensity
          )
        }

        // ------------------------------------------------------------ the bulge

        const middle = project(camera, 0, 0, 0, scratch)
        if (middle) {
          stamp(context, bulge, middle.x, middle.y, DISC * 1.5 * middle.scale, 0.72 * intensity)
        }

        // ------------------------------------------------------------- the disc

        for (const grain of grains) {
          const w = place(grain, cos, sin, worldScratch)
          const p = project(camera, w.x, w.y, w.z, scratch)
          if (!p) continue

          const twinkle = 0.7 + 0.3 * Math.sin(elapsed * 0.9 + grain.phase)
          // Hot and crimson at the middle, cooling to gold and then to the pale
          // old stars of the rim — a real colour gradient, in the house palette.
          const sprite = grain.t < 0.2 ? emberSprite : spark
          const size = Math.max(spark.width * p.scale * (0.5 + (1 - grain.t) * 0.5), 0.9)

          stamp(context, sprite, p.x, p.y, size, grain.glow * twinkle * 0.42 * intensity)
        }

        // ------------------------------------------------------- the nurseries

        for (const knot of nurseries) {
          const w = place(knot.p, cos, sin, worldScratch)
          const p = project(camera, w.x, w.y, w.z, scratch)
          if (!p) continue

          const flare = 0.7 + 0.3 * Math.sin(elapsed * 0.6 + knot.phase)
          stamp(context, nursery, p.x, p.y, knot.size * p.scale * 3, 0.5 * flare * intensity)
        }

        // --------------------------------------------------------- the clusters

        for (const globe of clusters) {
          const p = project(camera, globe.p.x, globe.p.y, globe.p.z, scratch)
          if (!p) continue
          stamp(
            context,
            cluster,
            p.x,
            p.y,
            globe.size * p.scale * 3.4,
            globe.glow * 0.4 * intensity
          )
        }

        // -------------------------------------------------------- the dust lanes

        /*
         * The only occluding pass in the scene.
         *
         * Everything else is additive and commutes, so ordering does not matter
         * — but a dust lane is dark, and drawing it additively would make it
         * brighter rather than darker. So it briefly leaves the additive pass.
         */
        context.globalCompositeOperation = 'source-over'
        context.lineCap = 'round'

        for (const lane of lanes) {
          context.beginPath()
          let started = false

          for (const point of lane.points) {
            const w = place(point, cos, sin, worldScratch)
            const p = project(camera, w.x, w.y, w.z, scratch)
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

          context.strokeStyle = tint('obsidian', lane.alpha)
          context.lineWidth = Math.max(Math.min(width, height) * 0.022, 2)
          context.stroke()
        }

        context.globalCompositeOperation = 'lighter'

        // ----------------------------------------------------------- the plexus

        /*
         * The network, threaded through the arms.
         *
         * Connections are tested in **world** space, not on screen. Joining by
         * screen distance links nodes that are nowhere near each other and
         * merely overlap from this angle, which is exactly what makes a plexus
         * read as flat — and on a disc seen at an angle it would wire the near
         * rim to the far one straight across the bulge.
         */
        for (const node of nodes) {
          const w = place(node, cos, sin, worldScratch)
          const p = project(camera, w.x, w.y, w.z, scratch)
          if (p) {
            node.screenX = p.x
            node.screenY = p.y
            node.screenScale = p.scale
            node.visible = true
          } else {
            node.visible = false
          }
        }

        const reach = DISC * 0.34
        const reachSquared = reach * reach
        context.lineWidth = Math.max(Math.min(width, height) / 900, 0.7)

        for (let i = 0; i < nodes.length; i += 1) {
          const a = nodes[i]
          if (!a.visible) continue

          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j]
            if (!b.visible) continue

            const dx = a.x - b.x
            const dy = a.y - b.y
            const dz = a.z - b.z
            const distance = dx * dx + dy * dy + dz * dz
            if (distance > reachSquared) continue

            const closeness = 1 - distance / reachSquared
            // A slow pulse runs the network, so it reads as carrying something
            // rather than as a static lattice laid over the picture.
            const travel =
              0.45 + 0.55 * Math.sin(elapsed * 0.9 - Math.sqrt(distance) * 0.006 + a.phase)
            /*
             * Bright, and deliberately so.
             *
             * At a third of an alpha over an additive star field the network
             * simply was not there — the disc it is drawn on is the brightest
             * thing in the frame. This is the layer the scene exists for, and
             * it has to survive its own background.
             */
            context.strokeStyle = tint('goldHot', closeness * 0.62 * travel * intensity)
            context.beginPath()
            context.moveTo(a.screenX, a.screenY)
            context.lineTo(b.screenX, b.screenY)
            context.stroke()
          }
        }

        for (const node of nodes) {
          if (!node.visible) continue
          const pulse = 0.6 + 0.4 * Math.sin(elapsed * 1.1 + node.phase)
          // A halo under the point, so a node is distinguishable from the
          // several thousand stars it is sitting among.
          stamp(
            context,
            nodeGlow,
            node.screenX,
            node.screenY,
            Math.max(nodeGlow.width * node.screenScale * 1.6, 6),
            node.glow * pulse * 0.5 * intensity
          )
          stamp(
            context,
            spark,
            node.screenX,
            node.screenY,
            Math.max(spark.width * node.screenScale * 1.2, 2),
            node.glow * pulse * 0.9 * intensity
          )
        }

        // The halo's near side, over the top of everything, so the disc sits
        // inside a sphere of old stars rather than in front of a backdrop.
        for (const star of stars) {
          if (star.z < 0) continue
          const p = project(camera, star.x * 0.42, star.y * 0.42, star.z * 0.42, scratch)
          if (!p) continue
          stamp(
            context,
            spark,
            p.x,
            p.y,
            Math.max(spark.width * p.scale * 0.5, 0.8),
            star.glow * 0.18 * intensity
          )
        }

        context.globalCompositeOperation = 'source-over'
      }
    })

    return teardown
  }, [animationsEnabled, leanRef])

  return <canvas ref={canvasRef} className={className ?? styles.field} aria-hidden="true" />
}
