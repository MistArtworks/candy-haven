import { useCallback, useState, type ReactNode } from 'react'
import type { ScanState } from '@shared/domain/projects'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { formatDuration, formatLogTime, truncatePath } from '@renderer/lib/format'
import { useApplySettings, useSettings } from '@renderer/hooks/useSettings'
import styles from './ScanPanel.module.scss'

const PHASE_LABEL: Record<ScanState['phase'], string> = {
  idle: 'IDLE',
  walking: 'WALKING',
  analysing: 'ANALYSING',
  persisting: 'FILING',
  done: 'COMPLETE',
  error: 'FAILED'
}

const PHASE_TONE: Record<ScanState['phase'], StatusTone> = {
  idle: 'offline',
  walking: 'pending',
  analysing: 'pending',
  persisting: 'pending',
  done: 'online',
  error: 'error'
}

export interface ScanPanelProps {
  scan: ScanState
  /** `force` re-reads every set instead of reusing unchanged analyses. */
  onScan: (force?: boolean) => void
  onCancel: () => void
  busy: boolean
}

/**
 * Indexing control and readout.
 *
 * Roots are managed here rather than only in Regulation: choosing which folders
 * hold your projects is the first thing this department needs, and sending the
 * operator to a different section to do it would make the register unusable on
 * first open. Regulation still owns the same setting — this writes through the
 * same local-first path, so the two cannot disagree.
 */
export function ScanPanel({ scan, onScan, onCancel, busy }: ScanPanelProps): ReactNode {
  const settings = useSettings()
  const applySettings = useApplySettings()
  const [choosing, setChoosing] = useState(false)

  // `settings` is null until the first hydration completes. Treating that as
  // "no roots" made the panel assert there were none configured — and disabled
  // the scan — while the operator's roots were sitting in the settings file.
  const loaded = settings !== null
  const roots = settings?.workspace.abletonProjectRoots ?? []
  const scanOnLaunch = settings?.workspace.scanOnLaunch ?? true
  const running =
    scan.phase === 'walking' || scan.phase === 'analysing' || scan.phase === 'persisting'

  const addRoot = useCallback(async () => {
    setChoosing(true)
    try {
      const selected = await window.candy.shell.selectDirectory('Select a projects directory')
      if (!selected) return

      const current = settings?.workspace.abletonProjectRoots ?? []
      // Case-insensitive on Windows: the same folder picked twice is one root.
      if (current.some((root) => root.toLowerCase() === selected.toLowerCase())) return

      applySettings({ workspace: { abletonProjectRoots: [...current, selected] } })
    } finally {
      setChoosing(false)
    }
  }, [applySettings, settings])

  const removeRoot = (root: string): void => {
    const current = settings?.workspace.abletonProjectRoots ?? []
    applySettings({
      workspace: { abletonProjectRoots: current.filter((entry) => entry !== root) }
    })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.status}>
        <StatusDot tone={PHASE_TONE[scan.phase]} label={PHASE_LABEL[scan.phase]} pulse={running} />
        {scan.durationMs !== null && !running ? (
          <span className={styles.duration}>{formatDuration(scan.durationMs)}</span>
        ) : null}
      </div>

      {/*
        Progress is genuinely unknowable while walking — the tree's size is not
        known until it has been walked — so the meter runs indeterminate rather
        than inventing a percentage.
      */}
      <Meter value={running ? null : scan.phase === 'done' ? 1 : 0} />

      <dl className={styles.counters}>
        <div>
          <dt>Projects</dt>
          <dd>{scan.projectsFound}</dd>
        </div>
        <div>
          <dt>Sets read</dt>
          <dd>{scan.setsParsed}</dd>
        </div>
        <div>
          {/*
            The point of the cache, stated plainly: an unchanged set is not
            decompressed again, which is what makes re-indexing on every launch
            cost a directory walk rather than seconds.
          */}
          <dt>Unchanged</dt>
          <dd>{scan.setsReused}</dd>
        </div>
        <div>
          <dt>Folders</dt>
          <dd>{scan.directoriesVisited}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{scan.filesSeen}</dd>
        </div>
      </dl>

      {scan.currentPath ? (
        <p className={styles.current} title={scan.currentPath}>
          {truncatePath(scan.currentPath, 52)}
        </p>
      ) : null}

      {scan.error ? <p className={styles.error}>{scan.error}</p> : null}

      <div className={styles.roots}>
        <div className={styles.rootsHead}>
          <span className={styles.rootsLabel}>Roots</span>
          <Button size="sm" onClick={addRoot} busy={choosing}>
            Add
          </Button>
        </div>

        {!loaded ? (
          <p className={styles.empty}>Reading settings…</p>
        ) : roots.length === 0 ? (
          <p className={styles.empty}>
            No directories configured. Add the folder that holds your Ableton projects.
          </p>
        ) : (
          <ul className={styles.rootList}>
            {roots.map((root) => (
              <li key={root} className={styles.root}>
                <button
                  type="button"
                  className={styles.rootPath}
                  title={`Open ${root}`}
                  onClick={() => void window.candy.shell.reveal(root)}
                >
                  {truncatePath(root, 40)}
                </button>
                <button
                  type="button"
                  className={styles.rootRemove}
                  aria-label={`Remove ${root}`}
                  onClick={() => removeRoot(root)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.launch}>
        <button
          type="button"
          className={styles.toggle}
          role="switch"
          aria-checked={scanOnLaunch}
          data-on={scanOnLaunch || undefined}
          onClick={() => applySettings({ workspace: { scanOnLaunch: !scanOnLaunch } })}
        >
          <span className={styles.toggleThumb} aria-hidden="true" />
        </button>
        <span className={styles.launchLabel}>Re-index on launch</span>
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onScan(false)}
          busy={busy || running}
          disabled={!loaded || roots.length === 0}
        >
          {scan.phase === 'done' ? 'Rescan' : 'Scan'}
        </Button>
        {running ? (
          <Button variant="danger" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onScan(true)}
            disabled={!loaded || roots.length === 0}
            title="Re-read every set, ignoring stored analyses"
          >
            Full re-read
          </Button>
        )}
      </div>

      {scan.log.length > 0 ? (
        <ol className={styles.log}>
          {scan.log.slice(-8).map((entry) => (
            <li
              key={`${entry.at}-${entry.message}`}
              className={styles.logEntry}
              data-level={entry.level}
            >
              <span className={styles.logTime}>{formatLogTime(entry.at)}</span>
              <span className={styles.logMessage}>{entry.message}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
