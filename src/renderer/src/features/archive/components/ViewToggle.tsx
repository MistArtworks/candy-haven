import type { ReactNode } from 'react'
import type { ProjectViewMode } from '@shared/domain/projects'
import { PROJECT_VIEW_LABEL, PROJECT_VIEW_MODES } from '@shared/domain/projects.constants'
import styles from './ViewToggle.module.scss'

export interface ViewToggleProps {
  view: ProjectViewMode
  onChange: (view: ProjectViewMode) => void
  /**
   * Which modes to offer. Omitted offers all three.
   *
   * INTAKE draws directories rather than a register, so it has LIST and ICONS
   * and no BOARD — there are no stages to make columns out of. Narrowing the
   * offer here rather than hiding the whole control means the operator keeps
   * the two choices that do apply.
   */
  modes?: readonly ProjectViewMode[]
}

/**
 * How the register is drawn, sited in the header of the panel it draws into.
 *
 * It used to live in the control strip above the page, alongside the lens, the
 * search and two rows of filter chips. That was wrong on two counts. It made an
 * already crowded strip carry a fourth kind of control, and it offered LIST /
 * ICONS / BOARD in lenses that draw no register at all — RELEASES is a board of
 * its own and VOLUMES at the top level is a tile grid, so the toggle sat there
 * doing nothing.
 *
 * A panel-scoped control belongs on the panel. The page now renders this as the
 * panel's `aside` and only where a register is actually drawn.
 */
export function ViewToggle({
  view,
  onChange,
  modes = PROJECT_VIEW_MODES
}: ViewToggleProps): ReactNode {
  return (
    <div className={styles.group} role="group" aria-label="Register view">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={styles.segment}
          data-selected={view === mode || undefined}
          aria-pressed={view === mode}
          onClick={() => onChange(mode)}
        >
          {PROJECT_VIEW_LABEL[mode]}
        </button>
      ))}
    </div>
  )
}
