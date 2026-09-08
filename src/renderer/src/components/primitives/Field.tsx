import type { ReactNode } from 'react'
import styles from './Field.module.scss'

export interface FieldProps {
  label: string
  value: ReactNode
  /** Renders the value in the monospace telemetry face. */
  mono?: boolean
  /** Allows text selection — use for paths and identifiers worth copying. */
  selectable?: boolean
  /** Secondary line beneath the value. */
  hint?: string
}

/**
 * A labelled readout. The atomic unit of every diagnostic panel: institutional
 * label above, value below, both on a shared baseline grid.
 */
export function Field({
  label,
  value,
  mono = false,
  selectable = false,
  hint
}: FieldProps): ReactNode {
  return (
    <div className={styles.field}>
      <dt className={styles.label}>{label}</dt>
      <dd
        className={`${styles.value} ${mono ? styles.mono : ''}`}
        {...(selectable ? { 'data-selectable': true } : {})}
      >
        {value}
      </dd>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

/** Definition list wrapper that lays Fields onto a responsive column grid. */
export function FieldGrid({
  children,
  columns = 2
}: {
  children: ReactNode
  columns?: 1 | 2 | 3 | 4
}): ReactNode {
  return (
    <dl className={styles.grid} data-columns={columns}>
      {children}
    </dl>
  )
}
