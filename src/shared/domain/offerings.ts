import { z } from 'zod'
import { ManagedImageSchema } from './artists'
import {
  DEFAULT_TIME_ZONE,
  OFFERING_ICONS,
  OFFERING_KINDS,
  OFFERING_LIMITS,
  OFFERINGS_LINK_STATES,
  SLUG_PATTERN,
  WEEKDAYS,
  type OfferingStatus
} from './offerings.constants'

/**
 * Schema half of SERVICES' OFFERINGS and HOURS.
 *
 * Two halves, kept in two places, as LORE's are. The services and the hours
 * as written are this console's, in its archive, and the other copy of the
 * console never sees them. What the website offers is the website's, and
 * this console holds what it last fetched. A publish sends the whole list,
 * in order, with the hours, and only then does the website show it.
 *
 * Records from the website default what they can: the website may gain a
 * field before this build knows what it is.
 */

const text = z.string().default('')

const FactSchema = z.object({ label: text, value: text })
export type OfferingFact = z.infer<typeof FactSchema>

const day = z.array(z.string()).default([])
const WeeklySchema = z.object({
  mon: day,
  tue: day,
  wed: day,
  thu: day,
  fri: day,
  sat: day,
  sun: day
})

/** When sessions can be booked: start times per weekday in Candy's zone, and the rules around them. */
export const OfferingHoursSchema = z.object({
  /** Where the times are read: Candy's zone, an IANA name. */
  timeZone: z.string().default(DEFAULT_TIME_ZONE),
  /** The start times offered each weekday, `HH:MM`, soonest first. */
  weekly: WeeklySchema.prefault({}),
  /** Days off, `YYYY-MM-DD` in Candy's zone. */
  closed: z.array(z.string()).default([]),
  /** How far ahead a session has to be booked. */
  noticeHours: z.number().min(0).default(24),
  /** How far ahead it can be booked: to the end of the month this many months on. */
  horizonMonths: z.number().int().min(1).max(12).default(3),
  /** Free time after a session before the next can start. */
  bufferMinutes: z.number().int().min(0).default(0)
})
export type OfferingHours = z.infer<typeof OfferingHoursSchema>

// --------------------------------------------------------------- the website

/** A service as the website offers it: its write-up still markdown. */
export const SiteServiceSchema = z.object({
  id: z.string(),
  kind: z.enum(OFFERING_KINDS).catch('commission'),
  name: text,
  icon: z.enum(OFFERING_ICONS).catch('production'),
  summary: text,
  facts: z.array(FactSchema).catch([]),
  photos: z.object({ card: text, wide: text, alt: text }).catch({ card: '', wide: '', alt: '' }),
  body: text,
  /** The full price in dollars; missing while it isn't set. */
  price: z.number().optional().catch(undefined),
  durationMinutes: z.number().optional().catch(undefined)
})
export type SiteService = z.infer<typeof SiteServiceSchema>

/** What the website offers: whether it shows this console's list yet, and what's there. */
export const ServicesSiteSchema = z.object({
  live: z.boolean().default(false),
  /** Goes up on every publish; a publish that started from an older one is refused. */
  revision: z.number().int().min(0).default(0),
  publishedAt: z.string().nullable().default(null),
  /** Who published last: a Firebase account id. */
  publishedBy: z.string().nullable().default(null),
  items: z.array(SiteServiceSchema).default([]),
  hours: OfferingHoursSchema.prefault({})
})
export type ServicesSite = z.infer<typeof ServicesSiteSchema>

// -------------------------------------------------------------- this machine

/** A photo picked here, once a website has it: which copy went, and where it keeps it. */
const SentPhotoSchema = z.object({
  website: z.string(),
  /** The copy that went, so a new pick goes again. */
  signature: z.string(),
  card: z.string(),
  wide: z.string()
})

/**
 * The photo a service shows. Either the website's own (a service brought
 * in from the website keeps the photos it had), or one picked here, which
 * goes to each website once and is then used from there. Either way a copy
 * is kept here to show, since the console can't load the website's.
 */
