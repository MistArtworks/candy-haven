import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DEFAULT_FOLDER_COLOUR, validateFolderName } from '@shared/domain/stacks.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from './SwatchPicker'
import styles from './stacks.module.scss'

export interface FolderDialogProps {
  mode: 'create' | 'rename'
  /** Where the folder will sit, shown so a nested create is unambiguous. */
  where: string
  /**
   * Sitting directly in the wrapper, where the name rules are stricter — the
   * app owns `RELEASES` at that level and a genre cannot collide with it.
   */
  topLevel?: boolean
  /** What this folder will be: GENRE at the top level, FOLDER below it. */
  kindLabel?: string
  initialName?: string
  initialColour?: string
  busy?: boolean
  /** Set when the main process refused the last attempt. */
  error?: string | null
  onSubmit: (name: string, colour: string) => void
  onCancel: () => void
}

/**
 * Create or rename a folder.
 *
 * A scrim dialog rather than an inline field: creating a genre is a deliberate
 * act that also picks a colour, and the department's only other modal — the
 * project dossier — establishes the pattern.
 *
 * The name is validated here against the same shared rules the service applies,
 * so an illegal character is refused before a round trip. The service checks
 * again on the way in; the renderer is not trusted to have asked.
 */
export function FolderDialog({
  mode,
  where,
  topLevel = false,
  kindLabel,
  initialName = '',
  initialColour = DEFAULT_FOLDER_COLOUR,
  busy = false,
  error = null,
  onSubmit,
  onCancel
}: FolderDialogProps): ReactNode {
  const [name, setName] = useState(initialName)
  const [colour, setColour] = useState(initialColour)

  // Escape closes, as it does for the dossier. Bound on the document because
  // the dialog may not hold focus when the operator reaches for it.
  useEffect(() => {
    /*
     * Enter commits, Escape cancels.
     *
     * Bound on the document because the dialog may not hold focus when the
     * operator reaches for a key, and a dialog whose only route out is the
     * mouse is a dialog that gets in the way of typing a name and moving on.
     *
     * A textarea is excluded: Enter there is a newline, not a decision. So is
     * anything that has claimed the key for itself, which the hex field in the
     * swatch picker does — see `data-enter`.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }

      if (event.key !== 'Enter') return

      const target = event.target as HTMLElement | null
      if (target?.tagName === 'TEXTAREA' || target?.dataset.enter === 'own') return

      event.preventDefault()
      if (canSubmit) submit()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const verdict = validateFolderName(name, topLevel)
  const canSubmit = verdict.ok && !busy

  const submit = (): void => {
    if (canSubmit) onSubmit(name.trim(), colour)
  }

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
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'create' ? 'Add a folder' : 'Rename folder'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>
              {mode === 'create' ? `Add ${(kindLabel ?? 'folder').toLowerCase()}` : 'Rename folder'}
            </span>
            <span className={styles.dialogWhere} title={where}>
              {where}
            </span>
          </header>

          <div className={styles.dialogBody}>
            <TextInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Hip Hop"
              maxLength={64}
              // Only complain once there is something to complain about — a
              // pristine empty field is not an error, it is an unstarted one.
              hint={name.length > 0 && !verdict.ok ? (verdict.reason ?? undefined) : undefined}
            />

            <SwatchPicker value={colour} onChange={setColour} subject="Folder" />

            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className={styles.dialogActions}>
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" busy={busy} disabled={!canSubmit} onClick={submit}>
              {mode === 'create' ? 'Create' : 'Rename'}
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
