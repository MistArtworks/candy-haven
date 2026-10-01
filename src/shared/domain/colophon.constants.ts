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
 * The details the website carries: every address and number people reach the
 * artist through, who represents them and where they are, and their profile
 * on every platform people follow, listen, watch and buy on. One record, not
 * a register, because the website has one of each.
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
 *
 * ## Every field is public or private
 *
 * A public field is published with the website; a private one is kept in the
 * archive and goes nowhere else. The few the website cannot be built without
 * are public and stay public (`ALWAYS_PUBLIC`). See the visibility section at
 * the foot of this file.
 */

/** RFC 5321's limit on a whole address. */
export const MAX_EMAIL = 254

/** As typed, with its spaces and brackets. Generous; the digits are the limit. */
export const MAX_PHONE = 32

/** Discord's own ceiling on a username. */
export const MAX_DISCORD = 32

/** Telegram's own ceiling on a username. */
export const MAX_TELEGRAM = 32

/** A city and a country, as the website should print them. */
export const MAX_BASED_IN = 64

/** The longest IANA zone is 30 characters; this leaves room and no more. */
export const MAX_TIME_ZONE = 64

/** A person's or a company's name: management, an agency, a label. */
export const MAX_NAME = 96

/** E.164: no number anywhere is longer than fifteen digits. */
const MAX_DIGITS = 15

/** Shorter than this and it cannot be a whole number, with or without a code. */
const MIN_DIGITS = 7

/**
 * Every detail the colophon holds besides the profiles, in the order the page
 * draws them. The schema checks its shape against this with `satisfies`, so a
 * detail added here and not there fails to compile.
 */
export const COLOPHON_DETAILS = [
  'email',
  'managementEmail',
  'pressEmail',
  'phone',
  'whatsapp',
  'discord',
  'telegram',
  'basedIn',
  'timeZone',
  'management',
  'agency',
  'label',
  'pressKit'
] as const

export type ColophonDetail = (typeof COLOPHON_DETAILS)[number]

/** As each detail is named, on the page and in a refusal. */
export const COLOPHON_DETAIL_LABEL: Record<ColophonDetail, string> = {
  email: 'Booking email',
  managementEmail: 'Management email',
  pressEmail: 'Press email',
  phone: 'Phone number',
  whatsapp: 'WhatsApp number',
  discord: 'Discord username',
  telegram: 'Telegram username',
  basedIn: 'Based in',
  timeZone: 'Time zone',
  management: 'Management',
  agency: 'Booking agency',
  label: 'Label',
  pressKit: 'Press kit'
}

/** The record before anything has been written into it. */
export function emptyColophon(): Colophon {
  return {
    email: '',
    managementEmail: '',
    pressEmail: '',
    phone: '',
    whatsapp: '',
    discord: '',
    telegram: '',
    basedIn: '',
    timeZone: '',
    management: '',
    agency: '',
    label: '',
    pressKit: '',
    profiles: emptyProfiles(),
    visibility: defaultVisibilities(),
    updatedAt: 0
  }
}

