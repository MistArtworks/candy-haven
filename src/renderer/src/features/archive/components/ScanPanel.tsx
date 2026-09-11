import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ScanState } from '@shared/domain/projects'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { formatDuration, formatLogTime, truncatePath } from '@renderer/lib/format'
import { useSettings } from '@renderer/hooks/useSettings'
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

/*
 * How much of the log is kept on screen. Raised from 8 once the log grew into
 * the space the locations block used to occupy — the cap is there so a long
 * scan does not turn the panel into a scroller, not to ration the readout.
 */
const LOG_LINES = 14

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
 * A readout and two verbs, and nothing else. It used to carry the filing root,
 * the project template, the other locations and the re-index toggle as well —
 * four settings changed about once per machine, sitting permanently in the
 * middle of a live scan. Those are in REGULATION → ARCHIVE now, which is where
 * the setup gate has been putting the operator's first answers all along; the
 * link below is here so the panel that goes quiet when nothing is configured
 * still says where to fix that.
 */
export function ScanPanel({ scan, onScan, onCancel, busy }: ScanPanelProps): ReactNode {
  const settings = useSettings()

  // `settings` is null until the first hydration completes. Treating that as
  // "no roots" made the panel assert there were none configured — and disabled
  // the scan — while the operator's roots were sitting in the settings file.
  const loaded = settings !== null
  const satellites = settings?.workspace.satelliteRoots ?? []
  const filingRoot = settings?.workspace.filingRoot ?? null
  const scannable = filingRoot !== null || satellites.length > 0
  const running =
    scan.phase === 'walking' || scan.phase === 'analysing' || scan.phase === 'persisting'

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

      {/*
        Stated here rather than left to be discovered. When nothing is
        configured this panel has no work to report and both verbs are
        refused, so the one thing it must not do is go blank without saying
        which department to go to.
      */}
      <p className={styles.locations}>
        {loaded && !scannable ? 'Nothing to index: no locations are configured. ' : null}
        The filing root, the project template and any other locations are in{' '}
        <Link to="/regulation?section=archive" className={styles.locationsLink}>
          REGULATION → ARCHIVE
        </Link>
        .
      </p>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onScan(false)}
          busy={busy || running}
          disabled={!loaded || !scannable}
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
            disabled={!loaded || !scannable}
            title="Re-read every set, ignoring stored analyses"
          >
            Full re-read
          </Button>
        )}
      </div>

      {scan.log.length > 0 ? (
        <ol className={styles.log}>
          {scan.log.slice(-LOG_LINES).map((entry) => (
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
