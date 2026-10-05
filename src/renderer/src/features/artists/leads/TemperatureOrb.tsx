import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { temperatureBand } from '@shared/domain/leads.constants'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { Orb, orbSeed } from './orb'

export interface TemperatureOrbProps {
  /** 0 to 100. */
  value: number
  /** Drawn on the sphere, under any ice. */
  initials?: string
  /** Its width and height, in CSS px. */
  size: number
  /** The small list orb: fewer rays and particles. */
  compact?: boolean
  /** Whose temperature it is, for screen readers: "Nyla Rae: Warm, 62%". */
  label?: string
}

/**
 * A lead's temperature, drawn: ice when it's cold, a star when it's hot.
 *
 * `Orb` (orb.ts) does the drawing; this hands it the props. A new value eases
 * in while the orb is on screen and Haven's motion preference allows it, and
 * is drawn still, straight away, otherwise.
 */
export function TemperatureOrb({
  value,
  initials = '',
  size,
  compact = false,
  label
}: TemperatureOrbProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbRef = useRef<Orb | null>(null)
  const motion = useAnimationsEnabled()
  // The lead's own frost: each name grows its ice its own way, every time.
  const seed = orbSeed(`${label ?? ''}|${initials}`)

  // What a new orb starts from. An orb is made again only when its look
  // changes; after that, these are handed to the one it has, below.
  const start = useRef({ value, size, motion })
  useLayoutEffect(() => {
    start.current = { value, size, motion }
  })

  // Before paint, so the canvas is never seen empty or stretched.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const orb = new Orb(canvas, { ...start.current, initials, compact, seed })
    orbRef.current = orb
    const unwatch = watchOnScreen(canvas, (visible) => orb.setOnScreen(visible))
    return () => {
      unwatch()
      orb.destroy()
      orbRef.current = null
    }
  }, [compact, initials, seed])

  useLayoutEffect(() => {
    orbRef.current?.setSize(size)
  }, [size])

  useEffect(() => {
    orbRef.current?.setValue(value)
  }, [value])

  useEffect(() => {
    orbRef.current?.setMotion(motion)
  }, [motion])

  const band = temperatureBand(value)

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${label ?? 'Temperature'}: ${band.label}, ${Math.round(value)}%`}
      // Exactly `size` square: the reset's max-width would squeeze it out of
      // round in a narrow parent, so it overflows instead.
      style={{ width: size, height: size, flex: 'none', maxWidth: 'none' }}
    />
  )
}

/**
 * One observer for every orb, rather than one each: a list of leads mounts
 * dozens. An orb scrolled out of view, or in a closed panel, stops drawing.
 */
const reporters = new Map<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | null = null

function watchOnScreen(canvas: HTMLCanvasElement, report: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) reporters.get(entry.target)?.(entry.isIntersecting)
  })
  reporters.set(canvas, report)
  observer.observe(canvas)
  return () => {
    reporters.delete(canvas)
    observer?.unobserve(canvas)
  }
}
