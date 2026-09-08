import { useCallback, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { SECTIONS, getSection } from '@shared/domain/navigation'
import { BOOT_STAGES } from '@shared/domain/boot.constants'
import {
  useSystemStore,
  selectArchive,
  selectBoot,
  selectUpdate
} from '@renderer/app/store/system.store'
import { useRuntimeInfo } from '@renderer/hooks/useRuntimeInfo'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { formatDuration, formatIndex, truncatePath } from '@renderer/lib/format'
import type { ArchiveState } from '@shared/domain/archive'
import { NexusLanding } from './components/NexusLanding'
import styles from './NexusPage.module.scss'

function archiveTone(state: ArchiveState): StatusTone {
  if (state === 'online') return 'online'
  if (state === 'degraded') return 'warn'
  if (state === 'error') return 'error'
  if (state === 'offline') return 'offline'
  return 'pending'
}

/**
 * NEXUS — the landing, then the overview.
 *
 * Two movements. The first is the landing: a full-height composition built to
 * the brief's single-focal-object rule, with the suspended orb reporting real
 * archive health rather than merely spinning. The second, one scroll down, is
 * the diagnostic grid — archive state, the boot that produced this session,
 * runtime paths, update status and the department register.
 *
 * The split is deliberate. The console needed a front door: something that
 * states what this institution is before it starts reciting numbers. The
 * numbers are still one gesture away and unchanged.
 */
export function NexusPage(): ReactNode {
  const section = getSection('nexus')
  const archive = useSystemStore(selectArchive)
  const boot = useSystemStore(selectBoot)
  const update = useSystemStore(selectUpdate)
  const { data: runtime } = useRuntimeInfo()

  const overviewRef = useRef<HTMLDivElement>(null)

  const descend = useCallback(() => {
    // `nearest` rather than `start`: the overview is taller than the viewport,
    // and `start` would overshoot past its own masthead on short windows.
    overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const bootDuration =
    boot.startedAt !== null && boot.completedAt !== null ? boot.completedAt - boot.startedAt : null

  // The slowest stage of the last boot — the first thing worth knowing when
  // startup begins to feel slow.
  const slowestStage = boot.stages
    .filter((stage) => stage.startedAt !== null && stage.completedAt !== null)
    .map((stage) => ({
      id: stage.id,
      duration: (stage.completedAt ?? 0) - (stage.startedAt ?? 0)
    }))
    .sort((a, b) => b.duration - a.duration)[0]

  const slowestLabel = slowestStage
    ? BOOT_STAGES.find((stage) => stage.id === slowestStage.id)?.label
    : null

  return (
    <div className={styles.page}>
      <NexusLanding
        archiveState={archive.state}
        archiveVersion={archive.serverVersion}
        latencyMs={archive.latencyMs}
        bootDurationMs={bootDuration}
        appVersion={runtime?.appVersion ?? null}
        onDescend={descend}
      />

      <div ref={overviewRef} className={styles.overview}>
        <PageHeader
          index={section.order + 1}
          label={section.label}
          purpose={section.purpose}
          epigraph={section.epigraph}
          actions={
            <StatusDot
              tone={archiveTone(archive.state)}
              label={archive.state.toUpperCase()}
              pulse={archive.state === 'connecting' || archive.state === 'starting'}
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
            label="Archive"
            index="01"
            aside={`${archive.restarts} restarts`}
            className={styles.span2}
          >
            <FieldGrid columns={1}>
              <Field label="State" value={archive.state.toUpperCase()} mono />
              <Field
                label="Runtime source"
                value={archive.binary?.source.toUpperCase() ?? 'NOT RESOLVED'}
                mono
              />
              <Field
                label="Data path"
                value={archive.dataPath ? truncatePath(archive.dataPath) : '—'}
                mono
                selectable
              />
              <Field
                label="Latency"
                value={archive.latencyMs !== null ? `${archive.latencyMs}ms` : '—'}
                mono
              />
              {archive.message ? <Field label="Last event" value={archive.message} /> : null}
            </FieldGrid>
          </Panel>

          <Panel
            label="Boot report"
            index="02"
            aside={boot.phase.toUpperCase()}
            className={styles.span2}
          >
            <FieldGrid columns={1}>
              <Field
                label="Duration"
                value={bootDuration !== null ? formatDuration(bootDuration) : '—'}
                mono
              />
              <Field
                label="Slowest stage"
                value={
                  slowestStage && slowestLabel
                    ? `${slowestLabel} · ${formatDuration(slowestStage.duration)}`
                    : '—'
                }
                mono
              />
              <Field
                label="Stages"
                value={`${boot.stages.filter((s) => s.status === 'complete').length} of ${
                  BOOT_STAGES.length
                } completed`}
                mono
              />
              <Field label="Port" value={archive.port ?? '—'} mono />
            </FieldGrid>
          </Panel>

          <Panel
            label="Runtime"
            index="03"
            aside={runtime?.isPackaged ? 'PACKAGED' : 'DEVELOPMENT'}
            className={styles.span2}
          >
            <FieldGrid columns={2}>
              <Field label="Candy Haven" value={`v${runtime?.appVersion ?? '—'}`} mono />
              <Field label="Electron" value={runtime?.electronVersion ?? '—'} mono />
              <Field label="Chromium" value={runtime?.chromeVersion ?? '—'} mono />
              <Field label="Node" value={runtime?.nodeVersion ?? '—'} mono />
            </FieldGrid>
          </Panel>

          <Panel
            label="Update channel"
            index="04"
            aside={update?.state.toUpperCase().replace('-', ' ')}
            className={styles.span3}
          >
            <FieldGrid columns={1}>
              <Field label="Current" value={`v${update?.currentVersion ?? '—'}`} mono />
              <Field label="Available" value={update?.version ? `v${update.version}` : '—'} mono />
              {update?.message ? <Field label="Status" value={update.message} /> : null}
            </FieldGrid>
          </Panel>

          <Panel
            label="Departments"
            index="05"
            className={`${styles.departments} ${styles.span3}`}
            flush
          >
            <ul className={styles.sectionList}>
              {SECTIONS.filter((entry) => entry.id !== 'nexus').map((entry) => (
                <li key={entry.id}>
                  <Link to={entry.path} className={styles.sectionLink}>
                    <span className={styles.sectionIndex}>{formatIndex(entry.order + 1)}</span>
                    <span className={styles.sectionBody}>
                      <span className={styles.sectionLabel}>{entry.label}</span>
                      <span className={styles.sectionPurpose}>{entry.purpose}</span>
                    </span>
                    <StatusDot
                      tone={entry.implemented ? 'online' : 'offline'}
                      label={entry.implemented ? 'IN SERVICE' : 'RESERVED'}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}
