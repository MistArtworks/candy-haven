import type { ReactNode } from 'react'
import type { CalendarFollowUp } from '@shared/domain/calendar'
import { formatMinute } from '@shared/domain/calendar.constants'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { FOLLOW_UP_LABEL, describeFollowUp, useOpenFollowUp } from '../followUps'
import styles from '../CalendarPage.module.scss'

export interface FollowUpMarkProps {
  followUp: CalendarFollowUp
  /** Drops the words "Follow up", for the month grid's cells and the week's columns. */
  terse?: boolean
}

/**
 * A follow-up from ARTISTS, on the register.
 *
 * ## A reading, as a release date is
 *
 * The task lives on a lead or an opportunity, where it is set, moved and
 * completed. The register shows it and does nothing else with it: no done
 * toggle, no dialog, nothing to drag. Pressing it leaves for the lead or the
 * opportunity, which is the one place it can honestly be changed.
 *
 * ## Drawn so it cannot pass for either neighbour
 *
 * An entry has a tone bar and a release has a seal. This has an arrow, a time
 * and a name, because that is what a follow-up is: somebody to get back to,
 * at a minute. The words "Follow up" are spelled out wherever there is room
 * for them, and carried in the accessible name where there is not.
 *
 * The same mark serves a month cell and the clock. On the clock the grid
 * places it and hangs it from a rule at its minute; see `.timeFollowUp`.
 */
export function FollowUpMark({ followUp, terse = false }: FollowUpMarkProps): ReactNode {
  const open = useOpenFollowUp()
  const description = describeFollowUp(followUp)

  return (
    <button
      type="button"
      className={styles.followUpMark}
      data-status={followUp.status}
      aria-label={description}
      onClick={(event) => {
        // The month cell behind this files a new entry on its date. Without
        // this, leaving for ARTISTS would open that dialog on the way out.
        event.stopPropagation()
        open(followUp)
      }}
      {...tooltipTrigger(description)}
    >
      <FollowUpGlyph />
      {terse ? null : <span className={styles.followUpLabel}>{FOLLOW_UP_LABEL}</span>}
      <span className={styles.followUpClock}>{formatMinute(followUp.startMinute)}</span>
      {followUp.who ? <span className={styles.followUpWho}>{followUp.who}</span> : null}
      {followUp.title ? <span className={styles.followUpTitle}>{followUp.title}</span> : null}
      <FollowUpPriority followUp={followUp} />
    </button>
  )
}

/**
 * The arrow a follow-up is known by, wherever it is drawn.
 *
 * Drawn rather than typed, as the paperclip in `EntryHints` is: the arrow
 * characters have emoji forms, and one arriving in colour would break the
 * palette in the middle of a month cell. Sized by the stylesheet, because a
 * row gives it the 8px slot of an entry's discharge mark and a mark does not.
 */
export function FollowUpGlyph(): ReactNode {
  return (
    <svg className={styles.followUpGlyph} viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1.5 6.5 6.5 1.5M2.5 1.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * The mark a high-priority follow-up carries: one figure at the far end, where
 * an entry keeps its hints, and nothing at all for the other priorities.
 * Hidden from assistive technology because `describeFollowUp` already says it.
 */
export function FollowUpPriority({ followUp }: { followUp: CalendarFollowUp }): ReactNode {
  if (followUp.priority !== 'high') return null

  return (
    <span className={styles.followUpPriority} aria-hidden="true">
      !
    </span>
  )
}