export const OfferingPhotoSchema = z.object({
  source: z.enum(['none', 'site', 'file']).default('none'),
  /** For `site`: the website's addresses for it. */
  site: z.object({ card: z.string(), wide: z.string() }).nullable().default(null),
  /**
   * For `site`: the website those addresses belong to. Empty for the
   * website's own files (`/img/...`), which every copy of it has.
   */
  siteWebsite: text,
  /** The picture here: the one picked, or a copy of the website's to show. */
  file: ManagedImageSchema.nullable().default(null),
  /** For `file`: where each website keeps it, once sent. */
  sent: z.array(SentPhotoSchema).default([]),
  /** What it shows, for people who can't see it. */
  alt: text
})
export type OfferingPhoto = z.infer<typeof OfferingPhotoSchema>

/** A service as written here. */
export const OfferingSchema = z.object({
  /** This console's id for it. */
  id: z.string(),
  /** Its address on the website (`?service=`): made from its name, kept once published. */
  slug: text,
  kind: z.enum(OFFERING_KINDS).default('commission'),
  name: text,
  icon: z.enum(OFFERING_ICONS).default('production'),
  /** One line, under the name on its card. */
  summary: text,
  /** The full price in dollars; null while it isn't set, and then it can't be booked online. */
  price: z.number().nullable().default(null),
  /** A session's length, in minutes. */
  durationMinutes: z.number().int().nullable().default(null),
  /** Shown as label and value: "Length · 90 min". */
  facts: z.array(FactSchema).default([]),
  /** The write-up, in the website's markdown. */
  body: text,
  photo: OfferingPhotoSchema.prefault({}),
  /** On the website, or kept here only. */
  shown: z.boolean().default(true),
  createdAt: text,
  updatedAt: text
})
export type Offering = z.infer<typeof OfferingSchema>

/** What this PC last published to one website. */
export const OfferingsBaseSchema = z.object({
  /** The website's revision it answered with, or took from. */
  revision: z.number().int().min(0).default(0),
  /** What each service was when it went, by this console's id. */
  sent: z.record(z.string(), z.string()).default({}),
  /** What the hours were when they went. */
  hours: text,
  /** The services' order when it went. */
  order: z.array(z.string()).default([]),
  at: z.number().nullable().default(null)
})
export type OfferingsBase = z.infer<typeof OfferingsBaseSchema>

export const OfferingsLinkSchema = z.object({
  state: z.enum(OFFERINGS_LINK_STATES).default('signed-out'),
  message: z.string().default(''),
  /** The website, as an origin. */
  website: z.string().default(''),
  /** When what it offers was last fetched, or null before the first time. */
  syncedAt: z.number().nullable().default(null)
})
export type OfferingsLink = z.infer<typeof OfferingsLinkSchema>

export const OfferingsStateSchema = z.object({
  link: OfferingsLinkSchema.prefault({}),
  /** What the website offers, as last fetched; null before the first fetch. */
  site: ServicesSiteSchema.nullable().default(null),
  /** The services here, in their order. Shown only while someone's signed in. */
  offerings: z.array(OfferingSchema).default([]),
  /** The hours here; null until they're set here (the website's are shown till then). */
  hours: OfferingHoursSchema.nullable().default(null),
  /** What this PC last published to this website; null before it ever has. */
  base: OfferingsBaseSchema.nullable().default(null),
  /** A publish or a copy from the website on its way. */
  working: z.enum(['publishing', 'importing']).nullable().default(null),
  /** Moves whenever anything here changes. */
  revision: z.number().int().min(0).default(0)
})
export type OfferingsState = z.infer<typeof OfferingsStateSchema>

// -------------------------------------------------------------------- inputs

