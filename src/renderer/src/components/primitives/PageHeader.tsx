import type { ReactNode } from 'react'
import { formatIndex } from '@renderer/lib/format'
import { GuideButton } from '@renderer/components/guide/GuideButton'
import type { GuideId } from '@renderer/features/catechism/content'
import styles from './PageHeader.module.scss'

export interface PageHeaderProps {
  index: number
  label: string
  purpose: string
  /** Flavour line from the world brief, set beneath the rule. */
  epigraph?: string
  /** Right-aligned actions or status. */
  actions?: ReactNode
  /**
   * The department's quick guide, offered at the end of the action row.
   *
   * Carried by the masthead rather than passed into `actions` by each page so
   * the affordance cannot end up in a different place on different departments
   * — the operator learns one location. Renders nothing when the guide has not
   * been written, so it is safe to declare ahead of the prose.
   */
  guideId?: GuideId
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
  actions,
  guideId
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
        {actions || guideId ? (
          <div className={styles.actions}>
            {actions}
            {guideId ? <GuideButton guideId={guideId} eyebrow={label} /> : null}
          </div>
        ) : null}
      </div>

      <span className={styles.rule} aria-hidden="true" />

      {epigraph ? <p className={styles.epigraph}>{epigraph}</p> : null}
    </header>
  )
}
