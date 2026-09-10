import type { ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import styles from './stacks.module.scss'

export interface ConfirmDialogProps {
  title: string
  /** What the main process refused, and why. */
  message: string
  /** What confirming will actually do, stated plainly. */
  detail?: string
  confirmLabel: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation for an action the main process has already refused once.
 *
 * In the app's own chrome rather than `window.confirm`. Two reasons, and the
 * second is the serious one: a native dialog is a grey system rectangle in the
 * middle of a console that is otherwise entirely of its own world, and it
 * *blocks the renderer thread* while it is open — freezing a scan readout and
 * every overlay this window is driving until someone clicks it.
 */
export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel,
  busy = false,
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): ReactNode {
  useDialogKeys({ onCommit: onConfirm, onCancel, canCommit: true })

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>{title}</span>
          </header>

          <div className={styles.dialogBody}>
            <p className={styles.confirmMessage}>{message}</p>
            {detail ? <p className={styles.confirmDetail}>{detail}</p> : null}
          </div>

          <div className={styles.dialogActions}>
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              busy={busy}
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
