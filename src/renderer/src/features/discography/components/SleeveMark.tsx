import type { ReactNode } from 'react'
import styles from '../DiscographyPage.module.scss'

export interface SleeveMarkProps {
  /** Drawn beneath the mark — the kind, so the plate still says what it is. */
  label: string
}

/**
 * What a release with no cover draws.
 *
 * The plate is the object on this page, so the empty state cannot be two
 * letters in a grey box — on a wall of covers that reads as a broken image
 * rather than as a record whose sleeve has not been struck yet.
 *
 * Drawn rather than imported, like every other mark here. The brief's
 * vocabulary applies directly: a disc is a concentric ring, the one focal
 * object is the centre, and the field around it is symmetrical. So this is a
 * record seen head-on — an outer rim, the grooves as two hairlines, and the
 * label at the centre — which is the same object the sleeve would have been
 * covering.
 *
 * `currentColor` throughout, so it inherits whatever the plate sets and never
 * introduces a sixth colour. Strokes are 1.5 *in field units* on a 100-unit
 * viewBox, which is the family rule `ArchiveIcon` records: a hairline is a
 * proportion of the field, not a device width.
 */
export function SleeveMark({ label }: SleeveMarkProps): ReactNode {
  return (
    <span className={styles.sleeveMark} aria-hidden="true">
      <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor">
        {/* The sleeve: square, as everything here is. */}
        <rect x="8" y="8" width="84" height="84" strokeWidth="1.5" opacity="0.5" />

        {/* The disc, and its grooves. */}
        <circle cx="50" cy="50" r="28" strokeWidth="1.5" opacity="0.8" />
        <circle cx="50" cy="50" r="22" strokeWidth="1" opacity="0.4" />
        <circle cx="50" cy="50" r="16" strokeWidth="1" opacity="0.25" />

        {/* The centre label, and the spindle. One solid element carrying the
            emphasis — the family rule the archive marks already follow. */}
        <circle cx="50" cy="50" r="7" fill="currentColor" opacity="0.55" stroke="none" />
        <circle cx="50" cy="50" r="1.8" fill="currentColor" stroke="none" />

        {/* Registration ticks at the cardinals, as the reticle and the boot
            ring use. It is the console's own way of saying "a place for
            something", which is exactly what an empty sleeve is. */}
        <path
          d="M50 12v6M50 82v6M12 50h6M82 50h6"
          strokeWidth="1.5"
          opacity="0.45"
          strokeLinecap="square"
        />
      </svg>
      <span className={styles.sleeveLabel}>{label}</span>
    </span>
  )
}
