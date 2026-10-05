/**
 * LEADS and OPPORTUNITIES: the constants and the rules, without zod.
 *
 * ARTISTS' light CRM. A **lead** is somebody Candy is building a relationship
 * with; its temperature says how warm that relationship is, from frozen to
 * supernova. Its **tasks** are the follow-ups. An **opportunity** is real work
 * that came of a lead: a collaboration, a booking, a remix, a paid project,
 * with a stage of its own. Temperature describes the relationship; stage
 * describes the work, and the two never stand in for each other.
 *
 * Zod-free, so the renderer and the strip can read the scale, the stages and
 * the rules without the schemas. See leads.ts for those.
 */

// -------------------------------------------------------------- temperature

/**
 * The named stops on the temperature scale, 0 to 100. 50 is neutral; a new
 * lead starts frozen. The bands the spec calls Cold, Warm and Hot are three of
 * them.
 */
export const TEMPERATURE_BANDS = [
  { value: 0, label: 'Frozen' },
  { value: 17, label: 'Cold' },
  { value: 33, label: 'Cool' },
  { value: 50, label: 'Neutral' },
  { value: 67, label: 'Warm' },
  { value: 83, label: 'Hot' },
  { value: 100, label: 'Supernova' }
] as const
export type TemperatureBand = (typeof TEMPERATURE_BANDS)[number]

/** The named stop nearest a temperature. */
export function temperatureBand(value: number): TemperatureBand {
  let best: TemperatureBand = TEMPERATURE_BANDS[0]
  for (const band of TEMPERATURE_BANDS) {
    if (Math.abs(band.value - value) < Math.abs(best.value - value)) best = band
  }
  return best
}

/** The most an interaction can move a lead, either way. */
export const MAX_INTERACTION_POINTS = 50

/** Points a lead loses for each week nothing is logged. */
export const DEFAULT_COOLING_PER_WEEK = 10

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A lead's temperature from what Candy logged: each interaction's own points,
 * oldest first, cooling for the quiet time between them and since the last.
 * Nothing logged since being added: frozen.
 *
 * Every interaction keeps the points it was logged with, so changing a
 * predefined interaction's points counts from then on and never re-scores the
 * past.
 */
export function automaticTemperature(
  createdAt: number,
  interactions: readonly { at: number; points: number }[],
  coolingPerWeek: number,
  now: number
): number {
  const cool = (from: number, to: number): number =>
    (Math.max(0, to - from) / WEEK_MS) * Math.max(0, coolingPerWeek)
  let value = 0
  let since = createdAt
  for (const entry of [...interactions].sort((a, b) => a.at - b.at)) {
    value = clamp(value - cool(since, entry.at) + entry.points)
    since = Math.max(since, entry.at)
  }
  return clamp(value - cool(since, now))
}

const clamp = (value: number): number => Math.min(100, Math.max(0, value))

// -------------------------------------------------------------- interactions

/** What Candy can pick from when logging, each worth its points; kept in REGULATION. */
export const DEFAULT_INTERACTIONS: readonly { id: string; name: string; points: number }[] = [
  { id: 'replied', name: 'They replied', points: 15 },
  { id: 'messaged', name: 'They messaged first', points: 18 },
  { id: 'commented', name: 'Candy commented', points: 6 },
  { id: 'story', name: 'Candy replied to their story', points: 5 },
  { id: 'call', name: 'Call or video call', points: 25 },
  { id: 'met', name: 'Met in person', points: 30 },
  { id: 'unfollowed', name: 'They unfollowed', points: -20 }
]

// --------------------------------------------------------------------- tasks

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High'
}

/** Worked out, never stored: complete once done, else by the clock. */
export type TaskStatus = 'pending' | 'overdue' | 'complete'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  overdue: 'Overdue',
  complete: 'Complete'
}

export function taskStatus(
  task: { dueAt: number; completedAt: number | null },
  now: number
): TaskStatus {
  if (task.completedAt !== null) return 'complete'
  return task.dueAt <= now ? 'overdue' : 'pending'
}

/** The task every new lead starts with. */
export const FIRST_TASK_TITLE = 'First interaction'

/**
 * A task made already due (the first interaction, due now) doesn't announce
 * itself the moment it's made; Candy is looking right at it.
 */
export const DUE_ON_ARRIVAL_MS = 60_000

/** The snoozes a reminder offers. */
export const SNOOZES = ['hour', 'evening', 'tomorrow'] as const
export type Snooze = (typeof SNOOZES)[number]

export const SNOOZE_LABEL: Record<Snooze, string> = {
  hour: 'In an hour',
  evening: 'This evening',
  tomorrow: 'Tomorrow morning'
}

/** When a snooze ends: an hour on, 18:00 today (or tomorrow if past), 10:00 tomorrow. */
export function snoozeUntil(snooze: Snooze, now: Date): number {
  if (snooze === 'hour') return now.getTime() + 60 * 60 * 1000
  const at = new Date(now)
  if (snooze === 'evening') {
    at.setHours(18, 0, 0, 0)
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
    return at.getTime()
  }
  at.setDate(at.getDate() + 1)
  at.setHours(10, 0, 0, 0)
  return at.getTime()
}

// ------------------------------------------------------------- opportunities

export const OPPORTUNITY_STAGES = [
  'open',
  'talks',
  'negotiating',
  'agreed',
  'progress',
  'won',
  'lost'
] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]

export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  open: 'Open',
  talks: 'In talks',
  negotiating: 'Negotiating',
  agreed: 'Agreed',
  progress: 'In progress',
  won: 'Won',
  lost: 'Lost'
}

/** Where an opportunity ends: closed, either way. */
export const CLOSED_STAGES: readonly OpportunityStage[] = ['won', 'lost']

export const OPPORTUNITY_KINDS = ['collaboration', 'booking', 'remix', 'paid', 'other'] as const
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number]

export const OPPORTUNITY_KIND_LABEL: Record<OpportunityKind, string> = {
  collaboration: 'Collaboration',
  booking: 'Booking',
  remix: 'Remix',
  paid: 'Paid project',
  other: 'Other'
}

export const DEFAULT_CURRENCY = 'CAD'
