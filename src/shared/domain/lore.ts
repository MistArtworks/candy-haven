import { z } from 'zod'
import { isPresetId, planetSpecSchema, presetById, type PlanetSpec } from '../planets/engine'
import {
  DEFAULT_PLANET_ID,
  LORE_LIMITS,
  LORE_LINK_STATES,
  SLUG_PATTERN,
  type ChapterStatus
} from './lore.constants'

/**
 * Schema half of LORE.
 *
 * Two halves, kept in two places. The drafts, the planet library and the
 * chapters' order are this console's, in its archive on this machine, and
 * the other copy of the console never sees them. What's published is the
 * website's, and this console holds what it last fetched. A chapter
 * reaches the website, as it stands here, only by being published.
 * See docs/LORE.md.
 *
 * Records from the website default what they can: the website may gain a
 * field before this build knows what it is.
 */

const text = z.string().default('')

// --------------------------------------------------------------- the website

/** A chapter as the website shows it: whole, with a copy of its planet. */
export const PublishedChapterSchema = z.object({
  id: z.string(),
  slug: text,
  title: text,
  line: text,
  body: text,
  planetId: z.string().default(DEFAULT_PLANET_ID),
  planetName: text,
  planet: planetSpecSchema,
  order: z.number().default(0),
  /** Goes up on every publish; a publish that started from an older one is refused. */
  revision: z.number().int().default(0),
  publishedAt: text,
  /** Who published it last: `mist`, `candy`, or an id this build doesn't know. */
  publishedBy: text
})
export type PublishedChapter = z.infer<typeof PublishedChapterSchema>

/** What the website has: whether it shows this lore yet, and what's published, in its order. */
export const LoreSiteSchema = z.object({
  live: z.boolean().default(false),
  chapters: z.array(PublishedChapterSchema).default([])
})
export type LoreSite = z.infer<typeof LoreSiteSchema>

// -------------------------------------------------------------- this machine

/** The published version a draft started from, on one website. */
export const DraftBaseSchema = z.object({
  /** The website, as an origin. */
  website: z.string(),
  revision: z.number().int().min(0)
})
export type DraftBase = z.infer<typeof DraftBaseSchema>

/** A chapter as written here. */
export const LoreDraftSchema = z.object({
  id: z.string(),
  slug: text,
  title: text,
  line: text,
  planetId: z.string().default(DEFAULT_PLANET_ID),
  /** The text, in the lore's markdown. */
  body: text,
  /**
   * Per website, the published version this draft started from, so that
   * publishing notices the other person publishing it in the meantime. Per
   * website because a development server is another website, with its own.
   */
  bases: z.array(DraftBaseSchema).default([]),
  createdAt: text,
  updatedAt: text
})
export type LoreDraft = z.infer<typeof LoreDraftSchema>

/** A planet in the library here. */
export const LorePlanetSchema = z.object({
  id: z.string(),
  name: text,
  spec: planetSpecSchema,
  createdAt: text,
  updatedAt: text
})
export type LorePlanet = z.infer<typeof LorePlanetSchema>

export const LoreLinkSchema = z.object({
  state: z.enum(LORE_LINK_STATES).default('signed-out'),
  message: z.string().default(''),
  /** The website, as an origin. */
  website: z.string().default(''),
  /** When what's published was last fetched, or null before the first time. */
  syncedAt: z.number().nullable().default(null)
})
export type LoreLink = z.infer<typeof LoreLinkSchema>

export const LoreStateSchema = z.object({
  link: LoreLinkSchema.prefault({}),
  /** What the website has published, as last fetched; null before the first fetch. */
  site: LoreSiteSchema.nullable().default(null),
  /** The drafts here. Like everything in LORE, shown only while someone's signed in. */
  drafts: z.array(LoreDraftSchema).default([]),
  planets: z.array(LorePlanetSchema).default([]),
  /** The chapters' order here, by id, drafts and published alike. */
  order: z.array(z.string()).default([]),
  /** Moves whenever anything here changes. */
  revision: z.number().int().min(0).default(0)
})
export type LoreState = z.infer<typeof LoreStateSchema>

