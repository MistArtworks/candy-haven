import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSection } from '@shared/domain/navigation'
import { useSystemStore, selectArchive, selectUpdate } from '@renderer/app/store/system.store'
import { useRuntimeInfo } from '@renderer/hooks/useRuntimeInfo'
import { useSettingsDraft } from '@renderer/hooks/useSettings'
import { ScaleDialog } from './components/ScaleDialog'
import { SettingsNav } from './components/SettingsNav'
import { BoardPanel } from './components/BoardPanel'
import { FilingPanel } from './components/FilingPanel'
import { REGULATION_CATEGORY, isRegulationCategory, type RegulationCategory } from './categories'
import { useDispatch } from '@renderer/hooks/useDispatch'
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
 * Grouped, and one group at a time. It was six panels in one grid, which read
 * well enough at four and stopped doing so once the shared board's connection
 * arrived: a page where everything is present at once has no shape, and the
 * operator scrolls past five things they were not looking for to reach the
 * sixth.
 *
 * The chosen group lives in the URL rather than in state, so a link can point
 * at one — DISPATCH sends an unconfigured board straight to BOARD — and so the
 * back gesture walks the groups instead of leaving the department.
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

  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('section')
  const category: RegulationCategory = isRegulationCategory(raw) ? raw : 'presentation'

  const selectCategory = (next: RegulationCategory): void => {
    // Replaced rather than pushed: walking a settings rail is not navigation
    // anybody wants seven entries of in their history.
    setSearchParams({ section: next }, { replace: true })
  }

  /*
   * The board's state, for the rail's mark alone.
   *
   * Read here rather than only inside the panel because the point of hiding six
   * groups is that anything wanting attention has to be visible from the rail —
   * a board that has come unattached is exactly that, and it would otherwise be
   * invisible until someone happened to open the group.
   */
  const board = useDispatch()
  const boardMark =
    board.link.state === 'unconfigured'
      ? 'not set up'
      : board.link.state === 'error'
        ? 'offline'
        : board.link.identity === null
          ? 'signed out'
          : undefined
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

  /*
   * Export and import, each reporting in one line under the masthead.
   *
   * The notice is state here rather than a toast because both of these are
   * things the operator did deliberately and will want to read the result of —
   * which file was written, what an import actually restored — and a message
   * that removes itself after three seconds is one they will miss while
   * looking at the dialog they just dismissed.
   */
  const [transfer, setTransfer] = useState<string | null>(null)

  const exportSettings = useMutation({
    mutationFn: () => window.candy.settings.export(),
    onSuccess: (result) => {
      // A cancelled dialog is not an event worth reporting.
      if (!result.path) return
      setTransfer(`Wrote ${result.entries.length} files to ${result.path}`)
    },
    onError: (error: Error) => setTransfer(error.message)
  })

  const importSettings = useMutation({
    mutationFn: () => window.candy.settings.import(),
    onSuccess: (result) => {
      if (!result) return
      setSettings(result.settings)

      /*
       * Said plainly, because the two credential files are the part an operator
       * cannot verify by looking at the page. Settings are visible the moment
       * the import lands; whether the board and the Spotify link came with them
       * is not, and assuming they did is how somebody goes live unlinked.
       */
      const carried = [
        'settings',
        result.board ? 'board' : null,
        result.spotify ? 'Spotify link' : null
      ].filter(Boolean)

      setTransfer(
        `Restored ${carried.join(', ')}` +
          (result.writtenBy ? ` from a ${result.writtenBy} export.` : '.')
      )
    },
    onError: (error: Error) => setTransfer(error.message)
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
  const system = settings?.system

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="regulation"
        actions={
          <div className={styles.headerActions}>
            <Button
              size="sm"
              variant="ghost"
              busy={importSettings.isPending}
              onClick={() => importSettings.mutate()}
              title="Restore settings, the board and the Spotify link from an exported .zip"
            >
              Import
            </Button>
            <Button
              size="sm"
              variant="ghost"
              busy={exportSettings.isPending}
              onClick={() => exportSettings.mutate()}
              title="Write every setting, the board configuration and the Spotify link to one .zip. It holds credentials — keep it somewhere private."
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="danger"
              busy={resetSettings.isPending}
              onClick={() => resetSettings.mutate()}
            >
              Reset to defaults
            </Button>
          </div>
        }
      />

      {transfer ? (
        <p className={styles.transfer} role="status">
          <span>{transfer}</span>
          <button type="button" className={styles.dismiss} onClick={() => setTransfer(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      <div className={styles.shell}>
        <SettingsNav
          active={category}
          onSelect={selectCategory}
          marks={boardMark ? { board: boardMark } : {}}
        />

        <div className={styles.content}>
          <header className={styles.categoryHead}>
            <h2 className={styles.categoryTitle}>{REGULATION_CATEGORY[category].label}</h2>
            <p className={styles.categoryPurpose}>{REGULATION_CATEGORY[category].purpose}</p>
          </header>

          {/*
            The chosen group, and only it.

            Keyed on the category so the grid remounts and replays its entrance
            when the rail moves — otherwise switching groups swaps the contents
            of a static frame, which reads as a glitch rather than a change of
            view.

            Panels are numbered within their group rather than across the page:
            the index is a position in what is on screen, and six groups sharing
            one sequence would number a first panel 04.
          */}
          <motion.div
            key={category}
            className={styles.grid}
            variants={gridVariants}
            initial="initial"
            animate="animate"
          >
            {category === 'presentation' ? (
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
                    <span className={styles.controlLabel}>Page transition</span>
                    <div className={styles.segmented} role="group" aria-label="Page transition">
                      {(['sweep', 'fade', 'off'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={styles.segment}
                          data-selected={appearance?.pageTransition === option || undefined}
                          // Reported as unavailable rather than hidden when
                          // motion is off: the setting still exists and still
                          // holds a value, and a control that vanishes reads as
                          // a fault rather than as a consequence.
                          disabled={appearance?.motion === 'off'}
                          onClick={() => applySettings({ appearance: { pageTransition: option } })}
                        >
                          {option.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className={styles.controlHint}>
                      {appearance?.motion === 'off'
                        ? 'Motion is off, so departments change instantly whatever is set here.'
                        : 'Sweep passes a mark across the field as a department changes. Fade is the plain handover. Off changes instantly.'}
                    </p>
                  </div>

                  <div className={styles.control}>
                    <span className={styles.controlLabel}>Pointer</span>
                    <div className={styles.segmented} role="group" aria-label="Pointer">
                      {(['reticle', 'native'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={styles.segment}
                          data-selected={appearance?.pointer === option || undefined}
                          // Same treatment as the page transition: reported
                          // unavailable rather than hidden, because the setting
                          // still exists and still holds a value.
                          disabled={appearance?.motion === 'off'}
                          onClick={() => applySettings({ appearance: { pointer: option } })}
                        >
                          {option.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className={styles.controlHint}>
                      {appearance?.motion === 'off'
                        ? 'Motion is off, so the system pointer is used whatever is set here.'
                        : 'The reticle replaces the system pointer with the console’s own survey instrument. Native hands the arrow back.'}
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
                        applySettings({
                          appearance: { fastBoot: !(appearance?.fastBoot ?? false) }
                        })
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
            ) : null}

            {category === 'updates' ? (
              <Panel
                label="Updates"
                index="01"
                aside={update?.state.toUpperCase().replace('-', ' ')}
              >
                <FieldGrid columns={2}>
                  <Field label="Current version" value={`v${update?.currentVersion ?? '—'}`} mono />
                  <Field
                    label="Channel"
                    value={settings?.updates.channel.toUpperCase() ?? '—'}
                    mono
                  />
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
            ) : null}

            {category === 'startup' ? (
              <Panel label="Startup" index="01">
                <div className={styles.controls}>
                  <div className={styles.control}>
                    <span className={styles.controlLabel}>Open the vestibule first</span>
                    <button
                      type="button"
                      className={styles.toggle}
                      role="switch"
                      aria-checked={system?.showVestibule ?? true}
                      data-on={system?.showVestibule || undefined}
                      onClick={() =>
                        applySettings({
                          system: { showVestibule: !(system?.showVestibule ?? true) }
                        })
                      }
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                    <p className={styles.controlHint}>
                      A small window opens ahead of the console offering two things: a new project,
                      or the console proper. Creating one there files it, copies your template set
                      and opens it in Ableton without the console ever loading. Turn this off and
                      launching goes straight to the console, as it used to. A sign-in launch never
                      shows it either way.
                    </p>
                  </div>

                  <div className={styles.control}>
                    <span className={styles.controlLabel}>Launch at sign-in</span>
                    <button
                      type="button"
                      className={styles.toggle}
                      role="switch"
                      aria-checked={system?.launchAtStartup ?? false}
                      data-on={system?.launchAtStartup || undefined}
                      onClick={() =>
                        applySettings({
                          system: { launchAtStartup: !(system?.launchAtStartup ?? false) }
                        })
                      }
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                    <p className={styles.controlHint}>
                      Registers the console to start when you sign in to Windows. The point is not
                      the window — it is that the archive, the overlay server and the chat ingest
                      are already up before OBS asks for them.
                    </p>
                  </div>

                  <div className={styles.control}>
                    <span className={styles.controlLabel}>Start in the tray</span>
                    <button
                      type="button"
                      className={styles.toggle}
                      role="switch"
                      aria-checked={system?.startMinimised ?? true}
                      data-on={system?.startMinimised || undefined}
                      disabled={!system?.launchAtStartup}
                      onClick={() =>
                        applySettings({
                          system: { startMinimised: !(system?.startMinimised ?? true) }
                        })
                      }
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                    <p className={styles.controlHint}>
                      A sign-in launch comes up in the tray rather than on screen. Only applies when
                      the console is launched by the sign-in; opening it yourself always shows it.
                    </p>
                  </div>

                  <div className={styles.control}>
                    <span className={styles.controlLabel}>Close retires to the tray</span>
                    <button
                      type="button"
                      className={styles.toggle}
                      role="switch"
                      aria-checked={system?.closeToTray ?? true}
                      data-on={system?.closeToTray || undefined}
                      onClick={() =>
                        applySettings({
                          system: { closeToTray: !(system?.closeToTray ?? true) }
                        })
                      }
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                    <p className={styles.controlHint}>
                      The console&apos;s own close button puts it in the tray and leaves the
                      overlays serving. <strong>Alt+F4 always quits</strong>, whatever this is set
                      to, as does Quit on the tray icon — an application that refuses the operating
                      system&apos;s own close is one you cannot get rid of.
                    </p>
                  </div>
                </div>
              </Panel>
            ) : null}

            {category === 'archive' ? <FilingPanel index="01" /> : null}

            {category === 'archive' ? (
              <Panel
                label="Archive"
                index="02"
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
                    <Button
                      onClick={() => void window.candy.shell.reveal(archive.dataPath as string)}
                    >
                      Reveal data directory
                    </Button>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            {/*
          Integrations sit in Regulation rather than on the overlay's own page
          because a credential is an operator setting, not a broadcast one — and
          because the same id will serve any future integration that needs it.
        */}
            {category === 'integrations' ? (
              <Panel label="Integrations" index="01">
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
            ) : null}

            {category === 'rehearsal' ? (
              <Panel label="Rehearsal" index="01">
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
                    Lets broadcast features run without the service they depend on, and reveals
                    their simulators. THE CONCORD normally refuses to open a poll with no Twitch
                    channel set, because one that counts nothing looks exactly like one that works —
                    turn this on to rehearse with synthetic votes, and off before going live.
                  </p>
                </div>
              </Panel>
            ) : null}

            {category === 'diagnostics' ? (
              <Panel label="Diagnostics" index="01" className={styles.wide}>
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
            ) : null}

            {category === 'board' ? <BoardPanel index="01" /> : null}
          </motion.div>
        </div>
      </div>

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
