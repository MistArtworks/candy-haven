import { useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  isSameMonth,
  monthGrid,
  parseIsoDate,
  startOfWeek
} from '@shared/domain/calendar.constants'
import { todayIso } from '@renderer/lib/format'
import styles from './Calendar.module.scss'

export interface CalendarProps {
  /** `YYYY-MM-DD`, or empty for no selection. */
  value: string
  onChange: (iso: string) => void
  /** Called by Escape, so the opener can close and take focus back. */
  onDismiss?: () => void
  /** Draws CLEAR beside TODAY. Only where an empty date means something. */
  clearable?: boolean
}

/**
 * A month, drawn in the document.
 *
 * ## Why this exists rather than the platform's
 *
 * Chromium's date picker is a panel rendered outside the page: no stylesheet
 * reaches it, and on Windows it arrives with a system-blue selection — the one
 * thing the brief rules out outright. `Select` was written for exactly this
 * reason about the native `<select>` popup, and this is the same answer for
 * the same problem.
 *
 * ## It owns no position
 *
 * Deliberately just the grid. Anchoring, flipping and dismissal live in
 * `usePanelAnchor`, so this is usable inline — in a dialog, or beside a field
 * — without inheriting a popover's machinery. `DateInput` is the one that
 * puts the two together.
 *
 * ## The arithmetic is not written here
 *
 * `monthGrid`, `addMonths`, `addDays` and the rest already exist in
 * `calendar.constants.ts`, where the CALENDAR department has used them since
 * it was built. Two consequences worth knowing, both of them theirs:
 * **Monday first**, and **always six rows** — a picker that changes height as
 * you page through the year is the commonest way this control is got wrong.
 */
export function Calendar({
  value,
  onChange,
  onDismiss,
  clearable = false
}: CalendarProps): ReactNode {
  const today = todayIso()
  /** The month on screen. Follows the selection, or opens on today. */
  const [anchor, setAnchor] = useState(value || today)
  /**
   * The day the keyboard is on.
   *
   * Shared with the pointer: `onPointerEnter` sets it too, so the two can
   * never light separate cells. `Select` draws the same rule and its
   * stylesheet spells out why — two highlights means neither is the answer to
   * "what does Enter do".
   */
  const [cursor, setCursor] = useState(value || today)

  const days = monthGrid(anchor)
  const { year, month } = parseIsoDate(anchor)

  const page = (months: number): void => {
    const next = addMonths(anchor, months)
    setAnchor(next)
    setCursor(next)
  }

  const moveTo = (iso: string): void => {
    setCursor(iso)
    // Paging follows the cursor off the edge of the month, which is what makes
    // arrowing from the 31st to the 1st feel like one continuous sheet.
    if (!isSameMonth(iso, anchor)) setAnchor(iso)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        moveTo(addDays(cursor, -1))
        break
      case 'ArrowRight':
        event.preventDefault()
        moveTo(addDays(cursor, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        moveTo(addDays(cursor, -7))
        break
      case 'ArrowDown':
        event.preventDefault()
        moveTo(addDays(cursor, 7))
        break
      case 'PageUp':
        event.preventDefault()
        page(-1)
        break
      case 'PageDown':
        event.preventDefault()
        page(1)
        break
      case 'Home':
        event.preventDefault()
        moveTo(startOfWeek(cursor))
        break
      case 'End':
        event.preventDefault()
        moveTo(addDays(startOfWeek(cursor), 6))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onChange(cursor)
        break
      case 'Escape':
        event.preventDefault()
        onDismiss?.()
        break
    }
  }

  return (
    /*
     * The grid takes the focus, not the individual days.
     *
     * Forty-two focusable buttons would make Tab a way to walk a month one day
     * at a time, which is not what Tab is for — the arrows are. One stop, and
     * `aria-activedescendant` would be the next refinement if anybody ever
     * drove this with a screen reader.
     */
    <div
      className={styles.calendar}
      role="application"
      aria-label="Choose a date"
      tabIndex={0}
      autoFocus
      onKeyDown={onKeyDown}
    >
      <header className={styles.head}>
        <button
          type="button"
          className={styles.page}
          aria-label="Previous month"
          onClick={() => page(-1)}
        >
          ‹
        </button>

        <span className={styles.month}>
          {MONTH_NAMES[month - 1]} {year}
        </span>

        <button
          type="button"
          className={styles.page}
          aria-label="Next month"
          onClick={() => page(1)}
        >
          ›
        </button>
      </header>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAY_LABELS.map((day) => (
          <span key={day} className={styles.weekday}>
            {day.slice(0, 2)}
          </span>
        ))}
      </div>

      <div className={styles.grid}>
        {days.map((iso) => (
          <button
            key={iso}
            type="button"
            className={styles.day}
            // Outside the month but still live: picking 3 October from
            // September's grid is an ordinary thing to want.
            data-outside={isSameMonth(iso, anchor) ? undefined : true}
            data-today={iso === today || undefined}
            data-selected={iso === value || undefined}
            data-cursor={iso === cursor || undefined}
            aria-pressed={iso === value}
            tabIndex={-1}
            onPointerEnter={() => setCursor(iso)}
            onClick={() => onChange(iso)}
          >
            {parseIsoDate(iso).day}
          </button>
        ))}
      </div>

      <footer className={styles.foot}>
        {clearable ? (
          <button type="button" className={styles.action} onClick={() => onChange('')}>
            Clear
          </button>
        ) : (
          <span />
        )}

        <button type="button" className={styles.action} onClick={() => onChange(today)}>
          Today
        </button>
      </footer>
    </div>
  )
}
