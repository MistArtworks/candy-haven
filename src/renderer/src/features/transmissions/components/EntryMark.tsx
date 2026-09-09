import type { ReactNode } from 'react'
import type { ScheduleEntry } from '@shared/domain/transmissions'
import { MARKETING_STATUS_LABEL } from '@shared/domain/projects.constants'
import { isEntryOverdue } from '../lib/entries'
import styles from './calendar.module.scss'

/**
 * One dated thing, as it appears in every view.
 *
 * Four layouts share this rather than each drawing its own row, because the
 * mark vocabulary is what makes the views legible as one calendar: a release is
 * crimson wherever it appears, and an operator who learns the month grid can
 * read the timeline without learning it again.
 *
 * The kind is carried by a swatch *and* by the entry's own text, never by
 * colour alone — the same rule `StatusDot` enforces.
 */

function statusLabel(entry: ScheduleEntry): string | null {
  if (entry.asset) return MARKETING_STATUS_LABEL[entry.asset.status]
  if (entry.task) return entry.task.done ? 'DONE' : 'OUTSTANDING'
  return entry.settled ? 'RELEASED' : null
}

export interface EntryMarkProps {
  entry: ScheduleEntry
  /** Chip form for a month cell; the full row everywhere else. */
  compact?: boolean
  onSelect?: (entry: ScheduleEntry) => void
}

export function EntryMark({ entry, compact = false, onSelect }: EntryMarkProps): ReactNode {
  const overdue = isEntryOverdue(entry)
  const status = statusLabel(entry)

  const body = (
    <>
      <span className={styles.markSwatch} aria-hidden="true" />
      <span className={styles.markTitle}>{entry.title}</span>
      {!compact && entry.projectName ? (
        <span className={styles.markProject}>{entry.projectName}</span>
      ) : null}
      {!compact && status ? <span className={styles.markStatus}>{status}</span> : null}
    </>
  )

  const className = compact ? styles.markCompact : styles.mark

  // A mark is only a button where selecting it does something. A plain span
  // otherwise, rather than a disabled button, so nothing lands in the tab order
  // offering an interaction it will not honour.
  if (!onSelect) {
    return (
      <span
        className={className}
        data-kind={entry.kind}
        data-settled={entry.settled || undefined}
        data-overdue={overdue || undefined}
        title={entry.projectName ? `${entry.title} · ${entry.projectName}` : entry.title}
      >
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={className}
      data-kind={entry.kind}
      data-settled={entry.settled || undefined}
      data-overdue={overdue || undefined}
      title={entry.projectName ? `${entry.title} · ${entry.projectName}` : entry.title}
      onClick={() => onSelect(entry)}
    >
      {body}
    </button>
  )
}
