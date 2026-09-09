import type { ReactNode } from 'react'
import type { ScheduleCollision, ScheduleEntry } from '@shared/domain/transmissions'
import { formatCountdown, formatIsoDate } from '@renderer/lib/format'
import { weekdayLabel } from '../lib/calendar'
import { EntryMark } from './EntryMark'
import styles from './calendar.module.scss'

/**
 * The ledger: every dated thing from today forward, grouped by day.
 *
 * Empty days are omitted, which is the whole point of it — the month grid draws
 * the shape of a plan, and this draws the work. It is the view to have open
 * while actually clearing a backlog, and it reads like the ARCHIVE register on
 * purpose.
 *
 * Deliberately not bounded to the anchored month: an agenda that stopped at the
 * 31st would hide the release on the 2nd, which is exactly the thing the
 * operator most needs to see.
 */

export interface AgendaViewProps {
  entries: readonly ScheduleEntry[]
  today: string
  collisionsByDay: Map<string, ScheduleCollision>
  onSelectDay: (date: string) => void
}

export function AgendaView({
  entries,
  today,
  collisionsByDay,
  onSelectDay
}: AgendaViewProps): ReactNode {
  const ahead = entries.filter((entry) => entry.date >= today)

  // Grouped here rather than with the shared helper: this view wants the days
  // in chronological order, and a Map built from an already-sorted list keeps
  // that without a second sort.
  const days = new Map<string, ScheduleEntry[]>()
  for (const entry of ahead) {
    const existing = days.get(entry.date)
    if (existing) existing.push(entry)
    else days.set(entry.date, [entry])
  }

  if (days.size === 0) {
    return <p className={styles.empty}>Nothing is scheduled from today onward.</p>
  }

  return (
    <div className={styles.agenda}>
      {[...days].map(([date, dayEntries]) => {
        const collision = collisionsByDay.get(date)

        return (
          <section key={date} className={styles.agendaDay}>
            <button
              type="button"
              className={styles.agendaHead}
              data-today={date === today || undefined}
              data-collision={collision?.severity}
              onClick={() => onSelectDay(date)}
              title={collision?.reason ?? `Open ${date}`}
            >
              <span className={styles.agendaDate}>{formatIsoDate(date)}</span>
              <span className={styles.agendaWeekday}>{weekdayLabel(date)}</span>
              <span className={styles.agendaCountdown}>{formatCountdown(date)}</span>
              {collision ? <span className={styles.cellFlag}>!</span> : null}
            </button>

            <div className={styles.agendaBody}>
              {dayEntries.map((entry) => (
                <EntryMark key={entry.id} entry={entry} onSelect={() => onSelectDay(date)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
