import { memo } from 'react'

export interface SigilProps {
  size?: number
  /** Stroke width in SVG user units (viewBox is 0 0 100 100). */
  weight?: number
  className?: string
  /** Ref target for animating the four-point star independently. */
  starRef?: React.Ref<SVGGElement>
  /** Ref target for animating the surrounding ring. */
  ringRef?: React.Ref<SVGCircleElement>
  title?: string
}

/**
 * The Sonoalchemy mark.
 *
 * Reconstructed from the reference boards: a four-point star (the convergence
 * of frequency, consciousness, structure and application) held inside a
 * circle (the consciousness ring), with four cardinal ticks marking the axes.
 * It is the app's single recurring focal object — the boot orb, the window
 * chrome and the Nexus hero are all the same mark at different scales.
 *
 * Drawn with `currentColor` so callers control it purely through CSS.
 */
export const Sigil = memo(function Sigil({
  size = 64,
  weight = 1.4,
  className,
  starRef,
  ringRef,
  title
}: SigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}

      {/* Consciousness ring */}
      <circle ref={ringRef} cx="50" cy="50" r="34" opacity="0.55" />

      {/* Inner containment ring */}
      <circle cx="50" cy="50" r="26" opacity="0.22" />

      <g ref={starRef}>
        {/*
          Four-point star. Each quadrant is a pair of curves meeting at the
          centre, giving the concave "spark" silhouette rather than a diamond.
        */}
        <path d="M50 16 C52.5 34 66 47.5 84 50 C66 52.5 52.5 66 50 84 C47.5 66 34 52.5 16 50 C34 47.5 47.5 34 50 16 Z" />
      </g>

      {/* Cardinal axis ticks */}
      <g opacity="0.6">
        <line x1="50" y1="6" x2="50" y2="12" />
        <line x1="50" y1="88" x2="50" y2="94" />
        <line x1="6" y1="50" x2="12" y2="50" />
        <line x1="88" y1="50" x2="94" y2="50" />
      </g>

      {/* Focal centre */}
      <circle cx="50" cy="50" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
})
