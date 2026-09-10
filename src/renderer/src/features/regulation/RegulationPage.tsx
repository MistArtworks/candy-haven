import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSection } from '@shared/domain/navigation'
import { useSystemStore, selectArchive, selectUpdate } from '@renderer/app/store/system.store'
import { useRuntimeInfo } from '@renderer/hooks/useRuntimeInfo'
import { useSettingsDraft } from '@renderer/hooks/useSettings'
import { ScaleDialog } from './components/ScaleDialog'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Slider } from '@renderer/components/primitives/Slider'
import { TextInput } from '@renderer/components/primitives/Input'
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
  const archive = useSystemStore(selectArchive)
  const update = useSystemStore(selectUpdate)
  const setSettings = useSystemStore((state) => state.setSettings)
  const { data: runtime } = useRuntimeInfo()
  const queryClient = useQueryClient()

  const [scaleOpen, setScaleOpen] = useState(false)
  const draft = useSettingsDraft()
  const settings = draft.settings
  const applySettings = draft.apply
  const integrations = settings?.integrations

  /*
   * Publishes this page's unsaved-changes controller for the console chrome to
   * render, and withdraws it on unmount — a stranded controller would leave the
   * rail refusing to navigate with no page left to save.
   */
  const setUnsaved = useSystemStore((state) => state.setUnsaved)
  useEffect(() => {
    setUnsaved({
      dirty: draft.dirty,
      saving: draft.saving,
      error: draft.error,
      subject: 'operator settings',
      save: draft.save,
      discard: draft.discard
    })
    return () => setUnsaved(null)
  }, [draft.dirty, draft.saving, draft.error, draft.save, draft.discard, setUnsaved])

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
  const workspace = settings?.workspace

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

            {/*
              Behind a dialog rather than inline, and not for ceremony.

              Interface scale is the frame's zoom factor, so a slider wired
              straight to it rescales the page while it is being dragged — the
              slider slides out from under the pointer, and at 150% the thumb
              has moved half a panel from where it was grabbed. The dialog holds
              the console still and scales a sample instead.
            */}
            <div className={styles.control}>
              <span className={styles.controlLabel}>Interface scale</span>
              <div className={styles.controlRow}>
                <span className={styles.controlValue}>
                  {Math.round((appearance?.uiScale ?? 1) * 100)}%
                </span>
                <Button size="sm" onClick={() => setScaleOpen(true)}>
                  Adjust
                </Button>
              </div>
              <p className={styles.controlHint}>
                Scales the whole console — text, controls and spacing together — the way
                Windows&apos; own display scaling does.
              </p>
            </div>

            <Slider
              label="Grain"
              width="inline"
              min={0}
              max={1}
              step={0.05}
              value={appearance?.grain ?? 0.5}
              readout={`${Math.round((appearance?.grain ?? 0.5) * 100)}%`}
              onChange={(grain) =>
                applySettings({ appearance: { grain } }, { debounceMs: 200, key: 'grain' })
              }
            />

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

        {/*
          Integrations sit in Regulation rather than on the overlay's own page
          because a credential is an operator setting, not a broadcast one — and
          because the same id will serve any future integration that needs it.
        */}
        <Panel label="Integrations" index="04">
          <div className={styles.control}>
            <TextInput
              label="Spotify client id"
              value={integrations?.spotifyClientId ?? ''}
              mono
              onChange={(spotifyClientId) =>
                applySettings(
                  { integrations: { spotifyClientId } },
                  { debounceMs: 400, key: 'spotifyClientId' }
                )
              }
              hint="From an app created at developer.spotify.com. Public by design — the refresh token it earns is stored encrypted, separately."
            />
            <p className={styles.controlHint}>
              Register the redirect URI and authorise the account from{' '}
              <Link to="/observatory/transmission" className={styles.inlineLink}>
                NOW TRANSMITTING
              </Link>
              , which shows the exact URI to paste into the Spotify dashboard.
            </p>

            <TextInput
              label="Twitch channel"
              value={integrations?.twitchChannel ?? ''}
              mono
              onChange={(twitchChannel) =>
                applySettings(
                  { integrations: { twitchChannel } },
                  { debounceMs: 400, key: 'twitchChannel' }
                )
              }
              hint="Channel name or a pasted twitch.tv URL — either works. Chat is read anonymously, so there is nothing to authorise and no token to store."
            />
            <p className={styles.controlHint}>
              Read-only, and used by{' '}
              <Link to="/observatory/concord" className={styles.inlineLink}>
                THE CONCORD
              </Link>{' '}
              to count votes. The connection is only held open while something needs it.
            </p>
          </div>
        </Panel>

        {/*
          Test mode sits with the operator's workspace rather than on any one
          overlay's page: it lifts the configuration gate on every broadcast
          feature, so putting it on one of them would imply it were local to it.
        */}
        <Panel label="Rehearsal" index="05">
          <div className={styles.control}>
            <span className={styles.controlLabel}>Test mode</span>
            <button
              type="button"
              className={styles.toggle}
              role="switch"
              aria-checked={workspace?.testMode ?? false}
              data-on={workspace?.testMode || undefined}
              onClick={() =>
                applySettings({ workspace: { testMode: !(workspace?.testMode ?? false) } })
              }
            >
              <span className={styles.toggleThumb} />
            </button>
            <p className={styles.controlHint}>
              Lets broadcast features run without the service they depend on, and reveals their
              simulators. THE CONCORD normally refuses to open a poll with no Twitch channel set,
              because one that counts nothing looks exactly like one that works — turn this on to
              rehearse with synthetic votes, and off before going live.
            </p>
          </div>
        </Panel>

        <Panel label="Diagnostics" index="06" className={styles.wide}>
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

      {scaleOpen ? (
        <ScaleDialog
          value={appearance?.uiScale ?? 1}
          onCancel={() => setScaleOpen(false)}
          onApply={(uiScale) => {
            setScaleOpen(false)
            // Staged like every other control on this page: the console rescales
            // immediately so the choice can be judged in place, and FILE CHANGES
            // is still what writes it to disk.
            applySettings({ appearance: { uiScale } })
          }}
        />
      ) : null}
    </div>
  )
}
