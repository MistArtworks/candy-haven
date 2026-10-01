import type { Colophon } from './colophon'
import { checkLinkUrl, type NameCheck } from './artists.constants'

/**
 * Zod-free half of the colophon domain: see projects.constants.ts for why the
 * split exists. The page needs the field rules as *values*, to say what is
 * wrong with a field while it is being typed; the schemas run once, at the IPC
 * boundary.
 *
 * ## What the colophon is
 *
 * The details the website carries: the address bookings are written to, the
 * number that is called, the Discord username people message after a
 * booking, and the artist's profile on every platform people follow and
 * listen on. One record, not a register, because the website has one of each.
 *
 * ## Kept here, published later
 *
 * It lives in the archive on this machine, like everything else. Nothing reads
 * it from outside yet: the website is meant to be a projection of this
 * console's records (docs/PROJECT_CONTEXT.md §14), and publishing it is a
 * department still to come. Until then this is the record the website will be
 * built from, and the one place each detail is written.
 *
 * ## Every field may be empty
 *
 * An empty field is the honest record of a detail not known yet, not a gap to
 * fill with something plausible. The website leaves out what is not set rather
 * than printing a placeholder.
 */

/** RFC 5321's limit on a whole address. */
export const MAX_EMAIL = 254

/** As typed, with its spaces and brackets. Generous; the digits are the limit. */
export const MAX_PHONE = 32

/** Discord's own ceiling on a username. */
export const MAX_DISCORD = 32

/** E.164: no number anywhere is longer than fifteen digits. */
const MAX_DIGITS = 15

/** Shorter than this and it cannot be a whole number, with or without a code. */
const MIN_DIGITS = 7

/** The record before anything has been written into it. */
export function emptyColophon(): Colophon {
  return { email: '', phone: '', discord: '', profiles: emptyProfiles(), updatedAt: 0 }
}

// -------------------------------------------------------------------- email

/**
 * An address, or nothing.
 *
 * Deliberately not RFC 5322: the full grammar admits addresses no mail
 * provider issues and refuses nothing the operator would actually type. What
 * this catches is the mistake that matters, a half-typed address or a missing
 * domain, and it says so in a sentence.
 */
export function checkEmail(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.length > MAX_EMAIL) return { ok: false, reason: 'That address is too long.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, reason: 'That is not an address yet. It needs a name, an @ and a domain.' }
  }
  return { ok: true }
}

// -------------------------------------------------------------------- phone

/**
 * A number, as it should read on the page, or nothing.
 *
 * Stored as typed, `+1 (902) 555-0142`, because how it reads is the operator's
 * choice and spacing a number is a local custom. What dials is derived from it
 * (`dialString`), so the two cannot disagree. The rules are only the ones a
 * dialler enforces: digits and the usual separators, a `+` only before the
 * country code, and a length a real number can have.
 */
export function checkPhone(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.length > MAX_PHONE) return { ok: false, reason: 'That number is too long.' }
  if (/[^0-9+()\-.\s]/.test(trimmed)) {
    return { ok: false, reason: 'A number holds digits, spaces, + ( ) - and . only.' }
  }
  if (trimmed.lastIndexOf('+') > 0) {
    return { ok: false, reason: 'A + belongs at the very start, before the country code.' }
  }

  const digits = trimmed.replace(/\D/g, '').length
  if (digits < MIN_DIGITS) return { ok: false, reason: 'That is too short to dial.' }
  if (digits > MAX_DIGITS) {
    return { ok: false, reason: 'That is longer than any number can be. Fifteen digits at most.' }
  }
  return { ok: true }
}

/**
 * What the number dials as: its digits, with the `+` kept when it has one.
 *
 * The form a `tel:` link wants, and the one the page shows under the field, so
 * the operator sees exactly what a phone will be handed. Empty for an empty or
 * unusable number, because a link that dials the wrong thing is worse than none.
 */
export function dialString(value: string): string {
  if (!checkPhone(value).ok) return ''
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

// ------------------------------------------------------------------ discord

/**
 * A Discord username, or nothing.
 *
 * Discord's current rules, which replaced the old `name#1234` tags: two to
 * thirty-two characters, lowercase letters, numbers, underscores and periods,
 * and never two periods together. Refused with the rule rather than corrected,
 * because quietly lowercasing a name the operator typed would store something
 * they did not write.
 */
export function checkDiscord(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.startsWith('@')) {
    return { ok: false, reason: 'Leave off the @. A Discord username is written without one.' }
  }
  if (trimmed.includes('#')) {
    return {
      ok: false,
      reason: 'Discord retired the #1234 tags. Use the username alone, as Discord shows it now.'
    }
  }
  if (trimmed !== trimmed.toLowerCase()) {
    return { ok: false, reason: 'Discord usernames are lowercase.' }
  }
  if (!/^[a-z0-9_.]+$/.test(trimmed)) {
    return {
      ok: false,
      reason: 'Discord usernames hold letters, numbers, periods and underscores only.'
    }
  }
  if (trimmed.length < 2)
    return { ok: false, reason: 'A Discord username is at least two characters.' }
  if (trimmed.length > MAX_DISCORD) {
    return { ok: false, reason: `A Discord username is at most ${MAX_DISCORD} characters.` }
  }
  if (trimmed.includes('..')) {
    return { ok: false, reason: 'Two periods cannot sit side by side in a Discord username.' }
  }
  return { ok: true }
}

