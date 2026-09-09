import { randomUUID } from 'node:crypto'
import type {
  ReleaseWindow,
  ScheduleEntry,
  TransmissionSchedule,
  TransmissionTask,
  TransmissionTaskDraft,
  TransmissionTaskPatch
} from '@shared/domain/transmissions'
import {
  detectCollisions,
  isWindowOverdue,
  submitByDate
} from '@shared/domain/transmissions.constants'
import type { ProjectRecord } from '@shared/domain/projects'
import { isMarketingAssetSettled, toIsoDate } from '@shared/domain/projects.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '../archive/archive.service'
import type { SettingsService } from '../settings/settings.service'
import type { ProjectsService } from '../projects/projects.service'
import { TransmissionsRepository } from './transmissions.repository'

const logger = getLogger('transmissions')

/**
 * TRANSMISSIONS — release and promotional scheduling.
 *
 * ### This service stores almost nothing
 *
 * A release date belongs to a project's distribution details and a promotional
 * deliverable's date belongs to its marketing plan. Both are ARCHIVE's, and the
 * scheduling department reads them rather than keeping a copy. That is a
 * deliberate constraint, not an omission: two stores of the same date drift the
 * moment one is written without the other, and the operator would have no way
 * to tell which of the two the release actually goes out on.
 *
 * So `schedule()` is a projection, rebuilt per call. It is cheap for the same
 * reason the project registry is read whole — this is an operator's own body of
 * work, hundreds of projects at the outside, and the alternative is a query per
 * calendar view.
 *
 * The one thing it does own is tasks, which exist precisely because not
 * everything on an operator's calendar belongs to a release.
 *
 * ### Reading through ProjectsService rather than the collection
 *
 * Projects stay under a single owner. This service asks `ProjectsService` for
 * records instead of opening its own repository on the same collection, so the
 * rules about what a project is — how a scan reconciles one, what a stage
 * change requires — keep exactly one implementation.
 */
export class TransmissionsService {
  private readonly repository: TransmissionsRepository

  constructor(
    archive: ArchiveService,
    private readonly projects: ProjectsService,
    private readonly settings: SettingsService
  ) {
    this.repository = new TransmissionsRepository(archive)
  }

  /**
   * The whole schedule: every dated thing, plus what is wrong with it.
   *
   * Collisions and submission windows are computed here rather than in the
   * renderer so that every surface reasoning about the schedule — this page
   * today, a command in INTERFACE later — agrees about what a conflict is
   * without re-deriving the rule.
   */
  async schedule(): Promise<TransmissionSchedule> {
    const leadDays = this.settings.snapshot.workspace.submissionLeadDays
    const today = toIsoDate(new Date())

    const [records, tasks] = await Promise.all([
      this.projects.listRecords(),
      this.repository.listAll()
    ])

    /*
     * Missing and shelved projects are excluded, and the count is reported.
     *
     * A project whose folder has disappeared still carries its old release date,
     * and a shelved one is explicitly off the pipeline. Drawing either on the
     * calendar would present a plan the operator has already abandoned as though
     * it were live work. Counting them keeps that honest rather than silent.
     */
    const scheduled = records.filter((record) => !record.missing && record.stage !== 'shelved')
    const excludedCount = records.length - scheduled.length

    const entries = [
      ...scheduled.flatMap((record) => projectEntries(record)),
      ...tasks.map(taskEntry)
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    return {
      entries,
      collisions: detectCollisions(entries),
      windows: scheduled.flatMap((record) => releaseWindow(record, leadDays, today)),
      leadDays,
      excludedCount,
      generatedAt: Date.now()
    }
  }

  async addTask(draft: TransmissionTaskDraft): Promise<TransmissionSchedule> {
    const now = Date.now()
    const task: TransmissionTask = {
      id: randomUUID(),
      title: draft.title.trim(),
      date: draft.date,
      notes: draft.notes,
      done: false,
      projectId: draft.projectId,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.save(task)
    logger.info(`Filed task "${task.title}" for ${task.date}`)
    return this.schedule()
  }

  async updateTask(id: string, patch: TransmissionTaskPatch): Promise<TransmissionSchedule> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError('That task no longer exists.', {
        code: ErrorCode.NotFound,
        hint: 'It may have been removed since this view was loaded.',
        recoverable: true
      })
    }

    // Spread rather than assigned field by field: the patch schema is genuinely
    // sparse, so an absent key is absent and cannot overwrite with a default.
    const next: TransmissionTask = {
      ...existing,
      ...patch,
      title: patch.title === undefined ? existing.title : patch.title.trim(),
      updatedAt: Date.now()
    }

    await this.repository.save(next)
    return this.schedule()
  }

  async removeTask(id: string): Promise<TransmissionSchedule> {
    await this.repository.deleteById(id)
    return this.schedule()
  }
}

/** Every dated thing one project contributes: its release, then its plan. */
function projectEntries(record: ProjectRecord): ScheduleEntry[] {
  const entries: ScheduleEntry[] = []
  const { distribution } = record
  // The register lets a release go untitled while it is still being worked on;
  // the folder name is what the operator recognises it by until then.
  const title = distribution.title.trim() || record.name

  if (distribution.releaseDate) {
    entries.push({
      id: `${record.id}:release`,
      kind: 'release',
      date: distribution.releaseDate,
      projectId: record.id,
      projectName: record.name,
      title,
      primaryArtist: distribution.primaryArtist,
      stage: record.stage,
      releaseKind: distribution.releaseKind,
      asset: null,
      task: null,
      settled: record.stage === 'released'
    })
  }

  for (const asset of record.marketing?.assets ?? []) {
    // An undated deliverable is owed but unplaced. It belongs in the dossier's
    // plan, not on a calendar, and inventing a day for it would be a fabricated
    // value dressed as a decision.
    if (!asset.scheduledFor) continue

    entries.push({
      id: `${record.id}:asset:${asset.id}`,
      kind: 'promotion',
      date: asset.scheduledFor,
      projectId: record.id,
      projectName: record.name,
      title: asset.title,
      primaryArtist: distribution.primaryArtist,
      stage: record.stage,
      releaseKind: distribution.releaseKind,
      asset,
      task: null,
      settled: isMarketingAssetSettled(asset.status)
    })
  }

  return entries
}

function taskEntry(task: TransmissionTask): ScheduleEntry {
  return {
    id: `task:${task.id}`,
    kind: 'task',
    date: task.date,
    projectId: task.projectId,
    projectName: '',
    title: task.title,
    primaryArtist: '',
    stage: null,
    releaseKind: null,
    asset: null,
    task,
    settled: task.done
  }
}

/**
 * The submission window for a project, when it has a date to derive one from.
 *
 * Returns an array so it can be flat-mapped — a project with no release date
 * has no window, and that is the common case for most of the register.
 */
function releaseWindow(record: ProjectRecord, leadDays: number, today: string): ReleaseWindow[] {
  const releaseDate = record.distribution.releaseDate
  if (!releaseDate) return []

  const submitBy = submitByDate(releaseDate, leadDays)

  return [
    {
      projectId: record.id,
      projectName: record.name,
      title: record.distribution.title.trim() || record.name,
      releaseDate,
      submitBy,
      leadDays,
      overdue: isWindowOverdue(submitBy, today, record.stage === 'released')
    }
  ]
}
