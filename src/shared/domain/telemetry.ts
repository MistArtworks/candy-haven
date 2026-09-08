import { z } from 'zod'

/**
 * Host telemetry: processor, memory, graphics and storage vitals for the
 * machine Candy Haven is running on.
 *
 * Ratios are 0..1 throughout, never 0..100 — the renderer formats for display.
 * Byte counts are raw bytes.
 */

export const CpuSampleSchema = z.object({
  /** Aggregate utilisation across all cores, 0..1. */
  usage: z.number().min(0).max(1),
  /** Per-core utilisation, 0..1, in the order the OS reports cores. */
  perCore: z.array(z.number().min(0).max(1)),
  model: z.string().nullable(),
  cores: z.number().int().min(0),
  speedMhz: z.number().min(0)
})
export type CpuSample = z.infer<typeof CpuSampleSchema>

export const MemorySampleSchema = z.object({
  total: z.number().min(0),
  used: z.number().min(0),
  free: z.number().min(0),
  usage: z.number().min(0).max(1),
  /** Resident memory of the Electron application itself. */
  appWorkingSet: z.number().min(0)
})
export type MemorySample = z.infer<typeof MemorySampleSchema>

export const GpuSampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string().nullable(),
  driverVersion: z.string().nullable(),
  /**
   * Per-adapter utilisation 0..1, or null when no authoritative per-device
   * source exists for this GPU. Windows performance counters are per *engine*
   * and cannot be mapped back to a named adapter, so only vendors shipping a
   * query tool (currently NVIDIA, via nvidia-smi) report a real figure here.
   */
  usage: z.number().min(0).max(1).nullable(),
  /** Where `usage` came from, so the UI can be honest about provenance. */
  usageSource: z.enum(['nvidia-smi', 'counters']).nullable(),
  memoryUsedBytes: z.number().min(0).nullable(),
  memoryTotalBytes: z.number().min(0).nullable(),
  temperatureC: z.number().nullable(),
  /** True for the adapter Chromium is actually rendering with. */
  active: z.boolean()
})
export type GpuSample = z.infer<typeof GpuSampleSchema>

export const StorageSampleSchema = z.object({
  /** Drive root, e.g. `C:`. */
  volume: z.string(),
  total: z.number().min(0),
  free: z.number().min(0),
  used: z.number().min(0),
  usage: z.number().min(0).max(1),
  /** True for the volume holding the archive's data directory. */
  holdsArchive: z.boolean()
})
export type StorageSample = z.infer<typeof StorageSampleSchema>

export const AppSampleSchema = z.object({
  uptimeSeconds: z.number().min(0),
  /** Number of processes in the Electron process tree. */
  processes: z.number().int().min(0),
  /** Aggregate CPU share of the app's own processes, 0..1. */
  cpuUsage: z.number().min(0).max(1),
  memoryBytes: z.number().min(0)
})
export type AppSample = z.infer<typeof AppSampleSchema>

export const HostSampleSchema = z.object({
  platform: z.string(),
  release: z.string(),
  hostname: z.string(),
  uptimeSeconds: z.number().min(0)
})
export type HostSample = z.infer<typeof HostSampleSchema>

export const TelemetrySampleSchema = z.object({
  timestamp: z.number(),
  cpu: CpuSampleSchema,
  memory: MemorySampleSchema,
  gpus: z.array(GpuSampleSchema),
  /**
   * Busiest-engine utilisation across all adapters, 0..1, or null when
   * counters are unavailable. Spans the whole system — not any one GPU.
   */
  gpuSystemUsage: z.number().min(0).max(1).nullable(),
  storage: z.array(StorageSampleSchema),
  app: AppSampleSchema,
  host: HostSampleSchema
})
export type TelemetrySample = z.infer<typeof TelemetrySampleSchema>

/** A sample plus the recent history the renderer plots. */
export const TelemetryStateSchema = z.object({
  latest: TelemetrySampleSchema,
  /** Oldest first. Trimmed to TELEMETRY_HISTORY entries. */
  cpuHistory: z.array(z.number().min(0).max(1)),
  memoryHistory: z.array(z.number().min(0).max(1)),
  gpuHistory: z.array(z.number().min(0).max(1)),
  /** False until the first successful sample completes. */
  ready: z.boolean()
})
export type TelemetryState = z.infer<typeof TelemetryStateSchema>

export {
  TELEMETRY_INTERVAL_MS,
  TELEMETRY_HISTORY,
  LOAD_THRESHOLD,
  LOAD_LABEL,
  classifyLoad,
  createEmptySample,
  type LoadLevel
} from './telemetry.constants'
