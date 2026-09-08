import { z } from 'zod'
import { BOOT_STAGE_IDS, type BootStageId } from './boot.constants'

/**
 * Schema half of the boot domain.
 *
 * Imported by the main process (to validate IPC payloads) and, type-only, by
 * the renderer. Runtime values the renderer actually needs — the stage table,
 * the log limit, the initial snapshot — live in boot.constants.ts so that
 * importing them does not drag zod into the renderer bundle.
 */

export type { BootStageId }
export {
  BOOT_STAGE_IDS,
  BOOT_STAGES,
  BOOT_LOG_LIMIT,
  createInitialBootSnapshot
} from './boot.constants'

export const BootStageIdSchema = z.enum(BOOT_STAGE_IDS)

export interface BootStageDefinition {
  id: BootStageId
  /** Thematic label shown in the boot ring. */
  label: string
  /** Plain-language description of the work actually performed. */
  description: string
  /** Relative contribution to overall progress. */
  weight: number
  /** Stages that only run conditionally (e.g. first-run provisioning). */
  conditional?: boolean
}

export const BootStageStatusSchema = z.enum(['pending', 'active', 'complete', 'skipped', 'failed'])
export type BootStageStatus = z.infer<typeof BootStageStatusSchema>

export const BootPhaseSchema = z.enum(['idle', 'running', 'ready', 'failed'])
export type BootPhase = z.infer<typeof BootPhaseSchema>

export const BootFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Operator-facing remediation hint, when one is known. */
  hint: z.string().nullable(),
  /** Whether retrying the boot sequence is expected to help. */
  recoverable: z.boolean()
})
export type BootFailure = z.infer<typeof BootFailureSchema>

export const BootStageStateSchema = z.object({
  id: BootStageIdSchema,
  status: BootStageStatusSchema,
  /** Progress within this stage, 0..1. */
  progress: z.number().min(0).max(1),
  /** Short status line, e.g. "mongod 8.0.29 · port 27917". */
  detail: z.string().nullable(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable()
})
export type BootStageState = z.infer<typeof BootStageStateSchema>

export const BootLogLevelSchema = z.enum(['trace', 'info', 'warn', 'error'])
export type BootLogLevel = z.infer<typeof BootLogLevelSchema>

export const BootLogEntrySchema = z.object({
  id: z.string(),
  level: BootLogLevelSchema,
  message: z.string(),
  stageId: BootStageIdSchema.nullable(),
  timestamp: z.number()
})
export type BootLogEntry = z.infer<typeof BootLogEntrySchema>

export const BootSnapshotSchema = z.object({
  phase: BootPhaseSchema,
  /** Weighted completion across all applicable stages, 0..1. */
  overall: z.number().min(0).max(1),
  activeStageId: BootStageIdSchema.nullable(),
  stages: z.array(BootStageStateSchema),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  failure: BootFailureSchema.nullable(),
  /** Incremented on every retry so the renderer can reset local animation state. */
  attempt: z.number().int().min(0),
  /**
   * Rolling boot log. Carried on the snapshot so a renderer that subscribes
   * late still receives the full history in a single call.
   */
  logs: z.array(BootLogEntrySchema)
})
export type BootSnapshot = z.infer<typeof BootSnapshotSchema>