/** The rule each detail is held to. One place, so the page and the service agree. */
export function checkDetail(detail: ColophonDetail, value: string): NameCheck {
  switch (detail) {
    case 'email':
    case 'managementEmail':
    case 'pressEmail':
      return checkEmail(value)
    case 'phone':
      return checkPhone(value)
    case 'whatsapp':
      return checkWhatsApp(value)
    case 'discord':
      return checkDiscord(value)
    case 'telegram':
      return checkTelegram(value)
    case 'basedIn':
      return checkName(value, MAX_BASED_IN)
    case 'timeZone':
      return checkTimeZone(value)
    case 'management':
    case 'agency':
    case 'label':
      return checkName(value, MAX_NAME)
    case 'pressKit':
      return value.trim() ? checkLinkUrl(value) : { ok: true }
  }
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

/**
 * A WhatsApp number, or nothing.
 *
 * A phone number by every rule above, and one more: it must carry its country
 * code. A chat link (`wa.me/…`) is opened from anywhere in the world and has
 * no local area to assume, so a number without its `+` would open a chat with
 * somebody else. Kept apart from the phone number because the two are often
 * not the same line.
 */
export function checkWhatsApp(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  const phone = checkPhone(trimmed)
  if (!phone.ok) return phone
  if (!trimmed.startsWith('+')) {
    return {
      ok: false,
      reason: 'WhatsApp needs the whole international number. Start with + and the country code.'
    }
  }
  return { ok: true }
}

/** The chat link a WhatsApp number opens, or empty for one that cannot. */
export function whatsappLink(value: string): string {
  if (!value.trim() || !checkWhatsApp(value).ok) return ''
  return `https://wa.me/${value.replace(/\D/g, '')}`
}

// ---------------------------------------------------------------- usernames

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

/**
 * A Telegram username, or nothing.
 *
 * Telegram's rules: five to thirty-two characters, letters, numbers and
 * underscores, starting with a letter and not ending with an underscore.
 * Unlike Discord's, case is the operator's: Telegram matches usernames without
 * regard to it, so `CandyHeist` and `candyheist` are the same account and
 * either is a fair way to write it.
 */
export function checkTelegram(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.startsWith('@')) {
    return { ok: false, reason: 'Leave off the @. A Telegram username is written without one.' }
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return {
      ok: false,
      reason: 'Telegram usernames hold letters, numbers and underscores only.'
    }
  }
  if (!/^[A-Za-z]/.test(trimmed)) {
    return { ok: false, reason: 'A Telegram username starts with a letter.' }
  }
  if (trimmed.length < 5) {
    return { ok: false, reason: 'A Telegram username is at least five characters.' }
  }
  if (trimmed.length > MAX_TELEGRAM) {
    return { ok: false, reason: `A Telegram username is at most ${MAX_TELEGRAM} characters.` }
  }
  if (trimmed.endsWith('_')) {
    return { ok: false, reason: 'A Telegram username cannot end with an underscore.' }
  }
  return { ok: true }
}

/** The address a Telegram username opens, or empty for one that cannot. */
export function telegramLink(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || !checkTelegram(trimmed).ok) return ''
  return `https://t.me/${trimmed}`
}

// -------------------------------------------------------------- particulars

/** A name or a place, as the website should print it, or nothing. */
export function checkName(value: string, max: number): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length > max) {
    return { ok: false, reason: `That is longer than ${max} characters.` }
  }
  return { ok: true }
}

/**
 * An IANA time zone, `America/Halifax`, or nothing.
 *
 * The zone rather than an offset, because an offset is wrong for half the
 * year anywhere that keeps summer time, and the website should be able to say
 * what time it is where the artist is on the day somebody asks. Checked against
 * the zone database the runtime carries, which is the same one the website's
 * will. Refused rather than corrected when only the case is wrong, by the same
 * rule as a Discord username.
 */
export function checkTimeZone(value: string): NameCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true }

  let resolved: string
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone
  } catch {
    return {
      ok: false,
      reason: 'That is not a time zone. Write it as the zone database does: America/Halifax.'
    }
  }

  if (resolved !== trimmed && resolved.toLowerCase() === trimmed.toLowerCase()) {
    return { ok: false, reason: `Written ${resolved}.` }
  }
  return { ok: true }
}

/** This machine's own zone, for the page to offer as a one-press fill. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// ----------------------------------------------------------------- profiles

/**
 * The kinds of platform, each its own panel on the page.
 *
 * Ordered by how often somebody arriving at the website wants them: to follow
 * and to listen first, the reference pages last.
 */
export const PROFILE_GROUPS = [
  'essentials',
  'listen',
  'follow',
  'live',
  'stores',
  'community',
  'catalogues'
] as const

export type ProfileGroup = (typeof PROFILE_GROUPS)[number]

export const PROFILE_GROUP_SPEC: Record<ProfileGroup, { label: string; purpose: string }> = {
  essentials: {
    label: 'Essentials',
    purpose:
      'The five the website cannot do without. The navbar and the footer draw Instagram, SoundCloud, Spotify and YouTube; Apple Music stands with them wherever the website lists where to listen.'
  },
  listen: {
    label: 'Listen',
    purpose: 'Every other service the records stream on, from the global ones to the regional.'
  },
  follow: {
    label: 'Follow',
    purpose: 'The social platforms, where people keep up between releases.'
  },
  live: {
    label: 'Live, mixes and video',
    purpose: 'Live streams, DJ mixes and tracklists, video, and the listings that carry the shows.'
  },
  stores: {
    label: 'Stores and services',
    purpose: 'Where records, beats and production work are bought and booked.'
  },
  community: {
    label: 'Community and support',
    purpose: 'Where listeners gather, and where they can support the work directly.'
  },
  catalogues: {
    label: 'Catalogues',
    purpose: 'The reference pages: discography databases, credits, lyrics and scrobbles.'
  }
}

