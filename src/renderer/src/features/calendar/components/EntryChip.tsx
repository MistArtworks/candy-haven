import type { ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import { CALENDAR_KIND, formatMinute } from '@shared/domain/calendar.constants'
import styles from '../CalendarPage.module.scss'

export interface EntryChipProps {
  entry: CalendarEntry
  onOpen: (entry: CalendarEntry) => void
  /** Drops the time readout where the column already carries it. */
  compact?: boolean
}

/**
 * One filed entry, as it appears inside a day.
 *
 * The kind is carried by a 2px bar in one of the four permitted tones rather
 * than by a coloured background: a month grid with five filled colours in it
 * stops being this application. The bar is the same device the rail uses for
 * the active department, at the same weight, which is what keeps the two
 * reading as one system.
 */
export function EntryChip({ entry, onOpen, compact = false }: EntryChipProps): ReactNode {
  const kind = CALENDAR_KIND[entry.kind]

  return (
    <button
      type="button"
      className={styles.chip}
      data-tone={kind.tone}
      data-done={entry.done || undefined}
      onClick={(event) => {
        // The day cell behind this opens a blank entry on that date; without
        // this a click on a chip would file a second one underneath it.
        event.stopPropagation()
        onOpen(entry)
      }}
      title={`${kind.label} — ${entry.title}`}
    >
      <span className={styles.chipBar} aria-hidden="true" />
      {!compact && entry.startMinute !== null ? (
        <span className={styles.chipTime}>{formatMinute(entry.startMinute)}</span>
      ) : null}
      <span className={styles.chipTitle}>{entry.title}</span>
    </button>
  )
}
