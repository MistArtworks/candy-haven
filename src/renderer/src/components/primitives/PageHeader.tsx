import type { ReactNode } from 'react'
import { formatIndex } from '@renderer/lib/format'
import styles from './PageHeader.module.scss'

export interface PageHeaderProps {
  index: number
  label: string
  purpose: string
  /** Flavour line from the world brief, set beneath the rule. */
  epigraph?: string
  /** Right-aligned actions or status. */
  actions?: ReactNode
}

/**
 * Standard section masthead. Every page opens the same way — numbered label,
 * plain-language purpose, a measured rule, then the epigraph — so sections read
 * as departments of one institution rather than as separate screens.
 */
export function PageHeader({
  index,
  label,
  purpose,
  epigraph,
  actions
}: PageHeaderProps): ReactNode {
  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <span className={styles.index}>{formatIndex(index)}</span>
          <div>
            <h1 className={styles.label}>{label}</h1>
            <p className={styles.purpose}>{purpose}</p>
          </div>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      <span className={styles.rule} aria-hidden="true" />

      {epigraph ? <p className={styles.epigraph}>{epigraph}</p> : null}
    </header>
  )
}
