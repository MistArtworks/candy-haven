import { useEffect, useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { CalendarEntry, CalendarFollowUp, CalendarRelease } from '@shared/domain/calendar'
import { MONTH_NAMES, parseIsoDate, weekdayIndex } from '@shared/domain/calendar.constants'
import type { Pin } from '@shared/domain/strip'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { formatCountdown, todayIso } from '@renderer/lib/format'
import { DayList } from './DayList'
import styles from '../CalendarPage.module.scss'

export interface DaySheetProps {
  /** The day being read, or null while the sheet is closed. */
  date: string | null
  entries: readonly CalendarEntry[]
  releases: readonly CalendarRelease[]
  followUps: readonly CalendarFollowUp[]
  /** False while the register cannot be written to, when adding could only fail. */
  canAdd: boolean
  /** Whatever went wrong last: a tick that did not take, an attachment that would not open. */
  error: string | null
  onClose: () => void
  /** Opens a blank entry on the day, as a click on the date used to do directly. */
  onAdd: (date: string) => void
  onOpenEntry: (entry: CalendarEntry) => void
  onToggleDone: (entry: CalendarEntry) => void
  onOpenAttachment: (pin: Pin) => void
}

/**
 * A day, opened from the month grid.
 *
 * A click on a date used to file a blank entry on it straight away, which
 * made the commonest question, what is on this day, a dialog the operator had
 * to cancel. The sheet answers the question first and offers the entry as its
 * one primary action.
 *
 * The list is `DayList`, the same one the DAY view's sheet draws, held in the
 * calendar's own dialog slab and portalled for the reason `EntryDialog` gives.
 * It stays open beneath an entry opened from it, so saving or cancelling
 * returns to the day as it now stands rather than to the grid.
 */
export function DaySheet({ date, ...rest }: DaySheetProps): ReactNode {
  if (!date) return null
  return <DaySheetPanel date={date} {...rest} />
}

/** Split out so its key listener exists only while there is a day open. */
function DaySheetPanel({
  date,
  entries,
  releases,
  followUps,
  canAdd,
  error,
  onClose,
  onAdd,
  onOpenEntry,
  onToggleDone,
  onOpenAttachment
}: DaySheetProps & { date: string }): ReactNode {
  const titleId = useId()

  /*
   * Escape closes the sheet, unless something over it has already answered
   * the key. The entry dialog marks Escape as answered (see `useDialogKeys`)
   * and so does the page's own binding for it, both from the document, which
   * a key reaches before the window. Checking whether a dialog is open would
   * not do: React re-renders between the two listeners, so by the time this
   * one runs the dialog already reads as closed. The project dossier holds
   * its rename dialog the same way.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.daySheetHead}>
            {/* The year as the index: the title leaves it out, and paging a
                month grid can carry the operator into another one. */}
            <span className={styles.dialogIndex}>{parseIsoDate(date).year}</span>
            <h2 id={titleId} className={styles.dialogTitle}>
              {dayTitle(date)}
            </h2>
            <span className={styles.dialogRule} aria-hidden="true" />
            <span className={styles.sheetCountdown} data-today={date === todayIso() || undefined}>
              {formatCountdown(date)}
            </span>
          </header>

          <div className={styles.daySheetBody}>
            <DayList
              date={date}
              entries={entries}
              releases={releases}
              followUps={followUps}
              onOpenEntry={onOpenEntry}
              onToggleDone={onToggleDone}
              onOpenAttachment={onOpenAttachment}
              emptyLabel="Nothing on this day."
            />
          </div>

          <footer className={styles.dialogFoot}>
            {error ? <p className={styles.dialogError}>{error}</p> : <span />}

            <div className={styles.dialogActions}>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              {/*
                Focused on arrival, so the old gesture is one key longer
                rather than gone: a date and Enter still files an entry on
                it. Focus that follows a click draws no ring.
              */}
              <Button
                variant="primary"
                size="sm"
                disabled={!canAdd}
                autoFocus
                onClick={() => onAdd(date)}
              >
                Add an entry
              </Button>
            </div>
          </footer>
        </motion.div>
      </div>
    </Portal>
  )
}

/** Weekday names, Monday first, matching `weekdayIndex`. */
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const

/**
 * `2026-10-09` as "Thursday 9 October".
 *
 * Built from the date's own parts rather than through `Date` and a locale, so
 * the day named is the day stored, wherever the machine thinks it is.
 */
function dayTitle(date: string): string {
  const { day, month } = parseIsoDate(date)
  const name = MONTH_NAMES[month - 1]
  return `${WEEKDAY_NAMES[weekdayIndex(date)]} ${day} ${name.charAt(0)}${name.slice(1).toLowerCase()}`
}
