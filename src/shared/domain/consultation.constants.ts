/**
 * Constants half of CONSULTATION: a track shared for other producers'
 * feedback, through a link on the website that stays open a week at most.
 *
 * The console uploads the track to the website's Vercel Blob store, with a
 * pass the website gives it for that one file, and opens the link on the
 * website. Producers listen there, leave notes and try tools on it, and
 * what they send comes back here when someone checks. When the link closes,
 * the website deletes the track and all its feedback, and only the record
 * that it was shared stays, marked EXPIRED. See docs/CONSULTATION.md.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/** The longest a link stays open, counted from when it was shared. */
export const MAX_LINK_DAYS = 7

/**
 * The Blob storage Vercel's free Hobby plan includes, which the meter
 * measures against and no upload is let past. The website keeps the same
 * figure and checks it again before it gives an upload's pass; this is
 * what the meter shows before the first check-in answers.
 */
export const STORAGE_LIMIT_BYTES = 1024 ** 3

/** The largest track one link plays. The website refuses bigger as well. */
export const MAX_TRACK_BYTES = 200 * 1024 ** 2

export const MAX_TITLE = 120
export const MAX_MESSAGE = 1000

/** The tempo range the producers' sidechain accepts, and so this field. */
export const MIN_BPM = 60
export const MAX_BPM = 200

/** How near its close a link reads as closing soon: its last day. */
export const CLOSING_SOON_MS = DAY_MS

export const CONSULTATION_LINK_STATES = [
  /** No Firebase config on this machine, so there is no sign-in to use. */
  'unconfigured',
  'signed-out',
  'syncing',
  'online',
  /** The last check-in failed. The copy is still here; changes wait. */
  'offline'
] as const
export type ConsultationLinkState = (typeof CONSULTATION_LINK_STATES)[number]

/** What an upload is doing, for the share dialog's bar. */
export const SHARE_STAGES = ['uploading', 'opening'] as const
export type ShareStage = (typeof SHARE_STAGES)[number]

/** A link's dates, which are all its openness is decided by. */
export interface LinkDates {
  expiresAt: number
  /** Set when it was closed early. */
  endedAt: number | null
}

/** Whether a link is open at `now`: neither closed early nor past its time. */
export function isLinkOpen(link: LinkDates, now: number): boolean {
  return link.endedAt === null && link.expiresAt > now
}

/** The latest a link can be kept open to: a week from when it was shared. */
export function latestClose(createdAt: number): number {
  return createdAt + MAX_LINK_DAYS * DAY_MS
}

/**
 * How long is left, in the largest unit that says it: `6 days`, `5 h`,
 * `12 min`, `under a minute`. Hours and minutes are abbreviated because
 * they sit in narrow columns; days are not, because `6 d` reads as a typo.
 */
export function formatLeft(ms: number): string {
  if (ms < 60_000) return 'under a minute'
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)} min`
  if (ms < DAY_MS) return `${Math.floor(ms / (60 * 60_000))} h`
  const days = Math.floor(ms / DAY_MS)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** The media type a track is stored under: the bare type, without codec parameters. */
export function storedType(mime: string): string {
  return mime.split(';')[0].trim()
}