interface ProfilePlatformSpec {
  /** As the platform writes its own name. */
  label: string
  group: ProfileGroup
  /**
   * The hosts its addresses live on, matched exactly or as a subdomain. One
   * ending in `.` is a prefix instead, for services on a domain per country
   * (`music.amazon.` takes `.com`, `.co.uk`, `.de` and the rest).
   */
  hosts: readonly string[]
  /** What one of its addresses looks like, as the field's example. */
  example: string
}

/**
 * Every platform the colophon holds a profile on, in the order the page draws
 * them within each group.
 *
 * Ids follow the console's existing tables wherever a platform means the same
 * thing there (`spotify`, `apple`, `soundcloud`, `bandcamp`, `beatport`,
 * `amazon`, `deezer`, `tidal`, `instagram`, `tiktok`, `x`), so a profile here
 * and a release's distribution row can be matched later without a translation
 * table. Two are deliberately split: `youtube` is the channel, which is what
 * the website's footer means, and `youtube-music` is the music service, which
 * is what DISCOGRAPHY's own `youtube` distributes to.
 *
 * Not `DISTRIBUTION_PLATFORMS`, for the reason that table gives for not being
 * `SOCIAL_PLATFORMS`: it is where a *record* goes out, and this is where the
 * *artist* can be found, which is a far longer list.
 */