// ----------------------------------------------------------------- profiles

/**
 * Every platform the colophon holds a profile on, in the order the page draws
 * them: where people follow the artist, and where they listen.
 *
 * Ids follow the console's existing tables wherever a platform means the same
 * thing there (`spotify`, `apple`, `soundcloud`, `bandcamp`, `beatport`,
 * `amazon`, `deezer`, `tidal`, `instagram`), so a profile here and a release's
 * distribution row can be matched later without a translation table. Two are
 * deliberately split: `youtube` is the channel, which is what the website's
 * footer means, and `youtube-music` is the music service, which is what
 * DISCOGRAPHY's own `youtube` distributes to.
 *
 * Not `DISTRIBUTION_PLATFORMS`, for the reason that table gives for not being
 * `SOCIAL_PLATFORMS`: it is where a *record* goes out, and this is where the
 * *artist* can be found, which includes the DJ platforms and the regional
 * services a release list has no reason to carry.
 */
export const PROFILE_PLATFORMS = [
  'instagram',
  'spotify',
  'apple',
  'soundcloud',
  'youtube',
  'youtube-music',
  'deezer',
  'tidal',
  'amazon',
  'bandcamp',
  'beatport',
  'beatsource',
  'traxsource',
  'mixcloud',
  'audiomack',
  'qobuz',
  'pandora',
  'anghami',
  'boomplay',
  'jiosaavn',
  'gaana'
] as const

export type ProfilePlatform = (typeof PROFILE_PLATFORMS)[number]

/**
 * Always on the page, filled or not.
 *
 * The four the operator named as musts (Spotify, Apple Music, SoundCloud and
 * YouTube), and Instagram, which the website's navbar and footer draw beside
 * three of them. Every other platform is added when there is a profile to put
 * on it, so the page does not open on sixteen empty fields.
 */
export const CORE_PROFILE_PLATFORMS = [
  'instagram',
  'spotify',
  'apple',
  'soundcloud',
  'youtube'
] as const satisfies readonly ProfilePlatform[]

/** The four the website's navbar and footer draw, each behind its own mark. */
export const NAVBAR_PROFILE_PLATFORMS = [
  'instagram',
  'soundcloud',
  'spotify',
  'youtube'
] as const satisfies readonly ProfilePlatform[]

/** As each platform writes its own name. */
export const PROFILE_PLATFORM_LABEL: Record<ProfilePlatform, string> = {
  instagram: 'Instagram',
  spotify: 'Spotify',
  apple: 'Apple Music',
  soundcloud: 'SoundCloud',
  youtube: 'YouTube',
  'youtube-music': 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'TIDAL',
  amazon: 'Amazon Music',
  bandcamp: 'Bandcamp',
  beatport: 'Beatport',
  beatsource: 'Beatsource',
  traxsource: 'Traxsource',
  mixcloud: 'Mixcloud',
  audiomack: 'Audiomack',
  qobuz: 'Qobuz',
  pandora: 'Pandora',
  anghami: 'Anghami',
  boomplay: 'Boomplay',
  jiosaavn: 'JioSaavn',
  gaana: 'Gaana'
}

/**
 * The hosts each platform's addresses live on.
 *
 * Matched against an address's hostname, exactly or as a subdomain, so
 * `nasko.bandcamp.com` is Bandcamp. `music.youtube.com` sits inside YouTube's
 * domain and belongs to YouTube Music, so the more specific platform is tried
 * first (`SPECIFIC_FIRST`). Amazon's music service lives on a different domain
 * in every country, so it is matched on its `music.amazon.` prefix instead and
 * lists no hosts here.
 */
const PROFILE_HOSTS: Record<ProfilePlatform, readonly string[]> = {
  instagram: ['instagram.com', 'instagr.am'],
  spotify: ['spotify.com', 'spotify.link'],
  apple: ['music.apple.com', 'itunes.apple.com'],
  soundcloud: ['soundcloud.com', 'snd.sc'],
  youtube: ['youtube.com', 'youtu.be'],
  'youtube-music': ['music.youtube.com'],
  deezer: ['deezer.com', 'deezer.page.link'],
  tidal: ['tidal.com'],
  amazon: [],
  bandcamp: ['bandcamp.com'],
  beatport: ['beatport.com'],
  beatsource: ['beatsource.com'],
  traxsource: ['traxsource.com'],
  mixcloud: ['mixcloud.com'],
  audiomack: ['audiomack.com'],
  qobuz: ['qobuz.com'],
  pandora: ['pandora.com'],
  anghami: ['anghami.com'],
  boomplay: ['boomplay.com', 'boomplaymusic.com'],
  jiosaavn: ['jiosaavn.com', 'saavn.com'],
  gaana: ['gaana.com']
}

