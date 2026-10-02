import { z } from 'zod'
import type { DiscographyRelease } from './discography'
import {
  DISTRIBUTION_PLATFORM_LABEL,
  RELEASE_STATUSES,
  hasArrived,
  type DistributionPlatform,
  type ReleaseStatus
} from './discography.constants'
import { ARTIST_ROLE_CREDIT } from './artists.constants'
import {
  RELEASE_CHOICES,
  RELEASES_LINK_STATES,
  SEND_STATES,
  SHELF_SIZE,
  SITE_KINDS,
  SITE_LIMITS,
  STAGE_ACTIONS,
  type ReleaseChoice,
  type SiteKind,
  type SitePlatform
} from './releases.constants'

/**
 * Schema half of RELEASES, and the one place a DISCOGRAPHY release is turned
 * into what the website shows.
 *
 * The website keeps the public part of each release (lib/releases/model.ts
 * there): its title, who it's by, its date, label, credits, tracks and the
 * platforms it's on. Notes, masters, projects, codes beyond the UPC and the
 * ISRCs, and the real names on the roster never leave this machine. The UPC
 * and the ISRCs go only so the website can recognise a release the other
 * copy of the console sent, and link an album's track to its single; it
 * never shows them.
 */

// ------------------------------------------------------------ the website

const text = z.string().default('')

/** A release as the website has it, as every call hands it back. */
export const SiteReleaseSchema = z.object({
  id: z.string(),
  slug: text,
  title: text,
  kind: z.enum(SITE_KINDS).catch('single'),
  status: z.enum(RELEASE_STATUSES).catch('released'),
  date: z.string().nullable().default(null),
  upc: text,
  spotifyId: text,
  titleKey: text,
  /** False when hidden by hand; otherwise its status and date decide. */
  shown: z.boolean().nullable().default(null),
  /** Whether visitors see it now. */
  visible: z.boolean().default(false),
  /** Its cover on the website, or null while it shows the placeholder. */
  cover: z.string().nullable().default(null),
  updatedAt: text,
  /** Who sent it last: `mist`, `candy`, or an id this build doesn't know. */
  updatedBy: text
})
export type SiteRelease = z.infer<typeof SiteReleaseSchema>

/** What the website has: whether it shows these releases yet, and the shelf. */
export const ReleasesSiteSchema = z.object({
  live: z.boolean().default(false),
  releases: z.array(SiteReleaseSchema).default([]),
  /** The home page shelf, in order: website ids. */
  shelf: z.array(z.string()).default([])
})
export type ReleasesSite = z.infer<typeof ReleasesSiteSchema>

/** A release's fields as the website takes them. */
export interface SiteTrack {
  title: string
  duration?: string
  artist?: string
  isrc?: string
}

export interface SiteCredit {
  role: string
  names: string[]
}

export interface SiteDistribution {
  platform: SitePlatform
  streamUrl?: string
  presaveUrl?: string
}

export interface SiteFields {
  title: string
  subtitle: string
  kind: SiteKind
  status: ReleaseStatus
  artist: string
  date: string | null
  label: string
  credits: SiteCredit[]
  tracks: SiteTrack[]
  distribution: SiteDistribution[]
  upc: string
}

// --------------------------------------------------------------- here

export const ReleasesLinkSchema = z.object({
  state: z.enum(RELEASES_LINK_STATES).default('signed-out'),
  message: z.string().default(''),
  /** The website, as an origin. */
  website: z.string().default(''),
  /** When the website's releases were last fetched, or null before the first time. */
  syncedAt: z.number().nullable().default(null)
})
export type ReleasesLink = z.infer<typeof ReleasesLinkSchema>

