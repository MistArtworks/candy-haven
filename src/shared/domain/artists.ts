import { z } from 'zod'
import { DEFAULT_FOLDER_COLOUR, isHexColour } from './stacks.constants'
import {
  ARTIST_ROLES,
  MAX_ARTIST_LINKS,
  MAX_ARTIST_NAME,
  MAX_ARTIST_REAL_NAME,
  MAX_LINK_LABEL,
  MAX_LINK_URL,
  SOCIAL_PLATFORMS
} from './artists.constants'

/**
 * Schema half of the artists domain — the people Candy Heist works with.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. Runtime values the renderer needs — the role table, the platform
 * table, the name rules — live in artists.constants.ts so importing them does
 * not drag zod into the renderer bundle.
 *
 * An artist owns no directory. The one file a record can carry is a picture,
 * and that is *copied* into the archive's own `Media\artists\` rather than
 * referenced where the operator found it — see docs/DISCOGRAPHY.md §5.
 *
 * **Every field carries a `.default()`**, as everywhere else here: the router
 * validates handler output, so one field without one fails the whole channel
 * rather than one record.
 */

export type { ArtistRole, SocialPlatform } from './artists.constants'

export {
  ARTIST_ROLES,
  ARTIST_ROLE_LABEL,
  MAX_ARTIST_NAME,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABEL,
  artistNameKey,
  checkArtistName,
  checkLinkUrl,
  guessPlatform
} from './artists.constants'

const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

export const ArtistRoleSchema = z.enum(ARTIST_ROLES)
export const SocialPlatformSchema = z.enum(SOCIAL_PLATFORMS)

/**
 * One address an artist can be found at.
 *
 * Carries its own id so the editor can reorder and remove rows without
 * reconciling by index — the same reason `MusterEntry` and `ConcordOption`
 * carry theirs.
 */
export const ArtistLinkSchema = z.object({
  id: z.string(),
  platform: SocialPlatformSchema.default('other').catch('other'),
  url: z.string().max(MAX_LINK_URL).default(''),
  /** Shown instead of the platform name. Only meaningful for `other`. */
  label: z.string().max(MAX_LINK_LABEL).default('')
})
export type ArtistLink = z.infer<typeof ArtistLinkSchema>

/**
 * A picture the archive has taken a copy of.
 *
 * The same three-field shape `ReleaseDeliverable` uses, and for the same
 * reason: where the file came from, where our copy landed, and when. Keeping
 * `sourcePath` means the record can say "this came from your Downloads folder
 * in March" long after that folder has been emptied.
 */
export const ManagedImageSchema = z.object({
  sourcePath: z.string().nullable().default(null),
  copiedPath: z.string().nullable().default(null),
  copiedAt: z.number().nullable().default(null)
})
export type ManagedImage = z.infer<typeof ManagedImageSchema>

export const ArtistRecordSchema = z.object({
  id: z.string(),
  /** As the operator typed it. Compared case-insensitively via `artistNameKey`. */
  name: z.string().max(MAX_ARTIST_NAME),
  /**
   * The case-folded comparison key, stored rather than derived.
   *
   * Stored because it is uniquely indexed, and an index cannot be built over a
   * value computed at read time. Exactly as `ArchiveTag` does it.
   */
  nameKey: z.string().default(''),
  /** For credits and splits. Never shown where the alias belongs. */
  realName: z.string().max(MAX_ARTIST_REAL_NAME).default(''),
  roles: z.array(ArtistRoleSchema).default([]),
  picture: ManagedImageSchema.prefault({}),
  /** Operator-set, stored verbatim. The ARCHIVE's colour licence, same rule. */
  colour: ColourSchema.default(DEFAULT_FOLDER_COLOUR),
  links: z.array(ArtistLinkSchema).max(MAX_ARTIST_LINKS).default([]),
  notes: z.string().default(''),
  favourite: z.boolean().default(false),
  /**
   * True for Candy Heist himself.
   *
   * One record on the roster is the operator, and credits read better when he
   * is in the same list as everybody else rather than being implied by absence.
   * The flag exists so the roster can put him first and so a release does not
   * have to name him to mean him.
   */
  isOperator: z.boolean().default(false),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type ArtistRecord = z.infer<typeof ArtistRecordSchema>

/**
 * An artist plus what they are on, assembled by the service.
 *
 * Counts rather than lists, as `TagSummary` does: the roster draws a hundred
 * of these and the ids behind them are one query away on the artist's own
 * sheet.
 */
export const ArtistSummarySchema = ArtistRecordSchema.extend({
  /** Live projects crediting this artist. Binned ones are not counted. */
  projectCount: z.number().int().min(0).default(0),
  /** Releases crediting them at release level, or on any track. */
  releaseCount: z.number().int().min(0).default(0)
})
export type ArtistSummary = z.infer<typeof ArtistSummarySchema>

export const ArtistLinkDraftSchema = z.object({
  platform: SocialPlatformSchema.optional(),
  url: z.string(),
  label: z.string().optional()
})
export type ArtistLinkDraft = z.infer<typeof ArtistLinkDraftSchema>

export const ArtistDraftSchema = z.object({
  name: z.string(),
  realName: z.string().optional(),
  roles: z.array(ArtistRoleSchema).optional(),
  colour: ColourSchema.optional(),
  links: z.array(ArtistLinkDraftSchema).optional(),
  notes: z.string().optional(),
  isOperator: z.boolean().optional(),
  /**
   * Credit the new artist on this project in the same round trip.
   *
   * The dossier's "create and credit" is one gesture, and splitting it into
   * `artists:create` then `projects:patch` would strand a new artist on the
   * roster whenever the second call failed. Lifted verbatim from
   * `TagDraft.attachTo`, which exists for the same reason.
   */
  attachTo: z.string().optional()
})
export type ArtistDraft = z.infer<typeof ArtistDraftSchema>

export const ArtistPatchSchema = z.object({
  /**
   * Renaming propagates for free.
   *
   * Projects and releases carry artist *ids*, so nothing else is rewritten
   * when somebody changes their alias — which is the whole reason ids won over
   * names, and the lesson schema v3 paid for with the `tags` array.
   */
  name: z.string().optional(),
  realName: z.string().optional(),
  roles: z.array(ArtistRoleSchema).optional(),
  colour: ColourSchema.optional(),
  links: z.array(ArtistLinkSchema).optional(),
  notes: z.string().optional(),
  favourite: z.boolean().optional(),
  isOperator: z.boolean().optional()
})
export type ArtistPatch = z.infer<typeof ArtistPatchSchema>
