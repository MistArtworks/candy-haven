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
  softSprite,
  stamp,
  tint,
  type PlexusNode,
  type Projected,
  type Star
} from './scene-kit'
import styles from '../GenesisField.module.scss'

/**
 * THE VIGIL — one figure, watching.
 *
 * A robed observer on a rocky world, small against a nebula that fills the
 * sky. The only scene of the four with a person in it, and the only one framed
 * from a surface rather than from space.
 *
 * It is the brief's central instruction made literal: *"Human figures are
 * always small against the architecture — this is deliberate: awe and hierarchy
 * over individuality."* Here the architecture is the sky. The figure is about a
 * seventh of the frame's height and is not the subject; what she is looking at
 * is.
 *
 * She wears the species sheets' one universal marking — gold resonance
 * linework, drawn directly on the body rather than on the robe — and she is
 * rim-lit by the nebula, because the light in this world is diegetic and comes
 * from the thing being venerated.
 *
 * ## Composition
 *
 * Framed to the reference: a low horizon at just under three quarters down,
 * the figure standing left of centre on the near ridge, two worlds hanging in
 * the upper right, and rock cutting into both bottom corners. Three ridge
 * layers parallax against the sky at different rates, which is what gives a
 * flat silhouette its depth.
 */

/** Horizon height as a fraction of the frame. Low, so the sky dominates. */
const HORIZON = 0.72

/** Where she stands. Left of centre, on the near ridge. */
const FIGURE_X = 0.34

interface Ridge {
  /** Height above the horizon at each sample, as a fraction of frame height. */
  profile: number[]
  /** Where the ridge line sits, as a fraction of the frame. */
  base: number
  /** Parallax in CSS pixels at full cursor deflection. */
  lean: number
  alpha: number
  /** Rim light along the crest. */
  rim: number
}

interface SkyWorld {
  x: number
  y: number
  radius: number
  material: 'concrete' | 'brass' | 'alabaster'
  ringed: boolean
  lean: number
}

