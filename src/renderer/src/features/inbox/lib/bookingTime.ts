/**
 * Times and money as SERVICES' PRODUCER shows them.
 *
 * A session's time is an instant, and this PC reads it in its own zone,
 * which is where Candy is. The client may be elsewhere; their time is shown
 * beside it, in the zone they booked from. Money is Canadian dollars, kept
 * in cents.
 */

const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})
const MONEY = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

/** `Saturday 10 October, 09:00`, here. */
export function whenHere(at: number): string {
  return `${DATE.format(at)}, ${CLOCK.format(at)}`
}

/** `Sat 10 Oct, 09:00`, here: for a card. */
export function whenShort(at: number): string {
  return `${SHORT_DATE.format(at)}, ${CLOCK.format(at)}`
}

/** `Saturday 10 October, 14:00 (UK)` in another zone, or null when it reads the same as here. */
export function whenThere(at: number, zone: string): string | null {
  if (!zone) return null
  try {
    const date = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: zone
    }).format(at)
    const clock = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone
    }).format(at)
    const there = `${date}, ${clock}`
    if (there === whenHere(at)) return null
    const name =
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longGeneric' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? zone
    return `${there} (${name})`
  } catch {
    return null
  }
}

/** `1 h 30 min`, from a session's start and end. */
export function lengthOf(start: number, end: number): string {
  const minutes = Math.round((end - start) / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function money(cents: number): string {
  return MONEY.format(cents / 100)
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** The day an instant falls on here, `YYYY-MM-DD`. */
export function dayHere(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The minute of the day an instant falls on here. */
export function minuteHere(at: number): number {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}

/** The instant a day and a minute of it are, here. Null for a day that isn't one. */
export function instantHere(day: string, minute: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const at = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Math.floor(minute / 60),
    minute % 60
  )
  return Number.isNaN(at.getTime()) ? null : at.getTime()
}

/** `09:00`, a minute of the day. */
export function clockOf(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}
