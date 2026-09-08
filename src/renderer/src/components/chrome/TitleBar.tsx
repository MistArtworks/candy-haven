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

      {/*
        Window controls, restated as institutional switches.
        See the glyph notes in TitleBar.module.scss for why these are not the
        usual dash / square / cross.

        `aria-label` keeps the conventional word. The chrome is themed; the
        accessibility contract is not — a screen reader user looking for
        "Minimise" should not have to know this world's vocabulary for it.
      */}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => void window.candy.window.minimize()}
          aria-label="Minimise"
        >
          {/* Recess: lower the housing. A chevron pressing down onto a floor rule. */}
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
            <path
              d="M3.6 4.1 6 6.5 8.4 4.1"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="square"
            />
            <line x1="2.2" y1="9.2" x2="9.8" y2="9.2" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        <button
          type="button"
          className={styles.control}
          onClick={() => void window.candy.window.toggleMaximize()}
          aria-label={windowState.isMaximized ? 'Restore' : 'Maximise'}
        >
          {/* Corner brackets — the ribbed-portal motif, opening out or drawing in. */}
          {windowState.isMaximized ? (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
              <path
                d="M4.8 1.8v3H1.8M7.2 1.8v3h3M7.2 10.2v-3h3M4.8 10.2v-3H1.8"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="square"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
              <path
                d="M1.8 4.4v-2.6h2.6M7.6 1.8h2.6v2.6M10.2 7.6v2.6H7.6M4.4 10.2H1.8V7.6"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="square"
              />
            </svg>
          )}
        </button>

        <button
          type="button"
          className={`${styles.control} ${styles.close}`}
          onClick={() => void window.candy.window.close()}
          aria-label="Close"
        >
          {/* Struck through, like a voided record. The arms overshoot the field. */}
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.1" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
