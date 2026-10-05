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

import type { CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import { anniversariesOn } from '../anniversaries'
import { dayItems, followUpsOn } from '../followUps'
import { AnniversaryMark } from './AnniversaryMark'
import { FollowUpMark } from './FollowUpMark'
import { ReleaseMark } from './ReleaseMark'

export interface MonthViewProps {
  /** Any date within the month being shown. */
  anchor: string
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
   * `releases` and kept apart from `entries` for the same reason.
   */
  followUps: readonly CalendarFollowUp[]
  onOpenEntry: (entry: CalendarEntry) => void
  /** Opens a date's day sheet: what is on it, and a way to add to it. */
  onOpenDay: (date: string) => void
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
  releases,
  followUps,
  onOpenEntry,
  onOpenDay,
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
          const due = followUpsOn(followUps, date)
          const out = releases.filter((release) => release.date === date)
          const marked = anniversariesOn(releases, date)
          /*
           * Entries claim the cell's chips first and follow-ups take the room
           * they leave. An entry is the operator's own appointment; a
           * follow-up is a reading from ARTISTS, and the day view lists every
           * one of them. Whatever makes it in is then drawn in time order, so
           * the cell reads the way the day runs.
           *
           * Unlike releases they are truncated with the rest: a lead can
           * carry any number of tasks, so one day can hold more follow-ups
           * than a cell has lines, where a catalogue puts out a handful of
           * records on a date at most.
           */
          const keptEntries = filed.slice(0, CHIPS_PER_CELL)
          const keptFollowUps = due.slice(0, CHIPS_PER_CELL - keptEntries.length)
          const shown = dayItems(keptEntries, keptFollowUps)
          const overflow = filed.length + due.length - shown.length
          const { day } = parseIsoDate(date)

          return (
            <div
              key={date}
              className={styles.monthCell}
              data-outside={!isSameMonth(date, anchor) || undefined}
              data-today={date === today || undefined}
              data-weekend={weekdayIndex(date) >= 5 || undefined}
              // The cell opens its own day's sheet, which lists the day and
              // offers a new entry on it. It used to file the entry outright,
              // a dialog to cancel for anyone who only wanted to look. The
              // chips and marks inside it stop the event, so opening one
              // never also opens the sheet.
              onClick={() => onOpenDay(date)}
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
                {/* What is filed here, and only that: a follow-up is filed in
                    ARTISTS, so like a release it is drawn but not counted. */}
                {filed.length > 0 ? (
                  <span className={styles.monthCount}>{filed.length}</span>
                ) : null}
              </div>

              <div className={styles.monthCellBody}>
                {/*
                  Releases lead the cell, and are never truncated by
                  `CHIPS_PER_CELL`. A day with four sessions on it can
                  summarise the fourth; a day a record comes out cannot
                  hide that it does.
                */}
                {out.map((release) => (
                  <ReleaseMark key={release.releaseId} release={release} terse />
                ))}
                {/*
                  Anniversaries follow the releases and lead the chips, and
                  are likewise never truncated. They are bounded by how many
                  records happen to share one calendar date, which for one
                  catalogue is a small number — unlike the entries below
                  them, which the operator can file without limit.
                */}
                {marked.map((anniversary) => (
                  <AnniversaryMark
                    key={`${anniversary.releaseId}-${anniversary.years}`}
                    anniversary={anniversary}
                    terse
                  />
                ))}
                {shown.map((item) =>
                  item.type === 'entry' ? (
                    <EntryChip key={item.key} entry={item.entry} onOpen={onOpenEntry} />
                  ) : (
                    <FollowUpMark key={item.key} followUp={item.followUp} terse />
                  )
                )}
                {/* Counts follow-ups as well as entries: it says what the
                    cell had no room to draw, whichever kind that was. */}
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
