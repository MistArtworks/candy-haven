import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { ChecklistItem } from '@shared/domain/calendar'
import { MAX_STEPS, MAX_STEP_TEXT, checklistProgress } from '../attachments'
import styles from '../CalendarPage.module.scss'

export interface ChecklistFieldProps {
  value: readonly ChecklistItem[]
  onChange: Dispatch<SetStateAction<ChecklistItem[]>>
  disabled?: boolean
}

/**
 * The steps within an entry, ticked off one by one.
 *
 * Edited in place and filed with the rest of the dialog. A step emptied of its
 * text is dropped when the entry is filed rather than refused here, so
 * clearing a line is a way to remove it.
 *
 * Enter belongs to the list while the focus is in it (`data-enter="own"`, see
 * useDialogKeys): in the last line it adds the step, in any other it moves
 * down to the last line, and on a button it presses it. Filing the entry from
 * a half-written step would be a surprise; Save is one click away.
 */
export function ChecklistField({
  value,
  onChange,
  disabled = false
}: ChecklistFieldProps): ReactNode {
  const [draft, setDraft] = useState('')
  const draftRef = useRef<HTMLInputElement>(null)

  const full = value.length >= MAX_STEPS
  const progress = checklistProgress(value)

  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    onChange((current) =>
      current.length >= MAX_STEPS
        ? current
        : [...current, { id: crypto.randomUUID(), text, done: false }]
    )
    setDraft('')
  }

  const update = (id: string, change: Partial<Omit<ChecklistItem, 'id'>>): void => {
    onChange((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  return (
    <div className={styles.field} role="group" aria-label="Checklist">
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>Checklist</span>
        {progress ? (
          <span className={styles.fieldCount}>
            {progress.done}/{progress.total}
          </span>
        ) : null}
      </div>

      <ul className={styles.stepList}>
        {value.map((item, index) => (
          <li key={item.id} className={styles.stepRow} data-done={item.done || undefined}>
            <button
              type="button"
              data-enter="own"
              role="checkbox"
              aria-checked={item.done}
              aria-label={`Step ${index + 1} done`}
              className={styles.stepMark}
              data-done={item.done || undefined}
              disabled={disabled}
              onClick={() => update(item.id, { done: !item.done })}
            />
            <input
              type="text"
              className={styles.stepText}
              value={item.text}
              maxLength={MAX_STEP_TEXT}
              disabled={disabled}
              aria-label={`Step ${index + 1}`}
              data-enter="own"
              onChange={(event) => update(item.id, { text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                draftRef.current?.focus()
              }}
            />
            <button
              type="button"
              data-enter="own"
              className={styles.pinRemove}
              disabled={disabled}
              aria-label={`Remove step ${index + 1}`}
              onClick={() => onChange((current) => current.filter((held) => held.id !== item.id))}
            >
              ×
            </button>
          </li>
        ))}

        {/* The next step, written where it will sit. At the cap the line goes. */}
        {!full ? (
          <li className={styles.stepRow} data-draft>
            <span className={styles.stepMark} data-draft aria-hidden="true" />
            <input
              ref={draftRef}
              type="text"
              className={styles.stepText}
              value={draft}
              maxLength={MAX_STEP_TEXT}
              disabled={disabled}
              placeholder={value.length === 0 ? 'Add a step, then Enter' : 'Add another'}
              aria-label="Add a step"
              data-enter="own"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                add()
              }}
              // A step typed and left is still a step. Pressing Save takes the
              // focus from here before its click lands, so the step is in the
              // list by the time the entry is filed.
              onBlur={add}
            />
          </li>
        ) : null}
      </ul>

      {full ? (
        <p className={styles.fieldEmpty}>{MAX_STEPS} steps is the most an entry holds.</p>
      ) : null}
    </div>
  )
}
