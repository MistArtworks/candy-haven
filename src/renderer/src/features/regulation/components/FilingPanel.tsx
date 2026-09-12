import { useCallback, useState, type ReactNode } from 'react'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { truncatePath } from '@renderer/lib/format'
import { useApplySettings, useSettings } from '@renderer/hooks/useSettings'
import styles from '../RegulationPage.module.scss'

/**
 * Where the ARCHIVE files, what it copies, and what else it reads.
 *
 * These lived in the ARCHIVE's own INDEXING panel, wrapped around the scan
 * readout. The argument for keeping them there was that the register is
 * unusable until a location is chosen, and sending the operator to another
 * department on first open would be a poor way to learn that. The setup gate
 * has since taken that job — it asks for the filing root, the template and any
 * other locations before the department opens at all — so what was left in
 * INDEXING was four settings sitting permanently in the middle of a live
 * readout, changed about once per machine.
 *
 * Two kinds of location, and the distinction is the whole point of the panel.
 * The **filing root** is the one directory the ARCHIVE builds in: it holds
 * Candy Haven, every genre and every provisioned project. **Other locations**
 * are read only — drives and folders that happen to contain sets, walked so
 * those sets can be found and then filed into the tree. Nothing is ever
 * created in one.
 *
 * The filing root is reported rather than edited, as it was in INDEXING.
 * Repointing it would not move what is already filed, so it is chosen once at
 * the gate; a CHANGE button here would imply otherwise.
 */
