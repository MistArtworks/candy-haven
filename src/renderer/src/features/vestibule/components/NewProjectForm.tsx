import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_FOLDER_COLOUR, validateFolderName } from '@shared/domain/stacks.constants'
import type { ArchiveFolder } from '@shared/domain/stacks'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from '@renderer/features/archive/components/stacks/SwatchPicker'
import { ShelfBrowser } from './ShelfBrowser'
import { canShelveIn } from './shelf-tree'
import styles from '../VestibulePage.module.scss'

export interface NewProjectFormProps {
  folders: readonly ArchiveFolder[]
  shelfId: string | null
  onShelfChange: (id: string | null) => void
  busy: boolean
  error: string | null
  onSubmit: (draft: { folderId: string; name: string; colour: string }) => void
  onBack: () => void
}

/**
 * A name, a colour and a destination, in the window that opened.
 *
 * Not `ProjectDialog`. That one is a portalled modal over a console page which
 * already knows which shelf you are standing on, so it takes the destination as
 * a string and shows it — here there is no page behind, and *where* is half the
 * question. What the two share is everything that decides whether a set is
 * legal: the same `validateFolderName`, the same swatches. The name is checked
 * against the shared folder rules because a project **is** a directory, and it
 * is checked again by the service on the way in; this one only saves a round
 * trip.
 *
 * **There is no category chooser**, on the operator's instruction: a new set is
 * a single until it turns out to be something else, and that is a fact about
 * the finished work rather than about starting it. It is one chip row in the
 * dossier to change there. The draft leaves here without a category and the
 * page supplies it, so this form never has to know the answer.
 */
export function NewProjectForm({
  folders,
  shelfId,
  onShelfChange,
  busy,
  error,
  onSubmit,
  onBack
}: NewProjectFormProps): ReactNode {
  const [name, setName] = useState('')
  const [colour, setColour] = useState(DEFAULT_FOLDER_COLOUR)

  const shelf = useMemo(
    () => folders.find((folder) => folder.id === shelfId) ?? null,
    [folders, shelfId]
  )

  const verdict = validateFolderName(name)
  const shelfOk = canShelveIn(shelf)
  const canSubmit = verdict.ok && shelfOk && !busy

  const submit = (): void => {
    if (!canSubmit || !shelf) return
    onSubmit({ folderId: shelf.id, name: name.trim(), colour })
  }

  return (
    <div className={styles.form}>
      <div className={styles.formScroll}>
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Solstice"
          maxLength={64}
          // The one field on this surface, so it has to look like one on its own.
          boxed
          invalid={name.length > 0 && !verdict.ok}
          // Only complain once there is something to complain about — a pristine
          // empty field is not an error, it is an unstarted one.
          hint={
            name.length > 0 && !verdict.ok
              ? (verdict.reason ?? undefined)
              : 'The folder is created as “Name Project”, as Ableton names its own.'
          }
        />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Shelf</span>
          <ShelfBrowser folders={folders} currentId={shelfId} onNavigate={onShelfChange} />
          <p className={styles.filingInto} data-ok={shelfOk || undefined}>
            {shelfOk && shelf ? (
              <>
                FILING INTO <span className={styles.filingName}>{shelf.name}</span>
              </>
            ) : shelf ? (
              <>A CATEGORY HOLDS NO PROJECTS. OPEN A GENRE OR AN ARTIST INSIDE IT.</>
            ) : (
              <>CHOOSE A SHELF. NOTHING IS FILED AT THE TOP OF THE ARCHIVE.</>
            )}
          </p>
        </div>

        <SwatchPicker value={colour} onChange={setColour} subject="Project" />

        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className={styles.formActions}>
        <p className={styles.formNote}>
          Creates the folder and copies your template set into it, then opens it in Ableton.
        </p>
        <Button size="sm" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="sm" busy={busy} disabled={!canSubmit} onClick={submit}>
          Create
        </Button>
      </div>
    </div>
  )
}
