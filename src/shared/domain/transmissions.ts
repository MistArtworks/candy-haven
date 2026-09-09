import { z } from 'zod'
import { sparseShape } from './patch'
import {
  IsoDateSchema,
  MarketingAssetSchema,
  ProjectStageSchema,
  ReleaseKindSchema
} from './projects'
import {
  TRANSMISSION_ENTRY_KINDS,
  COLLISION_SEVERITIES,
  TRANSMISSION_VIEW_MODES
} from './transmissions.constants'

/**
 * TRANSMISSIONS — the scheduling department.
 *
 * Almost everything here is *derived*. A release date lives on a project's
 * distribution details and a promotional deliverable's date lives on its
 * marketing plan; both belong to ARCHIVE, and this department reads them rather
 * than keeping a second copy that could disagree. The schedule below is a
 * projection rebuilt on demand, not a stored record.
 *
 * The exception is `TransmissionTask`, which is the one thing this department
 * genuinely owns — see its own doc comment.
 *
 * Schemas only. The zod-free half is in transmissions.constants.ts, which is
 * what the renderer imports as values.
 */

export const TransmissionEntryKindSchema = z.enum(TRANSMISSION_ENTRY_KINDS)
export type TransmissionEntryKind = z.infer<typeof TransmissionEntryKindSchema>

export const CollisionSeveritySchema = z.enum(COLLISION_SEVERITIES)
export type CollisionSeverity = z.infer<typeof CollisionSeveritySchema>

export const TransmissionViewModeSchema = z.enum(TRANSMISSION_VIEW_MODES)
export type TransmissionViewMode = z.infer<typeof TransmissionViewModeSchema>

/**
 * A dated work item the operator files themselves.
 *
 * Deliberately not a marketing asset. A marketing asset is a deliverable owed
 * by a release's plan, seeded from the kind table and re-dated when the release
 * moves; a task is whatever the operator decides belongs on a day — renew the
 * distributor subscription, call the mastering engineer, film something. It has
 * no kind, no readiness and no bearing on whether a release is ready.
 *
 * `projectId` is optional and is a *reference*, not ownership: a task can hang
 * off a campaign for context without becoming part of its plan, and deleting
 * nothing about the project changes the task.
 */
export const TransmissionTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The day this is assigned to. A calendar date, never an instant. */
  date: IsoDateSchema,
  notes: z.string().default(''),
  done: z.boolean().default(false),
  /** Project this hangs off, if any. Not an owning relationship. */
  projectId: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type TransmissionTask = z.infer<typeof TransmissionTaskSchema>

export const TransmissionTaskDraftSchema = z.object({
  title: z.string().min(1).max(200),
  date: IsoDateSchema,
  notes: z.string().max(2000).default(''),
  projectId: z.string().nullable().default(null)
})
export type TransmissionTaskDraft = z.infer<typeof TransmissionTaskDraftSchema>

/**
 * A sparse patch, built with `sparseShape` rather than `.partial()`.
 *
 * Not stylistic — see domain/patch.ts, which documents the three times the
 * distinction has already cost this project data. `notes` and `done` both carry
 * defaults so a document written by an earlier build still parses, and
 * `.partial()` would re-materialise those defaults for keys the renderer never
 * sent: ticking a task done would blank its notes on the way through.
 */

/** The fields an operator may rewrite. Identity and stamps are ours to set. */
type EditableTask = Omit<TransmissionTask, 'id' | 'createdAt' | 'updatedAt'>

/** Every editable field, unwrapped out of its default and made optional. */
type TransmissionTaskPatchShape = {
  [K in keyof EditableTask]: z.ZodOptional<z.ZodType<EditableTask[K]>>
}

// `Object.fromEntries` inside `sparseShape` erases key types, so the mapping
// has to be asserted — as it is for the rite config.
const transmissionTaskPatchShape = sparseShape(
  TransmissionTaskSchema.omit({ id: true, createdAt: true, updatedAt: true }).shape
) as unknown as TransmissionTaskPatchShape

export const TransmissionTaskPatchSchema = z.object(transmissionTaskPatchShape)
export type TransmissionTaskPatch = z.infer<typeof TransmissionTaskPatchSchema>

/**
 * One dated thing on the calendar, flattened out of its owner.
 *
 * The flattening is the point. A calendar asks "what is on the 14th", and
 * answering that from the record shapes would mean shipping every project in
 * full — every track name, plugin and sample path — to draw a grid of dates.
 * `ProjectSummary` exists to prevent exactly that for the register, and this
 * serves the same purpose for the schedule.
 *
 * `asset` and `task` carry their whole source record even so, because both are
 * small and because the calendar can *rewrite* a date: without them, moving a
 * deliverable would need a second round trip to fetch the record it belongs to
 * before it could write it back.
 */
export const ScheduleEntrySchema = z.object({
  /** Stable across rebuilds: `<projectId>:release`, `<projectId>:asset:<id>`, `task:<id>`. */
  id: z.string(),
  kind: TransmissionEntryKindSchema,
  date: IsoDateSchema,
  /** Null only for a task filed against no project. */
  projectId: z.string().nullable(),
  projectName: z.string(),
  /** Release title, deliverable title, or task title. */
  title: z.string(),
  primaryArtist: z.string(),
  stage: ProjectStageSchema.nullable(),
  releaseKind: ReleaseKindSchema.nullable(),
  /** Present on promotion entries only. */
  asset: MarketingAssetSchema.nullable(),
  /** Present on task entries only. */
  task: TransmissionTaskSchema.nullable(),
  /** Ready to go out, already gone out, or ticked off. */
  settled: z.boolean()
})
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

export const ScheduleCollisionSchema = z.object({
  date: IsoDateSchema,
  severity: CollisionSeveritySchema,
  /** Operator-facing sentence naming what actually clashes. */
  reason: z.string(),
  entryIds: z.array(z.string())
})
export type ScheduleCollision = z.infer<typeof ScheduleCollisionSchema>

/**
 * The submission window for one release.
 *
 * `submitBy` is derived, never stored: a distributor needs the finished package
 * some number of days before the date it goes live, and that lead time is one
 * operator setting rather than a field on every project.
 */
export const ReleaseWindowSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  title: z.string(),
  releaseDate: IsoDateSchema,
  submitBy: IsoDateSchema,
  leadDays: z.number().int(),
  /** The submission date has passed and the release has not gone out. */
  overdue: z.boolean()
})
export type ReleaseWindow = z.infer<typeof ReleaseWindowSchema>

export const TransmissionScheduleSchema = z.object({
  entries: z.array(ScheduleEntrySchema),
  collisions: z.array(ScheduleCollisionSchema),
  windows: z.array(ReleaseWindowSchema),
  /** Echoed from settings so the renderer can label a window without reading it. */
  leadDays: z.number().int(),
  /** Projects excluded as missing from disk or shelved, for an honest footnote. */
  excludedCount: z.number().int().min(0),
  generatedAt: z.number()
})
export type TransmissionSchedule = z.infer<typeof TransmissionScheduleSchema>
