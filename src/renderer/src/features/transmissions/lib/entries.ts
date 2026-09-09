import type { ScheduleEntry } from '@shared/domain/transmissions'
import { isOverdue } from '@renderer/lib/format'

/**
 * Predicates shared by the views.
 *
 * Kept out of the components themselves so the component files export only
 * components — the fast-refresh boundary the lint config enforces — and so the
 * four views cannot each arrive at a different answer for the same entry.
 */

/**
 * Unfinished business: a date that has passed with the work still outstanding.
 *
 * The `settled` check is what stops this flagging history. A deliverable that
 * went out last month has a date in the past and is not late, and marking it so
 * would train the operator to ignore the treatment on the ones that are.
 */
export function isEntryOverdue(entry: ScheduleEntry): boolean {
  return !entry.settled && isOverdue(entry.date)
}
