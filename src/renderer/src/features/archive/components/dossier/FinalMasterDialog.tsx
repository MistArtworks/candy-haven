import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ProjectRecord } from '@shared/domain/projects'
import { AUDIO_MARK_LABEL } from '@shared/domain/projects.constants'
import { RELEASE_MASTERED_TRACKS_DIRECTORY_NAME } from '@shared/domain/stacks.constants'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { formatBytes } from '@renderer/lib/format'
import styles from '../stacks/stacks.module.scss'
import local from './dossier.module.scss'

export interface FinalMasterDialogProps {
  project: ProjectRecord
  busy?: boolean
  error?: string | null
  /** Chosen file and the name it ships under. */
  onSubmit: (sourcePath: string, name: string) => void
  onCancel: () => void
}

/**
 * Which file ships, asked at the moment it matters.
 *
 * Reaching TRACK READY *is* choosing the final — the stage means "this is
 * finished", and a project cannot be finished without saying which file is the
 * finished thing. So pressing TRACK READY asks, rather than refusing and
 * sending the operator away to do it first.
 *
 * The list is the mixes and masters they marked, and nothing else. Marking is
 * the statement that a file is a candidate; this is a choice among candidates,
 * not a fresh search through everything lying in the folder. WIPs are excluded
 * by the same logic — kept for reference, never meant to ship.
 *
 * Naming is part of the same step because the file **moves**. It leaves the
 * project for `Release Mastered Tracks`, and the name it lands under is the
 * name of the finished track rather than whatever the bounce was called at
 * 3am. Asking afterwards would mean a rename of a file already moved.
 *
 * The same dialog handles a **swap**, reached by right-clicking the final in
 * MIX AND MASTER. It is the same question with one more fact in it — that
 * something is already shipping and is about to come home — so it is the same
 * dialog with the wording turned, rather than a second one to keep in step. The
 * name defaults to what the track already ships as: swapping is a statement
 * about which *file* is right, not about what the track is called, and
 * re-deriving the name from the project would quietly rename a finished track
 * every time its mix was corrected.
 */
export function FinalMasterDialog({
  project,
  busy = false,
  error = null,
  onSubmit,
  onCancel
}: FinalMasterDialogProps): ReactNode {
  const candidates = [
    ...project.masters.masters.map((path) => ({ path, mark: 'master' as const })),
    ...project.masters.mixes.map((path) => ({ path, mark: 'mix' as const }))
  ]

  /** The file already shipping, if any. Its presence is what makes this a swap. */
  const outgoing = project.masters.final?.split('\\').pop() ?? null

  const [chosen, setChosen] = useState<string | null>(candidates[0]?.path ?? null)
  const [name, setName] = useState(() => {
    if (!outgoing) return project.name
    // Without its extension: the field asks for a track name, and the service
    // puts the extension back from whichever file is chosen.
    const dot = outgoing.lastIndexOf('.')
    return dot > 0 ? outgoing.slice(0, dot) : outgoing
  })

  const canSubmit = chosen !== null && name.trim().length > 0 && !busy
  const submit = (): void => {
    if (canSubmit) onSubmit(chosen as string, name.trim())
  }

  useDialogKeys({ onCommit: submit, onCancel, canCommit: canSubmit })

  const sizeOf = (path: string): number | null =>
    project.audio.find((file) => file.path === path)?.sizeBytes ?? null

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
          aria-label={
            outgoing ? 'Swap the final mix and master' : 'Choose the final mix and master'
          }
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>
              {outgoing ? 'Swap the final?' : 'Which file ships?'}
            </span>
            <span className={styles.dialogWhere}>{project.name}</span>
          </header>

          <div className={styles.dialogBody}>
            {/*
              What leaves, said before what arrives is chosen. The outgoing file
              is about to be moved off the operator's disk and back into the
              project, and a dialog that only asked which file to promote would
              be describing half of what the button does.
            */}
            {outgoing ? (
              <p className={local.hint}>
                <strong>{outgoing}</strong> goes back into the project, marked as a master.
              </p>
            ) : null}

            {candidates.length === 0 ? (
              <p className={local.warn}>
                {outgoing
                  ? 'Nothing else is marked as a mix or a master. Mark another bounce in MIX AND MASTER first — the final is swapped for one of those.'
                  : 'Nothing is marked as a mix or a master yet. Mark one in MIX AND MASTER first — the final is chosen from what you marked.'}
              </p>
            ) : (
              <div className={local.fileList} role="radiogroup" aria-label="Candidates">
                {candidates.map((candidate) => {
                  const bytes = sizeOf(candidate.path)
                  return (
                    <div
                      key={candidate.path}
                      className={local.file}
                      data-chosen={chosen === candidate.path || undefined}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={chosen === candidate.path}
                        className={local.fileName}
                        title={candidate.path}
                        onClick={() => setChosen(candidate.path)}
                      >
                        {candidate.path.split('\\').pop()}
                      </button>
                      <span className={local.fileMeta}>{AUDIO_MARK_LABEL[candidate.mark]}</span>
                      {bytes !== null ? (
                        <span className={local.fileMeta}>{formatBytes(bytes)}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}

            <TextInput
              label="Ships as"
              value={name}
              onChange={setName}
              placeholder="Track name"
              maxLength={120}
              hint={
                outgoing
                  ? `Ships from ${RELEASE_MASTERED_TRACKS_DIRECTORY_NAME} under this name. The extension is kept.`
                  : `Moves to ${RELEASE_MASTERED_TRACKS_DIRECTORY_NAME}. The extension is kept.`
              }
            />

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
              {outgoing ? 'Swap it' : 'Ship it'}
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
