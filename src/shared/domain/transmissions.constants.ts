import type {
  CollisionSeverity,
  ReleaseWindow,
  ScheduleCollision,
  ScheduleEntry,
  TransmissionEntryKind,
  TransmissionViewMode
} from './transmissions'
import { shiftIsoDate } from './projects.constants'

/**
 * TRANSMISSIONS constants and policy — the zod-free half of the domain.
 *
 * Imported as *values* by the renderer and by the main-process service, so the
 * two cannot disagree about what a collision is or when a package is owed. The
 * schemas live in transmissions.ts and are imported here type-only, which is
 * erased at compile time and keeps zod out of the renderer bundle.
 */

export const TRANSMISSION_ENTRY_KINDS = ['release', 'promotion', 'task'] as const

export const COLLISION_SEVERITIES = ['critical', 'warn'] as const

/** How the calendar is laid out. Mirrors ARCHIVE's `PROJECT_VIEW_MODES`. */
export const TRANSMISSION_VIEW_MODES = ['month', 'week', 'agenda', 'timeline'] as const

export const TRANSMISSION_VIEW_LABEL: Record<TransmissionViewMode, string> = {
  month: 'MONTH',
  week: 'WEEK',
  agenda: 'AGENDA',
  timeline: 'TIMELINE'
}

export const COLLISION_SEVERITY_LABEL: Record<CollisionSeverity, string> = {
  critical: 'CRITICAL',
  warn: 'WARNING'
}

export const ENTRY_KIND_LABEL: Record<TransmissionEntryKind, string> = {
  release: 'RELEASE',
  promotion: 'PROMOTION',
  task: 'TASK'
}

/** Longest a task title may be. Matched by the draft schema. */
export const MAX_TASK_TITLE = 200

/** Bounds on the distributor lead time, in days. Matched by the settings schema. */
export const MIN_LEAD_DAYS = 0
export const MAX_LEAD_DAYS = 180

/**
 * Entries a month cell shows before it collapses the rest into `+N MORE`.
 *
 * Four is what fits a cell at the smallest window the console supports without
 * the row growing taller than the grid it sits in.
 */
export const MONTH_CELL_ENTRY_LIMIT = 4

/**
 * The date a finished package is owed to the distributor.
 *
 * Derived rather than stored. A distributor wants the master and metadata some
 * fixed number of days before the date a release goes live, and that is one
 * operator setting — putting a `submitBy` field on every project would mean
 * maintaining the same arithmetic in as many places as there are releases.
 */
export function submitByDate(releaseDate: string, leadDays: number): string {
  return shiftIsoDate(releaseDate, -Math.abs(leadDays))
}

/**
 * Whether a submission window has closed without the release going out.
 *
 * `stage` matters: a released project's window is history, not a warning. The
 * operator should not be told to hurry on something already live.
 */
export function isWindowOverdue(submitBy: string, today: string, released: boolean): boolean {
  if (released) return false
  return submitBy < today
}

/**
 * Group entries by the day they fall on.
 *
 * ISO dates sort and compare as plain strings, which is most of why the project
 * stores them that way — no parsing, no timezone, and a `Map` keyed on the date
 * needs no normalising step that could drift a day.
 */
export function groupEntriesByDate(
  entries: readonly ScheduleEntry[]
): Map<string, ScheduleEntry[]> {
  const grouped = new Map<string, ScheduleEntry[]>()

  for (const entry of entries) {
    const existing = grouped.get(entry.date)
    if (existing) existing.push(entry)
    else grouped.set(entry.date, [entry])
  }

  // Within a day, releases lead, then promotional deliverables, then tasks —
  // the order the operator thinks about them in, not insertion order.
  for (const day of grouped.values()) day.sort(compareEntries)

  return grouped
}

const KIND_ORDER: Record<ScheduleEntry['kind'], number> = { release: 0, promotion: 1, task: 2 }

export function compareEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  return a.title.localeCompare(b.title)
}

/** The next release on or after `today`, or null when nothing is scheduled. */
export function nextRelease(
  entries: readonly ScheduleEntry[],
  today: string
): ScheduleEntry | null {
  return (
    entries
      .filter((entry) => entry.kind === 'release' && entry.date >= today)
      .sort(compareEntries)[0] ?? null
  )
}

/**
 * Days on which the schedule is fighting itself.
 *
 * ### What counts, and why it is not simply "two things on one day"
 *
 * A release's plan deliberately clusters beats near its release date — the
 * default plan puts a pre-release the day before and a video on the day itself.
 * Flagging that would mean flagging every campaign that is working correctly,
 * and a warning that fires on the normal case is one the operator learns to
 * ignore. So the rule is about *competition between campaigns*, not density:
 *
 *  - `critical` — two or more releases on one day. Two records out at once split
 *    the same attention, and it is almost always an entry mistake.
 *  - `warn` — entries belonging to two or more different projects on one day,
 *    including a promotional beat landing on another release's day.
 *
 * Tasks are excluded entirely. They are the operator's own work items, not
 * anything an audience sees, and a reminder to renew a subscription does not
 * compete with a release.
 */
export function detectCollisions(entries: readonly ScheduleEntry[]): ScheduleCollision[] {
  const collisions: ScheduleCollision[] = []
  const broadcast = entries.filter((entry) => entry.kind !== 'task')

  for (const [date, day] of groupEntriesByDate(broadcast)) {
    const releases = day.filter((entry) => entry.kind === 'release')

    if (releases.length > 1) {
      collisions.push({
        date,
        severity: 'critical',
        reason: `${releases.length} releases share this day: ${releases
          .map((entry) => entry.title)
          .join(', ')}.`,
        entryIds: releases.map((entry) => entry.id)
      })
      continue
    }

    // A project id of null cannot happen on a broadcast entry — only tasks are
    // allowed to float free — but the filter keeps the key type honest.
    const projects = new Set(
      day.map((entry) => entry.projectId).filter((id): id is string => id !== null)
    )
    if (projects.size < 2) continue

    const release = releases[0]
    collisions.push({
      date,
      severity: 'warn',
      reason: release
        ? `Promotion for another project lands on ${release.title}'s release day.`
        : `${projects.size} campaigns are pushing on this day.`,
      entryIds: day.map((entry) => entry.id)
    })
  }

  return collisions.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
    return a.date < b.date ? -1 : 1
  })
}

/** Collisions keyed by date, for a calendar cell asking about one day. */
export function collisionsByDate(
  collisions: readonly ScheduleCollision[]
): Map<string, ScheduleCollision> {
  const map = new Map<string, ScheduleCollision>()
  // Sorted severest-first by `detectCollisions`, so the first wins the day.
  for (const collision of collisions) {
    if (!map.has(collision.date)) map.set(collision.date, collision)
  }
  return map
}

/** Windows whose submission date has passed, severest first. */
export function overdueWindows(windows: readonly ReleaseWindow[]): ReleaseWindow[] {
  return windows
    .filter((window) => window.overdue)
    .sort((a, b) => (a.submitBy < b.submitBy ? -1 : 1))
}
