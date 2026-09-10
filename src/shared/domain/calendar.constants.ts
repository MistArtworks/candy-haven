import type { CalendarEntry, CalendarKind } from './calendar'
import { CALENDAR_KINDS } from './calendar'

/**
 * Calendar vocabulary and date arithmetic.
 *
 * Pure, and free of Node, Electron and React so main, preload and renderer can
 * all import it. The date functions work on `YYYY-MM-DD` strings and go through
 * `Date` only in UTC — never local time — so no operation here can move an
 * entry across a day boundary. See the note at the top of domain/calendar.ts.
 */

export interface CalendarKindDefinition {
  id: CalendarKind
  /** Uppercase institutional label. */
  label: string
  /** What filing an entry under this kind asserts. */
  purpose: string
  /**
   * Which of the five materials draws it.
   *
   * Named rather than given as a colour so the palette rule is enforced by the
   * type: there are four tones available and no way to ask for a fifth.
   */
  tone: 'crimson' | 'gold' | 'brass' | 'concrete'
}

export const CALENDAR_KIND: Record<CalendarKind, CalendarKindDefinition> = {
  session: {
    id: 'session',
    label: 'SESSION',
    purpose: 'Time set aside at the desk',
    tone: 'brass'
  },
  delivery: {
    id: 'delivery',
    label: 'DELIVERY',
    purpose: 'Something owed to somebody on this date',
    tone: 'gold'
  },
  broadcast: {
    id: 'broadcast',
    label: 'BROADCAST',
    purpose: 'The console goes live to an audience',
    tone: 'crimson'
  },
  rite: {
    id: 'rite',
    label: 'RITE',
    purpose: 'A standing observance the calendar keeps',
    tone: 'concrete'
  },
  deadline: {
    id: 'deadline',
    label: 'DEADLINE',
    purpose: 'A cutoff, after which the matter is late',
    tone: 'crimson'
  }
}

export const CALENDAR_KIND_LIST = CALENDAR_KINDS.map((id) => CALENDAR_KIND[id])

/** Monday first: a production week starts when the work does, not on Sunday. */
export const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER'
] as const

// ------------------------------------------------------------------ arithmetic

const DAY_MS = 86_400_000

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** `2026-03-14` -> `{ year: 2026, month: 3, day: 14 }`. Month is 1-based. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

/** Midnight UTC for a calendar date — the only bridge to `Date` in this module. */
function toUtc(iso: string): number {
  const { year, month, day } = parseIsoDate(iso)
  return Date.UTC(year, month - 1, day)
}

function fromUtc(ms: number): string {
  const date = new Date(ms)
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 = Monday … 6 = Sunday, matching `WEEKDAY_LABELS`. */
export function weekdayIndex(iso: string): number {
  return (new Date(toUtc(iso)).getUTCDay() + 6) % 7
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/** The seven dates of the week containing `iso`, Monday first. */
export function weekOf(iso: string): string[] {
  const monday = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function startOfMonth(iso: string): string {
  const { year, month } = parseIsoDate(iso)
  return toIsoDate(year, month, 1)
}

export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseIsoDate(iso)
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  // Clamped rather than allowed to roll over: stepping back from 31 March must
  // land on 28 February, not on 3 March.
  const lastDay = daysInMonth(nextYear, nextMonth)
  return toIsoDate(nextYear, nextMonth, Math.min(day, lastDay))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Six weeks of dates covering the month containing `iso`, Monday first.
 *
 * Always 42 cells, including the tail of the previous month and the head of the
 * next. Fixed at six rows rather than sized to fit so the grid does not change
 * height as the operator pages through the year — a month view that resizes
 * under the cursor is the single most common way this control is got wrong.
 */
export function monthGrid(iso: string): string[] {
  const first = startOfMonth(iso)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

// ------------------------------------------------------------------ time of day

/** `870` -> `14:30`. Minutes from local midnight; 24-hour, as the console is. */
export function formatMinute(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/** `14:30` -> `870`, or null if it is not a time. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/** The window an entry occupies, clamped to the day it is filed on. */
export function entrySpan(entry: CalendarEntry): { start: number; end: number } | null {
  if (entry.startMinute === null) return null
  return {
    start: entry.startMinute,
    end: Math.min(1440, entry.startMinute + entry.durationMinutes)
  }
}

/**
 * Register order: by date, then all-day entries before timed ones, then by
 * start, then by title so the sort is total and a redraw cannot reshuffle two
 * entries that compare equal.
 */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.startMinute === null && b.startMinute !== null) return -1
  if (a.startMinute !== null && b.startMinute === null) return 1
  if (a.startMinute !== null && b.startMinute !== null && a.startMinute !== b.startMinute) {
    return a.startMinute - b.startMinute
  }
  return a.title.localeCompare(b.title)
}

/** Entries filed on one date, in register order. */
export function entriesOn(entries: readonly CalendarEntry[], date: string): CalendarEntry[] {
  return entries.filter((entry) => entry.date === date).sort(compareEntries)
}
