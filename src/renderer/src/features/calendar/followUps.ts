import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalendarEntry, CalendarFollowUp } from '@shared/domain/calendar'
import { compareEntries, formatMinute } from '@shared/domain/calendar.constants'

/**
 * Follow-ups from ARTISTS, as the register draws them.
 *
 * ## A reading, kept apart from the entries
 *
 * A follow-up is a task on a lead or an opportunity. It is set, moved and
 * completed in ARTISTS, and the register reads it on every snapshot the way
 * it reads a release date (see `CalendarFollowUpSchema`). So nothing in this
 * module turns one into an entry, and the views carry follow-ups in a list of
 * their own right up to the moment they are drawn.
 *
 * ## Unlike a release, it has a time
 *
 * Which decides where it goes. A release has only a date, so it holds the top
 * of its day. A follow-up is due at a minute, so it is drawn on the clock in
 * WEEK and DAY, and among the entries in time order wherever a day is a list.
 */

/** The words it is known by, wherever there is room to spell them out. */
export const FOLLOW_UP_LABEL = 'FOLLOW UP'

/** Whose task it is, which is also where pressing it leads. */
export const FOLLOW_UP_PARENT_LABEL: Record<CalendarFollowUp['parentKind'], string> = {
  lead: 'LEAD',
  opportunity: 'OPPORTUNITY'
}

/**
 * How much of the clock a follow-up's mark reserves, in minutes.
 *
 * Not a duration. A follow-up is due at a minute and lasts no time at all;
 * this is the room one line of type needs at the grid's hour height. The
 * overlap layout counts it, so an entry starting a few minutes later is drawn
 * beside the mark rather than over it.
 */
export const FOLLOW_UP_FOOTPRINT = 30

/** Where a follow-up lives: its lead, or its opportunity, in ARTISTS. */
export function followUpHref(followUp: CalendarFollowUp): string {
  // Built rather than concatenated, so an id is escaped however it is spelled.
  const query =
    followUp.parentKind === 'lead'
      ? new URLSearchParams({ lead: followUp.leadId })
      : new URLSearchParams({ lens: 'opportunities', opportunity: followUp.parentId })
  return `/leads?${query.toString()}`
}

/**
 * Leaves for a follow-up's lead or opportunity.
 *
 * Leaving is the only thing a follow-up does when pressed, for the reason
 * `ReleaseMark` gives for a release: there is nothing here to open, and a
 * marker that could be edited or dragged would make the calendar a second
 * writer of a time that ARTISTS owns.
 */
export function useOpenFollowUp(): (followUp: CalendarFollowUp) => void {
  const navigate = useNavigate()
  return useCallback(
    (followUp: CalendarFollowUp) => {
      void navigate(followUpHref(followUp))
    },
    [navigate]
  )
}

/**
 * Register order for follow-ups: by date and minute, then by name and title,
 * then by task so the order is total and a redraw cannot reshuffle two that
 * compare equal.
 */
export function compareFollowUps(left: CalendarFollowUp, right: CalendarFollowUp): number {
  if (left.date !== right.date) return left.date < right.date ? -1 : 1
  if (left.startMinute !== right.startMinute) return left.startMinute - right.startMinute
  return (
    left.who.localeCompare(right.who) ||
    left.title.localeCompare(right.title) ||
    left.taskId.localeCompare(right.taskId)
  )
}

/** The follow-ups due on one date, in time order. */
export function followUpsOn(
  followUps: readonly CalendarFollowUp[],
  date: string
): CalendarFollowUp[] {
  return followUps.filter((followUp) => followUp.date === date).sort(compareFollowUps)
}

/** The minutes a follow-up's mark covers on the clock. See `FOLLOW_UP_FOOTPRINT`. */
export function followUpSpan(followUp: CalendarFollowUp): { start: number; end: number } {
  // Clamped to the day, as `entrySpan` clamps an entry, so a mark due just
  // before midnight is cut short rather than running off the end of the clock.
  return {
    start: followUp.startMinute,
    end: Math.min(1440, followUp.startMinute + FOLLOW_UP_FOOTPRINT)
  }
}

/**
 * One line of a day: an entry the operator filed, or a follow-up read from
 * ARTISTS.
 *
 * A union rather than a common shape, so a view has to say which it is
 * drawing before it can touch either, and an entry's dialog can never be
 * handed a follow-up by accident.
 */
export type DayItem =
  | { type: 'entry'; key: string; entry: CalendarEntry }
  | { type: 'followUp'; key: string; followUp: CalendarFollowUp }

export function entryItem(entry: CalendarEntry): DayItem {
  return { type: 'entry', key: entry.id, entry }
}

export function followUpItem(followUp: CalendarFollowUp): DayItem {
  // Prefixed, because the two kinds of id share one list of React keys and
  // nothing promises they are drawn from different spaces.
  return { type: 'followUp', key: `follow-up:${followUp.taskId}`, followUp }
}

/**
 * One day's entries and follow-ups as a single list, in time order.
 *
 * All-day entries lead, because they have no minute to be placed by. On the
 * same minute an entry goes first: it is the operator's own appointment, and
 * a follow-up due then is usually something to do around it.
 */
export function dayItems(
  entries: readonly CalendarEntry[],
  followUps: readonly CalendarFollowUp[]
): DayItem[] {
  const items = [
    ...[...entries].sort(compareEntries).map(entryItem),
    ...[...followUps].sort(compareFollowUps).map(followUpItem)
  ]
  // A stable sort, so items on the same minute keep the order built above:
  // entries first, and each kind in its own register order.
  return items.sort((left, right) => itemMinute(left) - itemMinute(right))
}

/** Where an item falls in its day, with an all-day entry ahead of midnight. */
function itemMinute(item: DayItem): number {
  if (item.type === 'followUp') return item.followUp.startMinute
  return item.entry.startMinute ?? -1
}

const STATUS_NOTE: Record<CalendarFollowUp['status'], string> = {
  pending: '',
  overdue: 'Overdue',
  complete: 'Complete'
}

/**
 * A follow-up in words: the hint over it, and its accessible name.
 *
 * Everything the mark says with colour, weight and position is said here as
 * well, so the status and the priority survive being read rather than seen.
 */
export function describeFollowUp(followUp: CalendarFollowUp): string {
  const head = followUp.who ? `Follow up with ${followUp.who}` : 'Follow up'

  return [
    followUp.title ? `${head}: ${followUp.title}` : head,
    formatMinute(followUp.startMinute),
    STATUS_NOTE[followUp.status],
    followUp.priority === 'high' ? 'High priority' : '',
    `Open the ${followUp.parentKind} in ARTISTS`
  ]
    .filter(Boolean)
    .join(' · ')
}
