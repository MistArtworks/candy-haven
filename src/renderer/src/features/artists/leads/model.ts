import type { Lead, LeadTask, Opportunity, TaskRef } from '@shared/domain/leads'
import {
  CLOSED_STAGES,
  automaticTemperature,
  taskStatus,
  type TaskStatus
} from '@shared/domain/leads.constants'
import { formatMinute } from '@shared/domain/calendar.constants'
import { localIsoDate } from '@shared/domain/discography.constants'

/**
 * How LEADS reads its records: temperatures, follow-ups and times, worked out
 * the same way wherever they're drawn (the list, a sheet, the strip).
 */

/** A lead's temperature as shown, and where it comes from. */
export interface TemperatureReading {
  /** What the orb and the slider show. */
  value: number
  /** What the interactions say, pinned or not: the slider's ghost marker. */
  automatic: number
  /** Set by hand, and holding until set back. */
  pinned: boolean
}

export function readTemperature(
  lead: Lead,
  coolingPerWeek: number,
  now: number
): TemperatureReading {
  const automatic = automaticTemperature(lead.createdAt, lead.interactions, coolingPerWeek, now)
  return lead.pinnedTemperature === null
    ? { value: automatic, automatic, pinned: false }
    : { value: lead.pinnedTemperature, automatic, pinned: true }
}

/** A temperature's colour: the orb's own glow (orb.ts), for type beside it. */
export { temperatureColour } from './orb'

/** A follow-up with what's needed to act on it from anywhere. */
export interface TaskRow {
  ref: TaskRef
  task: LeadTask
  status: TaskStatus
  /** The lead's name, and the opportunity's title when it's one of those. */
  who: string
  leadId: string
}

export function leadTaskRows(lead: Lead, now: number): TaskRow[] {
  return lead.tasks.map((task) => ({
    ref: { parentKind: 'lead', parentId: lead.id, taskId: task.id },
    task,
    status: taskStatus(task, now),
    who: lead.name,
    leadId: lead.id
  }))
}

export function opportunityTaskRows(
  opportunity: Opportunity,
  lead: Lead | null,
  now: number
): TaskRow[] {
  const who = lead ? `${lead.name} · ${opportunity.title}` : opportunity.title
  return opportunity.tasks.map((task) => ({
    ref: { parentKind: 'opportunity', parentId: opportunity.id, taskId: task.id },
    task,
    status: taskStatus(task, now),
    who,
    leadId: opportunity.leadId
  }))
}

/**
 * Every open follow-up, the lead's and its live opportunities', soonest
 * first. Archived records keep quiet, as the reminders do.
 */
export function openTaskRows(
  leads: readonly Lead[],
  opportunities: readonly Opportunity[],
  now: number
): TaskRow[] {
  const byId = new Map(leads.map((lead) => [lead.id, lead]))
  const rows: TaskRow[] = []
  for (const lead of leads) {
    if (lead.archivedAt === null) rows.push(...leadTaskRows(lead, now))
  }
  for (const opportunity of opportunities) {
    const lead = byId.get(opportunity.leadId) ?? null
    if (opportunity.archivedAt !== null || !lead || lead.archivedAt !== null) continue
    rows.push(...opportunityTaskRows(opportunity, lead, now))
  }
  return rows.filter((row) => row.status !== 'complete').sort(bySoonest)
}

/** Overdue first (oldest first), then pending (soonest first), then done. */
export function byUrgency(a: TaskRow, b: TaskRow): number {
  const rank = (row: TaskRow): number =>
    row.status === 'overdue' ? 0 : row.status === 'pending' ? 1 : 2
  return rank(a) - rank(b) || (rank(a) === 2 ? b.task.dueAt - a.task.dueAt : bySoonest(a, b))
}

function bySoonest(a: TaskRow, b: TaskRow): number {
  return a.task.dueAt - b.task.dueAt
}

/**
 * Where a follow-up opens in the console: its lead, or its opportunity.
 * Short enough for the strip's page targets (80 characters) with a UUID.
 */
export function followUpRoute(row: TaskRow): string {
  return row.ref.parentKind === 'opportunity'
    ? `/artists?lens=opportunities&opportunity=${encodeURIComponent(row.ref.parentId)}`
    : `/artists?lens=leads&lead=${encodeURIComponent(row.leadId)}`
}

/** The follow-up most worth doing next: the first overdue, else the first pending. */
export function nextTask(rows: readonly TaskRow[]): TaskRow | null {
  return [...rows].filter((row) => row.status !== 'complete').sort(byUrgency)[0] ?? null
}

