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
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { describeCarried } from '../attachments'
import { EntryChip } from './EntryChip'
import { EntryHints } from './EntryHints'
import styles from '../CalendarPage.module.scss'

import type { CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import { anniversariesOn } from '../anniversaries'
import { entryItem, followUpItem, followUpSpan, followUpsOn, type DayItem } from '../followUps'
import { AnniversaryMark } from './AnniversaryMark'
import { FollowUpMark } from './FollowUpMark'
import { ReleaseMark } from './ReleaseMark'

export interface TimeGridProps {
  /** The columns, left to right. One date for the day view, seven for the week. */
  dates: readonly string[]
  entries: readonly CalendarEntry[]
  /**
   * Release dates projected from the catalogue — see `CalendarReleaseSchema`.
   *
   * Separate from `entries` all the way down, so no view can accidentally
   * treat one as editable.
   */
  releases: readonly CalendarRelease[]
  /**
   * Follow-ups from ARTISTS' leads and opportunities, read the same way as
   * `releases` and kept apart from `entries` for the same reason. Each has a
   * minute, so it goes on the clock rather than in the all-day band.
   */
  followUps: readonly CalendarFollowUp[]
  onOpenEntry: (entry: CalendarEntry) => void
  /** Files a new entry on a date, at the hour that was clicked. */
  onOpenSlot: (date: string, startMinute: number) => void
  onInspectDate: (date: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Where the grid is scrolled on arrival — a working day, not midnight. */
const OPENING_HOUR = 7

/** Something on the clock, and the minutes it covers there. */
interface ClockItem {
  item: DayItem
  start: number
  end: number
}

interface PlacedItem extends ClockItem {
  /** Which of the overlapping columns this item occupies. */
  lane: number
  /** How many columns the cluster it belongs to was split into. */
  lanes: number
}

/**
 * One day's clock: its timed entries, and its follow-ups at their minutes.
 *
 * A follow-up joins the layout with the room its mark needs rather than with
 * a duration it does not have (see `FOLLOW_UP_FOOTPRINT`), so an entry that
 * starts beside it shares the column instead of being drawn over it.
 */
function clockItems(
  entries: readonly CalendarEntry[],
  followUps: readonly CalendarFollowUp[],
  date: string
): ClockItem[] {
  const items: ClockItem[] = []

  for (const entry of entriesOn(entries, date)) {
    const span = entrySpan(entry)
    if (span) items.push({ item: entryItem(entry), ...span })
  }
  for (const followUp of followUpsOn(followUps, date)) {
    items.push({ item: followUpItem(followUp), ...followUpSpan(followUp) })
  }

  return items
}

/**
 * Lays out one day's clock, splitting overlaps into columns.
 *
 * A cluster is a run of items that transitively overlap; every item in one is
 * drawn at the same width, so two appointments at the same hour each take
 * half the column rather than one hiding the other. Clusters are resolved
 * independently, which is what stops a single long entry in the morning from
 * narrowing the whole day.
 */
function layoutDay(items: readonly ClockItem[]): PlacedItem[] {
  // On the same minute an entry goes ahead of a follow-up, as it does in the
  // lists (`dayItems`), and so keeps the left of the column with the mark
  // beside it. Between two entries nothing changes.
  const rank = (clock: ClockItem): number => (clock.item.type === 'entry' ? 0 : 1)
  const timed = [...items].sort((a, b) => a.start - b.start || rank(a) - rank(b) || a.end - b.end)

  const placed: PlacedItem[] = []
  let cluster: PlacedItem[] = []
  let clusterEnd = -1
  /** End time of the last item in each open lane. */
  let laneEnds: number[] = []

  const closeCluster = (): void => {
    const lanes = laneEnds.length
    for (const member of cluster) placed.push({ ...member, lanes })
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }

  for (const { item, start, end } of timed) {
    // A gap with nothing spanning it ends the cluster: items after it are
    // free to use the full width again.
    if (start >= clusterEnd && cluster.length > 0) closeCluster()

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }

    cluster.push({ item, start, end, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end)
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
 *
 * Follow-ups are the opposite case: due at a minute and lasting none, so they
 * are drawn on the clock as a mark hung from that minute rather than as a
 * block of time.
 */
export function TimeGrid({
  dates,
  entries,
  releases,
  followUps,
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
    entries: entriesOn(entries, date).filter((entry) => entry.startMinute === null),
    // A release has no time of day, so it belongs in the band an all-day
    // entry already uses rather than pinned to midnight on the clock.
    releases: releases.filter((release) => release.date === date),
    // An anniversary has even less of a time of day than a release does.
    anniversaries: anniversariesOn(releases, date)
  }))
  const hasAllDay = allDayByDate.some(
    (column) =>
      column.entries.length > 0 || column.releases.length > 0 || column.anniversaries.length > 0
  )

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
              {...tooltipTrigger('Open this day')}
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
              {/* Ahead of the chips: a release date is fixed and an
                  all-day entry can be moved, so the immovable thing
                  holds the top of the cell. */}
              {column.releases.map((release) => (
                <ReleaseMark key={release.releaseId} release={release} terse={dates.length > 1} />
              ))}
              {column.anniversaries.map((anniversary) => (
                <AnniversaryMark
                  key={`${anniversary.releaseId}-${anniversary.years}`}
                  anniversary={anniversary}
                  terse={dates.length > 1}
                />
              ))}
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
          const placed = layoutDay(clockItems(entries, followUps, date))

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

              {placed.map(({ item, start, end, lane, lanes }) => {
                const box = {
                  top: `${(start / 1440) * 100}%`,
                  height: `${((end - start) / 1440) * 100}%`,
                  left: `${(lane / lanes) * 100}%`,
                  width: `${100 / lanes}%`
                }

                // Placed here, and drawn by the same mark a month cell uses.
                // The clock never builds a button of its own for one, so
                // nothing on it can open a follow-up as if it were an entry.
                if (item.type === 'followUp') {
                  return (
                    <div key={item.key} className={styles.timeFollowUp} style={box}>
                      <FollowUpMark followUp={item.followUp} terse={dates.length > 1} />
                    </div>
                  )
                }

                const { entry } = item
                const kind = CALENDAR_KIND[entry.kind]
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.timeEntry}
                    data-tone={kind.tone}
                    data-done={entry.done || undefined}
                    style={box}
                    onClick={() => onOpenEntry(entry)}
                    {...tooltipTrigger(
                      [`${kind.label} — ${entry.title}`, describeCarried(entry)]
                        .filter(Boolean)
                        .join(' · ')
                    )}
                  >
                    <span className={styles.timeEntryBar} aria-hidden="true" />
                    <span className={styles.timeEntryBody}>
                      <span className={styles.timeEntryClock}>
                        {formatMinute(start)}–{formatMinute(end % 1440)}
                        <EntryHints entry={entry} />
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
