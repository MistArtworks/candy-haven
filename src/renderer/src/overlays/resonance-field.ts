import { withAlpha } from './colour'

/**
 * The resonance field — a rotating plexus on a sphere.
 *
 * The app's one piece of ambient depth, and by now its signature: the boot
 * screen has a variant, the rite ring is surrounded by one, the descent projects
 * one down its shaft, and THE CONCORD sits inside one. Extracted here when the
 * second overlay needed it, because two copies of this would drift — and the
 * drift would show, since both are visible in the same catalogue.
 *
 * Deliberately *not* unified with the boot screen's `ResonanceWeb`. That one is
 * bound to a React lifecycle, tuned separately (88 nodes, its own link
 * distance), and lives on the one screen that must never regress. Sharing this
 * with it would buy consistency nobody can see across two screens never shown
 * together, at the cost of destabilising the first thing the operator sees.
 */

export interface FieldNode {
  /** Unit-sphere coordinates; scaled to a radius at draw time. */
  x: number
  y: number
  z: number
  /** Per-node radial offset, so the shell is not perfectly smooth. */
  jitter: number
  /** Phase offset for the breathing motion. */
  drift: number
}

/** Chord distance below which two nodes are linked, in unit-sphere units. */
export const FIELD_LINK_DISTANCE = 0.66

const TAU = Math.PI * 2

/**
 * Even distribution over a sphere.
 *
 * A Fibonacci lattice rather than random placement, which clumps visibly at
 * these counts — and a clumped plexus reads as a mistake rather than as a field.
 */
export function createField(count: number): FieldNode[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(Math.max(1 - y * y, 0))
    const theta = golden * i
    return {
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      jitter: 0.88 + Math.random() * 0.24,
      drift: Math.random() * TAU
    }
  })
}

export interface ResonanceFieldFrame {
  centreX: number
  centreY: number
  radius: number
  /** Rotation about the vertical axis, in radians. */
  rotation: number
  /**
   * How agitated the field is, 0 at rest.
   *
   * The one input that carries meaning. The ring drives it from the wheel's
   * angular velocity; THE CONCORD drives it from the rate votes are arriving,
   * so a surge in chat is visible on the broadcast as the field tightening.
   * Values above 1 are permitted and simply read as more.
   */
  energy: number
  now: number
  /** Camera tilt in radians. */
  tilt?: number
  /** Overall opacity multiplier, for fading the field under another focal object. */
  opacity?: number
}

export interface ResonanceFieldStyle {
  /** Link colour. Gold in every current caller. */
  line: string
  /** Node colour, usually a brighter step of the same material. */
  node: string
}

/**
 * Paints one frame of the field.
 *
 * O(n²) in the node count, because every pair is tested for linking — which is
 * exactly why this is canvas and not retained-mode DOM. At 74 nodes that is
 * ~2,700 distance tests and a few hundred strokes per frame, which is nothing
 * for canvas and would be hopeless as elements.
 */
export function paintResonanceField(
  ctx: CanvasRenderingContext2D,
  field: readonly FieldNode[],
  frame: ResonanceFieldFrame,
  style: ResonanceFieldStyle
): void {
  const { centreX, centreY, radius, rotation, energy, now } = frame
  const opacity = frame.opacity ?? 1
  if (opacity <= 0 || radius <= 0) return

  const tilt = frame.tilt ?? 0.42
  const agitation = 1 + energy * 0.42
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const tiltCos = Math.cos(tilt)
  const tiltSin = Math.sin(tilt)

  const projected = field.map((node) => {
    const breath = 1 + Math.sin(now / 1400 + node.drift) * 0.05 * agitation
    const r = radius * node.jitter * breath
    const x1 = node.x * cos - node.z * sin
    const z1 = node.x * sin + node.z * cos
    const y1 = node.y * tiltCos - z1 * tiltSin
    const z2 = node.y * tiltSin + z1 * tiltCos
    const perspective = 1.6 / (1.6 - z2 * 0.55)
    return {
      sx: centreX + x1 * r * perspective,
      sy: centreY + y1 * r * perspective,
      ux: x1,
      uy: node.y,
      uz: z1,
      depth: (z2 + 1) / 2
    }
  })

  const intensity = (0.7 + energy * 0.4) * opacity

  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i]
    for (let j = i + 1; j < projected.length; j += 1) {
      const b = projected[j]
      const dx = a.ux - b.ux
      const dy = a.uy - b.uy
      const dz = a.uz - b.uz
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (distance > FIELD_LINK_DISTANCE) continue

      const closeness = 1 - distance / FIELD_LINK_DISTANCE
      const depth = (a.depth + b.depth) / 2
      const alpha = closeness * closeness * (0.06 + depth * 0.2) * intensity

      ctx.strokeStyle = withAlpha(style.line, alpha)
      ctx.lineWidth = 0.5 + depth * 0.5
      ctx.beginPath()
      ctx.moveTo(a.sx, a.sy)
      ctx.lineTo(b.sx, b.sy)
      ctx.stroke()
    }
  }

  for (const point of projected) {
    ctx.fillStyle = withAlpha(style.node, (0.1 + point.depth * 0.34) * intensity)
    ctx.beginPath()
    ctx.arc(point.sx, point.sy, 0.4 + point.depth * 1.2, 0, TAU)
    ctx.fill()
  }
}
