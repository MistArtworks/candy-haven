import type { DispatchActivity, DispatchItem, DispatchNotice } from './dispatch'
import type { DispatchAuthor, DispatchKind } from './dispatch.constants'

/**
 * What is new on the board, for whoever is reading it.
 *
 * Everything here is worked out from each item's `seen` stamps, so the marks
 * survive a restart and agree between the console, the rail and the main
 * process, which raises the notices. Type-only imports: the renderer reads
 * this without pulling zod in.
 *
 * Three kinds of news, all made by the *other* person, never by the reader:
 *
 * - **Unseen**: an item they filed that the reader has never opened.
 * - **Unread comments**: theirs, newer than the reader's stamp.
 * - **A ruling**: the status changed since the reader last opened the item.
 */

/**
 * Comments on an item that the reader has not seen.
 *
 * Their own are never counted, however old their `seen` stamp is: a person
 * cannot have unread mail they wrote. Everything else is compared against the
 * one timestamp, which is what keeps this a subtraction rather than a set.
 */
export function unreadCount(item: DispatchItem, identity: DispatchAuthor | null): number {
  if (!identity) return 0

  const since = item.seen[identity] ?? 0
  return Object.values(item.comments).filter(
    (comment) => comment.author !== identity && comment.createdAt > since
  ).length
}

/**
 * True for an item the reader has never opened, filed by the other person.
 *
 * Distinct from having unread comments, and worth its own mark: an item with no
 * discussion yet is exactly the one most likely to be missed, because there is
 * no comment count drawing the eye to it.
 */
export function isUnseen(item: DispatchItem, identity: DispatchAuthor | null): boolean {
  if (!identity) return false
  return item.author !== identity && (item.seen[identity] ?? 0) === 0
}

/**
 * True when the other person changed the item's status since the reader last
 * opened it: resolved, denied, or put back to pending.
 *
 * Read from `ruledBy` and `ruledAt`, which rulings carry from 1.26.0. Items
 * ruled before then have neither, and stay unmarked rather than all lighting
 * up at once on the first launch after the update.
 */
export function rulingUnseen(item: DispatchItem, identity: DispatchAuthor | null): boolean {
  if (!identity || item.ruledBy === null || item.ruledBy === identity) return false
  return item.ruledAt > (item.seen[identity] ?? 0)
}

/** Anything new on the item, of any kind. */
export function hasNews(item: DispatchItem, identity: DispatchAuthor | null): boolean {
  return isUnseen(item, identity) || unreadCount(item, identity) > 0 || rulingUnseen(item, identity)
}

/** How many items have something new: the rail's count and the board's "N new". */
export function countWaiting(
  items: readonly DispatchItem[],
  identity: DispatchAuthor | null
): number {
  return items.filter((item) => hasNews(item, identity)).length
}

/** The first line of a body or a comment, short enough for a notice. */
function firstLine(text: string, max = 140): string {
  const line = text.trim().split(/\r?\n/)[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/**
 * What changed between two readings of the board, made by the other person.
 *
 * The main process compares each frame from the database with the board it
 * already held, so this sees exactly what arrived: an item filed, a comment
 * posted, a status changed. The reader's own actions come back down the same
 * stream and are left out by author. So is anything the reader has already
 * opened since, on another machine signed in as them.
 */
export function changesBetween(
  previous: readonly DispatchItem[],
  next: readonly DispatchItem[],
  identity: DispatchAuthor
): DispatchActivity[] {
  const before = new Map(previous.map((item) => [item.id, item]))
  const changes: DispatchActivity[] = []

  for (const item of next) {
    const seen = item.seen[identity] ?? 0
    const old = before.get(item.id)

    if (!old) {
      if (item.author !== identity && seen === 0) {
        changes.push({
          itemId: item.id,
          title: item.title,
          kind: 'filed',
          who: item.author,
          itemKind: item.kind,
          status: null,
          detail: firstLine(item.body)
        })
      }
      continue
    }

    for (const comment of Object.values(item.comments)) {
      if (comment.author === identity || comment.createdAt <= seen) continue
      if (old.comments[comment.id]) continue
      changes.push({
        itemId: item.id,
        title: item.title,
        kind: 'comment',
        who: comment.author,
        itemKind: item.kind,
        status: null,
        detail: firstLine(comment.body)
      })
    }

    if (
      item.ruledAt > old.ruledAt &&
      item.ruledBy !== null &&
      item.ruledBy !== identity &&
      item.ruledAt > seen
    ) {
      changes.push({
        itemId: item.id,
        title: item.title,
        kind: 'ruling',
        who: item.ruledBy,
        itemKind: item.kind,
        status: item.status,
        detail: firstLine(item.statusReason ?? '')
      })
    }
  }

  return changes
}

// -------------------------------------------------------------------- wording

const NAME: Record<DispatchAuthor, string> = { mist: 'Mist', candy: 'Candy' }

const A_KIND: Record<DispatchKind, string> = {
  idea: 'an idea',
  suggestion: 'a suggestion',
  request: 'a request',
  bug: 'a fault'
}

/**
 * One change in words, for the console's notice and the Windows one alike:
 * who did what as the label, and the item with its first line as the detail.
 */
export function describeActivity(change: DispatchActivity): { label: string; detail: string } {
  const who = NAME[change.who]
  const what = A_KIND[change.itemKind]
  const about = change.detail ? `${change.title}: ${change.detail}` : change.title

  switch (change.kind) {
    case 'filed':
      return { label: `${who} filed ${what}`, detail: about }
    case 'comment':
      return { label: `${who} commented on ${what}`, detail: about }
    case 'ruling': {
      const ruled =
        change.status === 'resolved'
          ? `${who} resolved ${what}`
          : change.status === 'denied'
            ? `${who} denied ${what}`
            : `${who} put ${what} back to pending`
      return { label: ruled, detail: about }
    }
  }
}

/** More than this arriving together is said once, not stacked. */
export const NOTICE_AT_ONCE = 2

/** One line of a notice, and the item it opens (null: the board). */
export interface NoticeLine {
  label: string
  detail: string
  itemId: string | null
}

/**
 * A whole notice in words, one line per change. More than `NOTICE_AT_ONCE`
 * changes, or the opening summary, become one line rather than a stack.
 */
export function describeNotice(notice: DispatchNotice): NoticeLine[] {
  if (notice.changes.length === 0) {
    if (notice.waiting === 0) return []
    return [
      {
        label: 'New on the board',
        detail: `${notice.waiting} ${notice.waiting === 1 ? 'item has' : 'items have'} something new since you last looked.`,
        itemId: notice.itemId
      }
    ]
  }

  if (notice.changes.length > NOTICE_AT_ONCE) {
    const titles = [...new Set(notice.changes.map((change) => change.title))]
    const items = new Set(notice.changes.map((change) => change.itemId))
    return [
      {
        label: `${notice.changes.length} new on the board`,
        detail: titles.length > 3 ? `${titles.slice(0, 3).join(', ')} and more` : titles.join(', '),
        itemId: items.size === 1 ? notice.changes[0].itemId : null
      }
    ]
  }

  return notice.changes.map((change) => ({ ...describeActivity(change), itemId: change.itemId }))
}
