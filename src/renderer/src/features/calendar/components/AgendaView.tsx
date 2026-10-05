import { useMemo, type ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  CALENDAR_KIND,
  WEEKDAY_LABELS,
  addDays,
  compareEntries,
  entrySpan,
  formatMinute,
  parseIsoDate,
  weekdayIndex
} from '@shared/domain/calendar.constants'
import { MONTHS, formatCountdown, todayIso } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../CalendarPage.module.scss'

import type { CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import type { Pin } from '@shared/domain/strip'
import { anniversariesBetween } from '../anniversaries'
import {
  FOLLOW_UP_LABEL,
  FOLLOW_UP_PARENT_LABEL,
  dayItems,
  describeFollowUp,
  useOpenFollowUp
} from '../followUps'
import { AnniversaryMark } from './AnniversaryMark'
import { AttachmentLinks } from './AttachmentLinks'
import { EntryHints } from './EntryHints'
import { FollowUpGlyph, FollowUpPriority } from './FollowUpMark'
import { ReleaseMark } from './ReleaseMark'

export interface AgendaViewProps {
  /** Entries from this date onward are listed; earlier ones are summarised. */
  from: string
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
  onToggleDone: (entry: CalendarEntry) => void
  onInspectDate: (date: string) => void
  /** Opens one of an entry's attachments, listed under it. */
  onOpenAttachment: (pin: Pin) => void
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
  releases,
  followUps,
  onOpenEntry,
  onToggleDone,
  onInspectDate,
  onOpenAttachment
}: AgendaViewProps): ReactNode {
  const today = todayIso()
  const openFollowUp = useOpenFollowUp()

  const { days, past, overdue } = useMemo(() => {
    const forward = entries.filter((entry) => entry.date >= from).sort(compareEntries)
    const grouped = new Map<string, CalendarEntry[]>()

    for (const entry of forward) {
      const bucket = grouped.get(entry.date)
      if (bucket) bucket.push(entry)
      else grouped.set(entry.date, [entry])
    }

    /*
     * A release date opens a day of its own.
     *
     * Folded into the grouping rather than drawn per-section, because a
     * day whose only business is a release has no entry to group under
     * and would otherwise never appear here at all — and the ledger is
     * the one view whose whole question is "what is coming".
     */
    const out = releases.filter((release) => release.date >= from)
    for (const release of out) {
      if (!grouped.has(release.date)) grouped.set(release.date, [])
    }

    /*
     * And so does an anniversary, bounded to one year ahead.
     *
     * The bound is what the other three views do not need: a month, a week
     * and a day are finite, and this is a list running forward from a date
     * with no far end. Anniversaries recur for as long as the catalogue
     * exists, so without a horizon the ledger would never stop. One year
     * shows every record in the catalogue exactly once, which is the most
     * the question "what is coming" can honestly want.
     */
    const marks = anniversariesBetween(releases, from, addDays(from, 365))
    for (const mark of marks) {
      if (!grouped.has(mark.date)) grouped.set(mark.date, [])
    }

    /*
     * And so does a follow-up, with no horizon. Unlike an anniversary it
     * does not recur: there are only as many as ARTISTS holds tasks for,
     * and each falls once.
     */
    const due = new Map<string, CalendarFollowUp[]>()
    for (const followUp of followUps) {
      if (followUp.date < from) continue
      const bucket = due.get(followUp.date)
      if (bucket) bucket.push(followUp)
      else due.set(followUp.date, [followUp])
      if (!grouped.has(followUp.date)) grouped.set(followUp.date, [])
    }

    /*
     * Follow-ups left open before the date. Earlier entries are only
     * counted, and these are named beside them, because the ledger would
     * otherwise drop them without a word: an overdue follow-up is somebody
     * still waiting to hear back, however far behind the page it falls.
     * Pending ones are not late yet and completed ones are done, so neither
     * is mentioned.
     */
    const leftOpen = followUps.filter(
      (followUp) => followUp.status === 'overdue' && followUp.date < from
    )

    return {
      days: [...grouped.entries()]
        .map(([date, filed]) => ({
          date,
          // Entries and follow-ups in one run, by time: the ledger's
          // question is what comes next, and a follow-up at ten comes
          // before a session at two whichever department it is from.
          items: dayItems(filed, due.get(date) ?? []),
          out: out.filter((release) => release.date === date),
          marked: marks.filter((mark) => mark.date === date)
        }))
        // Insertion order was sorted while every day came from the
        // sorted entry list. A release can open a day in the middle of
        // it, so the order is now made rather than inherited.
        .sort((left, right) => left.date.localeCompare(right.date)),
      past: entries.length - forward.length,
      overdue: leftOpen.length
    }
  }, [entries, releases, followUps, from])

  if (days.length === 0) {
    return (
      <div className={styles.agendaEmpty}>
        <p className={styles.emptyLine}>NOTHING IS SCHEDULED FROM THIS DATE.</p>
        <p className={styles.emptyHint}>
          {past > 0
            ? `${past} ${past === 1 ? 'entry' : 'entries'} stand earlier in the register.`
            : 'File an entry to open the register.'}
        </p>
        {overdue > 0 ? (
          <p className={styles.emptyHint}>
            <span className={styles.agendaOverdue}>
              {overdue} {overdue === 1 ? 'follow-up is' : 'follow-ups are'} overdue before this
              date.
            </span>
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.agenda}>
      {past > 0 || overdue > 0 ? (
        <p className={styles.agendaPast}>
          {past > 0 ? `${past} ${past === 1 ? 'ENTRY' : 'ENTRIES'} EARLIER IN THE REGISTER` : null}
          {past > 0 && overdue > 0 ? ' · ' : null}
          {overdue > 0 ? (
            <span className={styles.agendaOverdue}>
              {overdue} {overdue === 1 ? 'FOLLOW-UP' : 'FOLLOW-UPS'} OVERDUE BEFORE THIS DATE
            </span>
          ) : null}
        </p>
      ) : null}

      {days.map(({ date, items, out, marked }) => {
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
              {...tooltipTrigger('Open this day')}
            >
              <span className={styles.agendaStampDay}>{String(day).padStart(2, '0')}</span>
              <span className={styles.agendaStampMonth}>{MONTHS[month - 1]}</span>
              <span className={styles.agendaStampWeekday}>
                {WEEKDAY_LABELS[weekdayIndex(date)]}
              </span>
              <span className={styles.agendaStampCountdown}>{formatCountdown(date)}</span>
            </button>

            <ul className={styles.agendaList}>
              {out.map((release) => (
                <li
                  key={release.releaseId}
                  className={`${styles.agendaRow} ${styles.agendaRelease}`}
                >
                  <ReleaseMark release={release} />
                </li>
              ))}

              {marked.map((anniversary) => (
                <li
                  key={`${anniversary.releaseId}-${anniversary.years}`}
                  className={`${styles.agendaRow} ${styles.agendaRelease}`}
                >
                  <AnniversaryMark anniversary={anniversary} />
                </li>
              ))}

              {items.map((item) => {
                if (item.type === 'followUp') {
                  const { followUp } = item
                  const description = describeFollowUp(followUp)

                  return (
                    <li
                      key={item.key}
                      className={`${styles.agendaRow} ${styles.agendaFollowUp}`}
                      data-status={followUp.status}
                    >
                      {/* The entry rows' own columns, so the clock lines up down
                          the day. The arrow takes the discharge mark's slot;
                          there is nothing here to tick. */}
                      <FollowUpGlyph />

                      <span className={styles.agendaClock}>
                        {formatMinute(followUp.startMinute)}
                      </span>

                      <button
                        type="button"
                        className={styles.agendaBody}
                        aria-label={description}
                        onClick={() => openFollowUp(followUp)}
                        {...tooltipTrigger(description)}
                      >
                        <span className={styles.agendaTitleRow}>
                          <span className={styles.agendaKind}>{FOLLOW_UP_LABEL}</span>
                          <span className={styles.agendaTitle}>
                            {followUp.who || followUp.title}
                          </span>
                          <FollowUpPriority followUp={followUp} />
                        </span>
                        {followUp.who && followUp.title ? (
                          <span className={styles.agendaNotes}>{followUp.title}</span>
                        ) : null}
                      </button>

                      {/* Where pressing it leads, in the column an entry gives
                          its length: a follow-up has none. */}
                      <span className={styles.agendaSpan}>
                        {FOLLOW_UP_PARENT_LABEL[followUp.parentKind]}
                      </span>
                    </li>
                  )
                }

                const { entry } = item
                const kind = CALENDAR_KIND[entry.kind]
                const span = entrySpan(entry)

                return (
                  <li
                    key={item.key}
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
                      {...tooltipTrigger(
                        entry.done ? 'Reopen this entry' : 'Mark this entry discharged'
                      )}
                    />

                    <span className={styles.agendaClock}>
                      {span ? formatMinute(span.start) : '—'}
                    </span>

                    {/* The attachments sit outside the body's button, which
                        opens the entry: a button cannot hold another. */}
                    <div className={styles.agendaMain}>
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
                          <EntryHints entry={entry} clip={false} />
                        </span>
                        {entry.notes ? (
                          <span className={styles.agendaNotes}>{entry.notes}</span>
                        ) : null}
                      </button>
                      <AttachmentLinks pins={entry.attachments} onOpen={onOpenAttachment} />
                    </div>

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