const PROFILE_PLATFORM_SPEC = {
  // Essentials
  instagram: {
    label: 'Instagram',
    group: 'essentials',
    hosts: ['instagram.com', 'instagr.am'],
    example: 'https://www.instagram.com/…'
  },
  spotify: {
    label: 'Spotify',
    group: 'essentials',
    hosts: ['spotify.com', 'spotify.link'],
    example: 'https://open.spotify.com/artist/…'
  },
  apple: {
    label: 'Apple Music',
    group: 'essentials',
    hosts: ['music.apple.com', 'itunes.apple.com'],
    example: 'https://music.apple.com/…/artist/…'
  },
  soundcloud: {
    label: 'SoundCloud',
    group: 'essentials',
    hosts: ['soundcloud.com', 'snd.sc'],
    example: 'https://soundcloud.com/…'
  },
  youtube: {
    label: 'YouTube',
    group: 'essentials',
    hosts: ['youtube.com', 'youtu.be'],
    example: 'https://www.youtube.com/@…'
  },

  // Listen
  'youtube-music': {
    label: 'YouTube Music',
    group: 'listen',
    hosts: ['music.youtube.com'],
    example: 'https://music.youtube.com/channel/…'
  },
  amazon: {
    label: 'Amazon Music',
    group: 'listen',
    hosts: ['music.amazon.'],
    example: 'https://music.amazon.com/artists/…'
  },
  deezer: {
    label: 'Deezer',
    group: 'listen',
    hosts: ['deezer.com', 'deezer.page.link'],
    example: 'https://www.deezer.com/artist/…'
  },
  tidal: {
    label: 'TIDAL',
    group: 'listen',
    hosts: ['tidal.com'],
    example: 'https://tidal.com/artist/…'
  },
  pandora: {
    label: 'Pandora',
    group: 'listen',
    hosts: ['pandora.com'],
    example: 'https://www.pandora.com/artist/…'
  },
  iheart: {
    label: 'iHeartRadio',
    group: 'listen',
    hosts: ['iheart.com'],
    example: 'https://www.iheart.com/artist/…'
  },
  qobuz: {
    label: 'Qobuz',
    group: 'listen',
    hosts: ['qobuz.com'],
    example: 'https://www.qobuz.com/…/interpreter/…'
  },
  napster: {
    label: 'Napster',
    group: 'listen',
    hosts: ['napster.com'],
    example: 'https://web.napster.com/artist/…'
  },
  audiomack: {
    label: 'Audiomack',
    group: 'listen',
    hosts: ['audiomack.com'],
    example: 'https://audiomack.com/…'
  },
  audius: {
    label: 'Audius',
    group: 'listen',
    hosts: ['audius.co'],
    example: 'https://audius.co/…'
  },
  shazam: {
    label: 'Shazam',
    group: 'listen',
    hosts: ['shazam.com'],
    example: 'https://www.shazam.com/artist/…'
  },
  anghami: {
    label: 'Anghami',
    group: 'listen',
    hosts: ['anghami.com'],
    example: 'https://play.anghami.com/artist/…'
  },
  boomplay: {
    label: 'Boomplay',
    group: 'listen',
    hosts: ['boomplay.com', 'boomplaymusic.com'],
    example: 'https://www.boomplay.com/artists/…'
  },
  jiosaavn: {
    label: 'JioSaavn',
    group: 'listen',
    hosts: ['jiosaavn.com', 'saavn.com'],
    example: 'https://www.jiosaavn.com/artist/…'
  },
  gaana: {
    label: 'Gaana',
    group: 'listen',
    hosts: ['gaana.com'],
    example: 'https://gaana.com/artist/…'
  },
  wynk: {
    label: 'Wynk Music',
    group: 'listen',
    hosts: ['wynk.in'],
    example: 'https://wynk.in/music/artist/…'
  },
  netease: {
    label: 'NetEase Cloud Music',
    group: 'listen',
    hosts: ['music.163.com'],
    example: 'https://music.163.com/#/artist?id=…'
  },
  'qq-music': {
    label: 'QQ Music',
    group: 'listen',
    hosts: ['y.qq.com'],
    example: 'https://y.qq.com/n/ryqq/singer/…'
  },
  kkbox: {
    label: 'KKBOX',
    group: 'listen',
    hosts: ['kkbox.com'],
    example: 'https://www.kkbox.com/…/artist/…'
  },
  melon: {
    label: 'Melon',
    group: 'listen',
    hosts: ['melon.com'],
    example: 'https://www.melon.com/artist/…'
  },
  joox: {
    label: 'JOOX',
    group: 'listen',
    hosts: ['joox.com'],
    example: 'https://www.joox.com/…/artist/…'
  },
  'line-music': {
    label: 'LINE MUSIC',
    group: 'listen',
    hosts: ['music.line.me'],
    example: 'https://music.line.me/webapp/artist/…'
  },
  yandex: {
    label: 'Yandex Music',
    group: 'listen',
    hosts: ['music.yandex.'],
    example: 'https://music.yandex.com/artist/…'
  },

  // Follow
  tiktok: {
    label: 'TikTok',
    group: 'follow',
    hosts: ['tiktok.com'],
    example: 'https://www.tiktok.com/@…'
  },
  x: {
    label: 'X',
    group: 'follow',
    hosts: ['x.com', 'twitter.com'],
    example: 'https://x.com/…'
  },
  facebook: {
    label: 'Facebook',
    group: 'follow',
    hosts: ['facebook.com', 'fb.com', 'fb.me'],
    example: 'https://www.facebook.com/…'
  },
  threads: {
    label: 'Threads',
    group: 'follow',
    hosts: ['threads.net', 'threads.com'],
    example: 'https://www.threads.net/@…'
  },
  bluesky: {
    label: 'Bluesky',
    group: 'follow',
    hosts: ['bsky.app'],
    example: 'https://bsky.app/profile/…'
  },
  snapchat: {
    label: 'Snapchat',
    group: 'follow',
    hosts: ['snapchat.com'],
    example: 'https://www.snapchat.com/add/…'
  },
  reddit: {
    label: 'Reddit',
    group: 'follow',
    hosts: ['reddit.com'],
    example: 'https://www.reddit.com/user/…'
  },
  tumblr: {
    label: 'Tumblr',
    group: 'follow',
    hosts: ['tumblr.com'],
    example: 'https://www.tumblr.com/…'
  },
  pinterest: {
    label: 'Pinterest',
    group: 'follow',
    hosts: ['pinterest.com'],
    example: 'https://www.pinterest.com/…'
  },
  linkedin: {
    label: 'LinkedIn',
    group: 'follow',
    hosts: ['linkedin.com'],
    example: 'https://www.linkedin.com/in/…'
  },
  vk: {
    label: 'VK',
    group: 'follow',
    hosts: ['vk.com'],
    example: 'https://vk.com/…'
  },
  weibo: {
    label: 'Weibo',
    group: 'follow',
    hosts: ['weibo.com'],
    example: 'https://weibo.com/…'
  },
  linktree: {
    label: 'Linktree',
    group: 'follow',
    hosts: ['linktr.ee'],
    example: 'https://linktr.ee/…'
  },

  // Live, mixes and video
  twitch: {
    label: 'Twitch',
    group: 'live',
    hosts: ['twitch.tv'],
    example: 'https://www.twitch.tv/…'
  },
  kick: {
    label: 'Kick',
    group: 'live',
    hosts: ['kick.com'],
    example: 'https://kick.com/…'
  },
  vimeo: {
    label: 'Vimeo',
    group: 'live',
    hosts: ['vimeo.com'],
    example: 'https://vimeo.com/…'
  },
  mixcloud: {
    label: 'Mixcloud',
    group: 'live',
    hosts: ['mixcloud.com'],
    example: 'https://www.mixcloud.com/…'
  },
  hearthis: {
    label: 'hearthis.at',
    group: 'live',
    hosts: ['hearthis.at'],
    example: 'https://hearthis.at/…'
  },
  '1001tracklists': {
    label: '1001Tracklists',
    group: 'live',
    hosts: ['1001tracklists.com'],
    example: 'https://www.1001tracklists.com/dj/…'
  },
  'resident-advisor': {
    label: 'Resident Advisor',
    group: 'live',
    hosts: ['ra.co', 'residentadvisor.net'],
    example: 'https://ra.co/dj/…'
  },
  songkick: {
    label: 'Songkick',
    group: 'live',
    hosts: ['songkick.com'],
    example: 'https://www.songkick.com/artists/…'
  },
  bandsintown: {
    label: 'Bandsintown',
    group: 'live',
    hosts: ['bandsintown.com', 'bnds.us'],
    example: 'https://www.bandsintown.com/a/…'
  },

  // Stores and services
  bandcamp: {
    label: 'Bandcamp',
    group: 'stores',
    hosts: ['bandcamp.com'],
    example: 'https://….bandcamp.com'
  },
  beatport: {
    label: 'Beatport',
    group: 'stores',
    hosts: ['beatport.com'],
    example: 'https://www.beatport.com/artist/…'
  },
  beatsource: {
    label: 'Beatsource',
    group: 'stores',
    hosts: ['beatsource.com'],
    example: 'https://www.beatsource.com/artist/…'
  },
  traxsource: {
    label: 'Traxsource',
    group: 'stores',
    hosts: ['traxsource.com'],
    example: 'https://www.traxsource.com/artist/…'
  },
  juno: {
    label: 'Juno Download',
    group: 'stores',
    hosts: ['junodownload.com'],
    example: 'https://www.junodownload.com/artists/…'
  },
  '7digital': {
    label: '7digital',
    group: 'stores',
    hosts: ['7digital.com'],
    example: 'https://us.7digital.com/artist/…'
  },
  beatstars: {
    label: 'BeatStars',
    group: 'stores',
    hosts: ['beatstars.com', 'bsta.rs'],
    example: 'https://www.beatstars.com/…'
  },
  airbit: {
    label: 'Airbit',
    group: 'stores',
    hosts: ['airbit.com'],
    example: 'https://airbit.com/…'
  },
  soundbetter: {
    label: 'SoundBetter',
    group: 'stores',
    hosts: ['soundbetter.com'],
    example: 'https://soundbetter.com/profiles/…'
  },

  // Community and support
  'discord-server': {
    label: 'Discord server',
    group: 'community',
    hosts: ['discord.gg', 'discord.com'],
    example: 'https://discord.gg/…'
  },
  'telegram-channel': {
    label: 'Telegram channel',
    group: 'community',
    hosts: ['t.me', 'telegram.me'],
    example: 'https://t.me/…'
  },
  'whatsapp-channel': {
    label: 'WhatsApp channel',
    group: 'community',
    hosts: ['whatsapp.com'],
    example: 'https://whatsapp.com/channel/…'
  },
  patreon: {
    label: 'Patreon',
    group: 'community',
    hosts: ['patreon.com'],
    example: 'https://www.patreon.com/…'
  },
  kofi: {
    label: 'Ko-fi',
    group: 'community',
    hosts: ['ko-fi.com'],
    example: 'https://ko-fi.com/…'
  },
  buymeacoffee: {
    label: 'Buy Me a Coffee',
    group: 'community',
    hosts: ['buymeacoffee.com'],
    example: 'https://www.buymeacoffee.com/…'
  },

  // Catalogues
  discogs: {
    label: 'Discogs',
    group: 'catalogues',
    hosts: ['discogs.com'],
    example: 'https://www.discogs.com/artist/…'
  },
  musicbrainz: {
    label: 'MusicBrainz',
    group: 'catalogues',
    hosts: ['musicbrainz.org'],
    example: 'https://musicbrainz.org/artist/…'
  },
  genius: {
    label: 'Genius',
    group: 'catalogues',
    hosts: ['genius.com'],
    example: 'https://genius.com/artists/…'
  },
  musixmatch: {
    label: 'Musixmatch',
    group: 'catalogues',
    hosts: ['musixmatch.com'],
    example: 'https://www.musixmatch.com/artist/…'
  },
  lastfm: {
    label: 'Last.fm',
    group: 'catalogues',
    hosts: ['last.fm'],
    example: 'https://www.last.fm/music/…'
  },
  allmusic: {
    label: 'AllMusic',
    group: 'catalogues',
    hosts: ['allmusic.com'],
    example: 'https://www.allmusic.com/artist/…'
  },
  wikipedia: {
    label: 'Wikipedia',
    group: 'catalogues',
    hosts: ['wikipedia.org'],
    example: 'https://en.wikipedia.org/wiki/…'
  }
} as const satisfies Record<string, ProfilePlatformSpec>

