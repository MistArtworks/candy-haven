import type { ReactNode } from 'react'
import type { ScheduleCollision, ScheduleEntry } from '@shared/domain/transmissions'
import { buildWeek, dayOfMonth, weekdayLabel } from '../lib/calendar'
import { EntryMark } from './EntryMark'
import styles from './calendar.module.scss'

/**
 * Seven columns, one per day, each carrying its whole manifest.
 *
 * The month grid trades detail for span; this is the other way round. It
 * follows the ARCHIVE pipeline board's column treatment — a sticky head over a
 * scrolling body — because that is already the console's idiom for a column of
 * cards, and a second idiom for the same shape would be one more thing to
 * learn for no gain.
 */

export interface WeekViewProps {
  anchor: string
  today: string
  selected: string | null
  entriesByDate: Map<string, ScheduleEntry[]>
  collisionsByDay: Map<string, ScheduleCollision>
  onSelectDay: (date: string) => void
}

export function WeekView({
  anchor,
  today,
  selected,
  entriesByDate,
  collisionsByDay,
  onSelectDay
}: WeekViewProps): ReactNode {
  return (
    <div className={styles.week}>
      {buildWeek(anchor).map((date) => {
        const entries = entriesByDate.get(date) ?? []
        const collision = collisionsByDay.get(date)

        return (
          <section
            key={date}
            className={styles.weekColumn}
            data-today={date === today || undefined}
            data-selected={date === selected || undefined}
            data-collision={collision?.severity}
          >
            <button
              type="button"
              className={styles.weekHead}
              onClick={() => onSelectDay(date)}
              title={collision?.reason ?? `Open ${date}`}
            >
              <span className={styles.weekDayName}>{weekdayLabel(date)}</span>
              <span className={styles.weekDayNumber}>{dayOfMonth(date)}</span>
              {collision ? <span className={styles.cellFlag}>!</span> : null}
            </button>

            <div className={styles.weekBody}>
              {entries.length === 0 ? (
                <span className={styles.weekEmpty}>—</span>
              ) : (
                entries.map((entry) => (
                  <EntryMark key={entry.id} entry={entry} onSelect={() => onSelectDay(date)} />
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
