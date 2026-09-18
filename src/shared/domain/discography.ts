import { z } from 'zod'
import { ManagedImageSchema } from './artists'
import { IsoDateSchema } from './dates'
import { MediaFileSchema } from './media'
import { DEFAULT_FOLDER_COLOUR, isHexColour } from './stacks.constants'
import { ARTIST_ROLES, SOCIAL_PLATFORMS } from './artists.constants'
import {
  MAX_CATALOGUE_NUMBER,
  MAX_COPYRIGHT_LINE,
  MAX_CREDIT_NOTE,
  MAX_CREDITS,
  MAX_LABEL_NAME,
  MAX_RELEASE_LINKS,
  MAX_RELEASE_SUBTITLE,
  MAX_RELEASE_TITLE,
  MAX_TRACK_TITLE,
  MAX_TRACKS,
  RELEASE_KINDS,
  RELEASE_STATUSES
} from './discography.constants'

/**
 * Schema half of the discography domain — the public record of what shipped.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. Runtime values live in discography.constants.ts.
 *
 * **Every field carries a `.default()`**, as everywhere else here.
 */

export type { DiscographyLens, ReleaseKind, ReleaseStatus } from './discography.constants'

export {
  DISCOGRAPHY_LENSES,
  DISCOGRAPHY_LENS_LABEL,
  MAX_CREDITS,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_STATUSES,
  RELEASE_STATUS_LABEL,
  formatIsrc,
  isForthcoming,
  isPublic,
  releaseYear
} from './discography.constants'

const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

export const ReleaseKindSchema = z.enum(RELEASE_KINDS)
export const ReleaseStatusSchema = z.enum(RELEASE_STATUSES)

export const ReleaseLinkSchema = z.object({
  id: z.string(),
  platform: z.enum(SOCIAL_PLATFORMS).default('other').catch('other'),
  url: z.string().default(''),
  label: z.string().default('')
})
export type ReleaseLink = z.infer<typeof ReleaseLinkSchema>

/**
 * One line of the liner notes.
 *
 * A row per *role*, naming one or more people — `PRODUCED BY — Candy Heist,
 * Nasko` — rather than a row per person carrying a role. That is how a credit
 * is read, and it is also what keeps the list short: a release with four
 * producers has one producer line, not four.
 *
 * Distinct from `artistIds` and `featuredArtistIds` above, which are how a
 * release is **titled**. Those two decide whether the world sees `CANDY HEIST`
 * or `CANDY HEIST feat. NASKO`; these say who did the work behind it. Somebody
 * can legitimately appear in both, and often does.
 *
 * Everything here is optional. A single put out alone carries no credits at
 * all, and an empty list is the honest record of that rather than a gap.
 */
export const ReleaseCreditSchema = z.object({
  id: z.string(),
  /** From the roster's own closed role set — see `ARTIST_ROLE_CREDIT`. */
  role: z.enum(ARTIST_ROLES).default('other').catch('other'),
  artistIds: z.array(z.string()).default([]),
  /**
   * What the role cannot say on its own.
   *
   * Carries `additional production`, the instrument an instrumentalist
   * actually played, or the whole credit when the role is `other`. Drawn
   * beside the role rather than instead of it.
   */
  note: z.string().max(MAX_CREDIT_NOTE).default('')
})
export type ReleaseCredit = z.infer<typeof ReleaseCreditSchema>

/**
 * One track on a release.
 *
 * ### Why the tracklist lives here and not on the project
 *
 * `volumes.constants.ts` recorded the opposite rule — membership on the
 * project, never a list on the volume, so there is one source of truth — and
 * that was right for a volume, which is made **only** of projects.
 *
 * A discography entry is not. The whole point of the department is that an
 * entry stands alone when there is no project behind it: everything released
 * before this application existed, everything a label mastered, every remix
 * somebody else made. A track with no project cannot be stored on a project.
 *
 * So the list is here and `projectId` is nullable, and the link stays
 * **one-directional** — a project does not store which release it is on. The
 * reverse lookup is built by the discography service and handed to the
 * projects service as a resolver, exactly as `setTagResolver` already works,
 * because two stored directions are two things to keep in step and they will
 * not stay in step.
 */
