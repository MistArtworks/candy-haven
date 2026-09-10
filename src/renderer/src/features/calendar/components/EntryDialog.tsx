import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { CalendarEntry, CalendarKind } from '@shared/domain/calendar'
import { CALENDAR_KIND, CALENDAR_KIND_LIST, formatMinute } from '@shared/domain/calendar.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import {
  Checkbox,
  DateInput,
  SelectInput,
  TextArea,
  TextInput
} from '@renderer/components/primitives/Input'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import styles from '../CalendarPage.module.scss'

/** What the dialog was opened with: an existing entry, or a blank on a date. */
export type EntryDialogSubject =
  | { mode: 'create'; date: string; startMinute: number | null }
  | { mode: 'edit'; entry: CalendarEntry }

export interface EntryDialogProps {
  subject: EntryDialogSubject | null
  busy: boolean
  error: string | null
  onClose: () => void
  onCreate: (values: EntryValues) => void
  onSave: (id: string, values: EntryValues) => void
  onDelete: (id: string) => void
}

export interface EntryValues {
  title: string
  kind: CalendarKind
  date: string
  startMinute: number | null
  durationMinutes: number
  notes: string
}

/** Durations offered rather than typed: a session is an hour, not 63 minutes. */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480] as const

/** Start times on the half hour, which is every start anybody books. */
const STARTS = Array.from({ length: 48 }, (_, index) => index * 30)

/**
 * Filing and amending an entry.
 *
 * Portalled, because the page it opens from carries a transform from the shell's
 * page transition and a `position: fixed` child would centre on the page box
 * rather than the window. Every overlay in this application does the same; see
 * components/primitives/Portal.tsx.
 */
export function EntryDialog({
  subject,
  busy,
  error,
  onClose,
  onCreate,
  onSave,
  onDelete
}: EntryDialogProps): ReactNode {
  if (!subject) return null

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
          aria-label={subject.mode === 'edit' ? 'Amend entry' : 'File entry'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <EntryForm
            key={
              subject.mode === 'edit'
                ? subject.entry.id
                : `${subject.date}:${String(subject.startMinute)}`
            }
            subject={subject}
            busy={busy}
            error={error}
            onClose={onClose}
            onCreate={onCreate}
            onSave={onSave}
            onDelete={onDelete}
          />
        </motion.div>
      </div>
    </Portal>
  )
}

/**
 * Split from the dialog so the form's state is created fresh per subject.
 *
 * The `key` above is what does it. Holding the draft in the parent and syncing
 * it with an effect is the alternative, and it is how a dialog ends up showing
 * the previous entry's title for one frame.
 */
function EntryForm({
  subject,
  busy,
  error,
  onClose,
  onCreate,
  onSave,
  onDelete
}: {
  subject: EntryDialogSubject
  busy: boolean
  error: string | null
  onClose: () => void
  onCreate: (values: EntryValues) => void
  onSave: (id: string, values: EntryValues) => void
  onDelete: (id: string) => void
}): ReactNode {
  const existing = subject.mode === 'edit' ? subject.entry : null

  const [title, setTitle] = useState(existing?.title ?? '')
  const [kind, setKind] = useState<CalendarKind>(existing?.kind ?? 'session')
  const [date, setDate] = useState(
    existing?.date ?? (subject.mode === 'create' ? subject.date : '')
  )
  const [allDay, setAllDay] = useState(
    existing
      ? existing.startMinute === null
      : subject.mode === 'create' && subject.startMinute === null
  )
  const [startMinute, setStartMinute] = useState(
    existing?.startMinute ?? (subject.mode === 'create' ? (subject.startMinute ?? 600) : 600)
  )
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 60)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const canCommit = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !busy

  const commit = (): void => {
    if (!canCommit) return
    const values: EntryValues = {
      title: title.trim(),
      kind,
      date,
      startMinute: allDay ? null : startMinute,
      durationMinutes: duration,
      notes: notes.trim()
    }

    if (existing) onSave(existing.id, values)
    else onCreate(values)
  }

  useDialogKeys({ onCommit: commit, onCancel: onClose, canCommit })

  return (
    <>
      <header className={styles.dialogHead}>
        <span className={styles.dialogIndex}>{existing ? 'AMEND' : 'FILE'}</span>
        <h2 className={styles.dialogTitle}>{CALENDAR_KIND[kind].label}</h2>
        <span className={styles.dialogRule} aria-hidden="true" />
      </header>

      <p className={styles.dialogPurpose}>{CALENDAR_KIND[kind].purpose}</p>

      <div className={styles.dialogBody}>
        <TextInput
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="What is happening"
          maxLength={160}
        />

        <div className={styles.dialogRow}>
          <SelectInput
            label="Kind"
            value={kind}
            options={CALENDAR_KIND_LIST.map((entry) => ({ value: entry.id, label: entry.label }))}
            onChange={setKind}
          />
          <DateInput label="Date" value={date} onChange={setDate} />
        </div>

        <Checkbox
          label="All day"
          checked={allDay}
          onChange={setAllDay}
          hint="Drawn in the day's header band rather than against the clock."
        />

        {!allDay ? (
          <div className={styles.dialogRow}>
            <SelectInput
              label="Starts"
              value={String(startMinute)}
              options={STARTS.map((minute) => ({
                value: String(minute),
                label: formatMinute(minute)
              }))}
              onChange={(value) => setStartMinute(Number(value))}
            />
            <SelectInput
              label="Runs for"
              value={String(duration)}
              options={DURATIONS.map((minutes) => ({
                value: String(minutes),
                label:
                  minutes >= 60
                    ? `${minutes / 60}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
                    : `${minutes}m`
              }))}
              onChange={(value) => setDuration(Number(value))}
            />
          </div>
        ) : null}

        <TextArea
          label="Notes"
          value={notes}
          onChange={setNotes}
          rows={3}
          maxLength={2000}
          placeholder="Anything the entry should carry with it"
        />

        {error ? <p className={styles.dialogError}>{error}</p> : null}
      </div>

      <footer className={styles.dialogFoot}>
        {existing ? (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              // Two-step, in place, rather than a second dialog over this one:
              // a confirmation that opens another overlay is how an operator
              // ends up two escapes from where they were.
              if (confirmingDelete) onDelete(existing.id)
              else setConfirmingDelete(true)
            }}
          >
            {confirmingDelete ? 'Strike it — certain?' : 'Strike from register'}
          </Button>
        ) : (
          <span />
        )}

        <div className={styles.dialogActions}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} disabled={!canCommit} onClick={commit}>
            {existing ? 'Save' : 'File entry'}
          </Button>
        </div>
      </footer>
    </>
  )
}
