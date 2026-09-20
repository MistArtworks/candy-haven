import type { ReactNode } from 'react'
import { APP_NAME } from '@shared/constants'
import { Sigil } from '@renderer/components/sigil/Sigil'
import chrome from '@renderer/components/chrome/TitleBar.module.scss'
import styles from '../VestibulePage.module.scss'

/**
 * The vestibule's own chrome.
 *
 * Borrows `TitleBar`'s classes outright rather than restating them — the
 * glyphs, the gold lamp that lights along the top edge of a control on hover,
 * the depressed `:active` inset and the permanent crimson rule under close are
 * all decisions made once and worth keeping identical. What differs is the
 * grid: the console's bar is `1fr auto 1fr` with telemetry at the true
 * midpoint, and this one has two columns because it carries no telemetry.
 * Archive health is the status rail's job here, where there is room to say
 * what boot is actually doing.
 *
 * No maximise. The window is not resizable, so the control would be a switch
 * wired to nothing.
 */
export function VestibuleBar(): ReactNode {
  return (
    <header
      className={`${chrome.titlebar} ${styles.bar}`}
      data-focused
      /*
        Electron delivers no mouse events at all over a drag region, so the
        renderer cannot track the pointer here and must hand the system cursor
        back. Same contract as the console's bar.
      */
      data-reticle="native"
    >
      <div className={chrome.identity}>
        <Sigil size={16} weight={2.4} className={chrome.mark} />
        <span className={`${chrome.name} ${styles.barName}`}>{APP_NAME}</span>
        <span className={chrome.separator} aria-hidden="true" />
        <span className={`${chrome.section} ${styles.barSection}`}>VESTIBULE</span>
      </div>

      {/*
        `aria-label` keeps the conventional word. The chrome is themed; the
        accessibility contract is not.
      */}
      <div className={chrome.controls}>
        <button
          type="button"
          className={chrome.control}
          onClick={() => void window.candy.vestibule.minimize()}
          aria-label="Minimise"
        >
          {/* Recess: a chevron pressing down onto a floor rule. */}
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
          className={`${chrome.control} ${chrome.close}`}
          onClick={() => void window.candy.vestibule.close()}
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
