import { useCallback, useRef, useState, type ReactNode } from 'react'
import styles from './Sparkline.module.scss'

export interface SparklineProps {
  /** Values in 0..1, oldest first. */
  data: number[]
  /** Names the series for assistive technology; no legend is drawn. */
  label: string
  /** Seconds between samples, used to phrase the hover readout. */
  intervalSeconds?: number
  /** Formats a value for the tooltip and summary. */
  format?: (value: number) => string
  height?: number
}

// A fixed viewBox stretched to the container. `vector-effect: non-scaling-stroke`
// keeps the line exactly 2px regardless of how far it is stretched.
const VB_W = 240
const VB_H = 60

function buildPaths(data: number[]): { line: string; area: string } {
  if (data.length === 0) return { line: '', area: '' }
  if (data.length === 1) {
    const y = VB_H - data[0] * VB_H
    return {
      line: `M0,${y} L${VB_W},${y}`,
      area: `M0,${VB_H} L0,${y} L${VB_W},${y} L${VB_W},${VB_H} Z`
    }
  }

  const step = VB_W / (data.length - 1)
  const points = data.map((value, index) => {
    const x = index * step
    // Values are ratios with a true zero, so the axis is anchored at 0 — never
    // cropped to the data range, which would exaggerate small fluctuations.
    const y = VB_H - Math.min(Math.max(value, 0), 1) * VB_H
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return {
    line: `M${points.join(' L')}`,
    area: `M0,${VB_H} L${points.join(' L')} L${VB_W},${VB_H} Z`
  }
}

/**
 * Single-series sparkline for a value that changes over time.
 *
 * One series, so no legend — the surrounding tile's label names it. The y-axis
 * is anchored at zero because the data are ratios with a meaningful zero point.
 * Hover exposes the value at a point; the current value is always also shown as
 * text by the parent, so nothing depends on reading the plot.
 */
export function Sparkline({
  data,
  label,
  intervalSeconds = 1,
  format = (value) => `${Math.round(value * 100)}%`,
  height = 60
}: SparklineProps): ReactNode {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { line, area } = buildPaths(data)
  const peak = data.length ? Math.max(...data) : 0

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const node = svgRef.current
      if (!node || data.length === 0) return

      const rect = node.getBoundingClientRect()
      const ratio = (event.clientX - rect.left) / rect.width
      const index = Math.round(ratio * (data.length - 1))
      setHover(Math.min(Math.max(index, 0), data.length - 1))
    },
    [data.length]
  )

  const hoverX = hover !== null && data.length > 1 ? (hover / (data.length - 1)) * VB_W : 0
  const hoverY = hover !== null ? VB_H - Math.min(Math.max(data[hover], 0), 1) * VB_H : 0
  const secondsAgo = hover !== null ? (data.length - 1 - hover) * intervalSeconds : 0

  return (
    <div className={styles.wrapper} style={{ height }}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. Currently ${format(data.at(-1) ?? 0)}, peak ${format(peak)} over the last ${Math.round((data.length * intervalSeconds) / 1)} seconds.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ch-gold-400)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ch-gold-400)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive reference lines at 50% and 100% */}
        <line x1="0" y1={VB_H / 2} x2={VB_W} y2={VB_H / 2} className={styles.grid} />
        <line x1="0" y1="0.5" x2={VB_W} y2="0.5" className={styles.grid} />

        {area ? <path d={area} className={styles.area} /> : null}
        {line ? <path d={line} className={styles.line} /> : null}

        {hover !== null ? (
          <g className={styles.cursor}>
            <line x1={hoverX} y1="0" x2={hoverX} y2={VB_H} className={styles.crosshair} />
            <circle cx={hoverX} cy={hoverY} r="3" className={styles.marker} />
          </g>
        ) : null}
      </svg>

      {hover !== null ? (
        <div
          className={styles.tooltip}
          style={{ left: `${data.length > 1 ? (hover / (data.length - 1)) * 100 : 0}%` }}
          role="status"
        >
          <span className={styles.tooltipValue}>{format(data[hover])}</span>
          <span className={styles.tooltipMeta}>
            {secondsAgo === 0 ? 'now' : `${secondsAgo}s ago`}
          </span>
        </div>
      ) : null}
    </div>
  )
}