/** What's typed for a service: everything but its photo, which is set on its own. */
export const OfferingDraftSchema = z.object({
  slug: z.string().max(OFFERING_LIMITS.slug),
  kind: z.enum(OFFERING_KINDS),
  name: z.string().max(OFFERING_LIMITS.name),
  icon: z.enum(OFFERING_ICONS),
  summary: z.string().max(OFFERING_LIMITS.summary),
  price: z.number().min(0).max(OFFERING_LIMITS.price).nullable(),
  durationMinutes: z.number().int().min(15).max(480).nullable(),
  facts: z
    .array(
      z.object({
        label: z.string().max(OFFERING_LIMITS.factLabel),
        value: z.string().max(OFFERING_LIMITS.factValue)
      })
    )
    .max(OFFERING_LIMITS.facts),
  body: z.string().max(OFFERING_LIMITS.body),
  alt: z.string().max(OFFERING_LIMITS.alt),
  shown: z.boolean()
})
export type OfferingDraft = z.infer<typeof OfferingDraftSchema>

export const NewOfferingSchema = z.object({
  kind: z.enum(OFFERING_KINDS),
  name: z.string().trim().min(1, 'A service needs a name').max(OFFERING_LIMITS.name)
})
export type NewOffering = z.infer<typeof NewOfferingSchema>

export const SaveOfferingSchema = z.object({ id: z.string(), draft: OfferingDraftSchema })
export type SaveOffering = z.infer<typeof SaveOfferingSchema>

export const OfferingPhotoInputSchema = z.object({
  id: z.string(),
  /** The picture chosen, anywhere on this PC; it's copied in. */
  path: z.string()
})
export type OfferingPhotoInput = z.infer<typeof OfferingPhotoInputSchema>

/** A new service: the state, and the new one's id to open it. */
export const OfferingCreatedSchema = z.object({
  state: OfferingsStateSchema,
  id: z.string()
})
export type OfferingCreated = z.infer<typeof OfferingCreatedSchema>

/**
 * A publish: done, or refused because the other person published since
 * this PC's list started from the website. A conflict carries what the
 * website has now, to take theirs or publish over it.
 */
export const OfferingsPublishResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('done'), state: OfferingsStateSchema }),
  z.object({
    status: z.literal('conflict'),
    state: OfferingsStateSchema,
    current: ServicesSiteSchema
  })
])
export type OfferingsPublishResult = z.infer<typeof OfferingsPublishResultSchema>

// ------------------------------------------------------------------- helpers

/** Which photo a service shows, in the terms a publish needs: changes when another is picked. */
function photoIdentity(photo: OfferingPhoto): string {
  if (photo.source === 'site' && photo.site) return `site:${photo.site.card}|${photo.site.wide}`
  if (photo.source === 'file' && photo.file?.copiedPath)
    return `file:${photo.file.copiedPath}|${photo.file.copiedAt ?? 0}`
  return 'none'
}

/** What a service would go to the website as, to compare with what went. */
export function offeringFingerprint(offering: Offering): string {
  return JSON.stringify([
    offering.slug,
    offering.kind,
    offering.name.trim(),
    offering.icon,
    offering.summary.trim(),
    offering.price,
    offering.kind === 'session' ? offering.durationMinutes : null,
    offering.facts.map((fact) => [fact.label.trim(), fact.value.trim()]),
    offering.body,
    photoIdentity(offering.photo),
    offering.photo.alt.trim()
  ])
}

/** The hours, to compare with what went. */
export function hoursFingerprint(hours: OfferingHours): string {
  return JSON.stringify([
    hours.timeZone,
    WEEKDAYS.map((day) => hours.weekly[day]),
    hours.closed,
    hours.noticeHours,
    hours.horizonMonths,
    hours.bufferMinutes
  ])
}

/** Where one service stands against what this PC last published. */
export function offeringStatus(offering: Offering, base: OfferingsBase | null): OfferingStatus {
  if (!offering.shown) return 'hidden'
  const sent = base?.sent[offering.id]
  if (!sent) return 'new'
  return sent === offeringFingerprint(offering) ? 'published' : 'changed'
}

/** What a publish would change on the website, as the page sums it up. */
export interface PendingChanges {
  added: number
  changed: number
  /** Taken off: published from here before, now hidden or deleted. */
  removed: number
  hours: boolean
  order: boolean
  /** Anything at all. */
  any: boolean
}

