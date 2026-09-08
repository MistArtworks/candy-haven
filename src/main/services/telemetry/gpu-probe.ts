import { app } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getLogger } from '@main/core/logger'

const execFileAsync = promisify(execFile)
const logger = getLogger('telemetry:gpu')

const NVIDIA_SMI = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe')

export interface GpuAdapter {
  id: string
  name: string
  vendor: string | null
  driverVersion: string | null
  usage: number | null
  usageSource: 'nvidia-smi' | 'counters' | null
  memoryUsedBytes: number | null
  memoryTotalBytes: number | null
  temperatureC: number | null
  active: boolean
}

interface WmiAdapter {
  name: string
  vendor: string | null
  driverVersion: string | null
  adapterRam: number | null
  vendorId: number | null
  deviceId: number | null
}

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

/** PowerShell emits a bare object rather than an array for a single result. */
function toArray<T>(value: unknown): T[] {
  if (value === null || value === undefined) return []
  return (Array.isArray(value) ? value : [value]) as T[]
}

/**
 * Enumerates every graphics adapter Windows knows about.
 *
 * Chromium's own `getGPUInfo` is *not* used for enumeration: it reports the
 * adapter Chromium is rendering with, so on a hybrid laptop it lists one GPU
 * and hides the other. WMI is authoritative for what hardware is present.
 */
async function readWmiAdapters(): Promise<WmiAdapter[]> {
  try {
    const script =
      'Get-CimInstance Win32_VideoController | ' +
      'Select-Object Name,AdapterCompatibility,DriverVersion,AdapterRAM,PNPDeviceID | ' +
      'ConvertTo-Json -Compress'

    const { stdout } = await execFileAsync('powershell.exe', [...POWERSHELL_ARGS, script], {
      timeout: 8_000,
      windowsHide: true
    })

    const rows = toArray<{
      Name?: string
      AdapterCompatibility?: string
      DriverVersion?: string
      AdapterRAM?: number
      PNPDeviceID?: string
    }>(JSON.parse(stdout.trim() || 'null'))

    return rows
      .filter((row) => row.Name)
      .map((row) => {
        // PNPDeviceID looks like PCI\VEN_10DE&DEV_2D19&SUBSYS_...
        const ids = /VEN_([0-9A-F]{4})&DEV_([0-9A-F]{4})/i.exec(row.PNPDeviceID ?? '')

        return {
          name: String(row.Name).trim(),
          vendor: row.AdapterCompatibility?.trim() || null,
          driverVersion: row.DriverVersion?.trim() || null,
          adapterRam: typeof row.AdapterRAM === 'number' ? row.AdapterRAM : null,
          vendorId: ids ? Number.parseInt(ids[1], 16) : null,
          deviceId: ids ? Number.parseInt(ids[2], 16) : null
        }
      })
  } catch (error) {
    logger.warn('Could not enumerate adapters via WMI', error)
    return []
  }
}

interface NvidiaStats {
  name: string
  usage: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  temperatureC: number | null
}

/**
 * Per-GPU statistics for NVIDIA adapters.
 *
 * Windows performance counters report GPU work per *engine*, not per adapter,
 * with no reliable way to map a counter LUID back to an adapter name. nvidia-smi
 * gives an authoritative per-device figure, so NVIDIA hardware gets a real
 * reading instead of an inferred one.
 */
async function readNvidiaStats(): Promise<NvidiaStats[]> {
  try {
    const { stdout } = await execFileAsync(
      NVIDIA_SMI,
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
        '--format=csv,noheader,nounits'
      ],
      { timeout: 6_000, windowsHide: true }
    )

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, usage, used, total, temp] = line.split(',').map((part) => part.trim())
        return {
          name,
          usage: Math.min(Math.max(Number.parseFloat(usage) / 100, 0), 1),
          // nvidia-smi reports MiB.
          memoryUsedBytes: Number.parseFloat(used) * 1024 * 1024,
          memoryTotalBytes: Number.parseFloat(total) * 1024 * 1024,
          temperatureC: Number.isFinite(Number.parseFloat(temp)) ? Number.parseFloat(temp) : null
        }
      })
      .filter((entry) => Number.isFinite(entry.usage))
  } catch {
    // Expected on machines without NVIDIA hardware or drivers.
    return []
  }
}

/** Device IDs of the adapter Chromium is actually rendering with. */
async function readActiveDeviceIds(): Promise<{ vendorId?: number; deviceId?: number } | null> {
  try {
    const info = (await app.getGPUInfo('complete')) as {
      gpuDevice?: Array<{ vendorId?: number; deviceId?: number; active?: boolean }>
    }
    const devices = info.gpuDevice ?? []
    return devices.find((device) => device.active) ?? devices[0] ?? null
  } catch {
    return null
  }
}

/**
 * Builds the adapter list: every physical GPU, each with the best utilisation
 * source available for it, and a flag for whichever one Chromium is using.
 */
