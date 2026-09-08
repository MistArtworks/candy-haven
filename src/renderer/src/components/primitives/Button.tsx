import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.scss'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  /** Shows a working indicator and blocks interaction. */
  busy?: boolean
  icon?: ReactNode
}

/**
 * The console's action control.
 *
 * Square, letterspaced, uppercase — a switch on an instrument panel rather than
 * a web button. `busy` is distinct from `disabled` so an in-flight action still
 * reads as active work rather than as unavailable.
 */
export function Button({
  variant = 'ghost',
  size = 'md',
  busy = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps): ReactNode {
  const classes = [styles.button, styles[variant], styles[size], className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || busy}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      <span className={styles.label}>{children}</span>
    </button>
  )
}