export function VigilScene({ tone, leanRef, className }: SceneProps): ReactNode {
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
    const cloudCrimson = softSprite(256, 'crimson', [
      [0, 0.42],
      [0.42, 0.12],
      [1, 0]
    ])
    const cloudBrass = softSprite(256, 'brass', [
      [0, 0.4],
      [0.42, 0.11],
      [1, 0]
    ])
    const cloudGold = softSprite(256, 'gold', [
      [0, 0.34],
      [0.42, 0.1],
      [1, 0]
    ])

    let stars: Star[] = []
    let constellation: PlexusNode[] = []
    let ridges: Ridge[] = []
    let clouds: { x: number; y: number; size: number; sprite: HTMLCanvasElement; phase: number }[] =
      []
    let worlds: SkyWorld[] = []

    /**
     * A ridge profile by midpoint displacement.
     *
     * Recursive subdivision with the displacement halving each pass, which is
     * the cheapest way to get a silhouette that reads as rock rather than as a
     * sine wave — the self-similarity at every scale is exactly what makes an
     * edge look geological.
     */
    const carve = (samples: number, roughness: number): number[] => {
      const profile = new Array<number>(samples).fill(0)
      profile[0] = Math.random() * roughness
      profile[samples - 1] = Math.random() * roughness

      let step = samples - 1
      let amplitude = roughness

      while (step > 1) {
        const half = step / 2
        for (let i = half; i < samples; i += step) {
          const average = (profile[i - half] + profile[Math.min(i + half, samples - 1)]) / 2
          profile[i] = average + (Math.random() - 0.5) * amplitude
        }
        step = half
        amplitude *= 0.54
      }

      return profile.map((value) => Math.max(value, 0))
    }

    const resize = (): void => {
      stars = createStarShell(320, 2400, 5000)

      // Constellation nodes: a plexus in the sky rather than on an object, so
      // the resonance motif is present without a body to hang it on.
      constellation = createPlexus(46, () => onSphere(1800 + Math.random() * 900))

      ridges = [
        // Far, and not quite black — distance washes a silhouette out.
        { profile: carve(129, 0.09), base: HORIZON, lean: 3, alpha: 0.82, rim: 0.5 },
        // Middle: the one she stands on, and the hardest edge in the frame.
        { profile: carve(129, 0.16), base: HORIZON + 0.07, lean: 8, alpha: 0.95, rim: 0.8 },
        // Near, cutting into the bottom corners.
        { profile: carve(129, 0.3), base: HORIZON + 0.24, lean: 18, alpha: 1, rim: 0.32 }
      ]

      /*
       * The nebula: a *bank*, not a wash.
       *
       * Thirty-four large sprites at half alpha, composited additively, is a
       * flat orange field — every star drowns and the silhouettes lose their
       * edge. Massed instead into a band across the middle of the sky, fewer,
       * smaller and much fainter, so there is dark above it and dark below and
       * the thing reads as gas hanging over a horizon.
       */
      clouds = Array.from({ length: 20 }, (_, i) => {
        const t = i / 19
        return {
          // Strung along a shallow arc, densest left of centre where she is
          // looking, rather than scattered over the whole dome.
          // Banked around a third of the way across and rising off the
          // skyline. Everything on the ground is a silhouette, and a
          // silhouette is only a shape if something behind it is bright.
          x: 0.1 + t * 0.72 + (Math.random() - 0.5) * 0.12,
          y: 0.34 + Math.sin(t * Math.PI) * 0.26 + (Math.random() - 0.5) * 0.1,
          size: 0.16 + Math.random() * 0.24,
          sprite: i % 3 === 0 ? cloudCrimson : i % 3 === 1 ? cloudBrass : cloudGold,
          phase: Math.random() * TAU
        }
      })

      // Two worlds, upper right, as in the reference: one large and near, one
      // small and far. Placed by hand so neither collides with the figure.
      worlds = [
        { x: 0.63, y: 0.27, radius: 0.15, material: 'concrete', ringed: true, lean: 11 },
        { x: 0.86, y: 0.13, radius: 0.062, material: 'alabaster', ringed: false, lean: 7 }
      ]
    }

    const teardown = mountScene(canvas, {
      animated: animationsEnabled,
      leanRef,
      toneRef,
      onResize: resize,
      onFrame: ({ context, width, height, elapsed, leanX, leanY, intensity }) => {
        const horizonY = height * HORIZON

        // ------------------------------------------------------------ the sky

        const sky = context.createLinearGradient(0, 0, 0, horizonY)
        sky.addColorStop(0, tint('obsidian', 1))
        sky.addColorStop(0.6, 'rgba(18, 12, 12, 1)')
        sky.addColorStop(1, 'rgba(34, 17, 14, 1)')
        context.fillStyle = sky
        context.fillRect(0, 0, width, horizonY)

        context.globalCompositeOperation = 'lighter'

        // Stars and the constellation plexus share a camera that barely moves —
        // the sky is distant, so it leans least of anything in the frame.
        aimCamera(camera, {
          yaw: leanX * 0.05,
          pitch: -0.12 + leanY * 0.04,
          focal: Math.min(width, height) * 1.6,
          originX: width * 0.5 - leanX * 5,
          originY: horizonY * 0.52 - leanY * 4,
          distance: 2600
        })

        drawStars(context, camera, stars, spark, elapsed, intensity, scratch)
        drawPlexus(context, camera, constellation, spark, {
          reach: 520,
          elapsed,
          intensity,
          line: 'gold',
          node: 'goldLit',
          strength: 0.55,
          scratch
        })

        // ---------------------------------------------------------- the nebula

        for (const cloud of clouds) {
          const breath = 0.75 + 0.25 * Math.sin(elapsed * 0.11 + cloud.phase)
          stamp(
            context,
            cloud.sprite,
            cloud.x * width - leanX * 9,
            cloud.y * height - leanY * 7,
            cloud.size * Math.max(width, height),
            0.26 * breath * intensity
          )
        }

        /*
         * The heart of the bank, sitting on the horizon behind her.
         *
         * Placed deliberately at her shoulder rather than at the centre of the
         * frame: she is a black shape, and where this glow *is* determines
         * whether she reads as a figure or as a smudge. Everything below the
         * skyline is lit by it and by nothing else.
         */
        stamp(
          context,
          cloudGold,
          width * 0.4 - leanX * 10,
          horizonY - height * 0.16 - leanY * 8,
          Math.max(width, height) * 0.52,
          0.5 * intensity
        )

        /*
         * A tall wash rising off the skyline.
         *
         * Not a thin line: she stands about a fifth of the frame high, so the
         * bright region has to be at least that tall or her head is against
         * black while her feet are against light. The band runs the full width
         * because the far ridge needs an edge everywhere, not just behind her.
         */
        const skyline = context.createLinearGradient(0, horizonY - height * 0.34, 0, horizonY)
        skyline.addColorStop(0, tint('goldLit', 0))
        skyline.addColorStop(0.55, tint('gold', 0.16 * intensity))
        skyline.addColorStop(1, tint('goldHot', 0.42 * intensity))
        context.fillStyle = skyline
        context.fillRect(0, horizonY - height * 0.34, width, height * 0.34)

        // ----------------------------------------------------------- the worlds

        context.globalCompositeOperation = 'source-over'

        for (const world of worlds) {
          const cx = world.x * width - leanX * world.lean
          const cy = world.y * height - leanY * world.lean * 0.7
          const r = world.radius * Math.min(width, height)

          /*
           * Lit from the nebula, which is below and left of them.
           *
           * Not from a convention like "top left": the brief is explicit that
           * light here is diegetic, and the brightest thing in this frame is
           * the gas she is looking at.
           */
          const body = context.createRadialGradient(
            cx - r * 0.4,
            cy + r * 0.35,
            r * 0.04,
            cx,
            cy,
            r
          )
          body.addColorStop(0, tint(world.material, 0.62 * intensity))
          body.addColorStop(0.5, tint(world.material, 0.22 * intensity))
          body.addColorStop(1, tint('obsidian', 0.97))

          context.fillStyle = body
          context.beginPath()
          context.arc(cx, cy, r, 0, TAU)
          context.fill()

          // Plating: a few latitude bands, foreshortened. Enough to say
          // "built", not enough to compete with the nebula.
          context.strokeStyle = tint('gold', 0.12 * intensity)
          context.lineWidth = Math.max(r / 90, 0.5)
          for (let band = 1; band < 5; band += 1) {
            const t = band / 5
            const y = cy - r + t * r * 2
            const w = Math.sqrt(Math.max(r * r - (y - cy) * (y - cy), 0))
            context.beginPath()
            context.ellipse(cx, y, w, w * 0.16, 0, 0, TAU)
            context.stroke()
          }

          // The lit limb, catching the nebula.
          context.strokeStyle = tint('goldLit', 0.2 * intensity)
          context.lineWidth = Math.max(r / 70, 0.6)
          context.beginPath()
          context.arc(cx, cy, r, Math.PI * 0.45, Math.PI * 1.3)
          context.stroke()

          if (world.ringed) {
            context.save()
            context.translate(cx, cy)
            context.rotate(-0.28)
            context.scale(1, 0.19)
            context.strokeStyle = tint('gold', 0.4 * intensity)
            context.lineWidth = Math.max(r * 0.13, 0.7)
            context.beginPath()
            context.arc(0, 0, r * 1.75, 0, TAU)
            context.stroke()
            context.restore()
          }
        }

        // ----------------------------------------------------------- the ground

        /*
         * Ridges back to front, each leaning more than the one behind it.
         *
         * The spread is what does the work. Everything moving by one amount is
         * a pan; the near rock has to travel several times as far as the far
         * rock for a silhouette to read as a landscape.
         */
        for (const ridge of ridges) {
          const offsetX = -leanX * ridge.lean
          const offsetY = -leanY * ridge.lean * 0.35
          const samples = ridge.profile.length
          const baseY = height * ridge.base + offsetY

          context.beginPath()
          context.moveTo(-40 + offsetX, height + 40)
          for (let i = 0; i < samples; i += 1) {
            const x = (i / (samples - 1)) * (width + 80) - 40 + offsetX
            context.lineTo(x, baseY - ridge.profile[i] * height)
          }
          context.lineTo(width + 40 + offsetX, height + 40)
          context.closePath()

          /*
           * True black, not the palette's obsidian.
           *
           * `#0c0c0c` at nine tenths of an alpha over a lit sky is *brown*, and
           * a brown landmass against a brown sky has no edge at all. A
           * silhouette is the absence of light; the one place in this
           * application that wants pure black is this.
           */
          context.fillStyle = `rgba(0, 0, 0, ${ridge.alpha})`
          context.fill()

          // Rim light along the crest: the nebula catching the edge of the
          // rock, which is the only reason a black silhouette has a shape.
          context.strokeStyle = tint('goldLit', ridge.rim * intensity)
          context.lineWidth = Math.max(Math.min(width, height) / 900, 0.7)
          context.beginPath()
          for (let i = 0; i < samples; i += 1) {
            const x = (i / (samples - 1)) * (width + 80) - 40 + offsetX
            const y = baseY - ridge.profile[i] * height
            if (i === 0) context.moveTo(x, y)
            else context.lineTo(x, y)
          }
          context.stroke()
        }

        // ----------------------------------------------------------- the figure

        drawFigure(context, {
          x: width * FIGURE_X - leanX * 8,
          // Standing on the middle ridge, at its profile height.
          groundY:
            height * (HORIZON + 0.045) -
            ridgeHeightAt(ridges[1], FIGURE_X) * height -
            leanY * 8 * 0.35,
          height: Math.min(width, height) * 0.19,
          elapsed,
          intensity
        })

        // A last wash of gas in front of everything, tying sky to ground.
        context.globalCompositeOperation = 'lighter'
        stamp(
          context,
          cloudCrimson,
          width * 0.58 - leanX * 4,
          horizonY - height * 0.02,
          Math.max(width, height) * 0.8,
          0.14 * intensity
        )
        context.globalCompositeOperation = 'source-over'
      }
    })

    return teardown
  }, [animationsEnabled, leanRef])

  return <canvas ref={canvasRef} className={className ?? styles.field} aria-hidden="true" />
}

