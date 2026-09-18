/**
 * Zod-free half of the artists domain — see projects.constants.ts for why the
 * split exists. The renderer needs the role table, the platform table and the
 * name rules as *values*; it never needs the validators, which run once at the
 * IPC boundary in the main process.
 *
 * ## What an artist record is, and what it is not
 *
 * It is who made something. It is **not** where the work is filed: the ARCHIVE
 * tree has an `artist` folder kind, and the two are deliberately unrelated.
 * A folder is one place on one disk; a track can credit four people, and
 * dragging it to another shelf must not rewrite who made it.
 *
 * That distinction was put to the operator directly and is decision D3 in
 * docs/DISCOGRAPHY.md. Do not reconcile the two.
 */

// --------------------------------------------------------------------- roles

/**
 * What somebody did, not what they are.
 *
 * A closed set, because these end up on credits and a free-text role produces
 * `Vocals`, `vocalist`, `Vocal` and `VOX` inside a month. `other` carries the
 * long tail without opening the gate.
 */
export const ARTIST_ROLES = [
  'producer',
  'vocalist',
  'instrumentalist',
  'writer',
  'dj',
  'engineer',
  'visual',
  'other'
] as const

export type ArtistRole = (typeof ARTIST_ROLES)[number]

export const ARTIST_ROLE_LABEL: Record<ArtistRole, string> = {
  producer: 'PRODUCER',
  vocalist: 'VOCALIST',
  instrumentalist: 'INSTRUMENTALIST',
  writer: 'WRITER',
  dj: 'DJ',
  engineer: 'ENGINEER',
  visual: 'VISUAL',
  other: 'OTHER'
}

/**
 * The same roles in the voice a credit is written in.
 *
 * `ARTIST_ROLE_LABEL` names what somebody *is*, which is right on a roster
 * card. A release credit says what somebody *did* — a sleeve reads `PRODUCED
 * BY`, never `PRODUCER` — so the two tables are the same set said two ways
 * rather than two sets to keep in step.
 *
 * Reusing `ARTIST_ROLES` rather than opening a second vocabulary is the point.
 * A free-text credit line produces `Vocals`, `vocalist`, `Vocal` and `VOX`
 * inside a month, which is exactly why that set is closed; `other` plus the
 * row's own note carries anything genuinely unlisted.
 */
export const ARTIST_ROLE_CREDIT: Record<ArtistRole, string> = {
  producer: 'PRODUCED BY',
  vocalist: 'VOCALS BY',
  instrumentalist: 'PERFORMED BY',
  writer: 'WRITTEN BY',
  dj: 'MIXED BY',
  engineer: 'ENGINEERED BY',
  visual: 'ARTWORK BY',
  other: 'CREDITED'
}

// ----------------------------------------------------------------- platforms

/**
 * Where somebody can be found.
 *
 * Ordered as they are drawn. The set is closed for the same reason the roles
 * are, with `other` taking anything unlisted alongside a label the operator
 * types — which is what keeps a Linktree or a personal site from needing a new
 * release of the application.
 */
export const SOCIAL_PLATFORMS = [
  'spotify',
  'soundcloud',
  'bandcamp',
  'apple',
  'beatport',
  'youtube',
  'instagram',
  'tiktok',
  'x',
  'website',
  'other'
] as const

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  spotify: 'SPOTIFY',
  soundcloud: 'SOUNDCLOUD',
  bandcamp: 'BANDCAMP',
  apple: 'APPLE MUSIC',
  beatport: 'BEATPORT',
  youtube: 'YOUTUBE',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  x: 'X',
  website: 'WEBSITE',
  other: 'OTHER'
}

// -------------------------------------------------------------------- limits

export const MAX_ARTIST_NAME = 64
export const MAX_ARTIST_REAL_NAME = 96
export const MAX_LINK_URL = 512
export const MAX_LINK_LABEL = 32
export const MAX_ARTIST_LINKS = 12

/** Pictures are copied into the archive, so this bounds what is copied. */
export const MAX_PICTURE_BYTES = 12 * 1024 * 1024

export const PICTURE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] as const

// --------------------------------------------------------------------- names

/**
 * The comparison key for "is this artist already on the roster".
 *
 * Case-folded and whitespace-collapsed, exactly as `tags.constants.ts` does it
 * — and uniquely indexed for the same reason. Two artists called `Nasko` and
 * `nasko` are one artist typed twice, and finding that out after crediting
 * eleven tracks to each is not recoverable by hand.
 */
export function artistNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface NameCheck {
  ok: boolean
  reason?: string
}

export function checkArtistName(name: string): NameCheck {
  const trimmed = name.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'An artist needs a name.' }
  if (trimmed.length > MAX_ARTIST_NAME) {
    return { ok: false, reason: `A name is at most ${MAX_ARTIST_NAME} characters.` }
  }
  return { ok: true }
}

/**
 * A URL this application is willing to hand to the operating system.
 *
 * The same allowlist `shell:open-external` enforces in the main process,
 * applied here so the field can refuse as it is typed rather than the button
 * failing later. The main process still checks — this is a courtesy, not the
 * guard.
 */
export function checkLinkUrl(url: string): NameCheck {
  const trimmed = url.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'A link needs an address.' }
  if (trimmed.length > MAX_LINK_URL) return { ok: false, reason: 'That address is too long.' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'That is not a valid address. Include https://' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https addresses can be opened.' }
  }

  return { ok: true }
}

/**
 * The platform an address most likely belongs to.
 *
 * A convenience when pasting, not a classification: the operator can always
 * override it, and `other` is the honest answer for anything unrecognised
 * rather than a guess at the nearest match.
 */
export function guessPlatform(url: string): SocialPlatform {
  const value = url.toLowerCase()
  if (value.includes('spotify.')) return 'spotify'
  if (value.includes('soundcloud.')) return 'soundcloud'
  if (value.includes('bandcamp.')) return 'bandcamp'
  if (value.includes('music.apple.') || value.includes('itunes.')) return 'apple'
  if (value.includes('beatport.')) return 'beatport'
  if (value.includes('youtube.') || value.includes('youtu.be')) return 'youtube'
  if (value.includes('instagram.')) return 'instagram'
  if (value.includes('tiktok.')) return 'tiktok'
  if (value.includes('twitter.') || value.includes('//x.com')) return 'x'
  return 'other'
}
