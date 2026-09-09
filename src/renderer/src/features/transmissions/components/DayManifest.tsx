import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScheduleCollision, ScheduleEntry } from '@shared/domain/transmissions'
import { MAX_TASK_TITLE } from '@shared/domain/transmissions.constants'
import { MARKETING_STATUS_LABEL } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Checkbox, DateInput, TextInput } from '@renderer/components/primitives/Input'
import { formatCountdown, formatIsoDate } from '@renderer/lib/format'
import { useProjectMutations } from '@renderer/hooks/useProjects'
import { useTaskMutations } from '@renderer/hooks/useTransmissions'
import { weekdayLabel } from '../lib/calendar'
import { isEntryOverdue } from '../lib/entries'
import styles from './calendar.module.scss'

/**
 * One day, in full — and the only place the calendar writes.
 *
 * Every view can select a day; all of them open this. Keeping the editing in
 * one component rather than inline in each view is what lets the four stay
 * presentational, and it means a date is rewritten exactly one way regardless
 * of which view the operator happened to be in.
 *
 * ### Three kinds of write, three different owners
 *
 * A promotional deliverable and a release both belong to ARCHIVE, so both go
 * through the project channels and land back here by invalidation. A task is
 * this department's own and goes through its own. The distinction is worth
 * keeping visible: it is why moving a release does more than move a date.
 */

export interface DayManifestProps {
  date: string
  entries: readonly ScheduleEntry[]
  collision: ScheduleCollision | undefined
  onClose: () => void
}

export function DayManifest({ date, entries, collision, onClose }: DayManifestProps): ReactNode {
  const navigate = useNavigate()
  const projects = useProjectMutations()
  const tasks = useTaskMutations()
  const [draftTitle, setDraftTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const report = (cause: unknown): void => {
    setError(cause instanceof Error ? cause.message : 'That change could not be saved.')
  }

  const fileTask = (): void => {
    const title = draftTitle.trim()
    if (!title) return

    setError(null)
    tasks.add.mutate(
      { title, date, notes: '', projectId: null },
      { onSuccess: () => setDraftTitle(''), onError: report }
    )
  }

  const moveEntry = (entry: ScheduleEntry, next: string): void => {
    // An empty date input means the operator cleared the field mid-edit rather
    // than choosing a day. Nothing is written until there is a date to write.
    if (!next) return
    setError(null)

    if (entry.task) {
      tasks.update.mutate({ id: entry.task.id, patch: { date: next } }, { onError: report })
      return
    }

    if (entry.asset && entry.projectId) {
      projects.saveMarketingAsset.mutate(
        { id: entry.projectId, asset: { ...entry.asset, scheduledFor: next } },
        { onError: report }
      )
      return
    }

    if (entry.kind === 'release' && entry.projectId) {
      projects.patch.mutate(
        { id: entry.projectId, patch: { distribution: { releaseDate: next } } },
        { onError: report }
      )
    }
  }

  return (
    <div className={styles.manifest}>
      <header className={styles.manifestHead}>
        <span className={styles.manifestDate}>{formatIsoDate(date)}</span>
        <span className={styles.manifestWeekday}>{weekdayLabel(date)}</span>
        <span className={styles.manifestCountdown}>{formatCountdown(date)}</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>

      {collision ? (
        <p className={styles.manifestNotice} data-severity={collision.severity}>
          {collision.reason}
        </p>
      ) : null}

      {error ? <p className={styles.manifestError}>{error}</p> : null}

      {entries.length === 0 ? (
        <p className={styles.empty}>Nothing is scheduled on this day.</p>
      ) : (
        <ul className={styles.manifestList}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={styles.manifestRow}
              data-kind={entry.kind}
              data-settled={entry.settled || undefined}
              data-overdue={isEntryOverdue(entry) || undefined}
            >
              <div className={styles.manifestRowHead}>
                <span className={styles.markSwatch} aria-hidden="true" />

                {entry.task ? (
                  <Checkbox
                    label={entry.title}
                    checked={entry.task.done}
                    onChange={(done) => {
                      setError(null)
                      tasks.update.mutate(
                        { id: entry.task?.id ?? '', patch: { done } },
                        { onError: report }
                      )
                    }}
                  />
                ) : (
                  <span className={styles.manifestTitle}>{entry.title}</span>
                )}

                <span className={styles.manifestMeta}>
                  {entry.asset
                    ? MARKETING_STATUS_LABEL[entry.asset.status]
                    : entry.kind === 'release'
                      ? 'RELEASE'
                      : 'TASK'}
                </span>

                {entry.projectId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/archive?project=${entry.projectId}`)}
                    title="Open this project in the ARCHIVE"
                  >
                    Dossier
                  </Button>
                ) : null}

                {entry.task ? (
                  <Button
                    size="sm"
                    variant="danger"
                    busy={tasks.remove.isPending}
                    onClick={() => {
                      setError(null)
                      tasks.remove.mutate({ id: entry.task?.id ?? '' }, { onError: report })
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className={styles.manifestRowControls}>
                <DateInput
                  label="Moves to"
                  value={entry.date}
                  onChange={(next) => moveEntry(entry, next)}
                  hint={
                    entry.kind === 'release'
                      ? 'Re-dates the whole promotional plan, keeping each deliverable its distance from release.'
                      : undefined
                  }
                />
                {entry.projectName ? (
                  <span className={styles.manifestProject}>{entry.projectName}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.manifestFile}>
        <TextInput
          label="File a task"
          value={draftTitle}
          onChange={setDraftTitle}
          placeholder="What needs doing on this day"
          maxLength={MAX_TASK_TITLE}
        />
        <Button
          variant="primary"
          size="sm"
          busy={tasks.add.isPending}
          disabled={draftTitle.trim().length === 0}
          onClick={fileTask}
        >
          File
        </Button>
      </div>
    </div>
  )
}
