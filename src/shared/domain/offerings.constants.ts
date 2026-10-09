/**
 * Constants half of SERVICES' OFFERINGS and HOURS: what "Book me as a music
 * producer" offers, and when its sessions can be booked, written here and
 * published to the website. See docs/INBOX.md.
 *
 * The limits are the website's own (candy-heist's lib/services/model.ts),
 * checked here first so the page can say what's wrong before anything is
 * sent. The website checks again, and has the last word.
 */

/** A commission (made for the client, half paid upfront) or a 1-1 session (paid in full). */
export const OFFERING_KINDS = ['commission', 'session'] as const
export type OfferingKind = (typeof OFFERING_KINDS)[number]

export const OFFERING_KIND_LABEL: Record<OfferingKind, string> = {
  commission: 'Commission',
  session: '1-1 session'
}

/** The glyph a service carries on the website's home page and in its testimonials. */
export const OFFERING_ICONS = ['production', 'dj', 'feedback', 'mix'] as const
export type OfferingIcon = (typeof OFFERING_ICONS)[number]

export const OFFERING_ICON_LABEL: Record<OfferingIcon, string> = {
  production: 'Production',
  dj: 'DJ',
  feedback: 'Feedback',
  mix: 'Mixing'
}

export const OFFERING_LIMITS = {
  /** Services on the website at once. */
  items: 40,
  slug: 60,
  name: 80,
  summary: 160,
  facts: 6,
  factLabel: 24,
  factValue: 80,
  alt: 200,
  body: 20_000,
  /** The highest price, in dollars. */
  price: 100_000,
  timesPerDay: 48,
  closed: 400
} as const

/** A service's address: lowercase words joined by dashes. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** How long a session can run, in minutes. */
export const SESSION_LENGTHS = [
  15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 420, 480
] as const

/** The smallest a service's photo may be, as the website asks: it cuts a 1600 wide banner from it. */
export const PHOTO_MIN = { width: 1200, height: 800 } as const

/** The days of the week, Monday first, as the website names them. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday'
}

/** How far ahead a session has to be booked, in hours. */
export const NOTICE_HOURS = [0, 1, 2, 3, 6, 12, 24, 36, 48, 72, 96, 120, 168, 336] as const

/** How far ahead it can be booked: to the end of the month this many months on. */
export const HORIZON_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/** Free time after a session before the next can start, in minutes. */
export const BUFFER_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const

/** Candy's zone, until it's set otherwise. */
export const DEFAULT_TIME_ZONE = 'America/Halifax'

/** Where a service stands against what this PC last published to the website. */
export const OFFERING_STATUSES = ['published', 'changed', 'new', 'hidden'] as const
export type OfferingStatus = (typeof OFFERING_STATUSES)[number]

export const OFFERING_STATUS_LABEL: Record<OfferingStatus, string> = {
  published: 'ON THE WEBSITE',
  changed: 'CHANGED',
  new: 'NOT PUBLISHED',
  hidden: 'KEPT HERE'
}

/** The same, short enough for a row of the list. */
export const OFFERING_STATUS_SHORT: Record<OfferingStatus, string> = {
  published: 'LIVE',
  changed: 'CHANGED',
  new: 'NOT LIVE',
  hidden: 'HIDDEN'
}

export const OFFERINGS_LINK_STATES = [
  'unconfigured',
  'signed-out',
  'syncing',
  'online',
  'offline'
] as const

/** The facts a new service starts with, by kind, to be edited. */
export const STARTER_FACTS: Record<OfferingKind, { label: string; value: string }[]> = {
  commission: [
    { label: 'Format', value: 'Per track' },
    { label: 'Delivery', value: 'Within 7 days' }
  ],
  session: [
    { label: 'Length', value: '60 min' },
    { label: 'Via', value: 'Discord or Google Meet' }
  ]
}

/** An address made from a name: `Mixing & Mastering` is `mixing-mastering`. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, OFFERING_LIMITS.slug)
    .replace(/-+$/g, '')
  return slug || 'service'
}

/** Every quarter of an hour, `00:00` to `23:45`, for a start time. */
export const QUARTER_HOURS: readonly string[] = Array.from({ length: 96 }, (_, i) => {
  const minute = i * 15
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
})