export function FilingPanel({ index }: { index: string }): ReactNode {
  const settings = useSettings()
  const applySettings = useApplySettings()
  const [choosing, setChoosing] = useState(false)

  // `settings` is null until the first hydration completes. Treating that as
  // "nothing configured" made the panel assert there were no locations while
  // the operator's were sitting in the settings file.
  const loaded = settings !== null
  const satellites = settings?.workspace.satelliteRoots ?? []
  const scanOnLaunch = settings?.workspace.scanOnLaunch ?? true
  const intakeMode = settings?.workspace.intakeMode ?? 'move'
  const filingRoot = settings?.workspace.filingRoot ?? null
  const templatePath = settings?.workspace.projectTemplatePath ?? null

  const addSatellite = useCallback(async () => {
    setChoosing(true)
    try {
      const selected = await window.candy.shell.selectDirectory('Select another projects location')
      if (!selected) return

      const current = settings?.workspace.satelliteRoots ?? []
      // Case-insensitive on Windows: the same folder picked twice is one root.
      if (current.some((root) => root.toLowerCase() === selected.toLowerCase())) return

      // The filing root is already walked; adding it again would double every
      // directory count in the indexing readout for no extra coverage.
      if (selected.toLowerCase() === (settings?.workspace.filingRoot ?? '').toLowerCase()) return

      applySettings({ workspace: { satelliteRoots: [...current, selected] } })
    } finally {
      setChoosing(false)
    }
  }, [applySettings, settings])

  const removeSatellite = (root: string): void => {
    const current = settings?.workspace.satelliteRoots ?? []
    applySettings({
      workspace: { satelliteRoots: current.filter((entry) => entry !== root) }
    })
  }

  const chooseTemplate = useCallback(async () => {
    const selected = await window.candy.shell.selectFile({
      title: 'Select the template Ableton set',
      filters: [{ name: 'Ableton Live Set', extensions: ['als'] }]
    })
    if (selected) applySettings({ workspace: { projectTemplatePath: selected } })
  }, [applySettings])

  return (
    <Panel label="Filing" index={index}>
      <div className={styles.controls}>
        <div className={styles.filingBlock}>
          <div className={styles.filingHead}>
            <span className={styles.controlLabel}>Filing root</span>
          </div>

          {!loaded ? (
            <p className={styles.controlHint}>Reading settings…</p>
          ) : filingRoot === null ? (
            <p className={styles.controlHint}>
              Not chosen yet. The ARCHIVE asks for it when you open the department.
            </p>
          ) : (
            <ul className={styles.pathList}>
              <li className={styles.path}>
                <button
                  type="button"
                  className={styles.pathOpen}
                  title={`Open ${filingRoot}`}
                  onClick={() => void window.candy.shell.reveal(filingRoot)}
                >
                  {truncatePath(filingRoot, 48)}
                </button>
              </li>
            </ul>
          )}
        </div>

        {/*
          The template has no remove affordance on purpose: a project cannot be
          created without one, so clearing it would only ever break the next
          thing the operator tried to do. It can be replaced, which is the
          action they actually want.
        */}
        <div className={styles.filingBlock}>
          <div className={styles.filingHead}>
            <span className={styles.controlLabel}>Project template</span>
            <Button size="sm" onClick={chooseTemplate}>
              {templatePath ? 'Change' : 'Choose'}
            </Button>
          </div>

          {templatePath ? (
            <ul className={styles.pathList}>
              <li className={styles.path}>
                <button
                  type="button"
                  className={styles.pathOpen}
                  title={`Open ${templatePath}`}
                  onClick={() => void window.candy.shell.reveal(templatePath)}
                >
                  {truncatePath(templatePath, 48)}
                </button>
              </li>
            </ul>
          ) : (
            <p className={styles.controlHint}>
              No template set. Every new project is created from a copy of it.
            </p>
          )}
        </div>

        <div className={styles.filingBlock}>
          <div className={styles.filingHead}>
            <span className={styles.controlLabel}>Other locations</span>
            <Button size="sm" onClick={addSatellite} busy={choosing}>
              Add
            </Button>
          </div>

          {satellites.length === 0 ? (
            <p className={styles.controlHint}>
              Add a folder here to index sets that live outside the filing root. They are read only
              — nothing is written to them — and can be filed into the tree afterwards.
            </p>
          ) : (
            <ul className={styles.pathList}>
              {satellites.map((root) => (
                <li key={root} className={styles.path}>
                  <button
                    type="button"
                    className={styles.pathOpen}
                    title={`Open ${root}`}
                    onClick={() => void window.candy.shell.reveal(root)}
                  >
                    {truncatePath(root, 48)}
                  </button>
                  <button
                    type="button"
                    className={styles.pathRemove}
                    aria-label={`Remove ${root}`}
                    onClick={() => removeSatellite(root)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/*
          A segmented pair rather than a toggle, because neither option is the
          absence of the other — "not moving" is copying, and a switch labelled
          MOVE would leave the operator guessing what off meant.
        */}
        <div className={styles.control}>
          <span className={styles.controlLabel}>When taking a project in</span>
          <div className={styles.segmented}>
            {(['move', 'copy'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={styles.segment}
                data-selected={intakeMode === mode || undefined}
                aria-pressed={intakeMode === mode}
                onClick={() => applySettings({ workspace: { intakeMode: mode } })}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <p className={styles.controlHint}>
            <strong>MOVE</strong> takes the project folder into the archive, leaving nothing behind.{' '}
            <strong>COPY</strong> leaves your original exactly where it is and files a duplicate —
            safer, but it copies the Samples folder too, so a large library costs real disk. Either
            way the register holds one entry: under COPY the original is remembered and skipped by
            later scans.
          </p>
        </div>

        <div className={styles.control}>
          <span className={styles.controlLabel}>Re-index on launch</span>
          <button
            type="button"
            className={styles.toggle}
            role="switch"
            aria-checked={scanOnLaunch}
            data-on={scanOnLaunch || undefined}
            onClick={() => applySettings({ workspace: { scanOnLaunch: !scanOnLaunch } })}
          >
            <span className={styles.toggleThumb} />
          </button>
          <p className={styles.controlHint}>
            An unchanged set is not decompressed again, so this costs a directory walk rather than
            seconds. Turn it off if the locations live on a slow or remote drive.
          </p>
        </div>
      </div>
    </Panel>
  )
}
