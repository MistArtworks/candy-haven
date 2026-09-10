import type { ReactNode } from 'react'
import { REGULATION_CATEGORIES, REGULATION_CATEGORY, type RegulationCategory } from '../categories'
import styles from '../RegulationPage.module.scss'

export interface SettingsNavProps {
  active: RegulationCategory
  onSelect: (category: RegulationCategory) => void
  /**
   * Categories wanting attention, by id.
   *
   * A short readout drawn beside the entry — "not attached", "signed out". The
   * whole point of splitting the page into groups is that most of it is hidden
   * at any moment, so anything needing action has to be visible from the rail
   * or it will never be found.
   */
  marks?: Partial<Record<RegulationCategory, string>>
}

/**
 * The settings rail.
 *
 * Numbered, like the department rail and every panel in the application — this
 * is a second order of navigation and it should look like it belongs to the
 * same institution, not like a web sidebar that wandered in.
 *
 * Generated from the category table rather than listed, so adding a group of
 * settings gives it an entry without anyone remembering to.
 */
export function SettingsNav({ active, onSelect, marks = {} }: SettingsNavProps): ReactNode {
  return (
    <nav className={styles.nav} aria-label="Settings categories">
      {REGULATION_CATEGORIES.map((id, index) => {
        const entry = REGULATION_CATEGORY[id]
        const mark = marks[id]

        return (
          <button
            key={id}
            type="button"
            className={styles.navItem}
            data-active={id === active || undefined}
            aria-current={id === active ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.navLabel}>{entry.label}</span>
            {mark ? <span className={styles.navMark}>{mark}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
