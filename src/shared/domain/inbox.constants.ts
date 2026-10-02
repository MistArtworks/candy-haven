/**
 * Constants half of the website inbox: CONTACT and SERVICES.
 *
 * The website files what its visitors send (a message from the contact page,
 * an enquiry from "Book me as a DJ") in its own database, and this console
 * keeps a copy of both. The statuses below are the website's, word for word:
 * a status is set here and sent there, so the two lists must not disagree
 * about what one can be. See docs/INBOX.md.
 */

/** Where a message stands. Opening a new one moves it to read on its own. */
export const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived'] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  new: 'NEW',
  read: 'READ',
  replied: 'REPLIED',
  archived: 'ARCHIVED'
}

/**
 * Where a DJ enquiry stands.
 *
 * No "read": an enquiry is a booking someone is waiting to hear about, and
 * having looked at one is not an answer. It stays new until it is taken up or
 * turned down, which is also why a new one keeps the rail's mark lit.
 */
export const ENQUIRY_STATUSES = ['new', 'in_talks', 'confirmed', 'declined', 'archived'] as const
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'NEW',
  in_talks: 'IN TALKS',
  confirmed: 'CONFIRMED',
  declined: 'DECLINED',
  archived: 'ARCHIVED'
}

/** The two things the website files, as its API names them. */
export const INBOX_KINDS = ['message', 'enquiry'] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export const INBOX_LINK_STATES = [
  /** No Firebase config on this machine, so there is no sign-in to use. */
  'unconfigured',
  'signed-out',
  'syncing',
  'online',
  /** The last check-in failed. The copy is still here; changes wait. */
  'offline'
] as const
export type InboxLinkState = (typeof INBOX_LINK_STATES)[number]

/**
 * The live website, and the one a development copy runs on this machine.
 *
 * Which applies is decided by the build rather than stored, so the installed
 * console and `npm run dev` can share one settings file and still each look
 * where they should. REGULATION's address field overrides both.
 */
export const LIVE_WEBSITE_URL = 'https://candy-heist.vercel.app'
export const LOCAL_WEBSITE_URL = 'http://localhost:3000'

/** How often the console checks in while signed in. */
export const INBOX_SYNC_INTERVAL_MS = 60_000

/** A note is the operator's own, and kept on this machine only. */
export const INBOX_NOTE_MAX = 4000

/**
 * A website address, cleaned to its origin, or null when it is not one.
 *
 * Only the origin is kept, so `https://candy-heist.vercel.app/contact` and the
 * bare address are the same website, and the copies filed under one are found
 * under the other. Plain http is allowed for a development server and nothing
 * else would be served that way, so it is not refused here.
 */
export function websiteOrigin(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}