export const ReleaseTrackSchema = z.object({
  id: z.string(),
  /** 1-based, and contiguous — the service renumbers on every write. */
  position: z.number().int().min(1).default(1),
  title: z.string().max(MAX_TRACK_TITLE).default(''),
  /**
   * The ARCHIVE project this track was made in, when there is one.
   *
   * Null is an ordinary state, not a broken link: a back catalogue predates
   * the archive, and a track somebody else produced never had a project here.
   * An id whose project has been forgotten resolves to nothing and the track
   * simply draws without it — cheaper and less surprising than refusing an
   * otherwise valid record, which is the rule `tagIds` already established.
   */
  projectId: z.string().nullable().default(null),
  /** Credits specific to this track, beyond the release's own. */
  artistIds: z.array(z.string()).default([]),
  /**
   * The audio file that ships, referenced where it already sits.
   *
   * ### Why this is here and not on the project
   *
   * It was on the project, as `masters.final`, and choosing one **moved** the
   * bounce into `Candy Haven\Release Mastered Tracks`. Both halves of that are
   * gone.
   *
   * It is here because a project does not know whether it shipped — the whole
   * point of the one-directional link is that the release is the record of
   * what went out into the world. The file that ships is a fact about the
   * release, so it is stored on the release, on the track it ships as.
   *
   * It is **referenced, not moved and not copied**: the path points into the
   * project folder, beside the set that made it. Moving it took the audio away
   * from its own session, which is the opposite of being able to find the
   * source; copying it would leave two files and no way to tell which the
   * record means. Nothing on disk changes when a master is chosen or cleared.
   *
   * Null is an ordinary state. A track with no project cannot have one, and a
   * release being planned has not been bounced yet. A path whose file has since
   * been moved or deleted still reads as a record of what shipped — the panel
   * reports it and offers to reveal it, and failing to reveal is a better
   * answer than the record quietly forgetting.
   */
  master: MediaFileSchema.nullable().default(null),
  /** Identifies a *recording*, so it belongs here rather than on the release. */
  isrc: z.string().default(''),
  /** Carried from the project's analysis when linked, so it survives unlinking. */
  durationMs: z.number().int().min(0).default(0),
  notes: z.string().default('')
})
export type ReleaseTrack = z.infer<typeof ReleaseTrackSchema>

