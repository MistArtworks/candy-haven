import { useState, type ReactNode } from 'react'
import type { ArtistRecord } from '@shared/domain/artists'
import type { ReleaseDraft, ReleaseKind, ReleaseStatus } from '@shared/domain/discography'
import {
  MAX_RELEASE_TITLE,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_KIND_PURPOSE,
  RELEASE_KIND_TRACK_HINT,
  RELEASE_STATUSES,
  RELEASE_STATUS_LABEL,
  RELEASE_STATUS_PURPOSE,
  seedsOneTrack
} from '@shared/domain/discography.constants'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { DateInput, TextInput } from '@renderer/components/primitives/Input'

export interface ReleaseDialogProps {
  roster: readonly ArtistRecord[]
  busy: boolean
  error: string | null
  onSubmit: (draft: ReleaseDraft) => void
  onCancel: () => void
}

/**
 * Raise a release.
 *
 * **The title and the kind are required; nothing else is.** That split is not
 * arbitrary — they are the two facts that exist the moment an entry is worth
 * making. A label, a catalogue number, a UPC and a date all arrive later,
 * often months later and from somebody else, which is exactly why the sheet
 * writes every field the instant it changes rather than asking for a commit.
 *
 * The kind carries a default of `SINGLE` rather than starting unset, because
 * it is right most of the time and an unset required field is a dialog that
 * refuses to open having told you nothing.
 *
 * A date is offered but not demanded, and the status chips explain what the
 * difference costs: `RELEASED` is the one status that genuinely needs one,
 * and the service refuses it without — so this dialog refuses it here rather
 * than letting the operator find out after pressing Raise.
 */
export function ReleaseDialog({
  roster,
  busy,
  error,
  onSubmit,
  onCancel
}: ReleaseDialogProps): ReactNode {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ReleaseKind>('single')
  // Everything starts SCHEDULED now that the set is two — an entry exists
  // because something is meant to go out, and the empty date says when is not
  // fixed yet. This was `idea`, which no longer exists.
  const [status, setStatus] = useState<ReleaseStatus>('scheduled')
  const [releaseDate, setReleaseDate] = useState('')
  const [artistIds, setArtistIds] = useState<string[]>(
    // The operator's own record is billed by default, because almost every
    // entry is theirs. One press removes it for anything that is not.
    () => roster.filter((artist) => artist.isOperator).map((artist) => artist.id)
  )

  const needsDate = status === 'released' && !releaseDate
  const canConfirm = title.trim().length > 0 && !needsDate && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onSubmit({
      title: title.trim(),
      kind,
      status,
      releaseDate: releaseDate || null,
      artistIds
    })
  }

  return (
    <Dialog
      title="Raise a release"
      width="wide"
      busy={busy}
      error={error}
      confirmLabel="Raise"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote={
        seedsOneTrack(kind)
          ? `A ${RELEASE_KIND_LABEL[kind].toLowerCase()} arrives with one track, taking the title. Artwork, label and the distribution codes are added on the sheet, which opens next.`
          : 'Tracks, artwork, label and the distribution codes are added on the sheet, which opens next. It does not need a project in the ARCHIVE behind it.'
      }
    >
      <TextInput
        label="Title"
        value={title}
        onChange={setTitle}
        placeholder="Ossuary"
        maxLength={MAX_RELEASE_TITLE}
        hint="What it is called. Everything else can wait."
      />

      <DialogField label="Kind" required hint={RELEASE_KIND_TRACK_HINT[kind]}>
        <DialogChips>
          {RELEASE_KINDS.map((entry) => (
            <DialogChip
              key={entry}
              on={kind === entry}
              label={RELEASE_KIND_LABEL[entry]}
              title={RELEASE_KIND_PURPOSE[entry]}
              onClick={() => setKind(entry)}
            />
          ))}
        </DialogChips>
      </DialogField>

      <DialogField label="Status" hint={RELEASE_STATUS_PURPOSE[status]}>
        <DialogChips>
          {RELEASE_STATUSES.map((entry) => (
            <DialogChip
              key={entry}
              on={status === entry}
              label={RELEASE_STATUS_LABEL[entry]}
              title={RELEASE_STATUS_PURPOSE[entry]}
              onClick={() => setStatus(entry)}
            />
          ))}
        </DialogChips>
      </DialogField>

      {/*
        The primitive, not the third raw date input this department had.

        Without a `DialogField` around it: that wrapper draws its own label and
        hint, and `DateInput` draws both itself, so nesting them says
        everything twice. What is lost is the wrapper's `required` marker — a
        release date is only required once the entry is RELEASED, and the hint
        below says exactly that, which is more than an asterisk manages.
      */}
      <DateInput
        label="Release date"
        value={releaseDate}
        onChange={setReleaseDate}
        invalid={needsDate}
        hint={
          needsDate
            ? 'A released entry needs the date it came out — the catalogue sorts by it.'
            : 'Optional until it is out.'
        }
      />

      {roster.length > 0 ? (
        <DialogField label="Billed as" hint="Who it is by. Features are added on the sheet.">
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
    </Dialog>
  )
}
