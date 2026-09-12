import { useState, type ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import {
  DEFAULT_FOLDER_COLOUR,
  FOLDER_KIND_LABEL,
  FOLDER_KIND_PURPOSE,
  validateFolderName
} from '@shared/domain/stacks.constants'
import type { FolderKind } from '@shared/domain/stacks.constants'
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
   * Sitting at the top of the tree, where the name rules are stricter — the
   * app owns several directory names in the wrapper and a category cannot
   * collide with any of them.
   */
  topLevel?: boolean
  /**
   * What may be created here, from `allowedChildKinds()`.
   *
   * One entry is the common case and the dialog simply states it. Two means
   * the operator has a real choice to make — a category holds genres *and*
   * artists — and only then is a picker drawn. Empty or absent on rename,
   * which cannot change what a folder is.
   */
  kinds?: readonly FolderKind[]
  initialName?: string
  initialColour?: string
  busy?: boolean
  /** Set when the main process refused the last attempt. */
  error?: string | null
  onSubmit: (name: string, colour: string, kind: FolderKind) => void
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
  kinds = [],
  initialName = '',
  initialColour = DEFAULT_FOLDER_COLOUR,
  busy = false,
  error = null,
  onSubmit,
  onCancel
}: FolderDialogProps): ReactNode {
  const [name, setName] = useState(initialName)
  const [colour, setColour] = useState(initialColour)
  const [kind, setKind] = useState<FolderKind>(kinds[0] ?? 'folder')

  const verdict = validateFolderName(name, topLevel)
  const canSubmit = verdict.ok && !busy

  const submit = (): void => {
    if (canSubmit) onSubmit(name.trim(), colour, kind)
  }

  useDialogKeys({ onCommit: submit, onCancel, canCommit: canSubmit })

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
              {mode === 'create' ? `Add ${FOLDER_KIND_LABEL[kind].toLowerCase()}` : 'Rename folder'}
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

            {/*
              Only drawn when there is something to choose. Below a category
              there is exactly one legal kind, and offering a picker with one
              option would be asking a question that has already been answered
              by where the operator clicked.
            */}
            {mode === 'create' && kinds.length > 1 ? (
              <div className={styles.kindChoice} role="radiogroup" aria-label="What this is">
                {kinds.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="radio"
                    aria-checked={kind === entry}
                    className={styles.kindOption}
                    data-selected={kind === entry || undefined}
                    onClick={() => setKind(entry)}
                  >
                    <span className={styles.kindLabel}>{FOLDER_KIND_LABEL[entry]}</span>
                    <span className={styles.kindPurpose}>{FOLDER_KIND_PURPOSE[entry]}</span>
                  </button>
                ))}
              </div>
            ) : null}

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
