import { z } from 'zod'
import { DEFAULT_FOLDER_COLOUR, isHexColour } from './stacks.constants'
import { MAX_VOLUME_TITLE_LENGTH, VOLUME_KINDS } from './volumes.constants'

/**
 * Schema half of the volumes domain — albums, EPs and compilations.
 *
 * See volumes.constants.ts for why a volume is metadata rather than a
 * directory. Everything here describes a record; nothing here touches disk.
 */

export type { VolumeKind } from './volumes.constants'

export {
  MAX_VOLUME_TITLE_LENGTH,
  VOLUME_KINDS,
  VOLUME_KIND_LABEL,
  VOLUME_KIND_PURPOSE,
  VOLUME_KIND_TYPICAL_TRACKS,
  validateVolumeTitle
} from './volumes.constants'

export const VolumeKindSchema = z.enum(VOLUME_KINDS)

const ColourSchema = z.string().refine(isHexColour, 'Expected a six-digit hex colour')

/**
 * A volume as the registry holds it.
 *
 * Note what is *not* here: no track list. Membership is held on the project, in
 * `volumeId` and `trackNumber`, so there is exactly one place that knows which
 * tracks are on an album. An ordered id array here would be a second answer to
 * the same question, and the two would drift the first time a project was
 * forgotten or its folder deleted outside the app.
 *
 * **Every field carries a `.default()`** — see `AbletonAnalysisSchema` in
 * projects.ts for the incident that established the rule.
 */
export const ArchiveVolumeSchema = z.object({
  id: z.string(),
  kind: VolumeKindSchema,
  title: z.string().max(MAX_VOLUME_TITLE_LENGTH),
  artist: z.string().default(''),
  /** Operator-set tile colour, stored exactly as picked. */
  colour: z.string().default(DEFAULT_FOLDER_COLOUR),
  /**
   * Cover art for the volume as a whole.
   *
   * An absolute path to a file that lives wherever the operator keeps it —
   * usually in one of its tracks' `GRAPHICS/` folders. Nothing is copied: a
   * volume owns no directory, so it owns no files either.
   */
  artworkPath: z.string().nullable().default(null),
  notes: z.string().default(''),
  /**
   * The shelf this volume is associated with, for the sake of the tile grid.
   *
   * Advisory rather than structural — its tracks are filed individually and may
   * legitimately sit under different genres. Null means "show it everywhere".
   */
  folderId: z.string().nullable().default(null),
  favourite: z.boolean().default(false),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type ArchiveVolume = z.infer<typeof ArchiveVolumeSchema>

/** A volume plus the figures its tile shows, assembled by the service. */
export const VolumeSummarySchema = ArchiveVolumeSchema.extend({
  /** Projects pointing at this volume. */
  trackCount: z.number().int().min(0).default(0),
  /** Of those, how many have a final mix and master chosen. */
  masteredCount: z.number().int().min(0).default(0),
  /** Combined size of every track's folder. */
  sizeBytes: z.number().min(0).default(0),
  /** Most recent `lastTouchedAt` across its tracks; 0 when it has none. */
  lastTouchedAt: z.number().default(0),
  /** True when a release has been raised for this volume. */
  released: z.boolean().default(false)
})
export type VolumeSummary = z.infer<typeof VolumeSummarySchema>

export const VolumeDraftSchema = z.object({
  kind: VolumeKindSchema,
  title: z.string(),
  artist: z.string().optional(),
  colour: ColourSchema.optional(),
  folderId: z.string().nullable().optional()
})
export type VolumeDraft = z.infer<typeof VolumeDraftSchema>

export const VolumePatchSchema = z.object({
  /**
   * Changing the kind re-categorises every track on it.
   *
   * The service does that rewrite rather than refusing the edit: a project's
   * category and its volume's kind are one statement made in two places, and
   * leaving nine tracks marked `album` under an object now calling itself an EP
   * would be a contradiction the operator never asked for.
   */
  kind: VolumeKindSchema.optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  colour: ColourSchema.optional(),
  artworkPath: z.string().nullable().optional(),
  notes: z.string().optional(),
  folderId: z.string().nullable().optional(),
  favourite: z.boolean().optional()
})
export type VolumePatch = z.infer<typeof VolumePatchSchema>
