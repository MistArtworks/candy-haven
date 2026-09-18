import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Portal } from './Portal'
import { Button } from './Button'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import styles from './Dialog.module.scss'

export interface DialogProps {
  title: string
  /** Context for the title — a path, a shelf, what this will belong to. */
  subtitle?: string
  /** Wider, for a form that wants two columns. */
  width?: 'standard' | 'wide'
  busy?: boolean
  error?: string | null
  confirmLabel: string
  /** False disables the commit button *and* the Enter key. */
  canConfirm: boolean
  /** Crimson commit button, for a dialog that destroys something. */
  danger?: boolean
  /** Drawn beneath the fields: what pressing the button will actually do. */
  footnote?: ReactNode
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}

/**
 * The console's modal shell.
 *
 * Extracted when ARTISTS and DISCOGRAPHY needed three more dialogs and the
 * scrim, the slab, the header, the error line, the action row and the
 * Enter/Escape binding were about to be copied a fourth and fifth time —
 * `ProjectDialog`, `FolderDialog`, `VolumeDialog` and `ConfirmDialog` had
 * each grown their own. The pieces were already identical; only the fields
 * between them ever differed, which is exactly the shape of a shell.
 *
 * Portalled, as everything overlaid must be: `ConsoleLayout` animates each
 * page with a transform, and a transform makes its element the containing
 * block for `position: fixed` descendants, so a scrim rendered inside a page
 * covers the page rather than the window. See `Portal`.
 *
 * `useDialogKeys` binds Enter and Escape on the document rather than on the
 * slab, because the slab does not necessarily hold focus when the operator
 * reaches for a key.
 */
export function Dialog({
  title,
  subtitle,
  width = 'standard',
  busy = false,
  error = null,
  confirmLabel,
  canConfirm,
  danger = false,
  footnote,
  onConfirm,
  onCancel,
  children
}: DialogProps): ReactNode {
  useDialogKeys({ onCommit: onConfirm, onCancel, canCommit: canConfirm && !busy })

  return (
    <Portal>
      <div
        className={styles.scrim}
        onMouseDown={(event) => {
          // Only a press that both starts and ends on the scrim dismisses.
          // Without the target check, releasing a text selection that began
          // inside the dialog and drifted out closes it and loses the form.
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <motion.div
          className={[styles.dialog, width === 'wide' ? styles.wide : ''].filter(Boolean).join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.head}>
            <span className={styles.title}>{title}</span>
            {subtitle ? (
              <span className={styles.subtitle} title={subtitle}>
                {subtitle}
              </span>
            ) : null}
          </header>

          <div className={styles.body}>
            {children}

            {footnote ? <p className={styles.footnote}>{footnote}</p> : null}

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className={styles.actions}>
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              busy={busy}
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}

export interface DialogFieldProps {
  label: string
  /** Marks the field as the one thing that must be filled in. */
  required?: boolean
  hint?: string
  children: ReactNode
}

/**
 * A labelled group inside a dialog, for anything that is not a `TextInput`.
 *
 * `required` draws a mark rather than relying on the commit button being
 * disabled: a form that refuses to submit without saying which field is
 * missing is a guessing game, and these dialogs deliberately make almost
 * everything optional — so the one or two that are not have to say so.
 */
export function DialogField({ label, required, hint, children }: DialogFieldProps): ReactNode {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}>required</span> : null}
      </span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </div>
  )
}

/** A row of mutually exclusive or multi-select stamps, as used throughout. */
export function DialogChips({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.chips}>{children}</div>
}

export interface DialogChipProps {
  on: boolean
  label: string
  title?: string
  disabled?: boolean
  onClick: () => void
}

export function DialogChip({ on, label, title, disabled, onClick }: DialogChipProps): ReactNode {
  return (
    <button
      type="button"
      className={styles.chip}
      data-on={on || undefined}
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
