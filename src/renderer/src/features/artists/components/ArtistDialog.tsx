import { useState, type ReactNode } from 'react'
import type { ArtistDraft, ArtistRole } from '@shared/domain/artists'
import {
  ARTIST_ROLES,
  ARTIST_ROLE_LABEL,
  MAX_ARTIST_NAME,
  MAX_ARTIST_REAL_NAME,
  checkArtistName
} from '@shared/domain/artists.constants'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from '@renderer/features/archive/components/stacks/SwatchPicker'
import { DEFAULT_FOLDER_COLOUR } from '@shared/domain/stacks.constants'

export interface ArtistDialogProps {
  busy: boolean
  error: string | null
  onSubmit: (draft: ArtistDraft) => void
  onCancel: () => void
}

/**
 * Add somebody to the roster.
 *
 * **Only the name is required.** Everything else is optional and can be left
 * for later — which is not laziness about validation, it is how a roster is
 * actually filled in: you add somebody the moment you need to credit them,
 * usually mid-way through doing something else, and the roles and the links
 * arrive whenever you next think about it.
 *
 * This replaced a bare name field in the page's control strip that created
 * the record and immediately opened the sheet to edit it. That worked but
 * read as two steps for one intent, and it meant the *only* way to set
 * anything was to go back and re-edit.
 *
 * The picture is deliberately **not** here. Storing one keys the file by the
 * artist's id, and there is no id until the record exists — so it is the one
 * field that genuinely cannot be set before creation. The sheet takes it, and
 * this dialog hands straight over to the sheet on success.
 */
export function ArtistDialog({ busy, error, onSubmit, onCancel }: ArtistDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [realName, setRealName] = useState('')
  const [roles, setRoles] = useState<ArtistRole[]>([])
  const [colour, setColour] = useState(DEFAULT_FOLDER_COLOUR)
  const [notes, setNotes] = useState('')

  const verdict = checkArtistName(name)
  const canConfirm = verdict.ok && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onSubmit({
      name: name.trim(),
      // Empty strings rather than omitted keys: the draft schema takes
      // optionals, and sending `''` says "they have none" as plainly as
      // leaving it out while keeping this object one shape.
      realName: realName.trim(),
      roles,
      colour,
      notes: notes.trim()
    })
  }

  return (
    <Dialog
      title="Add an artist"
      busy={busy}
      error={error}
      confirmLabel="Add"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote="Only the name is needed. A picture and links are added on their sheet, which opens next."
    >
      <TextInput
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Nasko"
        maxLength={MAX_ARTIST_NAME}
        // Complains only once there is something to complain about: a
        // pristine empty field is unstarted, not wrong.
        hint={
          name.length > 0 && !verdict.ok
            ? verdict.reason
            : 'How they are billed. Renaming later propagates everywhere at once.'
        }
      />

      <TextInput
        label="Real name"
        value={realName}
        onChange={setRealName}
        placeholder="Optional — for splits and paperwork"
        maxLength={MAX_ARTIST_REAL_NAME}
      />

      <DialogField label="Roles" hint="What they do. Pick any, or none.">
        <DialogChips>
          {ARTIST_ROLES.map((role) => (
            <DialogChip
              key={role}
              on={roles.includes(role)}
              label={ARTIST_ROLE_LABEL[role]}
              onClick={() =>
                setRoles((current) =>
                  current.includes(role)
                    ? current.filter((entry) => entry !== role)
                    : [...current, role]
                )
              }
            />
          ))}
        </DialogChips>
      </DialogField>

      <TextInput
        label="Notes"
        value={notes}
        onChange={setNotes}
        placeholder="Optional — how you met, what they play"
      />

      <SwatchPicker value={colour} onChange={setColour} subject="Artist" />
    </Dialog>
  )
}
