import type { ReactNode } from 'react'
import type { ReleasesState } from '@shared/domain/releases'
import styles from '../ReleasesPage.module.scss'

/**
 * What's being done for the website, while it is: an Update, Publish
 * everything, Sync now or an edit going, and the covers following one at
 * a time, with how far they've got.
 */
export function ActivityStrip({ state }: { state: ReleasesState }): ReactNode {
  const { working, covers } = state
  if (!working && !covers) return null
  const share = covers && covers.total ? (covers.done / covers.total) * 100 : 0

  return (
    <div className={styles.activity} role="status" aria-live="polite">
      {working ? (
        <div className={styles.activityRow}>
          <span className={styles.activityLabel}>{working.label}</span>
          <span className={styles.activityDetail}>{working.detail}</span>
          <span className={styles.activityBar} data-indeterminate>
            <span />
          </span>
        </div>
      ) : null}
      {covers ? (
        <>
          <div className={styles.activityRow}>
            <span className={styles.activityLabel}>Sending covers</span>
            <span className={styles.activityDetail}>
              {Math.min(covers.done + 1, covers.total)} of {covers.total} · {covers.current}
            </span>
            <span className={styles.activityBar}>
              <span style={{ width: `${share}%` }} />
            </span>
          </div>
          <p className={styles.activityNote}>
            Each is made into a 750×750 WebP and its shelf tape on the website. Updates can go in
            between them.
          </p>
        </>
      ) : null}
    </div>
  )
}