export const DiscographyReleaseSchema = z.object({
  id: z.string(),
  kind: ReleaseKindSchema.default('single').catch('single'),
  title: z.string().max(MAX_RELEASE_TITLE),
  /** `— Nasko Remix`, `Deluxe Edition`. Drawn under the title, never in it. */
  subtitle: z.string().max(MAX_RELEASE_SUBTITLE).default(''),

  /**
   * Credits at release level, by id.
   *
   * `artistIds` is billed as the release's own artist — usually one record,
   * the operator's. `featuredArtistIds` is everybody billed alongside. Split
   * rather than one list with roles because the distinction is how a release
   * is *titled*, not a fact about the people: `CANDY HEIST feat. NASKO`.
   */
  artistIds: z.array(z.string()).default([]),
  featuredArtistIds: z.array(z.string()).default([]),

  /** The liner notes — see `ReleaseCreditSchema`. Ordered as drawn. */
  credits: z.array(ReleaseCreditSchema).max(MAX_CREDITS).default([]),

  /**
   * Who put it out. A field rather than a record — decision D4.
   *
   * Empty means self-released, which is the common case and does not deserve
   * a sentinel value. The register autocompletes from labels already used, so
   * the strings stay consistent without an id behind them.
   */
  label: z.string().max(MAX_LABEL_NAME).default(''),
  labelUrl: z.string().default(''),
  catalogueNumber: z.string().max(MAX_CATALOGUE_NUMBER).default(''),

  /**
   * `scheduled` or `released` — see `RELEASE_STATUSES` for why it is two.
   *
   * `.catch` is load-bearing here rather than defensive. The set shrank from
   * five, so a document stored before that carries `idea`, `planned` or
   * `shelved`, none of which parse — and the catch folds each onto
   * `scheduled`, which is the same thing the v10 migration writes. A record
   * that has not been migrated yet therefore *reads* correctly instead of
   * being skipped as unreadable.
   */
  status: ReleaseStatusSchema.default('scheduled').catch('scheduled'),
  /**
   * `YYYY-MM-DD`, as every date in this project is.
   *
   * A release is dated the day it is out wherever the operator is standing,
   * and storing an instant would drag it across a day boundary the first time
   * they travelled. Same reasoning as `CalendarEntry.date`.
   */
  releaseDate: IsoDateSchema.nullable().default(null),

  /** Identifies a *product*, so it belongs here rather than on a track. */
  upc: z.string().default(''),
  /** ℗ — the recording. */
  phonographicLine: z.string().max(MAX_COPYRIGHT_LINE).default(''),
  /** © — the composition. */
  copyrightLine: z.string().max(MAX_COPYRIGHT_LINE).default(''),

  /** Copied into `Media\releases\`, never referenced in place. See §5. */
  artwork: ManagedImageSchema.prefault({}),
  canvas: ManagedImageSchema.prefault({}),

  links: z.array(ReleaseLinkSchema).max(MAX_RELEASE_LINKS).default([]),
  tracks: z.array(ReleaseTrackSchema).max(MAX_TRACKS).default([]),

  colour: ColourSchema.default(DEFAULT_FOLDER_COLOUR),
  notes: z.string().default(''),
  favourite: z.boolean().default(false),

  /**
   * The project this entry was raised **automatically** for, and only while it
   * is still untouched.
   *
   * Naming a final master raises a single by itself (D17). Clearing that
   * master has to be able to take the single back with it — otherwise a pick
   * made and immediately undone leaves a release the operator never asked for
   * and has to find and delete.
   *
   * So it cannot simply be "the id of the project this was raised for": that
   * would authorise deleting a record the operator has since *worked on* —
   * added a label, a catalogue number, artwork, a second track — which is a
   * far worse outcome than a stray entry. **Any operator edit sets this back
   * to null**, and from that moment the entry is theirs and is never removed
   * on their behalf. See `reconcileAutoSingle`.
   *
   * Null therefore means either "raised by hand" or "raised automatically and
   * since edited", and both of those mean exactly the same thing to every
   * reader: do not touch it.
   */
  raisedFor: z.string().nullable().default(null),

  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type DiscographyRelease = z.infer<typeof DiscographyReleaseSchema>

/**
 * A release plus what the register worked out about it.
 *
 * The catalogue draws these; the sheet fetches the full record. Same split as
 * the project registry, and for the same reason: a hundred releases with their
 * whole tracklists is a lot of rope to pull across the boundary to draw a grid
 * of covers.
 */
export const DiscographySummarySchema = DiscographyReleaseSchema.omit({ tracks: true }).extend({
  trackCount: z.number().int().min(0).default(0),
  /** Tracks with a project behind them. `trackCount` minus this is the gap. */
  linkedCount: z.number().int().min(0).default(0),
  /** Resolved names, so the catalogue draws credits without a second fetch. */
  artistNames: z.array(z.string()).default([]),
  year: z.number().int().nullable().default(null)
})
export type DiscographySummary = z.infer<typeof DiscographySummarySchema>

/**
 * The whole department in one response.
 *
 * Ships the artist library alongside, exactly as `ProjectRegistry` ships the
 * tag library: the summaries carry ids, and a renderer holding ids and no
 * library cannot draw a credit. One fetch, one consistent pair.
 */
export const DiscographyRegistrySchema = z.object({
  releases: z.array(DiscographySummarySchema).default([]),
  /** Every label used, deduped and ordered, for the field's autocomplete. */
  labels: z.array(z.string()).default([]),
  total: z.number().int().min(0).default(0)
})
export type DiscographyRegistry = z.infer<typeof DiscographyRegistrySchema>

// -------------------------------------------------------------------- inputs

export const ReleaseDraftSchema = z.object({
  title: z.string(),
  kind: ReleaseKindSchema.optional(),
  status: ReleaseStatusSchema.optional(),
  releaseDate: IsoDateSchema.nullable().optional(),
  artistIds: z.array(z.string()).optional(),
  /**
   * Raise the release around a project that already exists.
   *
   * The dossier's "add to discography" is one gesture; splitting it into
   * `discography:create` then `discography:track-add` would leave an empty
   * release behind whenever the second call failed. Same reasoning as
   * `TagDraft.attachTo` and `ArtistDraft.attachTo`.
   */
  fromProjectId: z.string().optional()
})
export type ReleaseDraft = z.infer<typeof ReleaseDraftSchema>

export const ReleasePatchSchema = z.object({
  kind: ReleaseKindSchema.optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  artistIds: z.array(z.string()).optional(),
  featuredArtistIds: z.array(z.string()).optional(),
  /** Replaces the whole list, as every patch field here does. */
  credits: z.array(ReleaseCreditSchema).optional(),
  label: z.string().optional(),
  labelUrl: z.string().optional(),
  catalogueNumber: z.string().optional(),
  status: ReleaseStatusSchema.optional(),
  releaseDate: IsoDateSchema.nullable().optional(),
  upc: z.string().optional(),
  phonographicLine: z.string().optional(),
  copyrightLine: z.string().optional(),
  links: z.array(ReleaseLinkSchema).optional(),
  colour: ColourSchema.optional(),
  notes: z.string().optional(),
  favourite: z.boolean().optional()
})
export type ReleasePatch = z.infer<typeof ReleasePatchSchema>

export const TrackDraftSchema = z.object({
  title: z.string().optional(),
  /** Link as it is added, which is the usual way a track gets here. */
  projectId: z.string().nullable().optional(),
  artistIds: z.array(z.string()).optional(),
  isrc: z.string().optional()
})
export type TrackDraft = z.infer<typeof TrackDraftSchema>

export const TrackPatchSchema = z.object({
  title: z.string().optional(),
  projectId: z.string().nullable().optional(),
  artistIds: z.array(z.string()).optional(),
  isrc: z.string().optional(),
  durationMs: z.number().int().min(0).optional(),
  notes: z.string().optional()
})
export type TrackPatch = z.infer<typeof TrackPatchSchema>

/**
 * Where a project appears in the catalogue, for the ARCHIVE to draw.
 *
 * The resolved half of the one-directional link described on
 * `ReleaseTrackSchema`. Built by the discography service and handed to the
 * projects service, so the register can say "track 3 of *Ossuary*" without
 * storing a second copy of the relationship.
 */
export const ReleaseAppearanceSchema = z.object({
  releaseId: z.string(),
  /** Which track of it, so the ARCHIVE can name the pick it is reporting. */
  trackId: z.string().default(''),
  title: z.string(),
  kind: ReleaseKindSchema,
  status: ReleaseStatusSchema,
  position: z.number().int().min(1),
  releaseDate: IsoDateSchema.nullable().default(null),
  /**
   * The file that shipped as this track, carried across with the appearance.
   *
   * Shipped here rather than fetched because the ARCHIVE's dossier is the
   * place the operator goes looking for the source audio, and making it ask
   * the catalogue a second question to answer "which file was it" would be a
   * round trip to restate something this index already had in hand.
   */
  master: MediaFileSchema.nullable().default(null)
})
export type ReleaseAppearance = z.infer<typeof ReleaseAppearanceSchema>

/** Which managed file a set call is writing. */
export const ReleaseAssetSchema = z.enum(['artwork', 'canvas'])
export type ReleaseAsset = z.infer<typeof ReleaseAssetSchema>
