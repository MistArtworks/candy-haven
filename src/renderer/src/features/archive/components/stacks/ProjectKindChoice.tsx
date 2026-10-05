import type { ReactNode } from 'react'
import {
  NEW_PROJECT_KINDS,
  NEW_PROJECT_KIND_LABEL,
  NEW_PROJECT_KIND_PURPOSE,
  type NewProjectKind
} from '@shared/domain/stacks.constants'
import styles from './ProjectKindChoice.module.scss'

export interface ProjectKindChoiceProps {
  value: NewProjectKind
  onChange: (kind: NewProjectKind) => void
  disabled?: boolean
}

/**
 * FILED or TEMPORARY, at the top of every New project form: ARCHIVE's dialog,
 * the vestibule and the strip.
 *
 * Two wide halves with a line each, rather than chips, because the choice
 * changes the rest of the form (a temporary set has no shelf, category or
 * colour) and has to read as the first question, not one option among the
 * fields. FILED is the default every time the form opens, so a real track
 * never lands among the temporary ones by accident.
 */
export function ProjectKindChoice({
  value,
  onChange,
  disabled = false
}: ProjectKindChoiceProps): ReactNode {
  return (
    <div className={styles.kinds} role="group" aria-label="Kind of project">
      {NEW_PROJECT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={styles.kind}
          data-kind={kind}
          data-selected={value === kind || undefined}
          aria-pressed={value === kind}
          disabled={disabled}
          onClick={() => onChange(kind)}
        >
          <span className={styles.kindLabel}>{NEW_PROJECT_KIND_LABEL[kind]}</span>
          <span className={styles.kindPurpose}>{NEW_PROJECT_KIND_PURPOSE[kind]}</span>
        </button>
      ))}
    </div>
  )
}