// -------------------------------------------------------------------- inputs

const planetId = z
  .string()
  .max(60)
  .refine((id) => isPresetId(id) || /^[a-f0-9]{24}$/i.test(id), 'Pick a planet from the library')

export const ChapterDraftSchema = z.object({
  title: z.string().trim().min(1, 'A chapter needs a title').max(LORE_LIMITS.title),
  line: z.string().trim().max(LORE_LIMITS.line).default(''),
  /** Its address. Left out, a new chapter's is made from its title, and a saved one keeps its own. */
  slug: z
    .string()
    .trim()
    .max(LORE_LIMITS.slug)
    .regex(SLUG_PATTERN, 'An address is lowercase words joined by dashes')
    .optional(),
  planetId,
  body: z.string().max(LORE_LIMITS.body).default('')
})
export type ChapterDraft = z.infer<typeof ChapterDraftSchema>

export const SaveChapterInputSchema = z.object({
  id: z.string(),
  draft: ChapterDraftSchema
})
export type SaveChapterInput = z.infer<typeof SaveChapterInputSchema>

export const DeleteChapterInputSchema = z.object({
  id: z.string(),
  /** Take it off the website too. Otherwise only the draft here goes. */
  everywhere: z.boolean()
})
export type DeleteChapterInput = z.infer<typeof DeleteChapterInputSchema>

export const PublishChapterInputSchema = z.object({
  id: z.string(),
  /** Publish over a newer version the other person published. */
  force: z.boolean()
})
export type PublishChapterInput = z.infer<typeof PublishChapterInputSchema>

export const PlanetDraftSchema = z.object({
  name: z.string().trim().min(1, 'A planet needs a name').max(LORE_LIMITS.planetName),
  spec: planetSpecSchema
})
export type PlanetDraft = z.infer<typeof PlanetDraftSchema>

export const SavePlanetInputSchema = z.object({
  id: z.string(),
  draft: PlanetDraftSchema
})
export type SavePlanetInput = z.infer<typeof SavePlanetInputSchema>

// ------------------------------------------------------------------- results

/** A new chapter or planet: the lore, and the new one's id to open it. */
export const LoreCreatedSchema = z.object({
  state: LoreStateSchema,
  id: z.string().nullable()
})
export type LoreCreated = z.infer<typeof LoreCreatedSchema>

/**
 * A publish: done, or refused because the other person published this
 * chapter since the draft started from it. A conflict carries their
 * version, or null when they took it off the website, so the page can
 * offer to keep theirs or publish over it.
 */
export const PublishResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('done'), state: LoreStateSchema }),
  z.object({
    status: z.literal('conflict'),
    state: LoreStateSchema,
    current: PublishedChapterSchema.nullable()
  })
])
export type PublishResult = z.infer<typeof PublishResultSchema>

// ------------------------------------------------------------------- helpers

/** The published revision a draft started from on a website: 0 for none. */
export function baseFor(draft: LoreDraft, website: string): number {
  return draft.bases.find((base) => base.website === website)?.revision ?? 0
}

/** A draft's bases with one website's set, or cleared with 0. */
export function rebased(draft: LoreDraft, website: string, revision: number): DraftBase[] {
  const others = draft.bases.filter((base) => base.website !== website)
  return revision > 0 ? [...others, { website, revision }] : others
}

/** A planet's name and look by its id: a preset, or one from the library here. */
export function planetLook(
  state: Pick<LoreState, 'planets'>,
  id: string
): { name: string; spec: PlanetSpec } | null {
  const preset = presetById(id)
  if (preset) return { name: preset.name, spec: preset.spec }
  const planet = state.planets.find((p) => p.id === id)
  return planet ? { name: planet.name, spec: planet.spec } : null
}

/** The chapters here that a planet is drawn for. */
export function planetUsers(state: Pick<LoreState, 'drafts'>, id: string): LoreDraft[] {
  return state.drafts.filter((draft) => draft.planetId === id)
}