/** A release here, and where it stands against the website. */
export const ReleaseEntrySchema = z.object({
  /** Its id in DISCOGRAPHY. */
  id: z.string(),
  title: text,
  kind: z.enum(SITE_KINDS).catch('single'),
  status: z.enum(RELEASE_STATUSES).catch('draft'),
  date: z.string().nullable().default(null),
  artworkPath: z.string().nullable().default(null),
  trackCount: z.number().int().min(0).default(0),
  /** Its id on the website, once sent. */
  siteId: z.string().nullable().default(null),
  /** Its page's address on the website, once sent. */
  slug: z.string().nullable().default(null),
  shown: z.boolean().nullable().default(null),
  /** Whether visitors see it, as the website last said; null before it's sent. */
  visible: z.boolean().nullable().default(null),
  /** Its place on the home page shelf, from 0; null when it isn't on it. */
  shelf: z.number().int().nullable().default(null),
  send: z.enum(SEND_STATES).default('unsent'),
  /** Why the website can't show it, when it can't. */
  problem: z.string().nullable().default(null),
  /** Platforms it's on that the website has no button for. */
  omitted: z.array(z.string()).default([]),
  updatedBy: text
})
export type ReleaseEntry = z.infer<typeof ReleaseEntrySchema>

/**
 * What's been picked on the page and not sent yet. Update sends it all in
 * one request; Discard drops it.
 */
export const StagedSchema = z.object({
  /** Show or Hide, by release: its DISCOGRAPHY id here, its website id for the other computer's. */
  visibility: z.record(z.string(), z.enum(RELEASE_CHOICES)).default({}),
  /** The home page shelf as it'll be, website ids in order; null when unchanged. */
  shelf: z.array(z.string()).max(SHELF_SIZE).nullable().default(null),
  /** Releases here to send: new, or changed since they were last sent. */
  send: z.array(z.string()).default([])
})
export type Staged = z.infer<typeof StagedSchema>

/** How many changes Update will send. */
export const stagedCount = (staged: Staged): number =>
  Object.keys(staged.visibility).length + staged.send.length + (staged.shelf ? 1 : 0)

export const ReleasesStateSchema = z.object({
  link: ReleasesLinkSchema.prefault({}),
  /** What the website has, as last fetched; null before the first fetch. */
  site: ReleasesSiteSchema.nullable().default(null),
  /** Every release in DISCOGRAPHY, newest first. */
  entries: z.array(ReleaseEntrySchema).default([]),
  /** Releases on the website that weren't sent from here: the other computer's. */
  remote: z.array(SiteReleaseSchema).default([]),
  /** Sends and removals waiting for the website. */
  pending: z.number().int().min(0).default(0),
  staged: StagedSchema.prefault({}),
  /** What's being done for the website right now, for the page to say. */
  working: z.object({ label: z.string(), detail: z.string() }).nullable().default(null),
  /** Covers going to the website in the background, one at a time. */
  covers: z
    .object({
      done: z.number().int().min(0),
      total: z.number().int().min(0),
      current: z.string()
    })
    .nullable()
    .default(null),
  revision: z.number().int().min(0).default(0)
})
export type ReleasesState = z.infer<typeof ReleasesStateSchema>

// ---------------------------------------------------------------- inputs

export const ReleaseIdInputSchema = z.object({ id: z.string() })

export const StageInputSchema = z.object({
  action: z.enum(STAGE_ACTIONS),
  /** DISCOGRAPHY ids for releases here, website ids for the other computer's. */
  ids: z.array(z.string()).min(1)
})
export type StageInput = z.infer<typeof StageInputSchema>

/** What picking did: the page as it is now, and the releases it couldn't apply to, each with why. */
export const StageResultSchema = z.object({
  state: ReleasesStateSchema,
  skipped: z.array(z.object({ title: z.string(), why: z.string() })).default([])
})
export type StageResult = z.infer<typeof StageResultSchema>

export const ShelfInputSchema = z.object({
  siteIds: z.array(z.string()).max(SHELF_SIZE)
})
export type ShelfInput = z.infer<typeof ShelfInputSchema>

// ------------------------------------------------------------ visibility

