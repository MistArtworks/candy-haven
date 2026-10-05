import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { PredefinedInteraction } from '@shared/domain/leads'
import { MAX_INTERACTION_POINTS } from '@shared/domain/leads.constants'
import { signOf, signed, type TaskRow } from './model'
import styles from './Leads.module.scss'

/** Where the points field starts, and goes back to after each log. */
const DEFAULT_POINTS = 5

export interface LogInteractionProps {
  suggestions: readonly PredefinedInteraction[]
  /**
   * The follow-up this could answer: the lead's most pressing one. Offered
   * as "Also complete it", already ticked when it's overdue.
   */
  completing: TaskRow | null
  disabled?: boolean
  /** Resolves true once it's logged, to clear the row. */
  onLog: (draft: { text: string; points: number }, complete: boolean) => Promise<boolean>
}

/**
 * Logging an interaction: what happened, its points, Enter.
 *
 * As the approved prototype has it. The suggestions are REGULATION's
 * predefined interactions; picking one fills both fields, and typing one's
 * name in full brings its points along unless the points were typed by hand.
 * As the text is typed, the suggestions narrow to the ones that match.
 */
export function LogInteraction({
  suggestions,
  completing,
  disabled = false,
  onLog
}: LogInteractionProps): ReactNode {
  const [text, setText] = useState('')
  const [points, setPoints] = useState(String(DEFAULT_POINTS))
  const [pointsTouched, setPointsTouched] = useState(false)
  // Ticked by default only for an overdue follow-up: answering it is the
  // likely reason for logging, where a future one usually isn't. Changed by
  // hand, the choice holds for that follow-up only.
  const [override, setOverride] = useState<{ taskId: string; on: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const textRef = useRef<HTMLInputElement>(null)

  const complete =
    completing !== null &&
    (override?.taskId === completing.task.id ? override.on : completing.status === 'overdue')

  const typed = text.trim().toLowerCase()
  const matches = suggestions.filter((entry) => !typed || entry.name.toLowerCase().includes(typed))
  const shown = matches.length > 0 ? matches : suggestions

  const value = pointsOf(points)
  const canLog = !disabled && !busy && text.trim().length > 0 && value !== null

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    if (!canLog || value === null) {
      textRef.current?.focus()
      return
    }
    setBusy(true)
    const logged = await onLog({ text: text.trim(), points: value }, complete)
    setBusy(false)
    if (!logged) return
    setText('')
    setPoints(String(DEFAULT_POINTS))
    setPointsTouched(false)
    setOverride(null)
    textRef.current?.focus()
  }

  return (
    <div className={styles.log}>
      <form className={styles.logRow} autoComplete="off" onSubmit={(event) => void submit(event)}>
        <input
          ref={textRef}
          className={styles.logText}
          value={text}
          maxLength={200}
          placeholder="What happened? They replied to my story"
          aria-label="What happened"
          disabled={disabled}
          // The row is its own form: Enter logs here, not in a dialog around it.
          data-enter="own"
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const match = suggestions.find(
              (entry) => entry.name.toLowerCase() === next.trim().toLowerCase()
            )
            if (match && !pointsTouched) setPoints(String(match.points))
          }}
        />
        <input
          className={styles.logPoints}
          type="number"
          min={-MAX_INTERACTION_POINTS}
          max={MAX_INTERACTION_POINTS}
          step={1}
          value={points}
          aria-label="Points"
          data-sign={signOf(value ?? 0)}
          data-enter="own"
          disabled={disabled}
          onChange={(event) => {
            setPoints(event.target.value)
            setPointsTouched(true)
          }}
        />
        <button type="submit" className={styles.textButton} disabled={!canLog}>
          Log
        </button>
      </form>

      {completing ? (
        <label className={styles.logComplete}>
          <input
            type="checkbox"
            checked={complete}
            disabled={disabled}
            onChange={(event) =>
              setOverride({ taskId: completing.task.id, on: event.target.checked })
            }
          />
          <span>
            Also complete <b>{completing.task.title}</b>
          </span>
        </label>
      ) : null}

      {suggestions.length > 0 ? (
        <div className={styles.suggestions} role="group" aria-label="Predefined interactions">
          {shown.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.suggestion}
              disabled={disabled}
              onClick={() => {
                setText(entry.name)
                setPoints(String(entry.points))
                setPointsTouched(false)
                textRef.current?.focus()
              }}
            >
              <span>{entry.name}</span>
              <span className={styles.delta} data-sign={signOf(entry.points)}>
                {signed(entry.points)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A whole number of points in range, or null. */
function pointsOf(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || Math.abs(number) > MAX_INTERACTION_POINTS) return null
  return number
}
