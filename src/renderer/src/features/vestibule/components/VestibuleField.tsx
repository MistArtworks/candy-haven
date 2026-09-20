import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import type { PointerLean } from '@renderer/features/home/components/GenesisField'
import {
  aimCamera,
  createCamera,
  createPlexus,
  createStarShell,
  drawPlexus,
  drawStars,
  mountScene,
  softSprite,
  tint,
  type PlexusNode,
  type Projected,
  type Star,
  type Vec3
} from '@renderer/features/home/components/scenes/scene-kit'
import styles from '@renderer/features/home/components/GenesisField.module.scss'

/**
 * The plexus behind the vestibule's two doors.
 *
 * The same engine every NEXUS scene is built on, laid out as a **slab** rather
 * than a sphere. A sphere is a focal object — it has a centre, and the eye goes
 * to it — and the focal object here is whichever door the operator is reaching
 * for. This is the field they hang in.
 *
 * No three.js. `scene-kit` already projects, links in world space and fades by
 * depth, which is the whole of what a plexus is; the dependency would buy a
 * depth buffer and a shader pipeline for a background that is mostly soft
 * light. That decision is recorded in docs/PROJECT_CONTEXT.md §2.
 */

/**
 * The slab, in world units.
 *
 * Sized against the camera below rather than picked: at `focal` 1.9x the short
 * edge and `distance` 2100, a node at the origin projects at about half scale,
 * so 1500 lands near ±760px on an 880px window. The field bleeds past both
 * edges, which is what stops it reading as a rectangle of dots sitting in the
 * middle of the frame.
 */
const SPREAD = 1500
/** Shallower than it is wide, like the window. */
const RISE = 700
/** And its depth, which is what the perspective divide has to work with. */
const DEPTH = 1100

const NODES = 130

/**
 * How far apart two nodes may be and still be linked, in world units.
 *
 * Mean spacing in a 3000x1400x2200 volume at 130 nodes is around 410, so this
 * gives each node several neighbours without joining the whole slab into a mat.
 * Note `drawPlexus` measures in **world** space, not on screen — joining by
 * screen distance links things that merely overlap from this angle, which is
 * exactly what makes a plexus read as flat.
 */
const REACH = 620

/**
 * Alpha multiplier. `drawPlexus` tops out at `0.3 * strength` for a link.
 *
 * Tuned up from a first pass at 0.18, where the maximum link alpha worked out
 * at 0.054 over a near-black floor and the field was invisible in everything
 * but a still. `GateScene` runs that low because it has lit architecture behind
 * it; here the plexus *is* the background, so it sits with the constellation in
 * `VigilScene` instead — and takes gold rather than brass for the same reason.
 */
const STRENGTH = 0.55

/**
 * Nodes thin out toward the middle of the frame.
 *
 * The two doors sit centred and are opaque, so a node behind one is a node
 * nobody sees — every one spent there is missing from the edges and the gap
 * between them, which is the only plexus actually on screen. The exponent
 * biases outward without opening a hole: a gap in a field reads as a mistake,
 * where a thinning reads as depth.
 */
function placeInSlab(): Vec3 {
  const side = Math.random() < 0.5 ? -1 : 1
  return {
    x: side * Math.pow(Math.random(), 0.62) * SPREAD,
    y: (Math.random() - 0.5) * 2 * RISE,
    z: (Math.random() - 0.5) * 2 * DEPTH
  }
}

export interface VestibuleFieldProps {
  /**
   * Live cursor position, read every frame.
   *
   * A ref rather than a value: this drives a canvas, and a window that
   * re-rendered React on pointer move would be a window that stuttered.
   */
  leanRef?: RefObject<PointerLean>
  /** Falls to `unstable` while the archive is not up, which dims the field. */
  tone: 'nominal' | 'unstable'
}

export function VestibuleField({ leanRef, tone }: VestibuleFieldProps): ReactNode {
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

    let nodes: PlexusNode[] = []
    let stars: Star[] = []

    const resize = (): void => {
      nodes = createPlexus(NODES, placeInSlab)
      // Far enough back to read as a sky rather than as more plexus.
      stars = createStarShell(90, 3200, 5200)
    }

    return mountScene(canvas, {
      animated: animationsEnabled,
      leanRef,
      toneRef,
      onResize: resize,
      onFrame: ({ context, width, height, elapsed, leanX, leanY, intensity }) => {
        // A warm floor under everything, so the field is lit from below the way
        // the reference boards are rather than sitting on flat black.
        const ground = context.createLinearGradient(0, 0, 0, height)
        ground.addColorStop(0, tint('obsidian', 1))
        ground.addColorStop(0.62, 'rgba(14, 11, 11, 1)')
        ground.addColorStop(1, 'rgba(26, 16, 13, 1)')
        context.fillStyle = ground
        context.fillRect(0, 0, width, height)

        context.globalCompositeOperation = 'lighter'

        /*
         * A very slow yaw, and almost no pitch.
         *
         * The picture is meant to be nearly still — at this scale anything
         * vibrating fights the one quality holding the composition together.
         * The cursor lean supplies the only motion the operator can cause, and
         * it is damped inside `mountScene`.
         */
        aimCamera(camera, {
          yaw: elapsed * 0.035 + leanX * 0.11,
          pitch: -0.08 + leanY * 0.07,
          focal: Math.min(width, height) * 1.9,
          originX: width * 0.5 - leanX * 14,
          originY: height * 0.46 - leanY * 10,
          distance: 2100
        })

        drawStars(context, camera, stars, spark, elapsed, intensity, scratch)

        drawPlexus(context, camera, nodes, spark, {
          reach: REACH,
          elapsed,
          intensity,
          line: 'gold',
          node: 'goldLit',
          strength: STRENGTH,
          scratch
        })

        context.globalCompositeOperation = 'source-over'
        context.globalAlpha = 1
      }
    })
  }, [animationsEnabled, leanRef])

  return <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />
}
