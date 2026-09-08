import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { TELEMETRY_INTERVAL_MS } from '@shared/domain/telemetry.constants'
import { useTelemetry } from '@renderer/hooks/useTelemetry'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Meter } from '@renderer/components/primitives/Meter'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { formatBytes, formatDuration } from '@renderer/lib/format'
import { VitalTile } from './components/VitalTile'
import { CoreStrip } from './components/CoreStrip'
import styles from './TelemetryPage.module.scss'

/**
 * TELEMETRY — host vitals.
 *
 * Every figure is sampled live in the main process. Metrics the platform
 * genuinely cannot report (GPU utilisation without performance counters) render
 * as unavailable rather than as zero, so an absent reading is never mistaken
 * for an idle one.
 */
export function TelemetryPage(): ReactNode {
  const section = getSection('telemetry')
  const telemetry = useTelemetry()
  const { latest } = telemetry

  const activeGpu = latest.gpus.find((gpu) => gpu.active) ?? latest.gpus[0] ?? null
  const adapterCount = latest.gpus.length
  const archiveVolume = latest.storage.find((volume) => volume.holdsArchive)
  const intervalSeconds = TELEMETRY_INTERVAL_MS / 1000

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <StatusDot
            tone={telemetry.ready ? 'online' : 'pending'}
            label={telemetry.ready ? `SAMPLING ${intervalSeconds}s` : 'INITIALISING'}
            pulse={!telemetry.ready}
          />
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="Processor"
          index="01"
          className={styles.span2}
          aside={`${latest.cpu.cores} CORES`}
        >
          <VitalTile
            label="Utilisation"
            value={telemetry.ready ? latest.cpu.usage : null}
            detail={latest.cpu.model ?? undefined}
            history={telemetry.cpuHistory}
          />
        </Panel>

        <Panel label="Memory" index="02" className={styles.span2}>
          <VitalTile
            label="In use"
            value={telemetry.ready ? latest.memory.usage : null}
            detail={
              latest.memory.total > 0
                ? `${formatBytes(latest.memory.used)} of ${formatBytes(latest.memory.total)}`
                : undefined
            }
            history={telemetry.memoryHistory}
          />
        </Panel>

        <Panel
          label="Graphics"
          index="03"
          className={styles.span2}
          aside={adapterCount > 0 ? `${adapterCount} ADAPTERS` : undefined}
        >
          <VitalTile
            label="System-wide"
            value={latest.gpuSystemUsage}
            detail={
              activeGpu ? `Rendering on ${activeGpu.name}` : 'Busiest engine across all adapters'
            }
            history={telemetry.gpuHistory}
            unavailableNote="GPU performance counters are not available on this system. Adapter details are still listed below."
          />
        </Panel>

        <Panel label="Per-core load" index="04" className={styles.span3}>
          <CoreStrip cores={latest.cpu.perCore} />
        </Panel>

        <Panel label="Application" index="05" className={styles.span3}>
          <FieldGrid columns={2}>
            <Field label="Processes" value={latest.app.processes || '—'} mono />
            <Field
              label="Uptime"
              value={
                latest.app.uptimeSeconds ? formatDuration(latest.app.uptimeSeconds * 1000) : '—'
              }
              mono
            />
            <Field
              label="CPU share"
              value={telemetry.ready ? `${(latest.app.cpuUsage * 100).toFixed(1)}%` : '—'}
              mono
            />
            <Field
              label="Memory"
              value={latest.app.memoryBytes ? formatBytes(latest.app.memoryBytes) : '—'}
              mono
            />
          </FieldGrid>
        </Panel>

        <Panel
          label="Adapters"
          index="06"
          className={styles.span3}
          aside={adapterCount ? `${adapterCount} DETECTED` : undefined}
        >
          {latest.gpus.length === 0 ? (
            <p className={styles.empty}>No graphics adapters reported.</p>
          ) : (
            <ul className={styles.adapters}>
              {latest.gpus.map((gpu) => (
                <li key={gpu.id} className={styles.adapter}>
                  <div className={styles.adapterHead}>
                    <span className={styles.adapterName}>{gpu.name}</span>
                    {gpu.active ? <span className={styles.adapterBadge}>RENDERING</span> : null}
                  </div>

                  <div className={styles.adapterStats}>
                    <span className={styles.adapterStat}>
                      <span className={styles.adapterStatLabel}>LOAD</span>
                      {gpu.usage !== null ? `${Math.round(gpu.usage * 100)}%` : 'n/r'}
                    </span>
                    <span className={styles.adapterStat}>
                      <span className={styles.adapterStatLabel}>VRAM</span>
                      {gpu.memoryTotalBytes
                        ? gpu.memoryUsedBytes !== null
                          ? `${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)}`
                          : formatBytes(gpu.memoryTotalBytes)
                        : '—'}
                    </span>
                    <span className={styles.adapterStat}>
                      <span className={styles.adapterStatLabel}>TEMP</span>
                      {gpu.temperatureC !== null ? `${Math.round(gpu.temperatureC)}°C` : '—'}
                    </span>
                  </div>

                  <span className={styles.adapterMeta}>
                    {[
                      gpu.vendor,
                      gpu.driverVersion ? `driver ${gpu.driverVersion}` : null,
                      gpu.usageSource
                        ? `load via ${gpu.usageSource}`
                        : 'per-adapter load not reported by this vendor'
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel label="Storage" index="07" className={styles.span3}>
          {latest.storage.length === 0 ? (
            <p className={styles.empty}>Reading volumes…</p>
          ) : (
            <ul className={styles.volumes}>
              {latest.storage.map((volume) => (
                <li key={volume.volume} className={styles.volume}>
                  <Meter
                    value={volume.usage}
                    size="sm"
                    tone={volume.usage >= 0.9 ? 'error' : 'gold'}
                    label={`${volume.volume}${volume.holdsArchive ? ' · ARCHIVE' : ''}`}
                    readout={`${formatBytes(volume.free)} free`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel label="Host" index="08" className={styles.span6}>
          <FieldGrid columns={4}>
            <Field label="Machine" value={latest.host.hostname || '—'} mono selectable />
            <Field label="Platform" value={latest.host.platform || '—'} mono />
            <Field label="Release" value={latest.host.release || '—'} mono />
            <Field
              label="Host uptime"
              value={
                latest.host.uptimeSeconds ? formatDuration(latest.host.uptimeSeconds * 1000) : '—'
              }
              mono
            />
            <Field
              label="Clock"
              value={latest.cpu.speedMhz ? `${(latest.cpu.speedMhz / 1000).toFixed(2)} GHz` : '—'}
              mono
            />
            <Field label="Archive volume" value={archiveVolume ? archiveVolume.volume : '—'} mono />
            <Field
              label="Archive free"
              value={archiveVolume ? formatBytes(archiveVolume.free) : '—'}
              mono
            />
            <Field label="Sample rate" value={`${intervalSeconds.toFixed(0)}s`} mono />
          </FieldGrid>
        </Panel>
      </motion.div>
    </div>
  )
}
