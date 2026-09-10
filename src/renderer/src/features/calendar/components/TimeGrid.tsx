import { useEffect, useRef, type ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  CALENDAR_KIND,
  WEEKDAY_LABELS,
  entriesOn,
  entrySpan,
  formatMinute,
  parseIsoDate,
  weekdayIndex
} from '@shared/domain/calendar.constants'
import { todayIso } from '@renderer/lib/format'
import { EntryChip } from './EntryChip'
import styles from '../CalendarPage.module.scss'

export interface TimeGridProps {
  /** The columns, left to right. One date for the day view, seven for the week. */
  dates: readonly string[]
  entries: readonly CalendarEntry[]
  onOpenEntry: (entry: CalendarEntry) => void
  /** Files a new entry on a date, at the hour that was clicked. */
  onOpenSlot: (date: string, startMinute: number) => void
  onInspectDate: (date: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Where the grid is scrolled on arrival — a working day, not midnight. */
const OPENING_HOUR = 7

interface PlacedEntry {
  entry: CalendarEntry
  start: number
  end: number
  /** Which of the overlapping columns this entry occupies. */
  lane: number
  /** How many columns the cluster it belongs to was split into. */
  lanes: number
}

/**
 * Lays out one day's timed entries, splitting overlaps into columns.
 *
 * A cluster is a run of entries that transitively overlap; every entry in one
 * is drawn at the same width, so two appointments at the same hour each take
 * half the column rather than one hiding the other. Clusters are resolved
 * independently, which is what stops a single long entry in the morning from
 * narrowing the whole day.
 */
function layoutDay(entries: readonly CalendarEntry[]): PlacedEntry[] {
  const timed = entries
    .map((entry) => ({ entry, span: entrySpan(entry) }))
    .filter((item): item is { entry: CalendarEntry; span: { start: number; end: number } } =>
      Boolean(item.span)
    )
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end)

  const placed: PlacedEntry[] = []
  let cluster: PlacedEntry[] = []
  let clusterEnd = -1
  /** End time of the last entry in each open lane. */
  let laneEnds: number[] = []

  const closeCluster = (): void => {
    const lanes = laneEnds.length
    for (const item of cluster) placed.push({ ...item, lanes })
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }

  for (const { entry, span } of timed) {
    // A gap with nothing spanning it ends the cluster: entries after it are
    // free to use the full width again.
    if (span.start >= clusterEnd && cluster.length > 0) closeCluster()

    let lane = laneEnds.findIndex((end) => end <= span.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(span.end)
    } else {
      laneEnds[lane] = span.end
    }

    cluster.push({ entry, start: span.start, end: span.end, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, span.end)
  }

  if (cluster.length > 0) closeCluster()
  return placed
}

/**
 * The clock grid, shared by the week and the day.
 *
 * Positions are percentages of the 1440-minute day rather than pixels, so the
 * hour rules and the entries are laid out against the same coordinate space and
 * cannot drift apart when the row height changes — the height lives in one SCSS
 * variable, and nothing here needs to know it.
 *
 * All-day entries are lifted into a band above the clock. A deadline that falls
 * "on the 14th" has no time, and drawing it at midnight would make it read as
 * an appointment nobody made.
 */
export function TimeGrid({
  dates,
  entries,
  onOpenEntry,
  onOpenSlot,
  onInspectDate
}: TimeGridProps): ReactNode {
  const scroller = useRef<HTMLDivElement>(null)
  const today = todayIso()

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    // Opened at the working day rather than at midnight. Done once on mount:
    // paging to another week should not yank the operator's scroll position
    // back, which is why this does not depend on `dates`.
    element.scrollTop = (OPENING_HOUR / 24) * element.scrollHeight
  }, [])

  const allDayByDate = dates.map((date) => ({
    date,
    entries: entriesOn(entries, date).filter((entry) => entry.startMinute === null)
  }))
  const hasAllDay = allDayByDate.some((column) => column.entries.length > 0)

  return (
    <div className={styles.timeGrid}>
      <div className={styles.timeHead}>
        <span className={styles.timeGutterHead} aria-hidden="true" />
        {dates.map((date) => {
          const { day } = parseIsoDate(date)
          return (
            <button
              key={date}
              type="button"
              className={styles.timeHeadCell}
              data-today={date === today || undefined}
              data-weekend={weekdayIndex(date) >= 5 || undefined}
              onClick={() => onInspectDate(date)}
              title="Open this day"
            >
              <span className={styles.timeHeadDay}>{WEEKDAY_LABELS[weekdayIndex(date)]}</span>
              <span className={styles.timeHeadDate}>{String(day).padStart(2, '0')}</span>
            </button>
          )
        })}
      </div>

      {/* The band is drawn only when something is in it: an always-present empty
          strip above every week is furniture that never earns its height. */}
      {hasAllDay ? (
        <div className={styles.allDay}>
          <span className={styles.allDayLabel}>ALL DAY</span>
          {allDayByDate.map((column) => (
            <div key={column.date} className={styles.allDayCell}>
              {column.entries.map((entry) => (
                <EntryChip key={entry.id} entry={entry} onOpen={onOpenEntry} compact />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.timeBody} ref={scroller}>
        <div className={styles.timeGutter}>
          {HOURS.map((hour) => (
            <span key={hour} className={styles.timeGutterMark}>
              {/* Midnight carries no label: the row above it is the day before,
                  and a `00` at the top rule reads as a value rather than a
                  boundary. */}
              {hour === 0 ? '' : formatMinute(hour * 60)}
            </span>
          ))}
        </div>

        {dates.map((date) => {
          const placed = layoutDay(entriesOn(entries, date))

          return (
            <div
              key={date}
              className={styles.timeColumn}
              data-today={date === today || undefined}
              data-weekend={weekdayIndex(date) >= 5 || undefined}
            >
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className={styles.timeSlot}
                  onClick={() => onOpenSlot(date, hour * 60)}
                  aria-label={`File an entry on ${date} at ${formatMinute(hour * 60)}`}
                />
              ))}

              {placed.map(({ entry, start, end, lane, lanes }) => {
                const kind = CALENDAR_KIND[entry.kind]
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.timeEntry}
                    data-tone={kind.tone}
                    data-done={entry.done || undefined}
                    style={{
                      top: `${(start / 1440) * 100}%`,
                      height: `${((end - start) / 1440) * 100}%`,
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`
                    }}
                    onClick={() => onOpenEntry(entry)}
                    title={`${kind.label} — ${entry.title}`}
                  >
                    <span className={styles.timeEntryBar} aria-hidden="true" />
                    <span className={styles.timeEntryBody}>
                      <span className={styles.timeEntryClock}>
                        {formatMinute(start)}–{formatMinute(end % 1440)}
                      </span>
                      <span className={styles.timeEntryTitle}>{entry.title}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
