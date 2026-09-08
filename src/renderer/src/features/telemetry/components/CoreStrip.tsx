import { useState, type ReactNode } from 'react'
import styles from './CoreStrip.module.scss'

export interface CoreStripProps {
  /** Per-core utilisation, 0..1, in OS core order. */
  cores: number[]
}

/**
 * Bucket for the sequential ramp. Four steps of a single hue, light→dark,
 * verified monotonic in OKLab lightness — deliberately not the status crimson,
 * which sits mid-ramp and would be ambiguous against gold-500. Status colour is
 * reserved for the headline tiles, where a text label always accompanies it.
 */
function rampStep(value: number): string {
  if (value >= 0.75) return styles.step4
  if (value >= 0.5) return styles.step3
  if (value >= 0.25) return styles.step2
  return styles.step1
}

/**
 * Per-core utilisation as a bar strip.
 *
 * Magnitude across a set of peers, so bars on a common zero-anchored scale —
 * this is the shape that makes one hot core obvious against the rest. Colour is
 * a sequential ramp of the same hue; it reinforces height rather than adding a
 * second meaning.
 */
export function CoreStrip({ cores }: CoreStripProps): ReactNode {
  const [hover, setHover] = useState<number | null>(null)

  if (cores.length === 0) {
    return <p className={styles.empty}>Awaiting first sample</p>
  }

  const busiest = cores.reduce((best, value, index) => (value > cores[best] ? index : best), 0)

  return (
    <div className={styles.strip}>
      <div
        className={styles.bars}
        role="img"
        aria-label={`Utilisation across ${cores.length} cores. Busiest is core ${
          busiest + 1
        } at ${Math.round(cores[busiest] * 100)} percent.`}
      >
        {cores.map((value, index) => (
          <div
            key={index}
            className={styles.column}
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover(null)}
          >
            <div className={styles.track}>
              <div
                className={`${styles.bar} ${rampStep(value)}`}
                style={{ height: `${Math.max(value * 100, 1.5)}%` }}
              />
            </div>

            {hover === index ? (
              <div className={styles.tooltip} role="status">
                <span className={styles.tooltipValue}>{Math.round(value * 100)}%</span>
                <span className={styles.tooltipMeta}>CORE {index + 1}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.axis}>
        <span>CORE 1</span>
        <span>CORE {cores.length}</span>
      </div>
    </div>
  )
}
