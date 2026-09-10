import type { ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  WEEKDAY_LABELS,
  entriesOn,
  isSameMonth,
  monthGrid,
  parseIsoDate,
  weekdayIndex
} from '@shared/domain/calendar.constants'
import { todayIso } from '@renderer/lib/format'
import { EntryChip } from './EntryChip'
import styles from '../CalendarPage.module.scss'

export interface MonthViewProps {
  /** Any date within the month being shown. */
  anchor: string
  entries: readonly CalendarEntry[]
  onOpenEntry: (entry: CalendarEntry) => void
  onOpenDate: (date: string) => void
  /** Jumps to the day view for a date. */
  onInspectDate: (date: string) => void
}

/** Beyond this a cell is a wall of chips; the rest is reported as a count. */
const CHIPS_PER_CELL = 3

/**
 * Six weeks at once.
 *
 * Always six rows, including the tail of the previous month and the head of the
 * next, so the grid does not change height as the operator pages through the
 * year. A month view that resizes under the cursor is the commonest way this
 * control is got wrong, and the cost of fixing it is one row of grey dates.
 */
export function MonthView({
  anchor,
  entries,
  onOpenEntry,
  onOpenDate,
  onInspectDate
}: MonthViewProps): ReactNode {
  const days = monthGrid(anchor)
  const today = todayIso()

  return (
    <div className={styles.month}>
      <div className={styles.monthHead} role="presentation">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className={styles.monthHeadCell}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.monthGrid}>
        {days.map((date) => {
          const filed = entriesOn(entries, date)
          const shown = filed.slice(0, CHIPS_PER_CELL)
          const overflow = filed.length - shown.length
          const { day } = parseIsoDate(date)

          return (
            <div
              key={date}
              className={styles.monthCell}
              data-outside={!isSameMonth(date, anchor) || undefined}
              data-today={date === today || undefined}
              data-weekend={weekdayIndex(date) >= 5 || undefined}
              // The cell files a new entry on its own date; the chips inside it
              // stop the event so opening one never also creates one.
              onClick={() => onOpenDate(date)}
              role="gridcell"
              tabIndex={-1}
            >
              <div className={styles.monthCellHead}>
                <button
                  type="button"
                  className={styles.monthDate}
                  onClick={(event) => {
                    event.stopPropagation()
                    onInspectDate(date)
                  }}
                  title="Open this day"
                >
                  {String(day).padStart(2, '0')}
                </button>
                {filed.length > 0 ? (
                  <span className={styles.monthCount}>{filed.length}</span>
                ) : null}
              </div>

              <div className={styles.monthCellBody}>
                {shown.map((entry) => (
                  <EntryChip key={entry.id} entry={entry} onOpen={onOpenEntry} />
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    className={styles.monthMore}
                    onClick={(event) => {
                      event.stopPropagation()
                      onInspectDate(date)
                    }}
                  >
                    +{overflow} MORE
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