export type ProfilePlatform = keyof typeof PROFILE_PLATFORM_SPEC

/** Every platform, in table order. */
export const PROFILE_PLATFORMS = Object.keys(PROFILE_PLATFORM_SPEC) as ProfilePlatform[]

/** As each platform writes its own name. */
export const PROFILE_PLATFORM_LABEL = Object.fromEntries(
  PROFILE_PLATFORMS.map((platform) => [platform, PROFILE_PLATFORM_SPEC[platform].label])
) as Record<ProfilePlatform, string>

/** The four the website's navbar and footer draw, each behind its own mark. */
export const NAVBAR_PROFILE_PLATFORMS = [
  'instagram',
  'soundcloud',
  'spotify',
  'youtube'
] as const satisfies readonly ProfilePlatform[]

/** What one of a platform's addresses looks like. */
export function profileExample(platform: ProfilePlatform): string {
  return PROFILE_PLATFORM_SPEC[platform].example
}

/** A group's platforms, in table order. */
export function platformsIn(group: ProfileGroup): ProfilePlatform[] {
  return PROFILE_PLATFORMS.filter((platform) => PROFILE_PLATFORM_SPEC[platform].group === group)
}

/** True for a key the colophon knows as a platform. */
export function isProfilePlatform(value: string): value is ProfilePlatform {
  return Object.hasOwn(PROFILE_PLATFORM_SPEC, value)
}

