/**
 * Formatting for the board.
 *
 * Relative rather than absolute, unlike the ARCHIVE's register. The question
 * asked of a suggestion board is "how long has this been sitting there", which
 * a date makes the reader work out and an interval answers.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelative(at: number): string {
  if (!at) return '—'

  const delta = Date.now() - at
  // A clock a few seconds ahead of the database's is normal and should not
  // produce "in 4 seconds" on something that has just been filed.
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  if (delta < 30 * DAY) return `${Math.floor(delta / DAY)}d ago`

  return new Date(at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

/** Absolute, for a thread where the exact moment of a reply matters. */
export function formatStamp(at: number): string {
  if (!at) return '—'

  return new Date(at)
    .toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    .toUpperCase()
}
