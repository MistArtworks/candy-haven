import { useEffect, useRef, useState, type ReactNode } from 'react'
import { INBOX_NOTE_MAX } from '@shared/domain/inbox.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextArea } from '@renderer/components/primitives/Input'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../Inbox.module.scss'

/*
 * The parts of an open message or enquiry that both departments share: its
 * details, where it stands, the operator's note, and deleting it.
 */

export interface DetailRow {
  label: string
  value: string
  /** Drawn as a link, `mailto:` for an address. */
  href?: string
}

/**
 * The sender's details, as label and value.
 *
 * Empty ones are left out rather than drawn as a dash: most of the form is
 * optional, and a column of dashes would bury the three things that were
 * actually given.
 */
export function DetailRows({ rows }: { rows: readonly DetailRow[] }): ReactNode {
  const given = rows.filter((row) => row.value.trim())
  if (!given.length) return null

  return (
    <dl className={styles.rows}>
      {given.map((row) => (
        <div key={row.label} className={styles.row}>
          <dt className={styles.rowLabel}>{row.label}</dt>
          <dd className={styles.rowValue}>
            {row.href ? (
              <a
                href={row.href}
                className={styles.inlineLink}
                onClick={(event) => {
                  event.preventDefault()
                  void window.candy.shell.openExternal(row.href as string)
                }}
              >
                {row.value}
              </a>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Where it stands, as a row of switches. */
export function StatusSwitch<S extends string>({
  statuses,
  labels,
  value,
  busy,
  onChange
}: {
  statuses: readonly S[]
  labels: Record<S, string>
  value: S
  busy: boolean
  onChange: (status: S) => void
}): ReactNode {
  return (
    <div className={styles.segmented} role="group" aria-label="Status">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          className={styles.segment}
          data-selected={status === value || undefined}
          disabled={busy}
          onClick={() => {
            if (status !== value) onChange(status)
          }}
        >
          {labels[status]}
        </button>
      ))}
    </div>
  )
}

/** How long typing must pause before the note is filed. */
const NOTE_SETTLE_MS = 700

/**
 * The operator's note, filed as it is typed.
 *
 * Kept on this machine: the website never sees it, and neither does the
 * other copy of the console. Filed once typing pauses, and on the way out if
 * it has not been yet, so closing the message straight after a sentence does
 * not lose it. Keyed by the page on the item, so each one has its own.
 */
export function NoteField({
  note,
  onSave
}: {
  note: string
  onSave: (note: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(note)
  const filed = useRef(note)
  const latest = useRef({ draft, onSave })

  useEffect(() => {
    latest.current = { draft, onSave }
  })

  useEffect(() => {
    if (draft === filed.current) return
    const timer = setTimeout(() => {
      filed.current = draft
      onSave(draft)
    }, NOTE_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [draft, onSave])

  // On the way out: whatever was typed and not yet filed.
  useEffect(
    () => () => {
      const { draft: last, onSave: save } = latest.current
      if (last !== filed.current) save(last)
    },
    []
  )

  return (
    <TextArea
      label="Note"
      value={draft}
      onChange={setDraft}
      rows={3}
      maxLength={INBOX_NOTE_MAX}
      placeholder="Anything worth remembering about this one."
      hint="Kept on this machine only. The website never sees it."
    />
  )
}

/**
 * Deleting it, from the website and from here.
 *
 * Asks in place first, as withdrawing does on the board: it cannot be undone,
 * and the other copy of the console loses it too on its next check-in. Needs
 * the website, so offline it is shown and not offered.
 */
export function DeleteControl({
  reachable,
  busy,
  onDelete
}: {
  reachable: boolean
  busy: boolean
  onDelete: () => void
}): ReactNode {
  const [confirming, setConfirming] = useState(false)

  if (!reachable) {
    return (
      // Wrapped: a disabled button fires no pointer events, so the reason
      // would never show where it is needed most.
      <span
        {...tooltipTrigger('Deleting removes it from the website too, so it needs the website')}
      >
        <Button size="sm" disabled>
          Connect to delete
        </Button>
      </span>
    )
  }

  if (!confirming) {
    return (
      <Button size="sm" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    )
  }

  return (
    <>
      <span className={styles.confirmText}>Delete from the website and here?</span>
      <Button size="sm" variant="danger" busy={busy} onClick={onDelete}>
        Delete
      </Button>
      <Button size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </>
  )
}