/** True for a platform the website's navbar and footer draw. */
export function isNavbarProfile(platform: ProfilePlatform): boolean {
  return (NAVBAR_PROFILE_PLATFORMS as readonly ProfilePlatform[]).includes(platform)
}

/**
 * Platforms whose hosts sit inside another's, tried before it:
 * `music.youtube.com` is inside YouTube's domain and belongs to YouTube Music.
 */
const SPECIFIC_FIRST: readonly ProfilePlatform[] = ['youtube-music']

/** The order addresses are recognised in. */
const RECOGNITION_ORDER: readonly ProfilePlatform[] = [
  ...SPECIFIC_FIRST,
  ...PROFILE_PLATFORMS.filter((platform) => !SPECIFIC_FIRST.includes(platform))
]

function hostMatches(host: string, known: string): boolean {
  if (known.endsWith('.')) return host.startsWith(known)
  return host === known || host.endsWith(`.${known}`)
}

/** Which platform an address is on, or null for one the colophon does not know. */
export function profilePlatformOf(url: string): ProfilePlatform | null {
  let host: string
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }

  for (const platform of RECOGNITION_ORDER) {
    const hosts: readonly string[] = PROFILE_PLATFORM_SPEC[platform].hosts
    if (hosts.some((known) => hostMatches(host, known))) return platform
  }
  return null
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

/** The profiles, keyed by platform: every platform present, empty when unset. */
export type ColophonProfiles = Record<ProfilePlatform, string>

export function emptyProfiles(): ColophonProfiles {
  return Object.fromEntries(PROFILE_PLATFORMS.map((platform) => [platform, ''])) as ColophonProfiles
}