/** The part of a release that says whether visitors see it. */
export interface Visibility {
  status: ReleaseStatus
  date: string | null
  shown: boolean | null
}

/** Out: RELEASED, or its day has come. */
export const isOutOn = (release: Visibility, today: string): boolean =>
  release.status === 'released' || hasArrived(release.date, today)

/**
 * Whether visitors see a release, as the website decides it: hidden by
 * hand, never; out, yes; before its day, only when SCHEDULED for a day.
 */
export function visibleOn(release: Visibility, today: string): boolean {
  if (release.shown === false) return false
  if (isOutOn(release, today)) return true
  return release.status === 'scheduled' && release.date !== null
}

/**
 * What Show or Hide comes to for one release. One here that isn't out yet
 * becomes SCHEDULED or a DRAFT in DISCOGRAPHY; everything else is shown or
 * hidden on the website. Null when it can't be done, with `whyNot` saying why.
 */
export function afterChoice(
  release: Visibility,
  choice: ReleaseChoice,
  own: boolean,
  today: string
): Visibility | null {
  if (whyNot(release, choice, own, today)) return null
  if (own && !isOutOn(release, today)) {
    return { ...release, status: choice === 'show' ? 'scheduled' : 'draft', shown: null }
  }
  return { ...release, shown: choice === 'hide' ? false : null }
}

/** Why Show or Hide can't be done to a release, or null when it can. */
export function whyNot(
  release: Visibility,
  choice: ReleaseChoice,
  own: boolean,
  today: string
): string | null {
  if (choice === 'hide' || isOutOn(release, today)) return null
  if (own && release.date === null) return 'It needs a release date before it can be scheduled.'
  if (!own && release.status === 'draft') {
    return 'A draft from the other computer: only that computer can schedule it.'
  }
  return null
}

// ---------------------------------------------------------------- mapping

const sentence = (label: string): string =>
  label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : label

const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/

function duration(ms: number): string | undefined {
  if (ms <= 0) return undefined
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** An address the website will take: http or https, and not too long. */
function link(raw: string): string | undefined {
  const value = raw.trim()
  if (!value || value.length > SITE_LIMITS.url) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined
  } catch {
    return undefined
  }
}

/** The website's button for one of DISCOGRAPHY's platforms, if it has one. */
function sitePlatform(platform: DistributionPlatform, url: string): SitePlatform | null {
  switch (platform) {
    case 'spotify':
    case 'soundcloud':
    case 'deezer':
    case 'tidal':
      return platform
    case 'apple':
      return 'apple-music'
    case 'youtube':
      return url.includes('music.youtube.com') ? 'youtube-music' : 'youtube'
    default:
      return null
  }
}

/** What turning a release into the website's fields comes to. */
export type SiteMapping =
  | { ok: true; fields: SiteFields; omitted: string[] }
  | { ok: false; problem: string; omitted: string[] }

/**
 * A DISCOGRAPHY release as the website takes it.
 *
 * `names` is the roster by id; `fallbackArtist` bills a release nobody is
 * credited on (the operator's own name). Platforms the website has no
 * button for come back in `omitted`, so the page can say they're left off.
 */
