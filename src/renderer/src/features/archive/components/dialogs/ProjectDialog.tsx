import { useState, type ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import type { ProjectCategory } from '@shared/domain/projects'
import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_PURPOSE
} from '@shared/domain/projects.constants'
import { DEFAULT_FOLDER_COLOUR, validateFolderName } from '@shared/domain/stacks.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from '../stacks/SwatchPicker'
import styles from '../stacks/stacks.module.scss'

export interface ProjectDialogProps {
  /** The shelf the project will be created on. */
  where: string
  busy?: boolean
  error?: string | null
  onSubmit: (draft: { name: string; category: ProjectCategory; colour: string }) => void
  onCancel: () => void
}

/**
 * Create a project.
 *
 * The name is validated against the same shared folder rules the service
 * applies, because a project *is* a directory — an illegal character here is
 * refused before a round trip, and refused again on the way in.
 *
 * Category is asked and nothing follows from it.
 *
 * It used to be half a question: choosing ALBUM revealed a second row asking
 * *which* album, because the service refused a volume-bound category without
 * one. Volumes became the DISCOGRAPHY, whose tracklist lives on the release,
 * so a project no longer names what it is a track of — it is added to a
 * release from the release, which is the only place that knows the running
 * order. Category is now the operator's own label and nothing validates it.
 */
export function ProjectDialog({
  where,
  busy = false,
  error = null,
  onSubmit,
  onCancel
}: ProjectDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProjectCategory>('single')
  const [colour, setColour] = useState(DEFAULT_FOLDER_COLOUR)

  const verdict = validateFolderName(name)
  const canSubmit = verdict.ok && !busy

  const submit = (): void => {
    if (canSubmit) {
      onSubmit({ name: name.trim(), category, colour })
    }
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
          aria-label="Create a project"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>New project</span>
            <span className={styles.dialogWhere} title={where}>
              {where}
            </span>
          </header>

          <div className={styles.dialogBody}>
            <TextInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Solstice"
              maxLength={64}
              // Only complain once there is something to complain about — a
              // pristine empty field is not an error, it is an unstarted one.
              hint={
                name.length > 0 && !verdict.ok
                  ? (verdict.reason ?? undefined)
                  : 'The folder is created as “Name Project”, as Ableton names its own.'
              }
            />

            <div className={styles.field}>
              <span className={styles.pickerLabel}>Category</span>
              <div className={styles.chipRow} role="group" aria-label="Project category">
                {PROJECT_CATEGORIES.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={styles.chip}
                    data-selected={category === entry || undefined}
                    aria-pressed={category === entry}
                    title={PROJECT_CATEGORY_PURPOSE[entry]}
                    onClick={() => setCategory(entry)}
                  >
                    {PROJECT_CATEGORY_LABEL[entry]}
                  </button>
                ))}
              </div>
            </div>

            <SwatchPicker value={colour} onChange={setColour} subject="Project" />

            <p className={styles.dialogWhere}>
              Creates the folder and copies your template set into it. Nothing else — Ableton makes
              its own folders the first time you save.
            </p>

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
              Create
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
