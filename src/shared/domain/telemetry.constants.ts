import type { TelemetrySample } from './telemetry'

/**
 * Zod-free half of the telemetry domain — see boot.constants.ts for why the
 * split exists. The renderer needs these values; it never needs the validators.
 */

/** How often the main process samples host vitals while a renderer is watching. */
export const TELEMETRY_INTERVAL_MS = 1_000

/**
 * Samples retained per series. At a 1s cadence this is a two-minute window,
 * which is long enough to show a spike's shape without the sparkline becoming
 * an unreadable smear.
 */
export const TELEMETRY_HISTORY = 120

/**
 * Utilisation thresholds, as ratios. These drive the status colour *and* the
 * accompanying text label — the label is what carries the meaning, since colour
 * alone must never encode state.
 */
export const LOAD_THRESHOLD = {
  elevated: 0.75,
  critical: 0.9
} as const

export type LoadLevel = 'nominal' | 'elevated' | 'critical'

export function classifyLoad(ratio: number): LoadLevel {
  if (ratio >= LOAD_THRESHOLD.critical) return 'critical'
  if (ratio >= LOAD_THRESHOLD.elevated) return 'elevated'
  return 'nominal'
}

/** Operator-facing word for each level. Always rendered alongside the colour. */
export const LOAD_LABEL: Record<LoadLevel, string> = {
  nominal: 'NOMINAL',
  elevated: 'ELEVATED',
  critical: 'CRITICAL'
}

export function createEmptySample(): TelemetrySample {
  return {
    timestamp: Date.now(),
    cpu: { usage: 0, perCore: [], model: null, cores: 0, speedMhz: 0 },
    memory: { total: 0, used: 0, free: 0, usage: 0, appWorkingSet: 0 },
    gpus: [],
    gpuSystemUsage: null,
    storage: [],
    app: { uptimeSeconds: 0, processes: 0, cpuUsage: 0, memoryBytes: 0 },
    host: { platform: '', release: '', hostname: '', uptimeSeconds: 0 }
  }
}
