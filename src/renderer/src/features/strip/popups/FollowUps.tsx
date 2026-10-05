import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  MAX_INTERACTION_POINTS,
  SNOOZES,
  SNOOZE_LABEL,
  TASK_PRIORITY_LABEL
} from '@shared/domain/leads.constants'
import type { PredefinedInteraction } from '@shared/domain/leads'
import { useLeadsSettings } from '@renderer/hooks/useLeads'
import {
  followUpRoute,
  formatDue,
  formatShortWhen,
  formatWhen,
  signOf,
  signed,
  type TaskRow
} from '@renderer/features/artists/leads/model'
import { Icon } from '../icons'
import styles from '../Strip.module.scss'

/**
 * A follow-up on the strip, with what its reminder offers: open the lead,
 * log what happened and complete it, snooze it, or dismiss its reminders
 * (which never completes it). The tick completes it without a log.
 */
export function FollowUpRow({
  row,
  now,
  open,
  onToggle,
  onActed,
  onError
}: {
  row: TaskRow
  now: number
  open: boolean
  onToggle: () => void
  /** After something was done about it: the reminder's popup closes. */
  onActed?: () => void
  onError: (message: string) => void
}): ReactNode {
  const settings = useLeadsSettings()
  const [logging, setLogging] = useState(false)
  const { task, ref, status } = row
  const late = status === 'overdue'
  const dismissed = task.dismissedAt !== null
  const snoozed = task.snoozedUntil !== null && task.snoozedUntil > now

  const act = (work: Promise<unknown>): void => {
    work.then(() => onActed?.()).catch((cause: Error) => onError(cause.message))
  }

  return (
    <div className={styles.entry} data-open={open || undefined} data-follow>
      <div className={styles.entryLine}>
        <button
          type="button"
          className={styles.tick}
          aria-label={`Done: ${task.title}`}
          title="Done, without logging anything"
          onClick={() => act(window.candy.leads.updateTask(ref, { completed: true }))}
        />
        <button type="button" className={styles.entryMain} onClick={onToggle}>
          <span className={styles.entryWhen} data-late={late || undefined}>
            {late ? 'Late' : formatShortWhen(task.dueAt, now)}
          </span>
          <span className={styles.followText}>
            <span className={styles.entryTitle}>{row.who}</span>
            <span className={styles.followTask}>{task.title}</span>
          </span>
          <span className={styles.entryMeta}>
            {task.priority === 'high' ? (
              <span className={styles.followHigh}>{TASK_PRIORITY_LABEL.high}</span>
            ) : null}
            <Icon glyph="person" size={14} />
          </span>
        </button>
      </div>

      {open ? (
        <div className={styles.entryBody}>
          <p className={styles.followDue} data-late={late || undefined}>
            {formatDue(task, status, now)}
            {snoozed && task.snoozedUntil !== null
              ? ` · snoozed to ${formatWhen(task.snoozedUntil, now)}`
              : ''}
            {dismissed ? ' · reminders off' : ''}
          </p>
          {task.notes ? <p className={styles.notes}>{task.notes}</p> : null}

          {logging ? (
            <LogLine
              suggestions={settings.interactions}
              onCancel={() => setLogging(false)}
              onLog={(draft) =>
                act(window.candy.leads.log(row.leadId, draft, ref).then(() => setLogging(false)))
              }
            />
          ) : (
            <div className={styles.followActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setLogging(true)}
              >
                Log and complete
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={() =>
                  act(window.candy.strip.openTarget({ kind: 'page', route: followUpRoute(row) }))
                }
              >
                Open {row.ref.parentKind === 'opportunity' ? 'the opportunity' : 'the lead'}
              </button>
            </div>
          )}

          {late && !logging ? (
            <div className={styles.followActions}>
              <span className={styles.followLabel}>Snooze</span>
              {SNOOZES.map((snooze) => (
                <button
                  key={snooze}
                  type="button"
                  className={styles.textButton}
                  onClick={() => act(window.candy.leads.snooze(ref, snooze))}
                >
                  {SNOOZE_LABEL[snooze]}
                </button>
              ))}
              {!dismissed ? (
                <button
                  type="button"
                  className={styles.textButton}
                  title="No more reminders for it. It stays open."
                  onClick={() => act(window.candy.leads.dismiss(ref))}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** What happened and its points, Enter: the console's log row, small. */
function LogLine({
  suggestions,
  onLog,
  onCancel
}: {
  suggestions: readonly PredefinedInteraction[]
  onLog: (draft: { text: string; points: number }) => void
  onCancel: () => void
}): ReactNode {
  const [text, setText] = useState('')
  const [points, setPoints] = useState('5')
  const [touched, setTouched] = useState(false)
  const textRef = useRef<HTMLInputElement>(null)
  const value = Number(points)
  const valid =
    text.trim().length > 0 &&
    points.trim() !== '' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_INTERACTION_POINTS

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (valid) onLog({ text: text.trim(), points: value })
  }

  const typed = text.trim().toLowerCase()
  const matches = suggestions.filter((entry) => !typed || entry.name.toLowerCase().includes(typed))

  return (
    <form className={styles.logLine} autoComplete="off" onSubmit={submit}>
      <div className={styles.logFields}>
        <input
          ref={textRef}
          className={styles.input}
          value={text}
          placeholder="What happened?"
          aria-label="What happened"
          maxLength={200}
          // Opened by a press, to type into.
          autoFocus
          onChange={(event) => {
            setText(event.target.value)
            const match = suggestions.find(
              (entry) => entry.name.toLowerCase() === event.target.value.trim().toLowerCase()
            )
            if (match && !touched) setPoints(String(match.points))
          }}
        />
        <input
          className={styles.points}
          type="number"
          min={-MAX_INTERACTION_POINTS}
          max={MAX_INTERACTION_POINTS}
          value={points}
          aria-label="Points"
          data-sign={signOf(Number(points) || 0)}
          onChange={(event) => {
            setPoints(event.target.value)
            setTouched(true)
          }}
        />
      </div>
      <div className={styles.logSuggestions}>
        {(matches.length ? matches : suggestions).slice(0, 6).map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={styles.logSuggestion}
            onClick={() => {
              setText(entry.name)
              setPoints(String(entry.points))
              setTouched(false)
              textRef.current?.focus()
            }}
          >
            {entry.name} <span data-sign={signOf(entry.points)}>{signed(entry.points)}</span>
          </button>
        ))}
      </div>
      <div className={styles.entryActions}>
        <button type="submit" className={styles.primaryButton} disabled={!valid}>
          Log and complete
        </button>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  )
}
