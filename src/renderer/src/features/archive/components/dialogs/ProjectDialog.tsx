import { useMemo, useState, type ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import type { ProjectCategory } from '@shared/domain/projects'
import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_PURPOSE,
  PROJECT_SCAFFOLD_FOLDERS,
  requiresVolume
} from '@shared/domain/projects.constants'
import { DEFAULT_FOLDER_COLOUR, validateFolderName } from '@shared/domain/stacks.constants'
import type { VolumeSummary } from '@shared/domain/volumes'
import { VOLUME_KIND_LABEL } from '@shared/domain/volumes.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from '../stacks/SwatchPicker'
import styles from '../stacks/stacks.module.scss'

export interface ProjectDialogProps {
  /** The shelf the project will be created on. */
  where: string
  /** Volumes available to attach to, for the volume-bound categories. */
  volumes: readonly VolumeSummary[]
  busy?: boolean
  error?: string | null
  onSubmit: (draft: {
    name: string
    category: ProjectCategory
    volumeId: string | null
    colour: string
  }) => void
  /** Opens the volume dialog, pre-set to the kind the category demands. */
  onNewVolume: (kind: 'album' | 'ep' | 'compilation') => void
  onCancel: () => void
}

/**
 * Create a project.
 *
 * The name is validated against the same shared folder rules the service
 * applies, because a project *is* a directory — an illegal character here is
 * refused before a round trip, and refused again on the way in.
 *
 * Category and volume are asked together and treated as one question, which is
 * what the service enforces: choosing ALBUM without saying which album is not a
 * half-filled form, it is an incomplete statement. So picking one of the three
 * volume-bound categories reveals the volume row immediately, with a create
 * affordance beside it for the common case of an album that does not exist yet.
 */
export function ProjectDialog({
  where,
  volumes,
  busy = false,
  error = null,
  onSubmit,
  onNewVolume,
  onCancel
}: ProjectDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProjectCategory>('single')
  const [volumeId, setVolumeId] = useState<string | null>(null)
  const [colour, setColour] = useState(DEFAULT_FOLDER_COLOUR)

  const needsVolume = requiresVolume(category)

  // Only volumes of the matching kind: an EP track cannot belong to an album,
  // and offering the choice would only produce a refusal from the service.
  const candidates = useMemo(
    () => volumes.filter((volume) => volume.kind === category),
    [volumes, category]
  )

  /*
   * The chosen volume is *derived*, not stored back on a category change.
   *
   * Moving from ALBUM to EP leaves the previously picked album still held in
   * state but no longer valid, and moving to SINGLE leaves a volume attached to
   * something that cannot have one. Resolving that during render rather than in
   * an effect keeps the submitted draft self-consistent at every instant, and
   * avoids the cascading re-render an effect that calls setState would cause.
   *
   * The raw pick survives in state, so flipping ALBUM → EP → ALBUM restores the
   * album the operator had already chosen instead of clearing it.
   */
  const resolvedVolumeId =
    needsVolume && volumeId && candidates.some((volume) => volume.id === volumeId) ? volumeId : null

  const verdict = validateFolderName(name)
  const canSubmit = verdict.ok && !busy && (!needsVolume || resolvedVolumeId !== null)

  const submit = (): void => {
    if (canSubmit) {
      onSubmit({ name: name.trim(), category, volumeId: resolvedVolumeId, colour })
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

            {needsVolume ? (
              <div className={styles.field}>
                <span className={styles.pickerLabel}>
                  Which {PROJECT_CATEGORY_LABEL[category].toLowerCase()}
                </span>

                {candidates.length === 0 ? (
                  <div className={styles.inlineEmpty}>
                    <p className={styles.dialogWhere}>
                      No{' '}
                      {VOLUME_KIND_LABEL[category as 'album' | 'ep' | 'compilation'].toLowerCase()}{' '}
                      exists yet.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => onNewVolume(category as 'album' | 'ep' | 'compilation')}
                    >
                      Create one
                    </Button>
                  </div>
                ) : (
                  <div className={styles.inlineRow}>
                    <select
                      className={styles.select}
                      value={resolvedVolumeId ?? ''}
                      aria-label="Volume"
                      onChange={(event) => setVolumeId(event.target.value || null)}
                    >
                      <option value="">Choose…</option>
                      {candidates.map((volume) => (
                        <option key={volume.id} value={volume.id}>
                          {volume.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => onNewVolume(category as 'album' | 'ep' | 'compilation')}
                    >
                      New
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            <SwatchPicker value={colour} onChange={setColour} subject="Project" />

            <p className={styles.dialogWhere}>
              Creates the folder, copies your template set into it, and adds{' '}
              {PROJECT_SCAFFOLD_FOLDERS.join(', ')}.
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
