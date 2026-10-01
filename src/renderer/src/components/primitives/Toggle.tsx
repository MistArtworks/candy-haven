import type { ReactNode } from 'react'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from './Toggle.module.scss'

export interface ToggleProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  /** What is being switched. The accessible name, since the control has no text. */
  label: string
  disabled?: boolean
  /**
   * Drawn in its state and not operable: a setting that is not the operator's
   * to change here. Shown with a padlock in the thumb and a dashed track, and
   * still focusable, so the tooltip saying why can be reached from the keyboard.
   */
  locked?: boolean
  /** Shown on hover and focus. A locked toggle should always say why. */
  tooltip?: string
  /**
   * `accent` is the crimson every settings toggle uses. `gold` is for a page
   * carrying many, where crimson on each would spend the console's one
   * saturated colour on something that does not demand attention.
   */
  tone?: 'accent' | 'gold'
  className?: string
}

/**
 * A two-state switch: a square track and a square thumb, cut stone like the
 * status dots rather than a rounded pill.
 *
 * REGULATION drew these from its own stylesheet until COLOPHON needed one
 * beside every field; one primitive now, so the two cannot drift.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  locked = false,
  tooltip,
  tone = 'accent',
  className
}: ToggleProps): ReactNode {
  const classes = [styles.toggle, className ?? ''].filter(Boolean).join(' ')
  const hint = tooltip ? tooltipTrigger(tooltip) : {}

  if (locked) {
    return (
      <span
        role="switch"
        aria-checked={checked}
        aria-readonly="true"
        aria-label={label}
        tabIndex={0}
        className={classes}
        data-on={checked || undefined}
        data-locked
        data-tone={tone}
        {...hint}
      >
        <span className={styles.thumb}>
          <svg className={styles.lock} width="8" height="9" viewBox="0 0 8 9" aria-hidden="true">
            <path d="M2 4V2.6a2 2 0 0 1 4 0V4" fill="none" strokeWidth="1.1" />
            <rect x="1" y="4" width="6" height="4.6" />
          </svg>
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={classes}
      data-on={checked || undefined}
      data-tone={tone}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      {...hint}
    >
      <span className={styles.thumb} />
    </button>
  )
}
