import type { MouseEvent, ReactNode } from 'react'
import { Sigil } from '@renderer/components/sigil/Sigil'
import styles from '../VestibulePage.module.scss'

export interface ChoiceTilesProps {
  /**
   * Whether a project can be provisioned yet.
   *
   * False until the archive is connected *and* the department is set up —
   * `projects:create` needs a folder tree out of Mongo and a template on disk,
   * so offering the door before either exists would be offering a door that
   * opens onto an error.
   */
  canCreate: boolean
  /** Why not, when `canCreate` is false. Shown under the disarmed tile. */
  blockedReason: string
  onCreate: () => void
  /** Opens the console, at a section path when one is given. */
  onConsole: (route: string | null) => void
}

/**
 * Four doors, and one of them is the front door.
 *
 * THE CONSOLE leads: it is first in the document, it holds the whole left
 * column, and it takes focus on arrival so Enter opens it. The other three are
 * shortcuts beside it — NEW PROJECT is the only one that does work here, and
 * ARCHIVE and OBSERVATORY open the console already standing in the department
 * the operator came for, which saves landing on NEXUS and then navigating.
 *
 * **The hierarchy is size, position and focus — not colour.** Marking the
 * primary door with the accent would spend the one saturated colour in the
 * palette on a resting state, which the brief reserves for focal points and
 * live state. A bigger tile in the reading position does the same job and
 * costs nothing.
 *
 * The lit tile is always the *focused* one, because hovering moves focus — see
 * `takeFocus`. That is what keeps the single-focal-object rule true: `autoFocus`
 * lights the console on arrival, and without this, pointing at a shortcut would
 * light a second tile while the console stayed lit behind it.
 */
/**
 * Hovering a door focuses it.
 *
 * Two things fall out of this, and both are the point. The accent marks exactly
 * one tile at any moment rather than one hovered *and* one focused, and Enter
 * always opens whatever the operator is pointing at rather than whatever they
 * last tabbed to.
 */
function takeFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.currentTarget.focus()
}

export function ChoiceTiles({
  canCreate,
  blockedReason,
  onCreate,
  onConsole
}: ChoiceTilesProps): ReactNode {
  return (
    <div className={styles.tiles}>
      <button
        type="button"
        className={`${styles.tile} ${styles.tilePrimary}`}
        onClick={() => onConsole(null)}
        onMouseEnter={takeFocus}
        // The default answer, so a keyboard operator can launch and press
        // Enter without looking. The others are a Tab away.
        autoFocus
      >
        <span className={styles.tileMark} aria-hidden="true">
          <Sigil size={88} weight={0.9} />
        </span>
        <span className={styles.tileLabel}>The console</span>
        <span className={styles.tileCaption}>Every department, as usual.</span>
      </button>

      <button
        type="button"
        className={`${styles.tile} ${styles.tileAside}`}
        onClick={onCreate}
        onMouseEnter={takeFocus}
        disabled={!canCreate}
        aria-describedby={canCreate ? undefined : 'vestibule-create-blocked'}
      >
        <span className={styles.tileMark} aria-hidden="true">
          {/* An aperture opening, not a plus sign. */}
          <svg viewBox="0 0 48 48" width="30" height="30" fill="none">
            <line x1="24" y1="9" x2="24" y2="39" stroke="currentColor" strokeWidth="1.6" />
            <line x1="9" y1="24" x2="39" y2="24" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
          </svg>
        </span>
        <span className={styles.tileText}>
          <span className={styles.tileLabel}>New project</span>
          <span className={styles.tileCaption}>
            {canCreate ? 'Filed, and open in Ableton.' : blockedReason}
          </span>
        </span>
      </button>

      <button
        type="button"
        className={`${styles.tile} ${styles.tileAside}`}
        onClick={() => onConsole('/archive')}
        onMouseEnter={takeFocus}
      >
        <span className={styles.tileMark} aria-hidden="true">
          {/*
            A filing rack: three open bands in a frame.

            Twice reduced. It started with dividers *and* a pull on each drawer,
            and at this size that is five horizontal strokes across 28 units —
            the gaps close and it reads as a solid block, noticeably heavier
            than the open linework of the other marks.
          */}
          <svg viewBox="0 0 48 48" width="30" height="30" fill="none">
            <rect
              x="10"
              y="11"
              width="28"
              height="26"
              stroke="currentColor"
              strokeWidth="1.3"
              opacity="0.85"
            />
            <line x1="10" y1="19.7" x2="38" y2="19.7" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="28.3" x2="38" y2="28.3" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
        <span className={styles.tileText}>
          <span className={styles.tileLabel}>Archive</span>
          <span className={styles.tileCaption}>Sets, shelves, the register.</span>
        </span>
      </button>

      <button
        type="button"
        className={`${styles.tile} ${styles.tileAside}`}
        onClick={() => onConsole('/observatory')}
        onMouseEnter={takeFocus}
      >
        <span className={styles.tileMark} aria-hidden="true">
          {/* Transmission: a source with arcs leaving it. */}
          <svg viewBox="0 0 48 48" width="30" height="30" fill="none">
            <circle cx="24" cy="24" r="3.4" fill="currentColor" />
            <path
              d="M31 17a10 10 0 0 1 0 14M17 31a10 10 0 0 1 0-14"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M35.5 12.5a16.5 16.5 0 0 1 0 23M12.5 35.5a16.5 16.5 0 0 1 0-23"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.6"
            />
          </svg>
        </span>
        <span className={styles.tileText}>
          <span className={styles.tileLabel}>Observatory</span>
          <span className={styles.tileCaption}>Overlays, and what is on air.</span>
        </span>
      </button>

      {canCreate ? null : (
        <span id="vestibule-create-blocked" className={styles.visuallyHidden}>
          {blockedReason}
        </span>
      )}
    </div>
  )
}
