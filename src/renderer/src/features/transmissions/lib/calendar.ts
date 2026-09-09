import type { TransmissionViewMode } from '@shared/domain/transmissions'
import { shiftIsoDate } from '@shared/domain/projects.constants'
import { MONTHS } from '@renderer/lib/format'

/**
 * Calendar geometry for the four views.
 *
 * Presentation, deliberately not in shared/domain: nothing in the main process
 * needs to know how many cells a month grid has. What *is* shared is the date
 * arithmetic itself — everything below builds on `shiftIsoDate` rather than
 * doing its own `Date` maths, so a month boundary is crossed exactly one way in
 * this project.
 *
 * Weeks start on Monday. A release week reads as five working days and then a
 * weekend, which is how the operator plans; a Sunday-first grid splits that.
 */

export const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

/** Six rows of seven. Fixed rather than fitted, so the grid never changes height. */
export const MONTH_ROWS = 6
export const DAYS_PER_WEEK = 7

export interface CalendarCell {
  date: string
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean
}

/** Parses `YYYY-MM-DD` into its parts without constructing a local-time Date. */
function parts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, month, day }
}

function iso(year: number, month: number, day: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Monday-based weekday index, 0..6. */
export function weekdayIndex(isoDate: string): number {
  const { year, month, day } = parts(isoDate)
  // UTC throughout: `getUTCDay` on a date-only value cannot be shifted into the
  // previous day by a negative timezone offset the way the local getter can.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  // JS weeks start on Sunday (0); rotate so Monday is 0 and Sunday is 6.
  return (weekday + 6) % 7
}

export function firstOfMonth(isoDate: string): string {
  const { year, month } = parts(isoDate)
  return iso(year, month, 1)
}

export function daysInMonth(isoDate: string): number {
  const { year, month } = parts(isoDate)
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The Monday on or before a date. */
export function startOfWeek(isoDate: string): string {
  return shiftIsoDate(isoDate, -weekdayIndex(isoDate))
}

/**
 * The 42 cells of a month grid, including the days borrowed from either side.
 *
 * Always six rows. A month that fits in five would otherwise make the panel
 * jump height as the operator steps through the year, and a calendar that
 * resizes under the cursor is hard to read across.
 */
export function buildMonthGrid(anchor: string): CalendarCell[] {
  const first = firstOfMonth(anchor)
  const start = startOfWeek(first)
  const { month } = parts(anchor)

  return Array.from({ length: MONTH_ROWS * DAYS_PER_WEEK }, (_, index) => {
    const date = shiftIsoDate(start, index)
    return { date, inMonth: parts(date).month === month }
  })
}

/** The seven dates of the week containing `anchor`, Monday first. */
export function buildWeek(anchor: string): string[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => shiftIsoDate(start, index))
}

/** Every date in the anchored month, for the timeline's horizontal axis. */
export function buildMonthSpan(anchor: string): string[] {
  const first = firstOfMonth(anchor)
  return Array.from({ length: daysInMonth(anchor) }, (_, index) => shiftIsoDate(first, index))
}

/**
 * Steps the anchor by one page of whichever view is showing.
 *
 * The unit differs per view on purpose: paging a week view by a month would
 * skip four screens of content, and paging a month view by a week would make
 * the operator press it four times to reach the next month.
 */
export function stepAnchor(anchor: string, view: TransmissionViewMode, direction: 1 | -1): string {
  if (view === 'week') return shiftIsoDate(anchor, direction * DAYS_PER_WEEK)

  const { year, month, day } = parts(anchor)
  const target = new Date(Date.UTC(year, month - 1 + direction, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth() + 1
  // Clamped: stepping from the 31st into a 30-day month must land on the 30th
  // rather than rolling forward into the month after it.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  return iso(targetYear, targetMonth, Math.min(day, lastDay))
}

/** `2026-03-14` -> `MAR 2026`. */
export function monthLabel(isoDate: string): string {
  const { year, month } = parts(isoDate)
  return `${MONTHS[month - 1]} ${year}`
}

/** The heading for whichever range is on screen. */
export function rangeLabel(anchor: string, view: TransmissionViewMode): string {
  if (view !== 'week') return monthLabel(anchor)

  const week = buildWeek(anchor)
  const from = parts(week[0])
  const to = parts(week[6])
  const pad = (value: number): string => String(value).padStart(2, '0')

  return from.month === to.month
    ? `${pad(from.day)}–${pad(to.day)} ${monthLabel(week[0])}`
    : `${pad(from.day)} ${MONTHS[from.month - 1]} – ${pad(to.day)} ${monthLabel(week[6])}`
}

/** Day-of-month, unpadded, for a cell's corner numeral. */
export function dayOfMonth(isoDate: string): number {
  return parts(isoDate).day
}

/** `2026-03-14` -> `SAT`. */
export function weekdayLabel(isoDate: string): string {
  return WEEKDAY_LABELS[weekdayIndex(isoDate)]
}
