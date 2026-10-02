/**
 * RELEASES: the catalogue as the website shows it.
 *
 * Zod-free, so the renderer's pickers and labels can read it without the
 * schemas. See docs/RELEASES.md.
 */

/** Tapes on the website's home page shelf, at most. */
export const SHELF_SIZE = 8

/** As the website reads its fields (lib/releases/model.ts there). */
export const SITE_LIMITS = {
  title: 120,
  subtitle: 120,
  artist: 200,
  label: 120,
  role: 60,
  name: 120,
  names: 20,
  tracks: 60,
  credits: 40,
  distribution: 12,
  url: 500
} as const

export const RELEASES_LINK_STATES = [
  /** No Firebase config on this machine, so there is no sign-in to use. */
  'unconfigured',
  'signed-out',
  'syncing',
  'online',
  /** The last call failed. What was fetched before is still shown. */
  'offline'
] as const
export type ReleasesLinkState = (typeof RELEASES_LINK_STATES)[number]

/**
 * Where a release here stands against the website.
 *
 * - `unsent`: never sent from here (a new release, before its first Done).
 * - `sent`: the website has it as it is here.
 * - `changed`: edited here since it was last sent; Done or Sync now sends it.
 * - `cover`: only its cover is new to the website; it follows on its own.
 * - `waiting`: a send that couldn't reach the website, tried again on Sync now.
 * - `problem`: the website can't show it as it is (no tracks, say).
 */
export const SEND_STATES = ['unsent', 'sent', 'changed', 'cover', 'waiting', 'problem'] as const
export type SendState = (typeof SEND_STATES)[number]

/** Something about it is still to go to the website. */
export const isToSend = (state: SendState): boolean =>
  state === 'unsent' || state === 'changed' || state === 'cover' || state === 'waiting'

export const SEND_STATE_LABEL: Record<SendState, string> = {
  unsent: 'NOT SENT',
  sent: 'ON THE WEBSITE',
  changed: 'CHANGED',
  cover: 'COVER TO SEND',
  waiting: 'WAITING TO SEND',
  problem: "CAN'T GO ON"
}

/** Show or Hide, as picked on the page. */
export const RELEASE_CHOICES = ['show', 'hide'] as const
export type ReleaseChoice = (typeof RELEASE_CHOICES)[number]

/**
 * What can be done to the releases picked on the page. Held, not sent: the
 * Update bar sends everything held in one request.
 */
export const STAGE_ACTIONS = ['show', 'hide', 'shelf-add', 'shelf-remove', 'send'] as const
export type StageAction = (typeof STAGE_ACTIONS)[number]

export const STAGE_ACTION_LABEL: Record<StageAction, string> = {
  show: 'Show',
  hide: 'Hide',
  'shelf-add': 'Add to shelf',
  'shelf-remove': 'Remove from shelf',
  send: 'Send'
}

/** The platforms the website has a button for, as it names them. */
export const SITE_PLATFORMS = [
  'spotify',
  'apple-music',
  'youtube-music',
  'youtube',
  'soundcloud',
  'deezer',
  'tidal'
] as const
export type SitePlatform = (typeof SITE_PLATFORMS)[number]

/** The release kinds, as both sides name them. */
export const SITE_KINDS = ['single', 'ep', 'album', 'compilation', 'remix'] as const
export type SiteKind = (typeof SITE_KINDS)[number]
