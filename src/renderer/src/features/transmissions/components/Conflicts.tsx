import type { ReactNode } from 'react'
import type { ReleaseWindow, ScheduleCollision } from '@shared/domain/transmissions'
import { COLLISION_SEVERITY_LABEL } from '@shared/domain/transmissions.constants'
import { formatCountdown, formatIsoDate } from '@renderer/lib/format'
import styles from '../TransmissionsPage.module.scss'

/**
 * What is wrong with the schedule: campaign clashes, then missed submissions.
 *
 * Both are computed in the main process and arrive on the schedule, so this
 * panel reports rather than decides. Worth stating because the temptation is to
 * re-derive "is this late" in the view — and then two surfaces disagree the
 * first time the rule changes.
 *
 * An empty list is the expected state and reads as a clean bill rather than a
 * blank panel.
 */

export interface ConflictsProps {
  collisions: readonly ScheduleCollision[]
  overdue: readonly ReleaseWindow[]
  onSelectDay: (date: string) => void
}

export function Conflicts({ collisions, overdue, onSelectDay }: ConflictsProps): ReactNode {
  if (collisions.length === 0 && overdue.length === 0) {
    return (
      <div className={styles.clear}>
        <p className={styles.clearLead}>No conflicts.</p>
        <p className={styles.clearHint}>
          No two campaigns share a day, and every submission window is still open.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.conflicts}>
      {collisions.map((collision) => (
        <button
          key={`${collision.date}-${collision.severity}`}
          type="button"
          className={styles.conflict}
          data-severity={collision.severity}
          onClick={() => onSelectDay(collision.date)}
        >
          <span className={styles.conflictHead}>
            <span className={styles.conflictDate}>{formatIsoDate(collision.date)}</span>
            <span className={styles.conflictSeverity}>
              {COLLISION_SEVERITY_LABEL[collision.severity]}
            </span>
          </span>
          <span className={styles.conflictReason}>{collision.reason}</span>
        </button>
      ))}

      {overdue.map((window) => (
        <button
          key={`window-${window.projectId}`}
          type="button"
          className={styles.conflict}
          data-severity="warn"
          onClick={() => onSelectDay(window.releaseDate)}
        >
          <span className={styles.conflictHead}>
            <span className={styles.conflictDate}>{formatIsoDate(window.submitBy)}</span>
            <span className={styles.conflictSeverity}>SUBMISSION</span>
          </span>
          <span className={styles.conflictReason}>
            {window.title} was owed to the distributor {formatCountdown(window.submitBy)} and goes
            live {formatCountdown(window.releaseDate)}.
          </span>
        </button>
      ))}
    </div>
  )
}