export function siteFieldsOf(
  release: DiscographyRelease,
  names: ReadonlyMap<string, string>,
  fallbackArtist: string
): SiteMapping {
  const named = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => {
      const name = names.get(id)?.trim()
      return name ? [name] : []
    })

  const billed = named(release.artistIds)
  const featuring = named(release.featuredArtistIds)
  const artist = [
    (billed.length ? billed : [fallbackArtist]).join(', '),
    featuring.length ? `feat. ${featuring.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const credits = release.credits.flatMap((credit) => {
    const people = named(credit.artistIds).slice(0, SITE_LIMITS.names)
    if (!people.length) return []
    const note = credit.note.trim()
    const role =
      credit.role === 'other'
        ? note || 'Credited'
        : note
          ? `${sentence(note)} by`
          : sentence(ARTIST_ROLE_CREDIT[credit.role])
    return [{ role: role.slice(0, SITE_LIMITS.role), names: people }]
  })

  const billedSet = new Set(release.artistIds)
  const tracks = [...release.tracks]
    .sort((a, b) => a.position - b.position)
    .map((track): SiteTrack => {
      const out: SiteTrack = { title: track.title.trim() }
      const time = duration(track.durationMs)
      if (time) out.duration = time
      // A track credited to somebody other than the release (a
      // compilation's) says so; one credited as the release is doesn't.
      const own = track.artistIds.filter((id) => !billedSet.has(id))
      if (own.length) {
        const by = named(track.artistIds)
        if (by.length) out.artist = by.join(', ')
      }
      const isrc = track.isrc.replace(/[\s-]/g, '').toUpperCase()
      if (ISRC.test(isrc)) out.isrc = isrc
      return out
    })

  const omitted: string[] = []
  const distribution = release.distribution.flatMap((d): SiteDistribution[] => {
    const streamUrl = link(d.streamUrl)
    const presaveUrl = link(d.presaveUrl)
    if (!streamUrl && !presaveUrl) return []
    const platform = sitePlatform(d.platform, streamUrl ?? presaveUrl ?? '')
    if (!platform) {
      const label = d.label.trim() || DISTRIBUTION_PLATFORM_LABEL[d.platform]
      if (!omitted.includes(label)) omitted.push(label)
      return []
    }
    return [
      { platform, ...(streamUrl ? { streamUrl } : {}), ...(presaveUrl ? { presaveUrl } : {}) }
    ]
  })

  const upc = release.upc.replace(/\s/g, '')
  const fields: SiteFields = {
    title: release.title.trim(),
    subtitle: release.subtitle.trim(),
    kind: release.kind,
    status: release.status,
    artist,
    date: release.releaseDate,
    label: release.label.trim(),
    credits: credits.slice(0, SITE_LIMITS.credits),
    tracks,
    distribution: distribution.slice(0, SITE_LIMITS.distribution),
    upc: /^\d{8,14}$/.test(upc) ? upc : ''
  }

  const problem = problemOf(fields)
  return problem ? { ok: false, problem, omitted } : { ok: true, fields, omitted }
}

/** Why the website can't show these fields, in words the page can show. */
function problemOf(fields: SiteFields): string | null {
  if (!fields.title) return 'It needs a title.'
  if (fields.title.length > SITE_LIMITS.title)
    return `Its title is longer than the website takes (${SITE_LIMITS.title} characters).`
  if (fields.subtitle.length > SITE_LIMITS.subtitle)
    return `Its subtitle is longer than the website takes (${SITE_LIMITS.subtitle} characters).`
  if (fields.artist.length > SITE_LIMITS.artist)
    return 'Its artist line is too long for the website.'
  if (fields.label.length > SITE_LIMITS.label) return 'Its label is too long for the website.'
  if (!fields.tracks.length) return 'It needs a track: the website shows a release by its tracks.'
  if (fields.tracks.length > SITE_LIMITS.tracks)
    return `It has more tracks than the website takes (${SITE_LIMITS.tracks}).`
  if ((fields.kind === 'single' || fields.kind === 'remix') && fields.tracks.length !== 1)
    return `A ${fields.kind} holds exactly one track.`
  if (fields.tracks.some((track) => track.title.length > SITE_LIMITS.title))
    return 'A track title is longer than the website takes.'
  return null
}

/** The fields that differ between what was sent and what's here now. */
export function changedFields(sent: SiteFields, now: SiteFields): Partial<SiteFields> {
  const changed: Partial<SiteFields> = {}
  for (const key of Object.keys(now) as (keyof SiteFields)[]) {
    if (JSON.stringify(sent[key]) !== JSON.stringify(now[key])) {
      ;(changed as Record<string, unknown>)[key] = now[key]
    }
  }
  return changed
}
