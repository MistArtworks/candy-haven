import type { ReactNode } from 'react'
import type { CalendarEntry, CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import {
  CALENDAR_KIND,
  entriesOn,
  entrySpan,
  formatMinute
} from '@shared/domain/calendar.constants'
import type { Pin } from '@shared/domain/strip'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { anniversariesOn } from '../anniversaries'
import {
  FOLLOW_UP_LABEL,
  FOLLOW_UP_PARENT_LABEL,
  dayItems,
  describeFollowUp,
  followUpsOn,
  useOpenFollowUp
} from '../followUps'
import { AnniversaryMark } from './AnniversaryMark'
import { AttachmentLinks } from './AttachmentLinks'
import { EntryHints } from './EntryHints'
import { FollowUpGlyph, FollowUpPriority } from './FollowUpMark'
import { ReleaseMark } from './ReleaseMark'
import styles from '../CalendarPage.module.scss'

export interface DayListProps {
  date: string
  /** The whole register. The list takes the day's own share of each. */
  entries: readonly CalendarEntry[]
  releases: readonly CalendarRelease[]
  followUps: readonly CalendarFollowUp[]
  onOpenEntry: (entry: CalendarEntry) => void
  onToggleDone: (entry: CalendarEntry) => void
  /** Opens one of an entry's attachments, listed under it. */
  onOpenAttachment: (pin: Pin) => void
  /** What the list says when nothing at all falls on the day. */
  emptyLabel: string
}

/**
 * Everything on one day, as a list.
 *
 * Releases and anniversaries hold the top, because they have no time; under
 * them the entries and follow-ups run in time order, all-day entries first.
 * An entry can be ticked off or opened to be amended. A release, an
 * anniversary or a follow-up opens where it lives instead, because the
 * register only reads them.
 *
 * Shared by the DAY view's sheet and the day sheet a month cell opens, so the
 * two can never list the same day differently.
 */
export function DayList({
  date,
  entries,
  releases,
  followUps,
  onOpenEntry,
  onToggleDone,
  onOpenAttachment,
  emptyLabel
}: DayListProps): ReactNode {
  const openFollowUp = useOpenFollowUp()
  // Entries and follow-ups in one list, by time, so the list runs in step
  // with the clock beside it in DAY.
  const items = dayItems(entriesOn(entries, date), followUpsOn(followUps, date))
  const out = releases.filter((release) => release.date === date)
  const marked = anniversariesOn(releases, date)

  return (
    <>
      {/*
        A release out today is business, so the day is not clear, and
        neither is a day the catalogue is marking or one with somebody to
        get back to. Three conditions rather than one ternary because the
        sheet can hold any of the lists, all of them, or none.
      */}
      {items.length === 0 && out.length === 0 && marked.length === 0 ? (
        <p className={styles.sheetEmpty}>{emptyLabel}</p>
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

      {items.length > 0 ? (
        <ul className={styles.sheetList}>
          {items.map((item) => {
            if (item.type === 'followUp') {
              const { followUp } = item
              const description = describeFollowUp(followUp)

              return (
                <li
                  key={item.key}
                  className={`${styles.sheetRow} ${styles.sheetFollowUp}`}
                  data-status={followUp.status}
                >
                  {/* In the slot an entry's discharge mark takes, and not a
                      control: a follow-up is completed in ARTISTS. */}
                  <FollowUpGlyph />

                  <button
                    type="button"
                    className={styles.sheetBody}
                    aria-label={description}
                    onClick={() => openFollowUp(followUp)}
                    {...tooltipTrigger(description)}
                  >
                    <span className={styles.sheetMeta}>
                      <span className={styles.sheetKind}>{FOLLOW_UP_LABEL}</span>
                      <span className={styles.sheetClock}>
                        {formatMinute(followUp.startMinute)}
                      </span>
                      <span className={styles.followUpParent}>
                        {FOLLOW_UP_PARENT_LABEL[followUp.parentKind]}
                      </span>
                      <FollowUpPriority followUp={followUp} />
                    </span>
                    {/* The name on the title's line and the task under it,
                        where an entry keeps its notes: most tasks share a
                        handful of titles, and the name is what tells them
                        apart. */}
                    <span className={styles.sheetTitle}>{followUp.who || followUp.title}</span>
                    {followUp.who && followUp.title ? (
                      <span className={styles.sheetNotes}>{followUp.title}</span>
                    ) : null}
                  </button>
                </li>
              )
            }

            const { entry } = item
            const kind = CALENDAR_KIND[entry.kind]
            const span = entrySpan(entry)

            return (
              <li key={item.key} className={styles.sheetRow} data-done={entry.done || undefined}>
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

                {/* Beside the body's button rather than in it, as in AGENDA. */}
                <div className={styles.sheetMain}>
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
                      <EntryHints entry={entry} clip={false} />
                    </span>
                    <span className={styles.sheetTitle}>{entry.title}</span>
                    {entry.notes ? <span className={styles.sheetNotes}>{entry.notes}</span> : null}
                  </button>
                  <AttachmentLinks pins={entry.attachments} onOpen={onOpenAttachment} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
