import { useState, type ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import type { ProjectCategory } from '@shared/domain/projects'
import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_PURPOSE
} from '@shared/domain/projects.constants'
import {
  DEFAULT_FOLDER_COLOUR,
  TEMPORARY_DIRECTORY_NAME,
  temporaryKeepSentence,
  temporaryName,
  validateFolderName,
  type NewProjectKind
} from '@shared/domain/stacks.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { useSettings } from '@renderer/hooks/useSettings'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { ProjectKindChoice } from '../stacks/ProjectKindChoice'
import { SwatchPicker } from '../stacks/SwatchPicker'
import styles from '../stacks/stacks.module.scss'

export interface ProjectDialogProps {
  /** The shelf the project will be created on. */
  where: string
  /** Where a temporary one goes instead: `TEMPORARY PROJECTS`, when known. */
  temporaryWhere?: string | null
  busy?: boolean
  error?: string | null
  onSubmit: (draft: { name: string; category: ProjectCategory; colour: string }) => void
  /** A temporary project: no category and no colour, and the name may be left out. */
  onSubmitTemporary: (draft: { name?: string }) => void
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
 *
 * FILED or TEMPORARY comes first (`ProjectKindChoice`), as in the vestibule's
 * form. TEMPORARY drops the category and the colour, makes the name optional,
 * and opens the set from TEMPORARY PROJECTS instead of filing it on this
 * shelf.
 */
export function ProjectDialog({
  where,
  temporaryWhere = null,
  busy = false,
  error = null,
  onSubmit,
  onSubmitTemporary,
  onCancel
}: ProjectDialogProps): ReactNode {
  const [kind, setKind] = useState<NewProjectKind>('filed')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProjectCategory>('single')
  const [colour, setColour] = useState(DEFAULT_FOLDER_COLOUR)
  // What an empty name becomes, shown as the placeholder so it isn't a surprise.
  const [stamp] = useState(() => temporaryName(new Date()))
  const keep = useSettings()?.workspace.temporaryKeep ?? 'day'
  const temporary = kind === 'temporary'

  const verdict = validateFolderName(name)
  const typed = name.trim().length > 0
  const canSubmit = (temporary ? !typed || verdict.ok : verdict.ok) && !busy

  const submit = (): void => {
    if (!canSubmit) return
    if (temporary) onSubmitTemporary(typed ? { name: name.trim() } : {})
    else onSubmit({ name: name.trim(), category, colour })
  }

  const shownWhere = temporary ? (temporaryWhere ?? TEMPORARY_DIRECTORY_NAME) : where

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
            <span className={styles.dialogWhere} {...tooltipTrigger(shownWhere)}>
              {shownWhere}
            </span>
          </header>

          <div className={styles.dialogBody}>
            <ProjectKindChoice value={kind} onChange={setKind} disabled={busy} />

            <TextInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder={temporary ? stamp : 'Solstice'}
              maxLength={64}
              // Only complain once there is something to complain about — a
              // pristine empty field is not an error, it is an unstarted one.
              hint={
                name.length > 0 && !verdict.ok
                  ? (verdict.reason ?? undefined)
                  : temporary
                    ? 'Optional. Left empty, it’s named for when it was made.'
                    : 'The folder is created as “Name Project”, as Ableton names its own.'
              }
            />

            {temporary ? null : (
              <>
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
                        {...tooltipTrigger(PROJECT_CATEGORY_PURPOSE[entry])}
                        onClick={() => setCategory(entry)}
                      >
                        {PROJECT_CATEGORY_LABEL[entry]}
                      </button>
                    ))}
                  </div>
                </div>

                <SwatchPicker value={colour} onChange={setColour} subject="Project" />
              </>
            )}

            <p className={styles.dialogNote}>
              {temporary
                ? `Copies your template set into ${TEMPORARY_DIRECTORY_NAME} and opens it in Ableton. Nothing is filed, and the ARCHIVE never lists it. ${temporaryKeepSentence(keep)}`
                : 'Creates the folder and copies your template set into it. Nothing else — Ableton makes its own folders the first time you save.'}
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
              {temporary ? 'Open in Live' : 'Create'}
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
