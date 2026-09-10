import { z } from 'zod'
import { IsoDateSchema, ProjectCategorySchema } from './projects'
import { MAX_RELEASE_TITLE_LENGTH, RELEASE_SUBJECTS } from './releases.constants'

/**
 * Schema half of the releases domain.
 *
 * A release is the one object in the ARCHIVE that owns a directory of its own
 * outside the genre tree: `<wrapper>/RELEASES/<title>/`. Nothing is moved into
 * it — the project stays filed where the operator put it, and the deliverables
 * are *copied* here. That is what stops the genre tree developing holes every
 * time something ships.
 *
 * Deliberately small in this pass. Distribution metadata — ISRC, UPC, label,
 * copyright, platform links — is not modelled at all yet; it is waiting on the
 * scheduling system that replaces TRANSMISSIONS.
 */

export type { DeliverableKind, ReleaseScaffoldFolder, ReleaseSubject } from './releases.constants'

export {
  DELIVERABLE_DESTINATION,
  DELIVERABLE_HINT,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABEL,
  MAX_RELEASE_TITLE_LENGTH,
  RELEASE_SCAFFOLD_FOLDERS,
  RELEASE_SCAFFOLD_PURPOSE,
  RELEASE_SUBJECTS,
  slugifyReleaseTitle
} from './releases.constants'

export const ReleaseSubjectSchema = z.enum(RELEASE_SUBJECTS)

/**
 * One of the three files that ship.
 *
 * Both paths are kept. `sourcePath` is where the operator picked it from, and
 * is what the picker shows as still-selected; `copiedPath` is where it now sits
 * inside the release folder. Keeping only the copy would lose the connection to
 * the project it came from, and keeping only the source would leave the folder
 * on disk unexplained.
 */
export const ReleaseDeliverableSchema = z.object({
  sourcePath: z.string().nullable().default(null),
  copiedPath: z.string().nullable().default(null),
  copiedAt: z.number().nullable().default(null)
})
export type ReleaseDeliverable = z.infer<typeof ReleaseDeliverableSchema>

/**
 * A release as the registry holds it.
 *
 * **Every field carries a `.default()`** — see `AbletonAnalysisSchema` in
 * projects.ts for the incident that established the rule.
 */
export const ArchiveReleaseSchema = z.object({
  id: z.string(),
  /** Whether this ships one project or a whole volume. */
  subjectKind: ReleaseSubjectSchema,
  /** Id of the project or volume being released. */
  subjectId: z.string(),
  title: z.string().max(MAX_RELEASE_TITLE_LENGTH),
  /**
   * Carried on the release rather than read from the subject each time.
   *
   * A release is a historical statement — this went out, as this, on this day —
   * and re-categorising a project two years later must not silently rewrite
   * what shipped.
   */
  category: ProjectCategorySchema.default('single'),
  /** `YYYY-MM-DD`, or null while the date is still undecided. */
  releaseDate: IsoDateSchema.nullable().default(null),
  /** Absolute path of `<wrapper>/RELEASES/<title>`. */
  path: z.string(),
  master: ReleaseDeliverableSchema.prefault({}),
  cover: ReleaseDeliverableSchema.prefault({}),
  canvas: ReleaseDeliverableSchema.prefault({}),
  notes: z.string().default(''),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0)
})
export type ArchiveRelease = z.infer<typeof ArchiveReleaseSchema>

/** A release plus what the tile needs about its subject. */
export const ReleaseSummarySchema = ArchiveReleaseSchema.extend({
  /** Display name of the project or volume, resolved at read time. */
  subjectName: z.string().default(''),
  /** True when the subject record has since been deleted or forgotten. */
  orphaned: z.boolean().default(false),
  /** Tracks covered — 1 for a project, the volume's track count otherwise. */
  trackCount: z.number().int().min(0).default(0),
  /** Deliverables attached, out of three. */
  attached: z.number().int().min(0).max(3).default(0)
})
export type ReleaseSummary = z.infer<typeof ReleaseSummarySchema>

export const ReleaseDraftSchema = z.object({
  subjectKind: ReleaseSubjectSchema,
  subjectId: z.string(),
  /** Omitted takes the subject's own name. */
  title: z.string().optional(),
  releaseDate: IsoDateSchema.nullable().optional()
})
export type ReleaseDraft = z.infer<typeof ReleaseDraftSchema>

/**
 * Operator edits to a release.
 *
 * `title` renames the directory on disk, so it goes through the same
 * disk-first-database-second path a folder rename does.
 */
export const ReleasePatchSchema = z.object({
  title: z.string().optional(),
  releaseDate: IsoDateSchema.nullable().optional(),
  notes: z.string().optional()
})
export type ReleasePatch = z.infer<typeof ReleasePatchSchema>

/**
 * Attaching a deliverable.
 *
 * `sourcePath` is null to detach. The copy inside the release folder is left in
 * place when that happens — deleting it would be the app removing a file the
 * operator can see, which nothing here does without being asked plainly.
 */
export const DeliverableAttachSchema = z.object({
  id: z.string(),
  kind: z.enum(['master', 'cover', 'canvas']),
  sourcePath: z.string().nullable()
})
export type DeliverableAttach = z.infer<typeof DeliverableAttachSchema>
