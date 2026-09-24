import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getSectionByPath } from '@shared/domain/navigation'
import { APP_NAME } from '@shared/constants'
import { useSystemStore, selectArchive, selectWindow } from '@renderer/app/store/system.store'
import { usePageRefresh } from '@renderer/hooks/usePageRefresh'
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
export interface TitleBarProps {
  /** Whether the department rail is currently shown. */
  railOpen: boolean
  /** Shows or hides the rail, animated. See `CommandRail`. */
  onToggleRail: () => void
}

export function TitleBar({ railOpen, onToggleRail }: TitleBarProps): ReactNode {
  const location = useLocation()
  const archive = useSystemStore(selectArchive)
  const windowState = useSystemStore(selectWindow)
  const { refresh, busy } = usePageRefresh()

  const section = getSectionByPath(location.pathname)
  const status = describeArchive(archive.state)

  return (
    <header
      className={styles.titlebar}
      data-focused={windowState.isFocused || undefined}
      /*
        The whole bar is `-webkit-app-region: drag`, and Electron delivers no
        mouse events at all over a drag region — so the renderer cannot track
        the pointer here and must hand the system cursor back. See the chrome
        note in `useReticle`.
      */
      data-reticle="native"
    >
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
        {/*
          The rail's own visibility. Drawn as a plate standing for the
          directory — ruled, with a filled column while it is on screen and a
          hollow one once it is put away — rather than a hamburger, which
          belongs to a menu and this opens a register instead.
        */}
        <button
          type="button"
          className={styles.control}
          onClick={onToggleRail}
          aria-pressed={railOpen}
          aria-label={railOpen ? 'Hide the department rail' : 'Show the department rail'}
          title={railOpen ? 'Hide the rail' : 'Show the rail'}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
            <rect x="1.5" y="2.2" width="9" height="7.6" stroke="currentColor" strokeWidth="1" />
            <line x1="4.4" y1="2.2" x2="4.4" y2="9.8" stroke="currentColor" strokeWidth="1" />
            {railOpen ? (
              <rect x="1.5" y="2.2" width="2.9" height="7.6" fill="currentColor" opacity="0.85" />
            ) : null}
          </svg>
        </button>

        {/*
          Re-read the department, from anywhere.

          In the bank because it is the only place on the console that is on
          screen no matter what is routed, and set apart from the three beside
          it by a gap: those manage the window and this one does not. What it
          actually does is in `usePageRefresh` — it refetches and remounts the
          page, and leaves the renderer, the transport and every subscription
          alone.

          `Ctrl+R` and `F5` run the same thing; both are registered in
          `ConsoleLayout` so they appear in the shortcut sheet.
        */}
        <button
          type="button"
          className={`${styles.control} ${styles.refresh}`}
          data-busy={busy || undefined}
          aria-busy={busy}
          onClick={refresh}
          aria-label="Refresh this department"
          title="Refresh this department (Ctrl+R)"
        >
          {/* A ring broken at the top right, closed by a bracket rather than
              by a filled head — the portal motif turning back on itself. */}
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
            <path
              d="M9.2 3.4A4 4 0 1 1 6 2"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="square"
            />
            <path
              d="M7.3 3.1 9.5 3.4 9.2 5.6"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="square"
            />
          </svg>
        </button>

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
