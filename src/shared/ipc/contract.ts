import { z } from 'zod'
import { BootSnapshotSchema } from '../domain/boot'
import { ArchiveStatusSchema } from '../domain/archive'
import { SettingsPatchSchema, SettingsSchema } from '../domain/settings'
import { RuntimeInfoSchema, WindowStateSchema } from '../domain/system'
import { UpdateStatusSchema } from '../domain/update'
import { TelemetryStateSchema } from '../domain/telemetry'
import {
  OverlayServerInfoSchema,
  PetitionDraftSchema,
  RiteConfigPatchSchema,
  RiteStateSchema
} from '../domain/rite'
import {
  MarketingAssetKindSchema,
  MarketingAssetSchema,
  NoteDraftSchema,
  ProjectPatchSchema,
  ProjectQuerySchema,
  ProjectRecordSchema,
  ProjectRegistrySchema,
  ScanStateSchema,
  UnlinkedMediaSchema
} from '../domain/projects'

/**
 * The IPC contract is declared once, here, and consumed by:
 *   - the main-process router, which validates inputs and outputs at runtime
 *   - the preload bridge, which rejects any channel not declared below
 *   - the renderer, which derives its call signatures from these schemas
 *
 * Adding a channel therefore requires exactly one edit, and every consumer
 * stays type-checked against it.
 */

