import { z } from 'zod'

/**
 * "Archive" is the in-app name for the embedded MongoDB instance
 * (lore: The Archive — endless halls of memory).
 */

export const ArchiveStateSchema = z.enum([
  'offline',
  'locating',
  'provisioning',
  'starting',
  'connecting',
  'online',
  'degraded',
  'error'
])
export type ArchiveState = z.infer<typeof ArchiveStateSchema>

/** Where the mongod binary was found — surfaced in diagnostics. */
export const ArchiveBinarySourceSchema = z.enum([
  'installer',
  'user-data',
  'system',
  'path',
  'configured'
])
export type ArchiveBinarySource = z.infer<typeof ArchiveBinarySourceSchema>

export const ArchiveBinaryInfoSchema = z.object({
  executablePath: z.string(),
  source: ArchiveBinarySourceSchema,
  version: z.string().nullable()
})
export type ArchiveBinaryInfo = z.infer<typeof ArchiveBinaryInfoSchema>

export const ProvisionPhaseSchema = z.enum(['idle', 'download', 'extract', 'verify', 'done'])
export type ProvisionPhase = z.infer<typeof ProvisionPhaseSchema>

export const ProvisionProgressSchema = z.object({
  phase: ProvisionPhaseSchema,
  receivedBytes: z.number().min(0),
  totalBytes: z.number().min(0),
  /** 0..1; falls back to indeterminate (-1) when content-length is unknown. */
  ratio: z.number(),
  message: z.string()
})
export type ProvisionProgress = z.infer<typeof ProvisionProgressSchema>

export const ArchiveStatusSchema = z.object({
  state: ArchiveStateSchema,
  binary: ArchiveBinaryInfoSchema.nullable(),
  dataPath: z.string().nullable(),
  logPath: z.string().nullable(),
  port: z.number().int().nullable(),
  /** Server version reported by the running daemon. */
  serverVersion: z.string().nullable(),
  /** Round-trip latency of the most recent ping, in milliseconds. */
  latencyMs: z.number().nullable(),
  /** Number of times the supervisor has restarted the daemon this session. */
  restarts: z.number().int().min(0),
  provision: ProvisionProgressSchema.nullable(),
  message: z.string().nullable(),
  updatedAt: z.number()
})
export type ArchiveStatus = z.infer<typeof ArchiveStatusSchema>

export { createInitialArchiveStatus } from './archive.constants'
