import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { renamedFolder, renamedSet } from '@shared/domain/projects.constants'
import { validateFolderName } from '@shared/domain/stacks.constants'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { useProject, useProjectMutations } from '@renderer/hooks/useProjects'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { notify } from '@renderer/components/feedback/notify'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../stacks/stacks.module.scss'

export interface RenameProjectDialogProps {
  projectId: string
  onClose: () => void
}

/**
 * Renames a project, on disk and in the register.
 *
 * A project's name is its folder's (`Vortex Project`) and its set's
 * (`Vortex.als`), so the dialog shows exactly what will be renamed before
 * anything is: the folder, and every set named after the project, by the same
 * rule the main process renames by. Backups and bounces keep their names.
 * Live holding the project open is the usual refusal, so the dialog asks for
 * it to be closed first, and a refusal is shown here, in the dialog it answers.
 */
export function RenameProjectDialog({ projectId, onClose }: RenameProjectDialogProps): ReactNode {
  const { data: project } = useProject(projectId)
  const { rename } = useProjectMutations()
  const [typed, setTyped] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)

  // The name selected and ready to type over, as Explorer's F2 leaves it.
  const loaded = Boolean(project)
  useEffect(() => {
    if (!loaded) return
    const input = body.current?.querySelector('input')
    input?.focus()
    input?.select()
  }, [loaded])

  const current = project?.name ?? ''
  const value = typed ?? current
  const name = value.trim()
  const verdict = validateFolderName(value)
  const unchanged = name === current
  const canSubmit = Boolean(project) && verdict.ok && !unchanged && !rename.isPending

  const submit = (): void => {
    if (!canSubmit) return
    rename.mutate(
      { id: projectId, name },
      {
        onSuccess: (renamed) => {
          notify.done(`Renamed to ${renamed.name}`)
          onClose()
        }
      }
    )
  }

  useDialogKeys({ onCommit: submit, onCancel: onClose, canCommit: canSubmit })

  // What changes on disk, folder first, as the main process does it.
  const changes =
    project && verdict.ok && !unchanged
      ? [
          { from: project.folderName, to: renamedFolder(project.folderName, name) },
          ...project.sets.flatMap((set) => {
            const to = renamedSet(set.fileName, project.name, name)
            return to ? [{ from: set.fileName, to }] : []
          })
        ]
      : []

  const failure = rename.error as (Error & { hint?: string | null }) | null
  const where = project
    ? project.path.slice(0, project.path.length - project.folderName.length)
    : ''

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Rename project"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>Rename project</span>
            <span className={styles.dialogWhere} {...tooltipTrigger(where)}>
              {where}
            </span>
          </header>

          <div className={styles.dialogBody} ref={body}>
            <TextInput
              label="Name"
              value={value}
              onChange={setTyped}
              placeholder="Vortex"
              maxLength={64}
              hint={value.length > 0 && !verdict.ok ? (verdict.reason ?? undefined) : undefined}
            />

            {changes.length ? (
              <div className={styles.renameChanges}>
                <span className={styles.pickerLabel}>On disk</span>
                {changes.map((change) => (
                  <p key={change.from} className={styles.renameChange}>
                    <span className={styles.renameFrom}>{change.from}</span>
                    <span className={styles.renameArrow} aria-hidden="true">
                      →
                    </span>
                    <span className={styles.renameTo}>{change.to}</span>
                  </p>
                ))}
              </div>
            ) : null}

            <p className={styles.confirmDetail}>
              Its folder and the sets named after it are renamed. Backups and bounces keep their
              names, and its pins, calendar attachments and release masters follow it. Close it in
              Ableton Live first.
            </p>

            {failure ? (
              <p className={styles.dialogError} role="alert">
                {failure.hint ? `${failure.message} ${failure.hint}` : failure.message}
              </p>
            ) : null}
          </div>

          <div className={styles.dialogActions}>
            <Button size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              busy={rename.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              Rename
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
