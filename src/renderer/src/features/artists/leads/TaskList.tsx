import { useState, type ReactNode } from 'react'
import type { TaskDraft, TaskRef } from '@shared/domain/leads'
import {
  SNOOZES,
  SNOOZE_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type TaskPriority
} from '@shared/domain/leads.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import type { LeadsActions } from '@renderer/hooks/useLeads'
import { DueField } from './DueField'
import { formatDue, formatWhen, type TaskRow } from './model'
import styles from './Leads.module.scss'

export interface TaskListProps {
  rows: readonly TaskRow[]
  now: number
  actions: LeadsActions
  /** Whose list it is; null for a list across leads, which can't take new ones. */
  parent: { kind: TaskRef['parentKind']; id: string } | null
  /** Names whose follow-up each row is, and opens it: for a list across leads. */
  onOpenWho?: (row: TaskRow) => void
  /** What to say when there are none. */
  empty?: string
}

/**
 * Follow-ups: due, overdue or done, and what can be done about each.
 *
 * The same actions as the reminders, so nothing about a follow-up needs the
 * strip: done, snooze, dismiss (its reminders stop; it stays open), edit,
 * remove. Done ones fold away under the open ones.
 */
export function TaskList({
  rows,
  now,
  actions,
  parent,
  onOpenWho,
  empty = 'No follow-ups.'
}: TaskListProps): ReactNode {
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const open = rows.filter((row) => row.status !== 'complete')
  const done = rows.filter((row) => row.status === 'complete')

  return (
    <div className={styles.tasks}>
      {open.length === 0 && !adding ? <p className={styles.quiet}>{empty}</p> : null}

      {open.length > 0 ? (
        <ul className={styles.taskList}>
          {open.map((row) => (
            <TaskItem
              key={row.task.id}
              row={row}
              now={now}
              actions={actions}
              onOpenWho={onOpenWho}
            />
          ))}
        </ul>
      ) : null}

      {parent ? (
        adding ? (
          <TaskEditor
            initial={{ title: '', dueAt: tomorrowAtTen(now), priority: 'normal', notes: '' }}
            submitLabel="Add the follow-up"
            onCancel={() => setAdding(false)}
            onSubmit={async (draft) => {
              const state = await actions.addTask(parent.kind, parent.id, draft)
              if (state) setAdding(false)
            }}
          />
        ) : (
          <div className={styles.tasksFoot}>
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              Add a follow-up
            </Button>
            {done.length > 0 ? (
              <button
                type="button"
                className={styles.linkButton}
                aria-expanded={showDone}
                onClick={() => setShowDone((current) => !current)}
              >
                {showDone ? 'Hide' : 'Show'} {done.length} done
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {showDone && done.length > 0 ? (
        <ul className={styles.taskList} data-done>
          {done.map((row) => (
            <TaskItem key={row.task.id} row={row} now={now} actions={actions} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

interface TaskItemProps {
  row: TaskRow
  now: number
  actions: LeadsActions
  onOpenWho?: (row: TaskRow) => void
}

/** One follow-up: its tick, what and when, and its actions. */
export function TaskItem({ row, now, actions, onOpenWho }: TaskItemProps): ReactNode {
  const [editing, setEditing] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const { task, status, ref } = row
  const done = status === 'complete'
  const snoozed = !done && task.snoozedUntil !== null && task.snoozedUntil > now
  const dismissed = !done && task.dismissedAt !== null

  if (editing) {
    return (
      <li className={styles.task} data-editing>
        <TaskEditor
          initial={{
            title: task.title,
            dueAt: task.dueAt,
            priority: task.priority,
            notes: task.notes
          }}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onRemove={async () => {
            const state = await actions.removeTask(ref)
            if (state) setEditing(false)
          }}
          onSubmit={async (draft) => {
            const state = await actions.updateTask(ref, draft)
            if (state) setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className={styles.task} data-status={status} data-priority={task.priority}>
      <button
        type="button"
        className={styles.tick}
        data-on={done || undefined}
        aria-label={done ? `Not done: ${task.title}` : `Done: ${task.title}`}
        onClick={() => void actions.updateTask(ref, { completed: !done })}
      >
        {done ? '✓' : null}
      </button>

      <div className={styles.taskMain}>
        <span className={styles.taskTitle}>
          {task.title}
          {task.priority === 'high' && !done ? (
            <span className={styles.priority}>{TASK_PRIORITY_LABEL.high}</span>
          ) : null}
        </span>
        <span className={styles.taskMeta}>
          <span className={styles.taskStatus} data-status={status}>
            {TASK_STATUS_LABEL[status]}
          </span>
          <span className={styles.taskDue} data-status={status} title={formatWhen(task.dueAt, now)}>
            {formatDue(task, status, now)}
          </span>
          {snoozed && task.snoozedUntil !== null ? (
            <span className={styles.taskMark}>Snoozed to {formatWhen(task.snoozedUntil, now)}</span>
          ) : null}
          {dismissed ? <span className={styles.taskMark}>Reminders off</span> : null}
          {onOpenWho ? (
            <button type="button" className={styles.taskWho} onClick={() => onOpenWho(row)}>
              {row.who}
            </button>
          ) : null}
        </span>
        {task.notes ? <span className={styles.taskNotes}>{task.notes}</span> : null}

        {snoozing ? (
          <span className={styles.snoozeRow} role="group" aria-label="Snooze until">
            {SNOOZES.map((snooze) => (
              <button
                key={snooze}
                type="button"
                className={styles.preset}
                onClick={() => {
                  setSnoozing(false)
                  void actions.snooze(ref, snooze)
                }}
              >
                {SNOOZE_LABEL[snooze]}
              </button>
            ))}
            <button type="button" className={styles.linkButton} onClick={() => setSnoozing(false)}>
              Cancel
            </button>
          </span>
        ) : null}
      </div>

      <span className={styles.taskActions}>
        {!done && status === 'overdue' ? (
          <button
            type="button"
            className={styles.linkButton}
            aria-expanded={snoozing}
            onClick={() => setSnoozing((current) => !current)}
          >
            Snooze
          </button>
        ) : null}
        {!done && status === 'overdue' && !dismissed ? (
          <button
            type="button"
            className={styles.linkButton}
            title="No more reminders for it. It stays open."
            onClick={() => void actions.dismiss(ref)}
          >
            Dismiss
          </button>
        ) : null}
        <button type="button" className={styles.linkButton} onClick={() => setEditing(true)}>
          Edit
        </button>
      </span>
    </li>
  )
}

interface TaskEditorProps {
  initial: TaskDraft
  submitLabel: string
  onSubmit: (draft: TaskDraft) => Promise<void>
  onCancel: () => void
  onRemove?: () => Promise<void>
}

/** A follow-up's fields: what, when, how pressing, and a note. */
function TaskEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onRemove
}: TaskEditorProps): ReactNode {
  const [title, setTitle] = useState(initial.title)
  const [dueAt, setDueAt] = useState(initial.dueAt)
  const [priority, setPriority] = useState<TaskPriority>(initial.priority)
  const [notes, setNotes] = useState(initial.notes)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const canSave = title.trim().length > 0 && !busy

  const save = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    await onSubmit({ title: title.trim(), dueAt, priority, notes: notes.trim() })
    setBusy(false)
  }

  return (
    <div className={styles.taskEditor}>
      <TextInput
        label="Follow-up"
        value={title}
        onChange={setTitle}
        maxLength={160}
        placeholder="Send them the stems"
        onEnter={() => void save()}
      />
      <DueField label="Due" value={dueAt} onChange={setDueAt} />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Priority</span>
        <div className={styles.chips} role="group" aria-label="Priority">
          {TASK_PRIORITIES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.chip}
              data-on={priority === entry || undefined}
              aria-pressed={priority === entry}
              onClick={() => setPriority(entry)}
            >
              {TASK_PRIORITY_LABEL[entry]}
            </button>
          ))}
        </div>
      </div>
      <TextInput
        label="Notes"
        value={notes}
        onChange={setNotes}
        maxLength={2000}
        placeholder="Optional"
      />
      <div className={styles.editorActions}>
        {onRemove ? (
          confirming ? (
            <>
              <span className={styles.confirmText}>Remove this follow-up?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button size="sm" variant="danger" onClick={() => void onRemove()}>
                Remove
              </Button>
            </>
          ) : (
            <button type="button" className={styles.linkButton} onClick={() => setConfirming(true)}>
              Remove
            </button>
          )
        ) : null}
        <span className={styles.spacer} />
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          busy={busy}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

/** Where a new follow-up starts: tomorrow morning, the usual answer. */
function tomorrowAtTen(now: number): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 10, 0).getTime()
}