/** Platforms whose hosts sit inside another's, tried before it. */
const SPECIFIC_FIRST: readonly ProfilePlatform[] = ['youtube-music']

/** The order addresses are recognised in. */
const RECOGNITION_ORDER: readonly ProfilePlatform[] = [
  ...SPECIFIC_FIRST,
  ...PROFILE_PLATFORMS.filter((platform) => !SPECIFIC_FIRST.includes(platform))
]

/** Which platform an address is on, or null for one the colophon does not know. */
export function profilePlatformOf(url: string): ProfilePlatform | null {
  let host: string
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }

  if (host.startsWith('music.amazon.')) return 'amazon'
  for (const platform of RECOGNITION_ORDER) {
    if (PROFILE_HOSTS[platform].some((known) => host === known || host.endsWith(`.${known}`))) {
      return platform
    }
  }
  return null
}

/** True for a key the colophon knows as a platform. */
export function isProfilePlatform(value: string): value is ProfilePlatform {
  return (PROFILE_PLATFORMS as readonly string[]).includes(value)
}

/** True for a platform the page always draws. */
export function isCoreProfile(platform: ProfilePlatform): boolean {
  return (CORE_PROFILE_PLATFORMS as readonly ProfilePlatform[]).includes(platform)
}

/** True for a platform the website's navbar and footer draw. */
export function isNavbarProfile(platform: ProfilePlatform): boolean {
  return (NAVBAR_PROFILE_PLATFORMS as readonly ProfilePlatform[]).includes(platform)
}

/**
 * A platform's address, or nothing.
 *
 * It has to open, the roster's rule for any link, and it has to be on the
 * platform its field is for. A SoundCloud address pasted into Spotify's field
 * is the mistake worth catching: the website would draw it behind the wrong
 * mark, and nobody would notice until somebody clicked it.
 */
export function checkProfileUrl(platform: ProfilePlatform, url: string): NameCheck {
  const trimmed = url.trim()
  if (trimmed.length === 0) return { ok: true }

  const opens = checkLinkUrl(trimmed)
  if (!opens.ok) return opens

  const on = profilePlatformOf(trimmed)
  if (on !== platform) {
    const field = PROFILE_PLATFORM_LABEL[platform]
    return {
      ok: false,
      reason: on
        ? `That address is on ${PROFILE_PLATFORM_LABEL[on]}, not ${field}.`
        : `That address is not on ${field}.`
    }
  }
  return { ok: true }
}

/**
 * The profiles, keyed by platform.
 *
 * A key present is a platform on the page; its value may be empty, a profile
 * planned and not set up yet. The core platforms are always present.
 */
export type ColophonProfiles = Record<string, string>

export function emptyProfiles(): ColophonProfiles {
  return Object.fromEntries(CORE_PROFILE_PLATFORMS.map((platform) => [platform, '']))
}

/**
 * A stored map, as the page should see it: every core platform present, every
 * platform this console does not know dropped, the rest kept as they are.
 *
 * Read rather than refused, because the stored schema is permissive on
 * purpose and a platform retired from the table should not make the whole
 * record unreadable.
 */
export function readProfiles(raw: Readonly<Record<string, unknown>>): ColophonProfiles {
  const profiles = emptyProfiles()
  for (const platform of PROFILE_PLATFORMS) {
    const url = raw[platform]
    if (typeof url === 'string') profiles[platform] = url
  }
  return profiles
}

/** The platforms on the page: the core ones, then those added, in table order. */
export function listedPlatforms(profiles: Readonly<ColophonProfiles>): ProfilePlatform[] {
  return PROFILE_PLATFORMS.filter(
    (platform) => isCoreProfile(platform) || profiles[platform] !== undefined
  )
}

/**
 * The profiles, from the free list of links the first COLOPHON kept.
 *
 * COLOPHON opened with a list of links and moved to a profile per platform the
 * same day (2026-10-01), once the website's own platforms were set beside it.
 * A record filed in between is read through this, so nothing typed into it is
 * lost: each link is placed by the platform its address is actually on, the
 * first of each winning, and an address on no platform the colophon knows is
 * left behind. Pure, like `distributionFromLinks`, so it reads without a
 * database.
 */
export function profilesFromLinks(links: unknown): ColophonProfiles {
  const profiles = emptyProfiles()
  if (!Array.isArray(links)) return profiles

  for (const link of links) {
    if (!link || typeof link !== 'object') continue
    const url = (link as { url?: unknown }).url
    if (typeof url !== 'string') continue
    const platform = profilePlatformOf(url)
    if (platform && !profiles[platform]) profiles[platform] = url.trim()
  }
  return profiles
}
