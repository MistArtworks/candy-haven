import { useMemo, useState, type ReactNode } from 'react'
import type { ArtistRecord } from '@shared/domain/artists'
import type { TrackDraft } from '@shared/domain/discography'
import { MAX_TRACK_TITLE, isValidIsrc, normaliseIsrc } from '@shared/domain/discography.constants'
import type { ProjectSummary } from '@shared/domain/projects'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import styles from '../DiscographyPage.module.scss'

export interface TrackDialogProps {
  releaseTitle: string
  /**
   * Finished, filed projects not already on this release.
   *
   * Gated on `LINKABLE_PROJECT_STAGES` by the page — see `linkableProjects`.
   */
  available: readonly ProjectSummary[]
  roster: readonly ArtistRecord[]
  busy: boolean
  error: string | null
  onSubmit: (draft: TrackDraft) => void
  onCancel: () => void
}

/**
 * Add a track to a release.
 *
 * **Only the title is required**, and it fills itself in from the project
 * when one is chosen — so the common case, adding something made here, is
 * pick the project and press Add.
 *
 * Linking is offered rather than demanded, which is the department's whole
 * premise: a back catalogue, a label master and somebody else's remix all
 * belong on a release and none has a project in the register. Choosing
 * **No project** is an ordinary answer, not a skipped step.
 */
export function TrackDialog({
  releaseTitle,
  available,
  roster,
  busy,
  error,
  onSubmit,
  onCancel
}: TrackDialogProps): ReactNode {
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [artistIds, setArtistIds] = useState<string[]>([])
  const [isrc, setIsrc] = useState('')

  const project = useMemo(
    () => available.find((entry) => entry.id === projectId) ?? null,
    [available, projectId]
  )

  /*
   * The title the track will actually get.
   *
   * Derived rather than written into state when a project is picked, so that
   * changing the project updates it — but a title the operator has typed
   * always wins, because overwriting what somebody deliberately entered is
   * the worse failure of the two. Same reasoning as `ProjectDialog`'s volume
   * resolution used to use before that field was retired.
   */
  const resolved = title.trim() || project?.name || ''
  const isrcBad = isrc.trim().length > 0 && !isValidIsrc(isrc)
  const canConfirm = resolved.length > 0 && !isrcBad && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onSubmit({
      title: resolved,
      projectId: projectId || null,
      artistIds,
      isrc: isrc.trim() ? normaliseIsrc(isrc) : ''
    })
  }

  return (
    <Dialog
      title="Add a track"
      subtitle={releaseTitle}
      busy={busy}
      error={error}
      confirmLabel="Add"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote="It joins the end of the running order; the arrows move it from there."
    >
      {/*
        Only finished, filed work is offered, and the hint says so.

        Without it, an operator who cannot find the project they were working
        on yesterday has no way to tell whether the picker is broken or
        whether the work simply is not finished yet. Naming the rule turns a
        missing entry into an instruction — and the rule now has two parts, so
        the sentence names the one that is more likely to be the cause.
      */}
      <DialogField
        label="Project"
        hint={
          available.length === 0
            ? 'Nothing is at TRACK READY. Move a project there in the ARCHIVE and it can be linked here — loose or unfinished work is not offered.'
            : 'Optional, and finished work only — TRACK READY or later. A track does not need one; a back catalogue has none.'
        }
      >
        <select
          className={styles.dialogSelect}
          value={projectId}
          aria-label="Link a project"
          disabled={available.length === 0}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">No project</option>
          {available.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </DialogField>

      <TextInput
        label="Title"
        value={title}
        onChange={setTitle}
        placeholder={project ? project.name : 'Its title'}
        maxLength={MAX_TRACK_TITLE}
        hint={
          project && !title.trim()
            ? `Takes the project's name — “${project.name}” — unless you type one.`
            : undefined
        }
      />

      {roster.length > 0 ? (
        <DialogField label="Credits" hint="Anyone on this track beyond the release's own billing.">
          <DialogChips>
            {roster.map((artist) => (
              <DialogChip
                key={artist.id}
                on={artistIds.includes(artist.id)}
                label={artist.name}
                onClick={() =>
                  setArtistIds((current) =>
                    current.includes(artist.id)
                      ? current.filter((entry) => entry !== artist.id)
                      : [...current, artist.id]
                  )
                }
              />
            ))}
          </DialogChips>
        </DialogField>
      ) : null}

      <TextInput
        label="ISRC"
        value={isrc}
        onChange={setIsrc}
        placeholder="Optional — GBXXX2600001"
        mono
        hint={
          isrcBad
            ? 'Two letters, three characters, then seven digits.'
            : 'Identifies this recording. The UPC on the release identifies the product.'
        }
      />
    </Dialog>
  )
}