/**
 * A stored map, as the page should see it: every platform present, every key
 * this console does not know dropped.
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

/**
 * The profiles, from the free list of links the first COLOPHON kept.
 *
 * COLOPHON opened with a list of links and moved to a profile per platform the
 * same day (2026-10-01), once the website's own platforms were set beside it.
 * A record filed in between is read through this, so nothing typed into it is
 * lost that has somewhere to go: each link is placed by the platform its
 * address is actually on, the first of each winning, and an address on no
 * platform the colophon knows is left behind. Pure, like
 * `distributionFromLinks`, so it reads without a database.
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

// --------------------------------------------------------------- visibility

/**
 * Whether a field goes out with the website.
 *
 * `public` is published with the website when publishing is built; `private`
 * is kept in the archive on this machine and goes nowhere else. It is the
 * operator's choice per field, not per kind, because the same kind of detail
 * can be either: a press address is meant to be found, and a second phone line
 * may be for people who already have it.
 */
export const VISIBILITIES = ['public', 'private'] as const

export type Visibility = (typeof VISIBILITIES)[number]

/**
 * Every field that carries a visibility: the details, then the platforms.
 *
 * One flat set of keys, which works because the two never share a name. The
 * platforms that sound like details are named for what they are
 * (`discord-server`, `telegram-channel`, `whatsapp-channel`) and so stay clear
 * of `discord`, `telegram` and `whatsapp`.
 */
export type ColophonField = ColophonDetail | ProfilePlatform

export const COLOPHON_FIELDS: readonly ColophonField[] = [...COLOPHON_DETAILS, ...PROFILE_PLATFORMS]

/**
 * The fields the website cannot be built without, which are public whatever
 * is chosen.
 *
 * Exactly what the website's own code reads today: its contact details
 * (`siteContact`: the email, the phone number and the Discord username, each a
 * required field there) and the four marks in its navbar and footer
 * (`socialLinks`). A private one would leave the website with a hole where a
 * detail it promises should be. When the website reads more, this grows with
 * it.
 */
export const ALWAYS_PUBLIC = [
  'email',
  'phone',
  'discord',
  ...NAVBAR_PROFILE_PLATFORMS
] as const satisfies readonly ColophonField[]

/** Each field's visibility, every field present. */
export type ColophonVisibility = Record<ColophonField, Visibility>

/** True for a key the colophon knows as a field. */
export function isColophonField(value: string): value is ColophonField {
  return (COLOPHON_FIELDS as readonly string[]).includes(value)
}

/** True for a field that is public whatever is chosen. */
export function isAlwaysPublic(field: ColophonField): boolean {
  return (ALWAYS_PUBLIC as readonly ColophonField[]).includes(field)
}

/** As a field is named, for a refusal or a control's label. */
export function fieldLabel(field: ColophonField): string {
  return isProfilePlatform(field) ? PROFILE_PLATFORM_LABEL[field] : COLOPHON_DETAIL_LABEL[field]
}

/**
 * A field's visibility before anybody has chosen one.
 *
 * Profiles start public and details start private, and the asymmetry is the
 * point. A profile is a page the platform already shows the world, so
 * publishing its address tells nobody anything new. A detail is a way to reach
 * a person, a line or a place, and putting one on the website should be a
 * choice somebody made rather than something that happened because a field
 * was filled in.
 */
export function defaultVisibility(field: ColophonField): Visibility {
  if (isAlwaysPublic(field)) return 'public'
  return isProfilePlatform(field) ? 'public' : 'private'
}

export function defaultVisibilities(): ColophonVisibility {
  return Object.fromEntries(
    COLOPHON_FIELDS.map((field) => [field, defaultVisibility(field)])
  ) as ColophonVisibility
}

/**
 * A stored map, as the page should see it: every field present, unknown keys
 * and values dropped, and the fields that must be public made public.
 *
 * A record filed before visibility existed reads with every field at its
 * default, which keeps every detail private until somebody says otherwise.
 */
export function readVisibility(raw: Readonly<Record<string, unknown>>): ColophonVisibility {
  const visibility = defaultVisibilities()
  for (const field of COLOPHON_FIELDS) {
    if (isAlwaysPublic(field)) continue
    const value = raw[field]
    if (value === 'public' || value === 'private') visibility[field] = value
  }
  return visibility
}

/**
 * Whether a field may be given a visibility.
 *
 * Only one refusal: an always-public field made private. Said with the reason,
 * because the control for it is not even drawn and a refusal from somewhere
 * else should explain itself.
 */
export function checkVisibility(field: ColophonField, visibility: Visibility): NameCheck {
  if (visibility === 'private' && isAlwaysPublic(field)) {
    return {
      ok: false,
      reason: `${fieldLabel(field)} is always public. The website cannot be built without it.`
    }
  }
  return { ok: true }
}
