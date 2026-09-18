import type { ReactNode } from 'react'
import { formatIndex } from '@renderer/lib/format'
import { GuideButton } from '@renderer/components/guide/GuideButton'
import type { GuideId } from '@renderer/features/catechism/content'
import styles from './PageHeader.module.scss'

export interface PageHeaderProps {
  index: number
  label: string
  purpose: string
  /**
   * What kind of thing this page is about, as a chip beside the label.
   *
   * Added for the OBSERVATORY overlay pages, where the label is an in-world
   * title that deliberately says nothing about function — `THE CONCORD`,
   * `THE MUSTER`, `CONVENING`. The chip is the shortest true answer to "what is
   * this", and it matches the one on the desk's board so the two surfaces name
   * the same thing the same way.
   *
   * Optional and absent by default, so no existing masthead changes. Use it
   * across a whole family of pages or not at all — one chipped masthead among a
   * department's pages reads as an oversight rather than as emphasis, which is
   * the same rule `Panel.icon` carries.
   */
  kind?: string
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
  kind,
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
            <div className={styles.titleRow}>
              <h1 className={styles.label}>{label}</h1>
              {kind ? <span className={styles.kind}>{kind}</span> : null}
            </div>
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
