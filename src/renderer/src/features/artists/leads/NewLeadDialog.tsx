import { useState, type ReactNode } from 'react'
import type { ArtistSummary } from '@shared/domain/artists'
import { checkLinkUrl, guessPlatform } from '@shared/domain/artists.constants'
import type { LeadDraft } from '@shared/domain/leads'
import { FIRST_TASK_TITLE } from '@shared/domain/leads.constants'
import { Dialog, DialogField } from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import { Select } from '@renderer/components/primitives/Select'
import { DueField } from './DueField'
import styles from './Leads.module.scss'

export interface NewLeadDialogProps {
  roster: readonly ArtistSummary[]
  busy: boolean
  onSubmit: (draft: LeadDraft) => void
  onCancel: () => void
}

/** The roster choice that links nobody. */
const NOBODY = ''

/**
 * Add a lead: somebody to build a relationship with.
 *
 * Only the name is needed, as for an artist. The first interaction comes
 * with it: a high-priority follow-up, due now unless a time is picked here.
 * Due now, it doesn't send a reminder straight away (Candy is looking at it);
 * it waits on the strip and in the list as overdue until it's done.
 */
export function NewLeadDialog({ roster, busy, onSubmit, onCancel }: NewLeadDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [artistId, setArtistId] = useState(NOBODY)
  const [notes, setNotes] = useState('')
  // Untouched, the service stamps it at the moment the lead is made.
  const [firstDue, setFirstDue] = useState<number | null>(null)
  const [openedAt] = useState(() => Date.now())

  const linkVerdict = link.trim() ? checkLinkUrl(link) : { ok: true, reason: undefined }
  const canConfirm = name.trim().length > 0 && linkVerdict.ok && !busy

  const submit = (): void => {
    if (!canConfirm) return
    const url = link.trim()
    onSubmit({
      name: name.trim(),
      notes: notes.trim(),
      links: url
        ? [{ id: `link-${Date.now()}`, platform: guessPlatform(url), url, label: '' }]
        : [],
      email: email.trim(),
      phone: phone.trim(),
      artistId: artistId === NOBODY ? null : artistId,
      firstTaskDueAt: firstDue
    })
  }

  return (
    <Dialog
      title="Add a lead"
      width="wide"
      busy={busy}
      confirmLabel="Add"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote={`Only the name is needed. "${FIRST_TASK_TITLE}" is added as a high-priority follow-up.`}
    >
      <TextInput
        label="Name"
        value={name}
        onChange={setName}
        maxLength={120}
        placeholder="Who they are, as you know them"
      />
      <TextInput
        label="Where you found them"
        value={link}
        onChange={setLink}
        placeholder="https://instagram.com/…"
        maxLength={500}
        invalid={!linkVerdict.ok}
        hint={linkVerdict.ok ? 'Optional. More links go on their sheet.' : linkVerdict.reason}
      />
      <div className={styles.pair}>
        <TextInput
          label="Email"
          value={email}
          onChange={setEmail}
          maxLength={200}
          placeholder="Optional"
        />
        <TextInput
          label="Phone"
          value={phone}
          onChange={setPhone}
          maxLength={60}
          placeholder="Optional"
        />
      </div>
      {roster.length > 0 ? (
        <DialogField
          label="On the roster"
          hint="Optional. When they're already an artist you work with."
        >
          <Select
            ariaLabel="On the roster"
            value={artistId}
            options={[
              { value: NOBODY, label: 'Not on the roster' },
              ...roster.map((artist) => ({ value: artist.id, label: artist.name }))
            ]}
            onChange={setArtistId}
          />
        </DialogField>
      ) : null}
      <TextInput
        label="Notes"
        value={notes}
        onChange={setNotes}
        maxLength={4000}
        placeholder="Optional: how you came across them, what they make"
      />
      <DueField
        label={`${FIRST_TASK_TITLE} due`}
        value={firstDue ?? openedAt}
        onChange={setFirstDue}
        hint={firstDue === null ? 'Now, unless you pick a time.' : undefined}
      />
    </Dialog>
  )
}
