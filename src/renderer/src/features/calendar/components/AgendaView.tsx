import { useMemo, type ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  CALENDAR_KIND,
  WEEKDAY_LABELS,
  compareEntries,
  entrySpan,
  formatMinute,
  parseIsoDate,
  weekdayIndex
} from '@shared/domain/calendar.constants'
import { MONTHS, formatCountdown, todayIso } from '@renderer/lib/format'
import styles from '../CalendarPage.module.scss'

export interface AgendaViewProps {
  /** Entries from this date onward are listed; earlier ones are summarised. */
  from: string
  entries: readonly CalendarEntry[]
  onOpenEntry: (entry: CalendarEntry) => void
  onToggleDone: (entry: CalendarEntry) => void
  onInspectDate: (date: string) => void
}

/**
 * The register as a ledger.
 *
 * Not a grid at all: dated rows, ruled, in one continuous column — which is
 * what the operator wants when the question is "what is coming" rather than
 * "what does this month look like". This is also the only view that reads an
 * entry's notes without being asked, because it has the width for them.
 *
 * Everything before `from` is collected into a single line rather than listed.
 * An agenda that opens on last spring is an archive, and the ARCHIVE is
 * elsewhere.
 */
export function AgendaView({
  from,
  entries,
  onOpenEntry,
  onToggleDone,
  onInspectDate
}: AgendaViewProps): ReactNode {
  const today = todayIso()

  const { days, past } = useMemo(() => {
    const forward = entries.filter((entry) => entry.date >= from).sort(compareEntries)
    const grouped = new Map<string, CalendarEntry[]>()

    for (const entry of forward) {
      const bucket = grouped.get(entry.date)
      if (bucket) bucket.push(entry)
      else grouped.set(entry.date, [entry])
    }

    return {
      days: [...grouped.entries()].map(([date, filed]) => ({ date, filed })),
      past: entries.length - forward.length
    }
  }, [entries, from])

  if (days.length === 0) {
    return (
      <div className={styles.agendaEmpty}>
        <p className={styles.emptyLine}>NOTHING IS SCHEDULED FROM THIS DATE.</p>
        <p className={styles.emptyHint}>
          {past > 0
            ? `${past} ${past === 1 ? 'entry' : 'entries'} stand earlier in the register.`
            : 'File an entry to open the register.'}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.agenda}>
      {past > 0 ? (
        <p className={styles.agendaPast}>
          {past} {past === 1 ? 'ENTRY' : 'ENTRIES'} EARLIER IN THE REGISTER
        </p>
      ) : null}

      {days.map(({ date, filed }) => {
        const { day, month } = parseIsoDate(date)

        return (
          <section key={date} className={styles.agendaDay}>
            {/* The date is a stamp in the left margin — the ledger's rail — so
                the eye runs down dates and across to entries, not through a
                repeated date on every row. */}
            <button
              type="button"
              className={styles.agendaStamp}
              data-today={date === today || undefined}
              onClick={() => onInspectDate(date)}
              title="Open this day"
            >
              <span className={styles.agendaStampDay}>{String(day).padStart(2, '0')}</span>
              <span className={styles.agendaStampMonth}>{MONTHS[month - 1]}</span>
              <span className={styles.agendaStampWeekday}>
                {WEEKDAY_LABELS[weekdayIndex(date)]}
              </span>
              <span className={styles.agendaStampCountdown}>{formatCountdown(date)}</span>
            </button>

            <ul className={styles.agendaList}>
              {filed.map((entry) => {
                const kind = CALENDAR_KIND[entry.kind]
                const span = entrySpan(entry)

                return (
                  <li
                    key={entry.id}
                    className={styles.agendaRow}
                    data-done={entry.done || undefined}
                  >
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

                    <span className={styles.agendaClock}>
                      {span ? formatMinute(span.start) : '—'}
                    </span>

                    <button
                      type="button"
                      className={styles.agendaBody}
                      onClick={() => onOpenEntry(entry)}
                    >
                      <span className={styles.agendaTitleRow}>
                        <span className={styles.agendaKind} data-tone={kind.tone}>
                          {kind.label}
                        </span>
                        <span className={styles.agendaTitle}>{entry.title}</span>
                      </span>
                      {entry.notes ? (
                        <span className={styles.agendaNotes}>{entry.notes}</span>
                      ) : null}
                    </button>

                    <span className={styles.agendaSpan}>
                      {span ? `${entry.durationMinutes}m` : 'ALL DAY'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
