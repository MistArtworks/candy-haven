import { app } from 'electron'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  CpuSample,
  StorageSample,
  TelemetrySample,
  TelemetryState
} from '@shared/domain/telemetry'
import {
  TELEMETRY_HISTORY,
  TELEMETRY_INTERVAL_MS,
  createEmptySample
} from '@shared/domain/telemetry.constants'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import { TypedEmitter } from '@main/core/emitter'
import { readGpuAdapters, readGpuUtilisation, type GpuAdapter } from './gpu-probe'

const execFileAsync = promisify(execFile)
const logger = getLogger('telemetry')

/** GPU counters and disk queries are far heavier than os.cpus(); sample them less often. */
const GPU_EVERY_N_TICKS = 3
const STORAGE_EVERY_N_TICKS = 15

/**
 * How long the sampler stays alive after the last unsubscribe.
 *
 * Comfortably longer than a React effect remount or a navigation away and
 * straight back, and short enough that a genuinely closed view stops costing
 * anything almost immediately.
 */
const STOP_GRACE_MS = 1_500

interface TelemetryEvents {
  sample: TelemetryState
}

interface CpuTimesSnapshot {
  idle: number
  total: number
}

function readCpuTimes(): CpuTimesSnapshot[] {
  return os.cpus().map((core) => {
    const times = core.times
    const total = times.user + times.nice + times.sys + times.idle + times.irq
    return { idle: times.idle, total }
  })
}

/**
 * Host vitals sampler.
 *
 * CPU utilisation is derived from deltas between successive `os.cpus()` reads —
 * the raw values are cumulative tick counters, so a single read tells you
 * nothing about current load. The first tick therefore establishes a baseline
 * and reports zero.
 *
 * Sampling only runs while at least one renderer has subscribed, so an idle
 * app in the background costs nothing.
 */
export class TelemetryService extends TypedEmitter<TelemetryEvents> {
  private timer: NodeJS.Timeout | null = null
  private subscribers = 0
  private ticks = 0
  /** Pending teardown, held open briefly after the last unsubscribe. */
  private stopTimer: NodeJS.Timeout | null = null

  private previousCpu: CpuTimesSnapshot[] | null = null
  private adapters: GpuAdapter[] = []
  private gpuUsage: number | null = null
  private storage: StorageSample[] = []
  /** Guards against overlapping probes when a slow tick outlasts the interval. */
  private gpuProbeInFlight = false
  private storageProbeInFlight = false

  private state: TelemetryState = {
    latest: createEmptySample(),
    cpuHistory: [],
    memoryHistory: [],
    gpuHistory: [],
    ready: false
  }

  get snapshot(): TelemetryState {
    return this.state
  }

  /** Begins sampling. Reference-counted: safe to call from several views. */
  subscribe(): TelemetryState {
    this.subscribers += 1

    // A pending teardown means the sampler is still warm; keep it.
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }

    if (this.subscribers === 1) this.start()
    return this.state
  }

  /**
   * Releases one view's interest, tearing down shortly after the last.
   *
   * The delay is what stops the sampler thrashing. React re-runs effects on
   * mount in development, and navigating away and straight back does the same
   * in production — both produced an immediate stop/start pair, and since
   * `start` kicks off a GPU probe, each pair spawned a PowerShell process for a
   * sampler that was about to be recreated anyway. Four transitions inside four
   * milliseconds was the observed case.
   *
   * The guarantee is unchanged: nothing samples while nobody is watching. It
   * just takes a moment to believe that nobody is.
   */
  unsubscribe(): void {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers > 0 || this.stopTimer) return

    this.stopTimer = setTimeout(() => {
      this.stopTimer = null
      if (this.subscribers === 0) this.stop()
    }, STOP_GRACE_MS)
    this.stopTimer.unref?.()
  }

  private start(): void {
    if (this.timer) return
    logger.info('Telemetry sampling started')

    // Establish the CPU baseline immediately so the first reported sample,
    // one interval later, is a real measurement rather than a zero.
    this.previousCpu = readCpuTimes()
    void this.refreshGpu()

    this.timer = setInterval(() => void this.tick(), TELEMETRY_INTERVAL_MS)
    // Do not hold the event loop open purely for telemetry.
    this.timer.unref?.()
  }

  private stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.previousCpu = null
    this.ticks = 0
    logger.info('Telemetry sampling stopped')
  }

  dispose(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    this.subscribers = 0
    this.stop()
    this.clear()
  }

  // ------------------------------------------------------------------- ticks

  private async tick(): Promise<void> {
    try {
      this.ticks += 1

      if (this.ticks % GPU_EVERY_N_TICKS === 0) void this.refreshGpu()
      if (this.storage.length === 0 || this.ticks % STORAGE_EVERY_N_TICKS === 0) {
        void this.refreshStorage()
      }

      const sample = this.buildSample()

      this.state = {
        latest: sample,
        cpuHistory: push(this.state.cpuHistory, sample.cpu.usage),
        memoryHistory: push(this.state.memoryHistory, sample.memory.usage),
        gpuHistory: push(this.state.gpuHistory, sample.gpuSystemUsage ?? 0),
        ready: true
      }

      this.emit('sample', this.state)
    } catch (error) {
      logger.warn('Telemetry tick failed', error)
    }
  }

  private buildSample(): TelemetrySample {
    const cpu = this.sampleCpu()
    const memory = this.sampleMemory()
    const appSample = this.sampleApp()

    return {
      timestamp: Date.now(),
      cpu,
      memory,
      // Adapters already carry their own per-device figures where a vendor tool
      // supplied one. The counter-derived number is system-wide and is reported
      // separately rather than being pinned to an arbitrary adapter.
      gpus: this.adapters,
      gpuSystemUsage: this.gpuUsage,
      storage: this.storage,
      app: appSample,
      host: {
        platform: `${os.type()} ${os.arch()}`,
        release: os.release(),
        hostname: os.hostname(),
        uptimeSeconds: os.uptime()
      }
    }
  }

  private sampleCpu(): CpuSample {
    const cores = os.cpus()
    const current = readCpuTimes()
    const previous = this.previousCpu
    this.previousCpu = current

    const perCore = current.map((core, index) => {
      const before = previous?.[index]
      if (!before) return 0

      const idleDelta = core.idle - before.idle
      const totalDelta = core.total - before.total
      // A zero delta means no ticks elapsed for this core; report idle rather
      // than dividing by zero.
      if (totalDelta <= 0) return 0

      return clamp01(1 - idleDelta / totalDelta)
    })

    const usage = perCore.length
      ? clamp01(perCore.reduce((sum, value) => sum + value, 0) / perCore.length)
      : 0

    return {
      usage,
      perCore,
      model: cores[0]?.model?.trim() ?? null,
      cores: cores.length,
      speedMhz: cores[0]?.speed ?? 0
    }
  }

  private sampleMemory(): TelemetrySample['memory'] {
    const total = os.totalmem()
    const free = os.freemem()
    const used = Math.max(total - free, 0)

    let appWorkingSet = 0
    try {
      for (const metric of app.getAppMetrics()) {
        appWorkingSet += (metric.memory?.workingSetSize ?? 0) * 1024
      }
    } catch {
      // getAppMetrics can throw during shutdown; the figure is non-essential.
    }

    return {
      total,
      used,
      free,
      usage: total > 0 ? clamp01(used / total) : 0,
      appWorkingSet
    }
  }

  private sampleApp(): TelemetrySample['app'] {
    let cpuPercent = 0
    let memoryBytes = 0
    let processes = 0

    try {
      const metrics = app.getAppMetrics()
      processes = metrics.length
      for (const metric of metrics) {
        cpuPercent += metric.cpu?.percentCPUUsage ?? 0
        memoryBytes += (metric.memory?.workingSetSize ?? 0) * 1024
      }
    } catch {
      // Non-essential; leave the zeros.
    }

    const coreCount = os.cpus().length || 1

    return {
      uptimeSeconds: process.uptime(),
      processes,
      // percentCPUUsage is per-core, so a 4-core machine can report up to 400.
      // Normalise against the core count to keep the ratio in 0..1.
      cpuUsage: clamp01(cpuPercent / 100 / coreCount),
      memoryBytes
    }
  }

  // ------------------------------------------------------------- slow probes

  /**
   * Refreshes both the adapter list (which carries live per-device utilisation,
   * VRAM and temperature) and the system-wide counter figure.
   */
  private async refreshGpu(): Promise<void> {
    if (this.gpuProbeInFlight) return
    this.gpuProbeInFlight = true
    try {
      const [adapters, systemUsage] = await Promise.all([readGpuAdapters(), readGpuUtilisation()])
      this.adapters = adapters
      this.gpuUsage = systemUsage
    } finally {
      this.gpuProbeInFlight = false
    }
  }

  /**
   * Reads fixed-disk capacity via WMI. Flagged against the archive's own volume
   * so the operator can see whether the database has room to grow.
   */
  private async refreshStorage(): Promise<void> {
    if (this.storageProbeInFlight) return
    this.storageProbeInFlight = true

    try {
      const script =
        "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | " +
        'Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress'

      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 8_000, windowsHide: true }
      )

      const parsed: unknown = JSON.parse(stdout.trim() || 'null')
      if (!parsed) return

      // A single disk deserialises as an object rather than an array.
      const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{
        DeviceID?: string
        Size?: number | string
        FreeSpace?: number | string
      }>

      const archiveVolume = getPaths().archiveData.slice(0, 2).toUpperCase()

      this.storage = rows
        .map((row) => {
          const volume = String(row.DeviceID ?? '').toUpperCase()
          const total = Number(row.Size ?? 0)
          const free = Number(row.FreeSpace ?? 0)
          const used = Math.max(total - free, 0)

          return {
            volume,
            total,
            free,
            used,
            usage: total > 0 ? clamp01(used / total) : 0,
            holdsArchive: volume === archiveVolume
          }
        })
        .filter((entry) => entry.total > 0)
    } catch (error) {
      logger.warn('Storage probe failed', error)
    } finally {
      this.storageProbeInFlight = false
    }
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

/** Appends to a fixed-length history window, dropping the oldest entry. */
function push(history: number[], value: number): number[] {
  const next = [...history, value]
  return next.length > TELEMETRY_HISTORY ? next.slice(next.length - TELEMETRY_HISTORY) : next
}
