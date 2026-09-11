import { z } from 'zod'
import { DEFAULT_FOLDER_COLOUR, isHexColour } from './stacks.constants'
import { MAX_TAG_NAME_LENGTH } from './tags.constants'

/**
 * Schema half of the tags domain — the operator's own labels on a project.
 *
 * See tags.constants.ts for why a tag is metadata rather than a directory, and
 * why its `folderId` is advisory. Everything here describes a record; nothing
 * here touches disk.
 */

export type { TagNameVerdict } from './tags.constants'

export { MAX_TAG_NAME_LENGTH, tagKey, validateTagName } from './tags.constants'

const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

/**
 * A tag as the registry holds it.
 *
 * Note what is *not* here: no project list. Membership is held on the project,
 * in `tagIds`, so there is exactly one place that knows which projects carry a
 * tag — the same arrangement as `ArchiveVolume` and for the same reason. An id
 * array here would be a second answer to the same question, and the two would
 * drift the first time a project was forgotten or purged.
 *
 * **Every field carries a `.default()`** — see `AbletonAnalysisSchema` in
 * projects.ts for the incident that established the rule.
 */
export const ArchiveTagSchema = z.object({
  id: z.string(),
  /** As the operator typed it. Compared case-insensitively via `tagKey`. */
  name: z.string().max(MAX_TAG_NAME_LENGTH),
  /** Operator-set chip colour, stored exactly as picked. */
  colour: z.string().default(DEFAULT_FOLDER_COLOUR),
  /**
   * The shelf this tag was created under, for ordering alone.
   *
   * Advisory rather than structural, exactly as on `ArchiveVolume`: it lifts a
   * genre's own tags to the top of the picker and the filter row while that
   * genre is being browsed. It never restricts which projects may carry the
   * tag, and a project moving shelves keeps everything it is labelled with.
   * Null means the tag was made outside any folder and sorts with the rest.
   */
  folderId: z.string().nullable().default(null),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type ArchiveTag = z.infer<typeof ArchiveTagSchema>

/** A tag plus how much of the register carries it, assembled by the service. */
export const TagSummarySchema = ArchiveTagSchema.extend({
  /** Live projects carrying this tag. Binned ones are not counted. */
  usageCount: z.number().int().min(0).default(0)
})
export type TagSummary = z.infer<typeof TagSummarySchema>

export const TagDraftSchema = z.object({
  name: z.string(),
  colour: ColourSchema.optional(),
  folderId: z.string().nullable().optional(),
  /**
   * Attach the new tag to this project in the same round trip.
   *
   * The picker's "create and apply" is one gesture to the operator, and
   * splitting it into `tags:create` then `projects:patch` would leave an
   * orphaned tag behind whenever the second call failed.
   */
  attachTo: z.string().optional()
})
export type TagDraft = z.infer<typeof TagDraftSchema>

export const TagPatchSchema = z.object({
  /**
   * Renaming propagates for free.
   *
   * Projects carry tag *ids*, not names, so nothing else has to be rewritten
   * when a tag is renamed — which is the reason ids won over names when this
   * was designed. See `ProjectRecord.tagIds`.
   */
  name: z.string().optional(),
  colour: ColourSchema.optional(),
  folderId: z.string().nullable().optional()
})
export type TagPatch = z.infer<typeof TagPatchSchema>