/** Renderer -> main request/response channels. */
export const IPC_INVOKE = {
  'runtime:info': { input: z.void(), output: RuntimeInfoSchema },

  'window:minimize': { input: z.void(), output: z.void() },
  'window:toggle-maximize': { input: z.void(), output: WindowStateSchema },
  'window:close': { input: z.void(), output: z.void() },
  'window:state': { input: z.void(), output: WindowStateSchema },

  'boot:snapshot': { input: z.void(), output: BootSnapshotSchema },
  'boot:retry': { input: z.void(), output: BootSnapshotSchema },
  /** Renderer signals the boot cinematic has finished; main reveals the window. */
  'boot:enter': { input: z.void(), output: z.void() },

  'archive:status': { input: z.void(), output: ArchiveStatusSchema },
  'archive:provision': { input: z.void(), output: ArchiveStatusSchema },
  'archive:restart': { input: z.void(), output: ArchiveStatusSchema },

  'settings:get': { input: z.void(), output: SettingsSchema },
  'settings:update': { input: SettingsPatchSchema, output: SettingsSchema },
  'settings:reset': { input: z.void(), output: SettingsSchema },

  'update:status': { input: z.void(), output: UpdateStatusSchema },
  'update:check': { input: z.void(), output: UpdateStatusSchema },
  'update:download': { input: z.void(), output: UpdateStatusSchema },
  'update:install': { input: z.void(), output: z.void() },

  /** Reference-counted: sampling runs only while a view is watching. */
  'telemetry:subscribe': { input: z.void(), output: TelemetryStateSchema },
  'telemetry:unsubscribe': { input: z.void(), output: z.void() },

  /**
   * Project registry (ARCHIVE section). Reads return summaries; the dossier
   * fetches one full record on demand, so listing hundreds of projects does not
   * move every track name and sample path across the boundary.
   */
  'projects:registry': { input: ProjectQuerySchema.optional(), output: ProjectRegistrySchema },
  'projects:get': { input: z.object({ id: z.string() }), output: ProjectRecordSchema },
  'projects:patch': {
    input: z.object({ id: z.string(), patch: ProjectPatchSchema }),
    output: ProjectRecordSchema
  },
  /** `force` re-reads every set instead of reusing unchanged analyses. */
  'projects:scan': {
    input: z.object({ force: z.boolean().optional() }).optional(),
    output: ScanStateSchema
  },
  'projects:scan-cancel': { input: z.void(), output: ScanStateSchema },
  'projects:scan-state': { input: z.void(), output: ScanStateSchema },
  'projects:note-add': {
    input: z.object({ id: z.string(), draft: NoteDraftSchema }),
    output: ProjectRecordSchema
  },
  'projects:note-update': {
    input: z.object({ id: z.string(), noteId: z.string(), draft: NoteDraftSchema }),
    output: ProjectRecordSchema
  },
  'projects:note-delete': {
    input: z.object({ id: z.string(), noteId: z.string() }),
    output: ProjectRecordSchema
  },
  'projects:marketing-add': {
    input: z.object({ id: z.string(), kind: MarketingAssetKindSchema }),
    output: ProjectRecordSchema
  },
  'projects:marketing-upsert': {
    input: z.object({ id: z.string(), asset: MarketingAssetSchema }),
    output: ProjectRecordSchema
  },
  'projects:marketing-remove': {
    input: z.object({ id: z.string(), assetId: z.string() }),
    output: ProjectRecordSchema
  },
  'projects:forget': { input: z.object({ id: z.string() }), output: z.void() },
  'projects:unlinked': {
    input: z.object({ limit: z.number().int().min(1).max(2000) }).optional(),
    output: z.array(UnlinkedMediaSchema)
  },
  /** Decoded and downscaled in main: the renderer CSP forbids `file:` images. */
  'projects:thumbnail': {
    input: z.object({ path: z.string(), width: z.number().int().min(32).max(1024).optional() }),
    output: z.string().nullable()
  },

  /**
   * Selection rite (OBSERVATORY section). The winner is drawn in main and
   * travels inside the spin command, so the console and every browser source
   * animate toward one predetermined result rather than each rolling their own.
   */
  'rite:state': { input: z.void(), output: RiteStateSchema },
  'rite:petition-add': { input: PetitionDraftSchema, output: RiteStateSchema },
  'rite:petition-remove': { input: z.object({ id: z.string() }), output: RiteStateSchema },
  'rite:petition-weight': {
    input: z.object({ id: z.string(), weight: z.number().int().min(1).max(999) }),
    output: RiteStateSchema
  },
  'rite:petitions-clear': { input: z.void(), output: RiteStateSchema },
  'rite:config': { input: RiteConfigPatchSchema, output: RiteStateSchema },
  'rite:spin': { input: z.void(), output: RiteStateSchema },
  'rite:reset': { input: z.void(), output: RiteStateSchema },
  'rite:history-clear': { input: z.void(), output: RiteStateSchema },

  'overlay:info': { input: z.void(), output: OverlayServerInfoSchema },
  /** Rebinds the server, picking up a changed port from settings. */
  'overlay:restart': { input: z.void(), output: OverlayServerInfoSchema },

  'shell:open-external': { input: z.object({ url: z.string() }), output: z.void() },
  'shell:reveal': { input: z.object({ path: z.string() }), output: z.void() },
  'dialog:select-directory': {
    input: z.object({ title: z.string().optional() }).optional(),
    output: z.string().nullable()
  },
  'dialog:select-file': {
    input: z
      .object({
        title: z.string().optional(),
        filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional()
      })
      .optional(),
    output: z.string().nullable()
  }
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>

export type InvokeMap = typeof IPC_INVOKE
export type InvokeChannel = keyof InvokeMap
export type InvokeInput<C extends InvokeChannel> = z.infer<InvokeMap[C]['input']>
export type InvokeOutput<C extends InvokeChannel> = z.infer<InvokeMap[C]['output']>

export const INVOKE_CHANNELS = Object.keys(IPC_INVOKE) as InvokeChannel[]

/** Main -> renderer push channels. */
export const IPC_EVENT = {
  'boot:progress': BootSnapshotSchema,
  'archive:status': ArchiveStatusSchema,
  'update:status': UpdateStatusSchema,
  'telemetry:sample': TelemetryStateSchema,
  'projects:scan': ScanStateSchema,
  'rite:state': RiteStateSchema,
  'overlay:info': OverlayServerInfoSchema,
  'window:state': WindowStateSchema
} satisfies Record<string, z.ZodType>

export type EventMap = typeof IPC_EVENT
export type EventChannel = keyof EventMap
export type EventPayload<C extends EventChannel> = z.infer<EventMap[C]>

export const EVENT_CHANNELS = Object.keys(IPC_EVENT) as EventChannel[]

/** Structured error shape carried across the process boundary. */
export interface SerializedError {
  name: string
  code: string
  message: string
  /** Operator-facing remediation hint, when one is known. */
  hint: string | null
  recoverable: boolean
  stack?: string
}

export type IpcResponse<T> = { ok: true; data: T } | { ok: false; error: SerializedError }
