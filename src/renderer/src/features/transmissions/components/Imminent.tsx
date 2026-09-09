import type { ReactNode } from 'react'
import type { ScheduleEntry } from '@shared/domain/transmissions'
import { shiftIsoDate } from '@shared/domain/projects.constants'
import { formatIsoDate } from '@renderer/lib/format'
import { EntryMark } from './EntryMark'
import styles from '../TransmissionsPage.module.scss'

/**
 * What is due now — the panel to read before starting work.
 *
 * Four groups, in the order they demand attention: what has already slipped,
 * what is due today, what is due this week, and what is left before the next
 * release goes out. The last of those is the one a plain calendar cannot
 * answer, and it is the question an operator actually asks.
 *
 * `OVERDUE` covers only unsettled entries. A deliverable marked published on a
 * date that has passed is not late — it is done, and listing it as overdue
 * would train the operator to ignore the group.
 */

interface Group {
  label: string
  entries: ScheduleEntry[]
  /** Nothing in this group is a good outcome, so say so rather than showing a rule. */
  empty: string
  urgent?: boolean
}

export interface ImminentProps {
  entries: readonly ScheduleEntry[]
  today: string
  nextReleaseDate: string | null
  onSelectDay: (date: string) => void
}

export function Imminent({
  entries,
  today,
  nextReleaseDate,
  onSelectDay
}: ImminentProps): ReactNode {
  const weekEnd = shiftIsoDate(today, 7)

  const overdue = entries.filter((entry) => !entry.settled && entry.date < today)
  const dueToday = entries.filter((entry) => entry.date === today)
  const thisWeek = entries.filter((entry) => entry.date > today && entry.date <= weekEnd)

  // Strictly between the end of this week and release day, so an entry is never
  // counted twice across two groups.
  const beforeRelease = nextReleaseDate
    ? entries.filter((entry) => entry.date > weekEnd && entry.date <= nextReleaseDate)
    : []

  const groups: Group[] = [
    { label: 'Overdue', entries: overdue, empty: 'Nothing has slipped.', urgent: true },
    { label: 'Today', entries: dueToday, empty: 'Nothing due today.' },
    { label: 'This week', entries: thisWeek, empty: 'Nothing due this week.' },
    {
      label: nextReleaseDate
        ? `Before ${formatIsoDate(nextReleaseDate)}`
        : 'Before the next release',
      entries: beforeRelease,
      empty: nextReleaseDate ? 'Nothing else before it.' : 'No release scheduled.'
    }
  ]

  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <section key={group.label} className={styles.group} data-urgent={group.urgent || undefined}>
          <header className={styles.groupHead}>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={styles.groupCount}>{group.entries.length}</span>
          </header>

          {group.entries.length === 0 ? (
            <p className={styles.groupEmpty}>{group.empty}</p>
          ) : (
            <div className={styles.groupBody}>
              {group.entries.map((entry) => (
                <EntryMark key={entry.id} entry={entry} onSelect={() => onSelectDay(entry.date)} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