/** JSON with every object's keys in order, so two equal looks compare equal however they were stored. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
          )
        )
      : inner
  )
}

/** Whether two planets look the same. */
export const sameLook = (a: PlanetSpec, b: PlanetSpec): boolean => canonical(a) === canonical(b)

/**
 * Where a chapter stands against the website: only here, as published, or
 * changed here since. Its text, title, line, address and planet's look
 * count; the planet's name doesn't, since visitors never see it.
 */
export function chapterStatus(
  state: Pick<LoreState, 'planets'>,
  draft: LoreDraft | null,
  published: PublishedChapter | null
): ChapterStatus {
  if (!published) return 'draft'
  if (!draft) return 'published'
  const look = planetLook(state, draft.planetId)
  const same =
    draft.slug === published.slug &&
    draft.title === published.title &&
    draft.line === published.line &&
    draft.body === published.body &&
    look !== null &&
    sameLook(look.spec, published.planet)
  return same ? 'published' : 'changed'
}

/** A chapter as LORE shows it: the draft here, and what the website has of it. */
export interface LoreChapterView {
  id: string
  draft: LoreDraft | null
  published: PublishedChapter | null
  status: ChapterStatus
}

/**
 * Every chapter's id in the order here: those placed, then any published
 * that this console hasn't placed yet (in the website's order), then any
 * drafts not placed (oldest first). An id that's neither a draft here nor
 * published is dropped.
 */
export function displayOrder(state: Pick<LoreState, 'order' | 'drafts' | 'site'>): string[] {
  const drafts = new Set(state.drafts.map((draft) => draft.id))
  const published = new Set(state.site?.chapters.map((chapter) => chapter.id))
  const seen = new Set<string>()
  const ids: string[] = []
  const add = (id: string): void => {
    if (seen.has(id) || (!drafts.has(id) && !published.has(id))) return
    seen.add(id)
    ids.push(id)
  }
  state.order.forEach(add)
  state.site?.chapters.forEach((chapter) => add(chapter.id))
  ;[...state.drafts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((draft) => add(draft.id))
  return ids
}

/** Every chapter, in the order here. */
export function chapterViews(state: LoreState): LoreChapterView[] {
  const drafts = new Map(state.drafts.map((draft) => [draft.id, draft]))
  const published = new Map(state.site?.chapters.map((chapter) => [chapter.id, chapter]))
  return displayOrder(state).map((id) => {
    const draft = drafts.get(id) ?? null
    const live = published.get(id) ?? null
    return { id, draft, published: live, status: chapterStatus(state, draft, live) }
  })
}

/** The published chapters, in the order here. */
export function publishedOrderHere(state: Pick<LoreState, 'order' | 'drafts' | 'site'>): string[] {
  const published = new Set(state.site?.chapters.map((chapter) => chapter.id))
  return displayOrder(state).filter((id) => published.has(id))
}

/**
 * Whether the website shows the published chapters in another order from
 * the one here. Drafts don't count: their place means nothing to the site
 * until they're published.
 */
export function orderDiffers(state: Pick<LoreState, 'order' | 'drafts' | 'site'>): boolean {
  if (!state.site) return false
  const here = publishedOrderHere(state)
  const there = state.site.chapters.map((chapter) => chapter.id)
  return here.length !== there.length || here.some((id, i) => id !== there[i])
}

/**
 * An order with the published chapters in the website's order and every
 * draft left where it is: the published chapters' places are refilled, in
 * turn, from the website's order. Any published chapter not placed yet
 * goes last.
 */
export function withSiteOrder(order: readonly string[], site: LoreSite): string[] {
  const there = site.chapters.map((chapter) => chapter.id)
  const published = new Set(there)
  const placed = new Set(order)
  const queue = there.filter((id) => placed.has(id))
  const next = order.map((id) => (published.has(id) ? (queue.shift() ?? id) : id))
  for (const id of there) if (!placed.has(id)) next.push(id)
  return next
}