/** An opportunity still being worked: not won, lost or archived. */
export function isLive(opportunity: Opportunity): boolean {
  return opportunity.archivedAt === null && !CLOSED_STAGES.includes(opportunity.stage)
}

// --------------------------------------------------------------------- time

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "14:30" today, "Tomorrow 10:00", "Thu 9 Oct, 18:00", with the year when it isn't this one. */
export function formatWhen(at: number, now: number): string {
  const date = new Date(at)
  const today = localIsoDate(new Date(now))
  const day = localIsoDate(date)
  const time = formatMinute(date.getHours() * 60 + date.getMinutes())
  if (day === today) return `Today ${time}`
  if (day === localIsoDate(new Date(now + DAY))) return `Tomorrow ${time}`
  if (day === localIsoDate(new Date(now - DAY))) return `Yesterday ${time}`
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  const label = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  return `${label}, ${time}`
}

/** "14:30" today, else "Tmrw", a weekday within the week, or "7 Oct": for a narrow column. */
export function formatShortWhen(at: number, now: number): string {
  const date = new Date(at)
  const day = localIsoDate(date)
  if (day === localIsoDate(new Date(now))) {
    return formatMinute(date.getHours() * 60 + date.getMinutes())
  }
  if (day === localIsoDate(new Date(now + DAY))) return 'Tmrw'
  if (at > now && at - now < 6 * DAY) {
    return date.toLocaleDateString('en-GB', { weekday: 'short' })
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "now", "12 min", "3 h", "2 days": how long, either way. */
export function formatSpan(ms: number): string {
  const span = Math.abs(ms)
  if (span < MINUTE) return 'now'
  if (span < HOUR) return `${Math.round(span / MINUTE)} min`
  if (span < DAY) return `${Math.round(span / HOUR)} h`
  const days = Math.round(span / DAY)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`
  const weeks = Math.round(days / 7)
  if (days < 60) return `${weeks} weeks`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}

/** "just now", "5 min ago", "2 days ago". */
export function formatAgo(at: number, now: number): string {
  const span = formatSpan(now - at)
  return span === 'now' ? 'just now' : `${span} ago`
}

/** What a follow-up's due time says about it: overdue by how long, or when. */
export function formatDue(task: LeadTask, status: TaskStatus, now: number): string {
  if (status === 'complete' && task.completedAt !== null) {
    return `Done ${formatAgo(task.completedAt, now)}`
  }
  if (status === 'overdue') {
    const late = formatSpan(now - task.dueAt)
    return late === 'now' ? 'Due now' : `Overdue by ${late}`
  }
  return formatWhen(task.dueAt, now)
}

/** A due time as the fields edit it: a local day and a minute of it. */
export interface DueParts {
  date: string
  minute: number
}

export function toDueParts(at: number): DueParts {
  const date = new Date(at)
  return { date: localIsoDate(date), minute: date.getHours() * 60 + date.getMinutes() }
}

export function fromDueParts(parts: DueParts): number {
  const [year, month, day] = parts.date.split('-').map(Number)
  return new Date(year, month - 1, day, Math.floor(parts.minute / 60), parts.minute % 60).getTime()
}

/** One press to a sensible due time, beside the fields. */
export interface DuePreset {
  id: string
  label: string
  at: (now: Date) => number
}

const at = (now: Date, days: number, hours: number): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hours, 0).getTime()

export const DUE_PRESETS: readonly DuePreset[] = [
  { id: 'now', label: 'Now', at: (now) => now.getTime() },
  { id: 'hour', label: 'In an hour', at: (now) => now.getTime() + HOUR },
  {
    id: 'evening',
    label: 'This evening',
    at: (now) => (now.getHours() < 18 ? at(now, 0, 18) : at(now, 1, 18))
  },
  { id: 'tomorrow', label: 'Tomorrow 10:00', at: (now) => at(now, 1, 10) },
  { id: 'week', label: 'In a week', at: (now) => at(now, 7, 10) }
]

// ------------------------------------------------------------------- points

export function signOf(points: number): 'plus' | 'minus' | 'zero' {
  return points > 0 ? 'plus' : points < 0 ? 'minus' : 'zero'
}

/** "+15", "−20" (a true minus), "0". */
export function signed(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${Math.abs(points)}`
  return '0'
}

// -------------------------------------------------------------------- money

/** A typed amount: a plain number, commas allowed, at most two decimals; else null. */
export function amountOf(text: string): number | null {
  const plain = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null
  return Number(plain)
}

/** "CAD 1,200", "CAD 1,250.50", or null when there's no amount. */
export function formatMoney(amount: number | null, currency: string): string | null {
  if (amount === null) return null
  const figure = amount.toLocaleString('en-CA', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })
  return `${currency} ${figure}`
}
