import { memo } from 'react'
import { LOGOMARK_PATH, LOGOMARK_VIEWBOX } from './logomark.path'

export interface LogomarkProps {
  /** Rendered width in pixels. The mark is wider than it is tall (≈1.39:1). */
  width?: number
  className?: string
  title?: string
}

/**
 * The Candy Haven mark — a galaxy vortex spiralling inward to a point.
 *
 * The path is inlined from `logomark.path` rather than imported as a file, so
 * the fill can be driven by `currentColor` and the mark inherits whatever the
 * surrounding theme sets. Importing the .svg as an <img> would lock it to the
 * flat #231f20 baked into the source file.
 */
export const Logomark = memo(function Logomark({ width = 140, className, title }: LogomarkProps) {
  return (
    <svg
      width={width}
      viewBox={`0 0 ${LOGOMARK_VIEWBOX.width} ${LOGOMARK_VIEWBOX.height}`}
      className={className}
      fill="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path d={LOGOMARK_PATH} />
    </svg>
  )
})
