import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSection } from '@shared/domain/navigation'
import {
  useSystemStore,
  selectArchive,
  selectSettings,
  selectUpdate
} from '@renderer/app/store/system.store'
import { useRuntimeInfo } from '@renderer/hooks/useRuntimeInfo'
import { useApplySettings } from '@renderer/hooks/useSettings'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { gridVariants } from '@renderer/motion/transitions'
import { formatRate, truncatePath } from '@renderer/lib/format'
import styles from './RegulationPage.module.scss'

/**
 * REGULATION — operator settings and system control.
 *
 * Mutations go through React Query so in-flight state drives the controls
 * directly; the resulting settings object is written straight back into the
 * system store, since settings have no push channel of their own.
 */
export function RegulationPage(): ReactNode {
  const section = getSection('regulation')
  const settings = useSystemStore(selectSettings)
  const archive = useSystemStore(selectArchive)
  const update = useSystemStore(selectUpdate)
  const setSettings = useSystemStore((state) => state.setSettings)
  const { data: runtime } = useRuntimeInfo()
  const queryClient = useQueryClient()

  const applySettings = useApplySettings()

  const resetSettings = useMutation({
    mutationFn: () => window.candy.settings.reset(),
    onSuccess: setSettings
  })

  const restartArchive = useMutation({
    mutationFn: () => window.candy.archive.restart()
  })

  const checkUpdates = useMutation({
    mutationFn: () => window.candy.updates.check(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runtime'] })
  })

  const downloadUpdate = useMutation({
    mutationFn: () => window.candy.updates.download()
  })

  const installUpdate = useMutation({
    mutationFn: () => window.candy.updates.install()
  })

  const appearance = settings?.appearance

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <Button
            size="sm"
            variant="danger"
            busy={resetSettings.isPending}
            onClick={() => resetSettings.mutate()}
          >
            Reset to defaults
          </Button>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Presentation" index="01">
          <div className={styles.controls}>
            <div className={styles.control}>
              <span className={styles.controlLabel}>Motion</span>
              <div className={styles.segmented} role="group" aria-label="Motion preference">
                {(['full', 'reduced', 'off'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.segment}
                    data-selected={appearance?.motion === option || undefined}
                    onClick={() => applySettings({ appearance: { motion: option } })}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className={styles.controlHint}>
                Reduced removes ambient movement. Off disables all transitions.
              </p>
            </div>

            <div className={styles.control}>
              <span className={styles.controlLabel}>Accent</span>
              <div className={styles.segmented} role="group" aria-label="Accent colour">
                {(['crimson', 'gold'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.segment}
                    data-selected={appearance?.accent === option || undefined}
                    onClick={() => applySettings({ appearance: { accent: option } })}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.control}>
              <label className={styles.controlLabel} htmlFor="grain">
                Grain
              </label>
              <input
                id="grain"
                type="range"
                min={0}
                max={1}
                step={0.05}
                className={styles.range}
                value={appearance?.grain ?? 0.5}
                onChange={(event) =>
                  applySettings(
                    { appearance: { grain: Number(event.target.value) } },
                    { debounceMs: 200, key: 'grain' }
                  )
                }
              />
            </div>

            <div className={styles.control}>
              <span className={styles.controlLabel}>Fast boot</span>
              <button
                type="button"
                className={styles.toggle}
                role="switch"
                aria-checked={appearance?.fastBoot ?? false}
                data-on={appearance?.fastBoot || undefined}
                onClick={() =>
                  applySettings({ appearance: { fastBoot: !(appearance?.fastBoot ?? false) } })
                }
              >
                <span className={styles.toggleThumb} />
              </button>
              <p className={styles.controlHint}>
                Enter the console automatically once the boot sequence completes.
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="Updates" index="02" aside={update?.state.toUpperCase().replace('-', ' ')}>
          <FieldGrid columns={2}>
            <Field label="Current version" value={`v${update?.currentVersion ?? '—'}`} mono />
            <Field label="Channel" value={settings?.updates.channel.toUpperCase() ?? '—'} mono />
          </FieldGrid>

          {update?.state === 'downloading' ? (
            <div className={styles.provision}>
              <Meter
                value={update.progress}
                label="Downloading"
                readout={formatRate(update.bytesPerSecond)}
                tone="gold"
              />
            </div>
          ) : null}

          {update?.message ? <p className={styles.message}>{update.message}</p> : null}

          <div className={styles.actions}>
            <Button
              busy={checkUpdates.isPending || update?.state === 'checking'}
              disabled={update?.state === 'unsupported'}
              onClick={() => checkUpdates.mutate()}
            >
              Check for updates
            </Button>
            {update?.state === 'available' ? (
              <Button
                variant="primary"
                busy={downloadUpdate.isPending}
                onClick={() => downloadUpdate.mutate()}
              >
                Download
              </Button>
            ) : null}
            {update?.state === 'downloaded' ? (
              <Button
                variant="primary"
                busy={installUpdate.isPending}
                onClick={() => installUpdate.mutate()}
              >
                Restart and install
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel
          label="Archive"
          index="03"
          aside={archive.state.toUpperCase()}
          className={styles.wide}
        >
          <FieldGrid columns={3}>
            <Field label="State" value={archive.state.toUpperCase()} mono />
            <Field label="Port" value={archive.port ?? '—'} mono />
            <Field label="Server" value={archive.serverVersion ?? '—'} mono />
            <Field
              label="Runtime"
              value={archive.binary ? archive.binary.source.toUpperCase() : 'NOT RESOLVED'}
              mono
            />
            <Field label="Restarts" value={archive.restarts} mono />
            <Field
              label="Latency"
              value={archive.latencyMs !== null ? `${archive.latencyMs}ms` : '—'}
              mono
            />
          </FieldGrid>

          {archive.provision ? (
            <div className={styles.provision}>
              <Meter
                value={archive.provision.ratio >= 0 ? archive.provision.ratio : null}
                label={archive.provision.message}
                tone="gold"
              />
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button busy={restartArchive.isPending} onClick={() => restartArchive.mutate()}>
              Restart archive
            </Button>
            {archive.dataPath ? (
              <Button onClick={() => void window.candy.shell.reveal(archive.dataPath as string)}>
                Reveal data directory
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel label="Diagnostics" index="04" className={styles.wide}>
          <FieldGrid columns={2}>
            <Field
              label="User data"
              value={runtime ? truncatePath(runtime.paths.userData) : '—'}
              mono
              selectable
            />
            <Field
              label="Log file"
              value={runtime ? truncatePath(runtime.paths.logs) : '—'}
              mono
              selectable
            />
            <Field
              label="Archive data"
              value={runtime ? truncatePath(runtime.paths.archiveData) : '—'}
              mono
              selectable
            />
            <Field label="Locale" value={runtime?.locale ?? '—'} mono />
          </FieldGrid>

          <div className={styles.actions}>
            {runtime ? (
              <Button onClick={() => void window.candy.shell.reveal(runtime.paths.userData)}>
                Open user data
              </Button>
            ) : null}
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
