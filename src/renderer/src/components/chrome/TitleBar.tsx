import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getSectionByPath } from '@shared/domain/navigation'
import { APP_NAME } from '@shared/constants'
import { useSystemStore, selectArchive, selectWindow } from '@renderer/app/store/system.store'
import { Sigil } from '@renderer/components/sigil/Sigil'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import type { ArchiveState } from '@shared/domain/archive'
import styles from './TitleBar.module.scss'

/** Maps archive state onto an indicator tone and an operator-facing word. */
function describeArchive(state: ArchiveState): { tone: StatusTone; label: string } {
  switch (state) {
    case 'online':
      return { tone: 'online', label: 'ARCHIVE ONLINE' }
    case 'degraded':
      return { tone: 'warn', label: 'ARCHIVE DEGRADED' }
    case 'error':
      return { tone: 'error', label: 'ARCHIVE FAULT' }
    case 'offline':
      return { tone: 'offline', label: 'ARCHIVE OFFLINE' }
    default:
      return { tone: 'pending', label: 'ARCHIVE LINKING' }
  }
}

/**
 * Custom window chrome for the frameless window.
 *
 * The whole bar is a drag region except the controls, which opt out via the
 * `window-no-drag` mixin. Beyond window management it carries the current
 * section name and live archive state, so system health is visible from every
 * screen without occupying content space.
 */
export function TitleBar(): ReactNode {
  const location = useLocation()
  const archive = useSystemStore(selectArchive)
  const windowState = useSystemStore(selectWindow)

  const section = getSectionByPath(location.pathname)
  const status = describeArchive(archive.state)

  return (
    <header className={styles.titlebar} data-focused={windowState.isFocused || undefined}>
      <div className={styles.identity}>
        <Sigil size={16} weight={2.4} className={styles.mark} />
        <span className={styles.name}>{APP_NAME}</span>
        {section ? (
          <>
            <span className={styles.separator} aria-hidden="true" />
            <span className={styles.section}>{section.label}</span>
          </>
        ) : null}
      </div>

      <div className={styles.telemetry}>
        <StatusDot
          tone={status.tone}
          label={status.label}
          pulse={archive.state === 'connecting' || archive.state === 'starting'}
        />
        {archive.port ? <span className={styles.port}>:{archive.port}</span> : null}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => void window.candy.window.minimize()}
          aria-label="Minimise"
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="0.9" />
          </svg>
        </button>

        <button
          type="button"
          className={styles.control}
          onClick={() => void window.candy.window.toggleMaximize()}
          aria-label={windowState.isMaximized ? 'Restore' : 'Maximise'}
        >
          {windowState.isMaximized ? (
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" fill="none">
              <rect x="1" y="3" width="6" height="6" stroke="currentColor" strokeWidth="0.9" />
              <path d="M3 3V1h6v6H7" stroke="currentColor" strokeWidth="0.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" fill="none">
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="0.9" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className={`${styles.control} ${styles.close}`}
          onClick={() => void window.candy.window.close()}
          aria-label="Close"
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="0.9" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="0.9" />
          </svg>
        </button>
      </div>
    </header>
  )
}