export async function readGpuAdapters(): Promise<GpuAdapter[]> {
  const [wmi, nvidia, activeIds] = await Promise.all([
    readWmiAdapters(),
    readNvidiaStats(),
    readActiveDeviceIds()
  ])

  // Consume each nvidia-smi row at most once, so two identical cards do not
  // both bind to the first reading.
  const unclaimed = [...nvidia]

  return wmi.map((adapter, index) => {
    let stats: NvidiaStats | undefined

    if (adapter.vendor?.toUpperCase().includes('NVIDIA')) {
      const matchIndex = unclaimed.findIndex(
        (entry) => entry.name.toLowerCase() === adapter.name.toLowerCase()
      )
      const claimIndex = matchIndex >= 0 ? matchIndex : unclaimed.length > 0 ? 0 : -1
      if (claimIndex >= 0) stats = unclaimed.splice(claimIndex, 1)[0]
    }

    const active =
      activeIds !== null &&
      adapter.vendorId !== null &&
      activeIds.vendorId === adapter.vendorId &&
      (activeIds.deviceId === undefined || activeIds.deviceId === adapter.deviceId)

    return {
      id: `${adapter.vendorId ?? 'x'}:${adapter.deviceId ?? index}`,
      name: adapter.name,
      vendor: adapter.vendor,
      driverVersion: adapter.driverVersion,
      usage: stats?.usage ?? null,
      usageSource: stats ? 'nvidia-smi' : null,
      memoryUsedBytes: stats?.memoryUsedBytes ?? null,
      // WMI's AdapterRAM is a 32-bit field and silently caps around 4 GB — an
      // 8 GB card reports 4 GB. Prefer the vendor tool's figure when present.
      memoryTotalBytes: stats?.memoryTotalBytes ?? adapter.adapterRam,
      temperatureC: stats?.temperatureC ?? null,
      active
    }
  })
}

/**
 * System-wide GPU utilisation from Windows performance counters.
 *
 * Counter instances are per process *and* per engine (3D, copy, videoencode,
 * …). The correct aggregate is: sum each engine type across processes, then
 * take the busiest engine type — the same figure Task Manager reports.
 *
 * Naively summing every instance conflates concurrent engines and badly
 * over-reports. Measured on a test machine: busiest engine 9.4%, flat sum of
 * all instances 35.7% for the same moment.
 *
 * This spans all adapters, so it is reported as a system-wide figure rather
 * than attributed to any single GPU.
 *
 * @returns ratio 0..1, or null when counters are unavailable
 */
export async function readGpuUtilisation(): Promise<number | null> {
  try {
    /*
     * Tolerate invalid samples rather than failing on them.
     *
     * `\GPU Engine(*)` expands to one instance per engine per process, and on a
     * hybrid or partly-idle GPU some of those come back with no valid data.
     * With `-ErrorAction Stop` a single bad instance aborted the entire query
     * and the whole reading was reported as unavailable — which is what the
     * "data in one of the performance counter samples is not valid" failure was.
     *
     * `Status -eq 0` is the per-sample validity flag the error message itself
     * points at, so the good instances are kept and the bad ones dropped. A
     * partial reading across engines is still the right answer; the aggregate
     * takes the busiest engine type, and an engine with no data is not the
     * busiest one.
     */
    /*
     * Emits a number in every case, using -1 for "no usable counters".
     *
     * Deliberately quote-free. Returning an empty string would mean passing
     * `""` through `-Command`, and that extra quoting layer is exactly the kind
     * of thing that breaks silently across shells; a sentinel needs no quoting,
     * and the caller has to range-check the parsed value regardless.
     */
    const script = [
      "$ErrorActionPreference='SilentlyContinue';",
      "$s=@((Get-Counter '\\GPU Engine(*)\\Utilization Percentage'",
      '-ErrorAction SilentlyContinue).CounterSamples |',
      'Where-Object { $_.Status -eq 0 });',
      'if ($s.Count -eq 0) { -1 } else {',
      "$g=$s | Group-Object { ($_.InstanceName -split 'engtype_')[-1] } |",
      'ForEach-Object { ($_.Group | Measure-Object CookedValue -Sum).Sum };',
      '$v=($g | Measure-Object -Maximum).Maximum;',
      'if ($null -eq $v) { -1 } else { [Math]::Round($v,2) } }'
    ].join(' ')

    const { stdout } = await execFileAsync('powershell.exe', [...POWERSHELL_ARGS, script], {
      timeout: 6_000,
      windowsHide: true
    })

    const percent = Number.parseFloat(stdout.trim())
    // -1 is the script's sentinel for "every counter sample was invalid", which
    // is a real state on a partly-idle hybrid GPU and is reported as unknown
    // rather than as zero load.
    if (!Number.isFinite(percent) || percent < 0) return null

    return Math.min(Math.max(percent / 100, 0), 1)
  } catch (error) {
    logger.warn('GPU utilisation counters unavailable', error)
    return null
  }
}
