import type { ReactNode } from 'react'
import styles from './StatusDot.module.scss'

export type StatusTone = 'online' | 'pending' | 'warn' | 'error' | 'offline'

export interface StatusDotProps {
  tone: StatusTone
  label?: string
  /** Adds a slow pulse. Reserved for genuinely in-flight states. */
  pulse?: boolean
}

/**
 * Small state indicator. The dot alone is never the only signal — a text label
 * accompanies it wherever the state matters, so meaning does not rest on colour.
 */
export function StatusDot({ tone, label, pulse = false }: StatusDotProps): ReactNode {
  return (
    <span className={styles.wrapper}>
      <span
        className={`${styles.dot} ${styles[tone]} ${pulse ? styles.pulse : ''}`}
        aria-hidden="true"
      />
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  )
}