export function pendingChanges(
  state: Pick<OfferingsState, 'offerings' | 'hours' | 'base'>
): PendingChanges {
  const base = state.base
  const shown = state.offerings.filter((offering) => offering.shown)
  let added = 0
  let changed = 0
  for (const offering of shown) {
    const status = offeringStatus(offering, base)
    if (status === 'new') added += 1
    if (status === 'changed') changed += 1
  }
  const shownIds = new Set(shown.map((offering) => offering.id))
  const removed = Object.keys(base?.sent ?? {}).filter((id) => !shownIds.has(id)).length
  const hours = state.hours !== null && hoursFingerprint(state.hours) !== (base?.hours ?? '')
  // The services that went before, in their order here and in the order they went.
  const kept = shown.filter((offering) => base?.sent[offering.id]).map((offering) => offering.id)
  const keptSet = new Set(kept)
  const went = (base?.order ?? []).filter((id) => keptSet.has(id))
  const order = kept.some((id, index) => went[index] !== id)
  return {
    added,
    changed,
    removed,
    hours,
    order,
    any: added + changed + removed > 0 || hours || order || !base
  }
}

const CENTS_EPSILON = 1e-6

/**
 * What would stop a service going to the website, in the words the page
 * shows; empty when it can go. The website checks again, and its own word
 * (a write-up it can't show, say) comes back from the publish.
 */
export function offeringProblems(offering: Offering): string[] {
  const problems: string[] = []
  if (!offering.name.trim()) problems.push('Give it a name.')
  if (!SLUG_PATTERN.test(offering.slug))
    problems.push('Its address is lowercase words joined by dashes.')
  if (!offering.summary.trim()) problems.push('Give it its one line.')
  if (!offering.facts.length) problems.push('Give it at least one fact, like its format or length.')
  if (offering.facts.some((fact) => !fact.label.trim() || !fact.value.trim()))
    problems.push('Every fact needs a label and a value.')
  if (!offering.body.trim()) problems.push('Write its write-up.')
  if (offering.photo.source === 'none') problems.push('Pick its photo.')
  if (!offering.photo.alt.trim()) problems.push('Say what its photo shows.')
  if (offering.price !== null) {
    if (offering.price <= 0) problems.push('A price is more than zero, or none.')
    else if (Math.abs(offering.price * 100 - Math.round(offering.price * 100)) > CENTS_EPSILON)
      problems.push('A price is in dollars and cents.')
  }
  if (offering.kind === 'session' && !offering.durationMinutes)
    problems.push('Give the session its length.')
  return problems
}

/** What would stop the hours going, empty when they can. */
export function hoursProblems(hours: OfferingHours): string[] {
  const problems: string[] = []
  try {
    new Intl.DateTimeFormat('en', { timeZone: hours.timeZone })
  } catch {
    problems.push(`${hours.timeZone} isn't a time zone.`)
  }
  for (const day of WEEKDAYS) {
    const times = hours.weekly[day]
    if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
      problems.push('A start time is HH:MM.')
    if (new Set(times).size !== times.length) problems.push('A day lists each time once.')
    if (times.length > OFFERING_LIMITS.timesPerDay) problems.push('Too many times in a day.')
  }
  if (hours.closed.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day)))
    problems.push('A day off is a date.')
  return [...new Set(problems)]
}

/** A service as it goes to the website. */
export function siteServiceOf(
  offering: Offering,
  photos: { card: string; wide: string }
): SiteService {
  const facts = offering.facts.map((fact) => ({
    label: fact.label.trim(),
    value: fact.value.trim()
  }))
  return {
    id: offering.slug,
    kind: offering.kind,
    name: offering.name.trim(),
    icon: offering.icon,
    summary: offering.summary.trim(),
    facts,
    photos: { card: photos.card, wide: photos.wide, alt: offering.photo.alt.trim() },
    body: offering.body,
    ...(offering.price !== null ? { price: offering.price } : {}),
    ...(offering.kind === 'session' && offering.durationMinutes
      ? { durationMinutes: offering.durationMinutes }
      : {})
  }
}
