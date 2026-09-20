import type { ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  CALENDAR_KIND,
  WEEKDAY_LABELS,
  entriesOn,
  entrySpan,
  formatMinute,
  weekdayIndex
} from '@shared/domain/calendar.constants'
import { formatIsoDate, formatCountdown, todayIso } from '@renderer/lib/format'
import { TimeGrid } from './TimeGrid'
import styles from '../CalendarPage.module.scss'

import type { CalendarRelease } from '@shared/domain/calendar'
import { anniversariesOn } from '../anniversaries'
import { AnniversaryMark } from './AnniversaryMark'
import { ReleaseMark } from './ReleaseMark'

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
  onOpenEntry: (entry: CalendarEntry) => void
  onOpenSlot: (date: string, startMinute: number) => void
  onToggleDone: (entry: CalendarEntry) => void
}

/**
 * One day, twice.
 *
 * The clock on the left answers "when", the sheet on the right answers "what" —
 * and the sheet is where an entry's notes are actually readable, which a
 * 40-minute block in a time grid never is. Both are views of the same array, so
 * they cannot disagree.
 */
export function DayView({
  date,
  entries,
  releases,
  onOpenEntry,
  onOpenSlot,
  onToggleDone
}: DayViewProps): ReactNode {
  const filed = entriesOn(entries, date)
  const out = releases.filter((release) => release.date === date)
  const marked = anniversariesOn(releases, date)
  const isToday = date === todayIso()

  return (
    <div className={styles.day}>
      <TimeGrid
        dates={[date]}
        entries={entries}
        releases={releases}
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

        {/*
          A release out today is business, so the day is not clear — and
          neither is a day the catalogue is marking. Three conditions rather
          than one ternary because the sheet can hold any of the lists, all
          of them, or none.
        */}
        {filed.length === 0 && out.length === 0 && marked.length === 0 ? (
          <p className={styles.sheetEmpty}>THE DAY IS CLEAR.</p>
        ) : null}

        {out.length > 0 || marked.length > 0 ? (
          <ul className={styles.sheetReleases}>
            {out.map((release) => (
              <li key={release.releaseId}>
                <ReleaseMark release={release} />
              </li>
            ))}
            {marked.map((anniversary) => (
              <li key={`${anniversary.releaseId}-${anniversary.years}`}>
                <AnniversaryMark anniversary={anniversary} />
              </li>
            ))}
          </ul>
        ) : null}

        {filed.length > 0 ? (
          <ul className={styles.sheetList}>
            {filed.map((entry) => {
              const kind = CALENDAR_KIND[entry.kind]
              const span = entrySpan(entry)

              return (
                <li key={entry.id} className={styles.sheetRow} data-done={entry.done || undefined}>
                  <button
                    type="button"
                    className={styles.sheetMark}
                    data-tone={kind.tone}
                    data-done={entry.done || undefined}
                    role="checkbox"
                    aria-checked={entry.done}
                    onClick={() => onToggleDone(entry)}
                    title={entry.done ? 'Reopen this entry' : 'Mark this entry discharged'}
                  />

                  <button
                    type="button"
                    className={styles.sheetBody}
                    onClick={() => onOpenEntry(entry)}
                  >
                    <span className={styles.sheetMeta}>
                      <span className={styles.sheetKind} data-tone={kind.tone}>
                        {kind.label}
                      </span>
                      <span className={styles.sheetClock}>
                        {span
                          ? `${formatMinute(span.start)}–${formatMinute(span.end % 1440)}`
                          : 'ALL DAY'}
                      </span>
                    </span>
                    <span className={styles.sheetTitle}>{entry.title}</span>
                    {entry.notes ? <span className={styles.sheetNotes}>{entry.notes}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </aside>
    </div>
  )
}
