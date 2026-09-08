import type { ReactNode } from 'react'
import { classifyLoad, LOAD_LABEL } from '@shared/domain/telemetry.constants'
import { Sparkline } from './Sparkline'
import styles from './VitalTile.module.scss'

export interface VitalTileProps {
  label: string
  /** Current value as a ratio 0..1, or null when unavailable on this system. */
  value: number | null
  /** Secondary line, e.g. "24.1 GB of 64.0 GB". */
  detail?: string
  history?: number[]
  /** Shown in place of the chart when the metric cannot be measured. */
  unavailableNote?: string
}

/**
 * Headline reading for one vital: a hero number, a status word, and the recent
 * trend.
 *
 * The status colour is always accompanied by its word (NOMINAL / ELEVATED /
 * CRITICAL), so state is never carried by colour alone. Crimson appears here
 * and only here among the charts — it is a reserved status colour, not a step
 * on the sequential ramp the core strip and sparkline use.
 */
export function VitalTile({
  label,
  value,
  detail,
  history = [],
  unavailableNote
}: VitalTileProps): ReactNode {
  const available = value !== null
  const level = available ? classifyLoad(value) : 'nominal'

  return (
    <div className={styles.tile}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {available ? (
          <span className={styles.status} data-level={level}>
            <span className={styles.statusDot} aria-hidden="true" />
            {LOAD_LABEL[level]}
          </span>
        ) : null}
      </div>

      <div className={styles.readingRow}>
        <span className={styles.reading} data-level={available ? level : undefined}>
          {available ? Math.round(value * 100) : '—'}
          {available ? <span className={styles.unit}>%</span> : null}
        </span>
      </div>

      {detail ? <p className={styles.detail}>{detail}</p> : null}

      <div className={styles.chart}>
        {available && history.length > 1 ? (
          <Sparkline data={history} label={`${label} utilisation`} />
        ) : (
          <p className={styles.unavailable}>{unavailableNote ?? 'Awaiting samples'}</p>
        )}
      </div>
    </div>
  )
}
