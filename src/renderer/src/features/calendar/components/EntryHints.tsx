import type { ReactNode } from 'react'
import type { CalendarEntry } from '@shared/domain/calendar'
import { checklistProgress } from '../attachments'
import styles from '../CalendarPage.module.scss'

export interface EntryHintsProps {
  entry: CalendarEntry
  /**
   * Off where the attachments are listed by name beside it, as in AGENDA and
   * the day sheet, so the count does not say the same thing twice.
   */
  clip?: boolean
}

/**
 * What an entry carries, as a whisper beside its title: a clip and a count for
 * its attachments, and how far through its steps it is.
 *
 * Faint figures in the chip's own readout face, because a month cell is 10px
 * of title and anything louder would outweigh it. Nothing at all when the
 * entry carries neither.
 */
export function EntryHints({ entry, clip = true }: EntryHintsProps): ReactNode {
  const attachments = clip ? entry.attachments.length : 0
  const progress = checklistProgress(entry.checklist)
  if (attachments === 0 && !progress) return null

  return (
    <span className={styles.entryHints}>
      {attachments > 0 ? (
        <span className={styles.entryHint}>
          <Paperclip />
          {attachments}
          <span className={styles.srOnly}>
            {attachments === 1 ? ' attachment' : ' attachments'}
          </span>
        </span>
      ) : null}
      {progress ? (
        <span
          className={styles.entryHint}
          data-complete={progress.done === progress.total || undefined}
        >
          <span className={styles.entryHintBox} aria-hidden="true" />
          {progress.done}/{progress.total}
          <span className={styles.srOnly}> steps done</span>
        </span>
      ) : null}
    </span>
  )
}

/** Drawn rather than an emoji, which would arrive in colour. */
function Paperclip(): ReactNode {
  return (
    <svg
      className={styles.entryHintClip}
      width="6"
      height="9"
      viewBox="0 0 8 12"
      aria-hidden="true"
    >
      <path
        d="M6 4.5V9a2 2 0 0 1-4 0V2.5a1.5 1.5 0 0 1 3 0v6a.75.75 0 0 1-1.5 0V4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
