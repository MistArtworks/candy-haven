import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { CurvePoint } from '@shared/domain/darkroom'
import { buildCurveTable } from '@shared/domain/darkroom'
import styles from '../DarkroomPage.module.scss'

export interface CurveEditorProps {
  points: CurvePoint[]
  /** The loaded image's luminance distribution, drawn behind the curve. */
  histogram: Float32Array | null
  onChange: (points: CurvePoint[]) => void
}

/** Drawn in a 0..100 square; the SVG scales to whatever the panel gives it. */
const SIZE = 100
/** How far off the square a point must be dragged before it is dropped. */
const DISCARD_MARGIN = 18

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

/**
 * The tone curve, drawn over the image's own histogram.
 *
 * Input runs left to right, output bottom to top, so the identity grade is the
 * diagonal — the convention every editor uses, and worth matching exactly
 * because it is the one control here an operator arrives already knowing.
 *
 * Click the line to add a point, drag to shape it, drag a point off the square
 * to remove it. The two endpoints cannot be removed and cannot leave their
 * edges: they are what anchors black and white, and a curve that does not span
 * the range is a levels control wearing a curve's clothes.
 *
 * The rendered line comes from `buildCurveTable` — the same function that grades
 * the image — rather than from an SVG path through the points. A `<path>` with
 * a cubic command would draw a *different* curve from the one being applied,
 * and the operator would be shaping the wrong thing.
 */
export function CurveEditor({ points, histogram, onChange }: CurveEditorProps): ReactNode {
  const ref = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  /** Pointer position in curve space, y flipped so up is more. */
  const locate = (event: ReactPointerEvent): { x: number; y: number } | null => {
    const svg = ref.current
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * SIZE,
      y: SIZE - ((event.clientY - box.top) / box.height) * SIZE
    }
  }

  const sorted = [...points].sort((a, b) => a.x - b.x)

  const table = buildCurveTable(sorted)
  const line = Array.from(table, (value, index) => {
    const x = (index / 255) * SIZE
    const y = value * SIZE
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${(SIZE - y).toFixed(2)}`
  }).join(' ')

  const bars: ReactNode[] = []
  if (histogram) {
    for (let i = 0; i < 256; i += 1) {
      const height = histogram[i] * SIZE
      if (height <= 0) continue
      bars.push(
        <rect
          key={i}
          x={(i / 256) * SIZE}
          y={SIZE - height}
          width={SIZE / 256 + 0.15}
          height={height}
          className={styles.curveHistBar}
        />
      )
    }
  }

  const onPointerDownPoint =
    (index: number) =>
    (event: ReactPointerEvent): void => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(index)
    }

  const onPointerMove = (event: ReactPointerEvent): void => {
    if (dragging === null) return
    const at = locate(event)
    if (!at) return

    const isEnd = dragging === 0 || dragging === sorted.length - 1
    const next = sorted.map((point, index) =>
      index === dragging
        ? {
            // Endpoints keep their x — they are the anchors for black and white.
            x: isEnd ? point.x : clamp01(at.x / SIZE),
            y: clamp01(at.y / SIZE)
          }
        : point
    )
    onChange(next)
  }

  const onPointerUp = (event: ReactPointerEvent): void => {
    if (dragging === null) return

    const at = locate(event)
    const isEnd = dragging === 0 || dragging === sorted.length - 1

    // Dragged well outside the square, and not an anchor: the operator is
    // throwing it away. The margin keeps a slightly overshot drag from
    // silently deleting a point they were still placing.
    if (
      at &&
      !isEnd &&
      (at.x < -DISCARD_MARGIN ||
        at.x > SIZE + DISCARD_MARGIN ||
        at.y < -DISCARD_MARGIN ||
        at.y > SIZE + DISCARD_MARGIN)
    ) {
      onChange(sorted.filter((_, index) => index !== dragging))
    }

    setDragging(null)
  }

  /** Clicking the field adds a point there. */
  const onAdd = (event: ReactPointerEvent): void => {
    const at = locate(event)
    if (!at) return

    const x = clamp01(at.x / SIZE)
    const y = clamp01(at.y / SIZE)

    // Too close to an existing point and this is a fumbled grab, not a new
    // point — adding one on top of another makes both impossible to hit.
    if (sorted.some((point) => Math.abs(point.x - x) < 0.03)) return

    onChange([...sorted, { x, y }].sort((a, b) => a.x - b.x))
  }

  return (
    <div className={styles.curveWrap}>
      <svg
        ref={ref}
        className={styles.curve}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        preserveAspectRatio="none"
        role="application"
        aria-label="Tone curve"
        onPointerDown={onAdd}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g aria-hidden="true">{bars}</g>

        {/* Quarters, so the eye can place a point without measuring. */}
        <g aria-hidden="true">
          {[25, 50, 75].map((at) => (
            <g key={at}>
              <line x1={at} y1={0} x2={at} y2={SIZE} className={styles.curveGrid} />
              <line x1={0} y1={at} x2={SIZE} y2={at} className={styles.curveGrid} />
            </g>
          ))}
          <line x1={0} y1={SIZE} x2={SIZE} y2={0} className={styles.curveDiagonal} />
        </g>

        <path d={line} className={styles.curveLine} />

        {sorted.map((point, index) => (
          <circle
            key={index}
            cx={point.x * SIZE}
            cy={SIZE - point.y * SIZE}
            r={dragging === index ? 3.4 : 2.4}
            className={styles.curveHandle}
            data-anchor={index === 0 || index === sorted.length - 1 || undefined}
            onPointerDown={onPointerDownPoint(index)}
          />
        ))}
      </svg>

      <p className={styles.hint}>
        Click to add a point, drag to shape it, drag it off the square to remove it. The ends hold
        black and white in place.
      </p>
    </div>
  )
}