/** The ridge's height at a horizontal fraction, so the figure stands *on* it. */
function ridgeHeightAt(ridge: Ridge, fraction: number): number {
  const samples = ridge.profile.length
  const index = Math.round(fraction * (samples - 1))
  return ridge.profile[Math.min(Math.max(index, 0), samples - 1)]
}

/**
 * The observer.
 *
 * Robed, which is the brief's default costume and also the honest answer to
 * drawing a person a hundred pixels tall: a bell silhouette with a hooded head
 * reads as a figure immediately, where articulated limbs at this size read as a
 * smudge with legs.
 *
 * She is drawn almost entirely in shadow with a gold rim down the side facing
 * the nebula — she is backlit, and the light is the subject. The three short
 * strokes on the robe are the species sheets' resonance linework, which every
 * body in this world carries.
 *
 * She is not centred and not large, and both are deliberate. Awe over intimacy.
 */
function drawFigure(
  context: CanvasRenderingContext2D,
  options: { x: number; groundY: number; height: number; elapsed: number; intensity: number }
): void {
  const { x, groundY, height: h, elapsed, intensity } = options

  /*
   * Proportions, arrived at twice.
   *
   * The first attempt tapered from a narrow head to a wide hem and read as a
   * traffic bollard. The second widened the shoulders and read as a pillar,
   * because the head and the shoulders were close enough in width that there
   * was nothing between them.
   *
   * What makes a silhouette human at seventy pixels is **the neck** — a hard
   * pinch to about a third of the shoulder width, immediately under a head
   * that is nearly round. Everything else can be a column; without that notch
   * nothing else helps.
   */
  const hemW = h * 0.16
  const waistW = h * 0.115
  const shoulderW = h * 0.135
  const neckW = h * 0.045
  const headW = h * 0.075
  const shoulderY = -h * 0.78
  const neckY = -h * 0.85

  // A very slow sway, so she is alive without being animated.
  const sway = Math.sin(elapsed * 0.35) * h * 0.005

  context.save()
  context.translate(x + sway, groundY)

  /*
   * One path for the whole body.
   *
   * Drawn as a single silhouette rather than as head, torso and robe stacked:
   * overlapping black shapes at this size leave hairline seams where their
   * edges nearly meet, and a seam across a neck is the artefact the eye finds
   * first.
   */
  context.beginPath()
  context.moveTo(-hemW, 0)
  // Up the left side: hem, waist, shoulder.
  context.quadraticCurveTo(-waistW, -h * 0.42, -shoulderW, shoulderY)
  // The notch. A sharp line rather than a curve — this is the one edge that
  // has to be unambiguous.
  context.lineTo(-neckW, neckY)
  // Over the head, nearly circular.
  context.bezierCurveTo(-headW * 1.5, neckY - h * 0.03, -headW * 1.35, -h * 1.0, 0, -h * 1.0)
  context.bezierCurveTo(headW * 1.35, -h * 1.0, headW * 1.5, neckY - h * 0.03, neckW, neckY)
  // Back down the right side.
  context.lineTo(shoulderW, shoulderY)
  context.quadraticCurveTo(waistW, -h * 0.42, hemW, 0)
  context.closePath()

  // True black. She is an absence of light, like the rock she stands on.
  context.fillStyle = 'rgba(0, 0, 0, 1)'
  context.fill()

  /*
   * The rim, down the side facing the nebula only.
   *
   * A rim all the way round is an outline, which is a cartoon. A rim on one
   * side is light, and it is the only thing giving a black shape volume.
   */
  context.strokeStyle = tint('goldHot', 0.95 * intensity)
  context.lineWidth = Math.max(h * 0.015, 1)
  context.beginPath()
  context.moveTo(0, -h * 1.0)
  context.bezierCurveTo(headW * 1.35, -h * 1.0, headW * 1.5, neckY - h * 0.03, neckW, neckY)
  context.lineTo(shoulderW, shoulderY)
  context.quadraticCurveTo(waistW, -h * 0.42, hemW, 0)
  context.stroke()

  // A fold down the robe, catching a little of the same light — enough to say
  // cloth rather than cardboard.
  context.strokeStyle = tint('gold', 0.3 * intensity)
  context.lineWidth = Math.max(h * 0.006, 0.4)
  context.beginPath()
  context.moveTo(shoulderW * 0.15, shoulderY + h * 0.04)
  context.quadraticCurveTo(hemW * 0.2, -h * 0.3, hemW * 0.42, -h * 0.02)
  context.stroke()

  // Resonance linework: the species sheets' one universal marking, worn on the
  // body rather than the robe. Three short strokes, and the only warm thing
  // on her that is not reflected light.
  context.strokeStyle = tint('goldLit', 0.5 * intensity)
  context.lineWidth = Math.max(h * 0.006, 0.4)
  for (let i = 0; i < 3; i += 1) {
    const y = shoulderY + h * (0.1 + i * 0.09)
    context.beginPath()
    context.moveTo(-shoulderW * 0.5, y)
    context.lineTo(shoulderW * 0.55, y - h * 0.012)
    context.stroke()
  }

  // The ground at her feet, catching the sky.
  context.globalCompositeOperation = 'lighter'
  const pool = context.createRadialGradient(0, 0, 0, 0, 0, hemW * 3)
  pool.addColorStop(0, tint('gold', 0.16 * intensity))
  pool.addColorStop(1, tint('gold', 0))
  context.fillStyle = pool
  context.beginPath()
  context.ellipse(0, 0, hemW * 3, hemW * 0.5, 0, 0, TAU)
  context.fill()
  context.globalCompositeOperation = 'source-over'

  context.restore()
}
