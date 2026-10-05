import type { ReactNode } from 'react'
import { useLeads, useNow } from '@renderer/hooks/useLeads'
import { followUpRoute, openTaskRows } from '@renderer/features/artists/leads/model'
import { useNotice } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import { FollowUpRow } from './FollowUps'
import styles from '../Strip.module.scss'

/**
 * A clicked follow-up reminder, beside the strip.
 *
 * Windows notifications can't carry buttons of their own, so the reminder
 * opens this: the follow-up with its actions in reach (open the lead, log
 * and complete, snooze, dismiss). Once something is done about it, it goes.
 */
export function FollowUpPopup({
  taskId,
  onClose
}: {
  taskId: string
  onClose: () => void
}): ReactNode {
  const { state, ready } = useLeads()
  const now = useNow(30_000, state)
  const [notice, say] = useNotice()
  const row =
    openTaskRows(state.leads, state.opportunities, now).find((entry) => entry.task.id === taskId) ??
    null

  return (
    <div className={styles.todayPopup}>
      <PopupHead title="Follow up" onClose={onClose} />
      <div className={styles.todayList}>
        {row ? (
          <section className={styles.group}>
            <FollowUpRow
              row={row}
              now={now}
              open
              onToggle={() => undefined}
              onActed={onClose}
              onError={say}
            />
          </section>
        ) : (
          <p className={styles.quiet}>
            {ready ? 'Done already, or no longer here.' : 'Reading the follow-ups…'}
          </p>
        )}
      </div>

      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}

      <div className={styles.popupActions}>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => void window.candy.strip.popup({ kind: 'today', entryId: null })}
        >
          All of today
        </button>
        {row ? (
          <button
            type="button"
            className={styles.textButton}
            onClick={() =>
              void window.candy.strip
                .openTarget({ kind: 'page', route: followUpRoute(row) })
                .then(onClose)
            }
          >
            Open in ARTISTS
          </button>
        ) : null}
      </div>
    </div>
  )
}
