import type { ReactNode } from 'react'
import styles from './Meter.module.scss'

export interface MeterProps {
  /** Completion 0..1. Pass `null` for an indeterminate meter. */
  value: number | null
  label?: string
  /** Right-aligned readout, e.g. a percentage or byte count. */
  readout?: string
  tone?: 'accent' | 'gold' | 'error'
  size?: 'sm' | 'md'
}

/**
 * Linear progress meter.
 *
 * Renders as a measured instrument: a hairline track with tick marks at
 * quarters, filled by a solid bar. Indeterminate state sweeps a short segment
 * rather than filling, so "working" is never mistaken for "nearly done".
 */
export function Meter({
  value,
  label,
  readout,
  tone = 'accent',
  size = 'md'
}: MeterProps): ReactNode {
  const indeterminate = value === null || value < 0
  const percent = indeterminate ? 0 : Math.round(Math.min(Math.max(value, 0), 1) * 100)

  return (
    <div className={`${styles.meter} ${styles[size]}`}>
      {label || readout ? (
        <div className={styles.head}>
          {label ? <span className={styles.label}>{label}</span> : <span />}
          {readout ? <span className={styles.readout}>{readout}</span> : null}
        </div>
      ) : null}

      <div
        className={`${styles.track} ${styles[tone]}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-label={label}
      >
        <span className={styles.ticks} aria-hidden="true" />
        <span
          className={`${styles.fill} ${indeterminate ? styles.indeterminate : ''}`}
          style={indeterminate ? undefined : { transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  )
}
