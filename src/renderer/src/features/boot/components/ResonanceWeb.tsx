import { useEffect, useRef, type ReactNode } from 'react'
import type { BootPhase } from '@shared/domain/boot'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import styles from './ResonanceWeb.module.scss'

export interface ResonanceWebProps {
  phase: BootPhase
  /** CSS pixel size of the square canvas. */
  size?: number
  className?: string
}

interface Node {
  /** Unit-sphere coordinates; scaled to radius at draw time. */
  x: number
  y: number
  z: number
  /** Per-node radial offset, so the shell is not perfectly smooth. */
  jitter: number
  /** Phase offset for the breathing motion. */
  drift: number
}

const NODE_COUNT = 88
/** Chord distance below which two nodes are linked, in unit-sphere units. */
const LINK_DISTANCE = 0.62

const GOLD_LINE = '210, 169, 97'
const GOLD_NODE = '227, 194, 134'
const CRIMSON_LINE = '196, 69, 58'

/**
 * Distributes points evenly over a sphere using the Fibonacci spiral.
 *
 * Random placement clumps badly at this node count; the golden-angle spiral
 * gives near-uniform spacing, which is what makes the link distance threshold
 * produce an even web rather than dense knots and empty patches.
 */
function createNodes(count: number): Node[] {
  const golden = Math.PI * (3 - Math.sqrt(5))

  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(Math.max(1 - y * y, 0))
    const theta = golden * i

    return {
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      jitter: 0.86 + Math.random() * 0.28,
      drift: Math.random() * Math.PI * 2
    }
  })
}

/**
 * A rotating point-cloud web — the resonance field around the focal orb.
 *
 * Nodes sit on a sphere and are linked when close enough, giving the plexus
 * look. Depth drives both opacity and node size, so the far hemisphere recedes
 * and the whole thing reads as a volume rather than a flat scribble. Canvas
 * rather than SVG: this is ~90 nodes and up to a few hundred lines redrawn
 * every frame, which is exactly the case where retained-mode DOM falls over.
 */
export function ResonanceWeb({ phase, size = 340, className }: ResonanceWebProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationsEnabled = useAnimationsEnabled()
  // The render loop reads the phase every frame but must not be torn down and
  // rebuilt when it changes, so the value is mirrored into a ref. Syncing in an
  // effect rather than during render keeps this off the render path.
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    // Render at device resolution so the hairlines stay crisp on HiDPI panels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    context.scale(dpr, dpr)

    const nodes = createNodes(NODE_COUNT)
    const centre = size / 2
    const radius = size * 0.34

    let frame = 0
    let rotation = 0
    let last = performance.now()

    const draw = (now: number): void => {
      const deltaSeconds = Math.min((now - last) / 1000, 0.05)
      last = now

      const currentPhase = phaseRef.current
      const failed = currentPhase === 'failed'
      // The web spins up while work is happening and settles once ready.
      const speed = failed ? 0 : currentPhase === 'running' ? 0.28 : 0.09
      rotation += deltaSeconds * speed

      const tint = failed ? CRIMSON_LINE : GOLD_LINE
      const nodeTint = failed ? CRIMSON_LINE : GOLD_NODE
      const intensity = currentPhase === 'running' ? 1 : currentPhase === 'ready' ? 0.82 : 0.6

      context.clearRect(0, 0, size, size)

      const cos = Math.cos(rotation)
      const sin = Math.sin(rotation)
      // A fixed tilt keeps the pole off-axis so the rotation is legible.
      const tiltCos = Math.cos(0.42)
      const tiltSin = Math.sin(0.42)

      const projected = nodes.map((node) => {
        // Breathing: each node drifts along its own radius, slightly out of
        // step with its neighbours, so the shell pulses rather than scales.
        const breath = 1 + Math.sin(now / 1400 + node.drift) * 0.05
        const r = radius * node.jitter * breath

        // Rotate about Y, then tilt about X.
        const x1 = node.x * cos - node.z * sin
        const z1 = node.x * sin + node.z * cos
        const y1 = node.y * tiltCos - z1 * tiltSin
        const z2 = node.y * tiltSin + z1 * tiltCos

        // Weak perspective: near nodes spread outward, far nodes contract.
        const perspective = 1.6 / (1.6 - z2 * 0.55)
        const depth = (z2 + 1) / 2

        return {
          sx: centre + x1 * r * perspective,
          sy: centre + y1 * r * perspective,
          ux: node.x * cos - node.z * sin,
          uy: node.y,
          uz: z1,
          depth
        }
      })

      // Links
      for (let i = 0; i < projected.length; i += 1) {
        const a = projected[i]
        for (let j = i + 1; j < projected.length; j += 1) {
          const b = projected[j]
          const dx = a.ux - b.ux
          const dy = a.uy - b.uy
          const dz = a.uz - b.uz
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (distance > LINK_DISTANCE) continue

          // Fade with both link length and depth of the pair.
          const closeness = 1 - distance / LINK_DISTANCE
          const depth = (a.depth + b.depth) / 2
          const alpha = closeness * closeness * (0.1 + depth * 0.42) * intensity

          context.strokeStyle = `rgba(${tint}, ${alpha.toFixed(3)})`
          context.lineWidth = 0.5 + depth * 0.7
          context.beginPath()
          context.moveTo(a.sx, a.sy)
          context.lineTo(b.sx, b.sy)
          context.stroke()
        }
      }

      // Nodes, drawn last so they sit on top of their own links.
      for (const point of projected) {
        const alpha = (0.16 + point.depth * 0.6) * intensity
        context.fillStyle = `rgba(${nodeTint}, ${alpha.toFixed(3)})`
        context.beginPath()
        context.arc(point.sx, point.sy, 0.5 + point.depth * 1.5, 0, Math.PI * 2)
        context.fill()
      }

      if (animationsEnabled) frame = requestAnimationFrame(draw)
    }

    if (animationsEnabled) {
      frame = requestAnimationFrame(draw)
    } else {
      // Reduced motion: paint one static frame rather than nothing, so the
      // composition still reads as intended.
      draw(performance.now())
    }

    return () => cancelAnimationFrame(frame)
  }, [size, animationsEnabled])

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.web} ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
