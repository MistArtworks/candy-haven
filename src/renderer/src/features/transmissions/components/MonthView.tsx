import type { ReactNode } from 'react'
import type { ScheduleCollision, ScheduleEntry } from '@shared/domain/transmissions'
import { MONTH_CELL_ENTRY_LIMIT } from '@shared/domain/transmissions.constants'
import { buildMonthGrid, dayOfMonth, WEEKDAY_LABELS } from '../lib/calendar'
import { EntryMark } from './EntryMark'
import styles from './calendar.module.scss'

/**
 * The month grid — the view that answers "what does this campaign look like".
 *
 * Always six rows, so stepping through the year does not resize the panel under
 * the operator. Cells cap their marks and state the remainder rather than
 * scrolling: a cell that scrolls hides exactly the thing a calendar exists to
 * make visible, and the day manifest below is one click away for the full list.
 */

export interface MonthViewProps {
  anchor: string
  today: string
  selected: string | null
  entriesByDate: Map<string, ScheduleEntry[]>
  collisionsByDay: Map<string, ScheduleCollision>
  onSelectDay: (date: string) => void
}

export function MonthView({
  anchor,
  today,
  selected,
  entriesByDate,
  collisionsByDay,
  onSelectDay
}: MonthViewProps): ReactNode {
  const cells = buildMonthGrid(anchor)

  return (
    <div className={styles.month}>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className={styles.weekday}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.monthGrid} role="grid" aria-label="Month">
        {cells.map((cell) => {
          const entries = entriesByDate.get(cell.date) ?? []
          const shown = entries.slice(0, MONTH_CELL_ENTRY_LIMIT)
          const hidden = entries.length - shown.length
          const collision = collisionsByDay.get(cell.date)

          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              className={styles.cell}
              data-outside={!cell.inMonth || undefined}
              data-today={cell.date === today || undefined}
              data-selected={cell.date === selected || undefined}
              data-collision={collision?.severity}
              aria-label={`${cell.date}, ${entries.length} entries`}
              onClick={() => onSelectDay(cell.date)}
            >
              <span className={styles.cellHead}>
                <span className={styles.cellDay}>{dayOfMonth(cell.date)}</span>
                {collision ? (
                  <span className={styles.cellFlag} title={collision.reason}>
                    !
                  </span>
                ) : null}
              </span>

              <span className={styles.cellBody}>
                {shown.map((entry) => (
                  <EntryMark key={entry.id} entry={entry} compact />
                ))}
                {hidden > 0 ? <span className={styles.cellMore}>+{hidden} MORE</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
