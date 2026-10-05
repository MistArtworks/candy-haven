import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useLeads, useNow } from '@renderer/hooks/useLeads'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import {
  byUrgency,
  followUpRoute,
  formatDue,
  openTaskRows,
  type TaskRow
} from '@renderer/features/artists/leads/model'
import styles from './FollowUpsBeacon.module.scss'

/** How many are named on the card; the rest are a count. */
const SHOWN = 3

/** The follow-ups the card was put away with; new ones bring it back. */
const HIDDEN_KEY = 'candy.nexus.followUpsHidden'

/**
 * Follow-ups, on the NEXUS.
 *
 * The landing is a picture, and this mustn't spoil it, so it's small, sits
 * in the corner under SONOALCHEMY where every field is sky, and fades with
 * the rest of the chrome on the way down. It still has to be seen: overdue
 * ones are written in the console's crimson with a slow pulse beside them.
 *
 * Put away, it folds to a mark in the same corner. A follow-up that wasn't
 * there when it was put away opens it again, so hiding today's list never
 * hides tomorrow's.
 */
export function FollowUpsBeacon(): ReactNode {
  const { state } = useLeads()
  const now = useNow(30_000, state)
  const navigate = useNavigate()
  const animate = useAnimationsEnabled()
  const [hidden, setHidden] = useState<string[]>(readHidden)

  const rows = useMemo(() => {
    const tonight = new Date(now)
    tonight.setHours(23, 59, 59, 999)
    return openTaskRows(state.leads, state.opportunities, now)
      .filter((row) => row.task.dueAt <= tonight.getTime())
      .sort(byUrgency)
  }, [state, now])

  if (rows.length === 0) return null

  const late = rows.filter((row) => row.status === 'overdue').length
  const folded = rows.every((row) => hidden.includes(row.task.id))

  const hide = (): void => {
    const ids = rows.map((row) => row.task.id)
    setHidden(ids)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids))
    } catch {
      // A preference: losing it shows the card again, which is harmless.
    }
  }

  const show = (): void => {
    setHidden([])
    try {
      localStorage.removeItem(HIDDEN_KEY)
    } catch {
      // As above.
    }
  }

  const open = (row: TaskRow): void => {
    void navigate(followUpRoute(row))
  }

  const summary = late > 0 ? `${late} overdue` : `${rows.length} today`

  return (
    <div className={styles.beacon} data-late={late > 0 || undefined}>
      <AnimatePresence initial={false} mode="wait">
        {folded ? (
          <motion.button
            key="folded"
            type="button"
            className={styles.mark}
            initial={animate ? { opacity: 0, x: 8 } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animate ? { opacity: 0, x: 8 } : undefined}
            transition={{ duration: 0.22 }}
            aria-label={`Follow-ups: ${summary}. Show them`}
            onClick={show}
          >
            <span className={styles.pulse} aria-hidden="true" />
            <span className={styles.markLabel}>Follow-ups</span>
            <span className={styles.markCount}>{rows.length}</span>
          </motion.button>
        ) : (
          <motion.section
            key="card"
            className={styles.card}
            aria-label="Follow-ups due"
            initial={animate ? { opacity: 0, y: -6 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -6 } : undefined}
            transition={{ duration: 0.26 }}
          >
            <header className={styles.head}>
              <span className={styles.pulse} aria-hidden="true" />
              <span className={styles.title}>Follow-ups</span>
              <span className={styles.summary}>{summary}</span>
              <button
                type="button"
                className={styles.hide}
                aria-label="Put the follow-ups away"
                title="Put away. A new one brings it back."
                onClick={hide}
              >
                –
              </button>
            </header>
            <ul className={styles.list}>
              {rows.slice(0, SHOWN).map((row) => (
                <li key={row.task.id}>
                  <button type="button" className={styles.row} onClick={() => open(row)}>
                    <span className={styles.who}>{row.who}</span>
                    <span className={styles.what}>{row.task.title}</span>
                    <span className={styles.due} data-late={row.status === 'overdue' || undefined}>
                      {formatDue(row.task, row.status, now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.more}
              onClick={() => void navigate('/artists?lens=leads')}
            >
              {rows.length > SHOWN ? `${rows.length - SHOWN} more in LEADS` : 'Open LEADS'} →
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
