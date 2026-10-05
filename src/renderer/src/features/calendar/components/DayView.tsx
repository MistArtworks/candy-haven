import type { ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import { WEEKDAY_LABELS, weekdayIndex } from '@shared/domain/calendar.constants'
import { formatIsoDate, formatCountdown, todayIso } from '@renderer/lib/format'
import { TimeGrid } from './TimeGrid'
import styles from '../CalendarPage.module.scss'

import type { CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import type { Pin } from '@shared/domain/strip'
import { DayList } from './DayList'

export interface DayViewProps {
  date: string
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
  onOpenSlot: (date: string, startMinute: number) => void
  onToggleDone: (entry: CalendarEntry) => void
  /** Opens one of an entry's attachments, listed on the sheet. */
  onOpenAttachment: (pin: Pin) => void
}

/**
 * One day, twice.
 *
 * The clock on the left answers "when", the sheet on the right answers "what" —
 * and the sheet is where an entry's notes are actually readable, which a
 * 40-minute block in a time grid never is. Both are views of the same array, so
 * they cannot disagree.
 *
 * The sheet's list is `DayList`, the same one a month cell opens over the
 * page, so a day reads the same wherever it is read.
 */
export function DayView({
  date,
  entries,
  releases,
  followUps,
  onOpenEntry,
  onOpenSlot,
  onToggleDone,
  onOpenAttachment
}: DayViewProps): ReactNode {
  const isToday = date === todayIso()

  return (
    <div className={styles.day}>
      <TimeGrid
        dates={[date]}
        entries={entries}
        releases={releases}
        followUps={followUps}
        onOpenEntry={onOpenEntry}
        onOpenSlot={onOpenSlot}
        onInspectDate={() => undefined}
      />

      <aside className={styles.sheet}>
        <header className={styles.sheetHead}>
          <span className={styles.sheetWeekday}>{WEEKDAY_LABELS[weekdayIndex(date)]}</span>
          <span className={styles.sheetDate}>{formatIsoDate(date)}</span>
          <span className={styles.sheetCountdown} data-today={isToday || undefined}>
            {formatCountdown(date)}
          </span>
        </header>

        <DayList
          date={date}
          entries={entries}
          releases={releases}
          followUps={followUps}
          onOpenEntry={onOpenEntry}
          onToggleDone={onToggleDone}
          onOpenAttachment={onOpenAttachment}
          emptyLabel="THE DAY IS CLEAR."
        />
      </aside>
    </div>
  )
}
