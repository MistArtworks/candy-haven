import { randomUUID } from 'node:crypto'
import type { CalendarFollowUp } from '@shared/domain/calendar'
import { localIsoDate } from '@shared/domain/discography.constants'
import type {
  InteractionDraft,
  Lead,
  LeadDraft,
  LeadPatch,
  LeadTask,
  LeadsState,
  Opportunity,
  OpportunityDraft,
  OpportunityPatch,
  TaskDraft,
  TaskPatch,
  TaskRef
} from '@shared/domain/leads'
import {
  CLOSED_STAGES,
  FIRST_TASK_TITLE,
  snoozeUntil,
  taskStatus,
  type Snooze
} from '@shared/domain/leads.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { TypedEmitter } from '@main/core/emitter'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '../archive/archive.service'
import { LeadsRepository } from './leads.repository'

const logger = getLogger('leads')

interface LeadsEvents {
  changed: LeadsState
}

/** A follow-up not yet done, with what its reminder needs to say and open. */
export interface OpenTask {
  ref: TaskRef
  leadId: string
  title: string
  /** The lead's name, and the opportunity's title when it's one of those. */
  who: string
  dueAt: number
  createdAt: number
  priority: LeadTask['priority']
  snoozedUntil: number | null
  dismissedAt: number | null
}

/**
 * LEADS and OPPORTUNITIES: ARTISTS' light CRM.
 *
 * Holds both registers in memory and mirrors every change to the archive, as
 * CALENDAR does, and for the same reason: a CRM for two people is dozens of
 * records, and every view (the list, a lead's sheet, the strip's follow-ups,
 * CALENDAR's projection) wants a different slice of the same small set.
 *
 * Every write answers with the whole state and pushes it (`changed`), so the
 * console and the strip stay in step without asking. Temperatures aren't
 * worked out here: they follow from the interactions and REGULATION's cooling,
 * which the renderer reads anyway (`automaticTemperature`).
 */
export class LeadsService extends TypedEmitter<LeadsEvents> {
  private readonly repository: LeadsRepository
  private leads: Lead[] = []
  private opportunities: Opportunity[] = []
  private hydrated = false
  private hydrating: Promise<void> | null = null
  private listener: (() => void) | null = null

  constructor(private readonly archive: ArchiveService) {
    super()
    this.repository = new LeadsRepository(archive)
  }

  /** Told after every change: CALENDAR's projection of the follow-ups. */
  setChangeListener(listener: () => void): void {
    this.listener = listener
  }

  async snapshot(): Promise<LeadsState> {
    await this.hydrate()
    return this.state()
  }

  private state(): LeadsState {
    return {
      leads: this.leads.map((lead) => ({ ...lead })),
      opportunities: this.opportunities.map((opportunity) => ({ ...opportunity })),
      attached: this.archive.isOnline()
    }
  }

  private async hydrate(): Promise<void> {
    // Loaded once from a connected archive; a read while it was down isn't a
    // load, so it's tried again.
    if (this.hydrated && this.archive.isConnected()) return
    if (!this.archive.isConnected()) return
    if (this.hydrating) return this.hydrating
    this.hydrating = (async () => {
      this.leads = await this.repository.listLeads()
      this.opportunities = await this.repository.listOpportunities()
      this.hydrated = true
      logger.info(
        `Leads hydrated: ${this.leads.length} leads, ${this.opportunities.length} opportunities`
      )
    })().finally(() => {
      this.hydrating = null
    })
    return this.hydrating
  }

  private async ready(): Promise<void> {
    if (!this.repository.attached) {
      throw new AppError('The archive is not connected, so leads cannot be saved.', {
        code: ErrorCode.Unavailable,
        hint: 'Check the archive in REGULATION, then try again.',
        recoverable: true
      })
    }
    await this.hydrate()
  }

  private publish(): LeadsState {
    const state = this.state()
    this.emit('changed', state)
    this.listener?.()
    return state
  }

  // ------------------------------------------------------------------ leads

  private lead(id: string): Lead {
    const lead = this.leads.find((entry) => entry.id === id)
    if (!lead) {
      throw new AppError('That lead is no longer here.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
    return lead
  }

  private async saveLead(next: Lead): Promise<void> {
    await this.repository.putLead(next)
    const index = this.leads.findIndex((entry) => entry.id === next.id)
    if (index >= 0) this.leads[index] = next
    else this.leads.push(next)
  }

  /**
   * A new lead, and its first follow-up with it: a high-priority first
   * interaction, due now unless Candy picked another time.
   */
  async createLead(draft: LeadDraft): Promise<LeadsState> {
    await this.ready()
    const now = Date.now()
    const lead: Lead = {
      id: randomUUID(),
      name: draft.name.trim(),
      notes: draft.notes.trim(),
      links: draft.links,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      artistId: draft.artistId,
      pinnedTemperature: null,
      interactions: [],
      tasks: [
        {
          id: randomUUID(),
          title: FIRST_TASK_TITLE,
          dueAt: draft.firstTaskDueAt ?? now,
          priority: 'high',
          notes: '',
          completedAt: null,
          snoozedUntil: null,
          dismissedAt: null,
          createdAt: now
        }
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    }
    await this.saveLead(lead)
    logger.info(`New lead "${lead.name}"`)
    return this.publish()
  }

  async updateLead(id: string, patch: LeadPatch): Promise<LeadsState> {
    await this.ready()
    const current = this.lead(id)
    const next: Lead = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.links !== undefined ? { links: patch.links } : {}),
      ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
      ...(patch.artistId !== undefined ? { artistId: patch.artistId } : {}),
      ...(patch.archived !== undefined ? { archivedAt: patch.archived ? Date.now() : null } : {}),
      updatedAt: Date.now()
    }
    await this.saveLead(next)
    return this.publish()
  }

  /** A lead, and the opportunities that came of it, gone for good. */
  async removeLead(id: string): Promise<LeadsState> {
    await this.ready()
    const lead = this.lead(id)
    for (const opportunity of this.opportunities.filter((entry) => entry.leadId === id)) {
      await this.repository.removeOpportunity(opportunity.id)
    }
    await this.repository.removeLead(id)
    this.opportunities = this.opportunities.filter((entry) => entry.leadId !== id)
    this.leads = this.leads.filter((entry) => entry.id !== id)
    logger.info(`Removed lead "${lead.name}"`)
    return this.publish()
  }

  /** Set by hand, or (null) back to following the interactions. */
  async setTemperature(id: string, value: number | null): Promise<LeadsState> {
    await this.ready()
    const current = this.lead(id)
    await this.saveLead({
      ...current,
      pinnedTemperature: value === null ? null : Math.min(100, Math.max(0, Math.round(value))),
      updatedAt: Date.now()
    })
    return this.publish()
  }

  /**
   * Something that happened, with its points. Logged from a reminder or a
   * task, it can complete that task in the same step.
   */
  async logInteraction(
    leadId: string,
    draft: InteractionDraft,
    complete: TaskRef | null = null
  ): Promise<LeadsState> {
    await this.ready()
    const current = this.lead(leadId)
    const interaction = {
      id: randomUUID(),
      at: draft.at ?? Date.now(),
      text: draft.text.trim(),
      points: draft.points
    }
    await this.saveLead({
      ...current,
      interactions: [...current.interactions, interaction].sort((a, b) => a.at - b.at),
      updatedAt: Date.now()
    })
    if (complete) await this.changeTask(complete, (task) => completed(task, true))
    return this.publish()
  }

  /** One logged by mistake. */
  async removeInteraction(leadId: string, interactionId: string): Promise<LeadsState> {
    await this.ready()
    const current = this.lead(leadId)
    await this.saveLead({
      ...current,
      interactions: current.interactions.filter((entry) => entry.id !== interactionId),
      updatedAt: Date.now()
    })
    return this.publish()
  }

  // ------------------------------------------------------------------ tasks

  async addTask(
    parentKind: TaskRef['parentKind'],
    parentId: string,
    draft: TaskDraft
  ): Promise<LeadsState> {
    await this.ready()
    const task: LeadTask = {
      id: randomUUID(),
      title: draft.title.trim(),
      dueAt: draft.dueAt,
      priority: draft.priority,
      notes: draft.notes.trim(),
      completedAt: null,
      snoozedUntil: null,
      dismissedAt: null,
      createdAt: Date.now()
    }
    await this.withTasks(parentKind, parentId, (tasks) => [...tasks, task])
    return this.publish()
  }

  async updateTask(ref: TaskRef, patch: TaskPatch): Promise<LeadsState> {
    await this.ready()
    await this.changeTask(ref, (task) => {
      let next: LeadTask = {
        ...task,
        ...(patch.title !== undefined ? { title: patch.title.trim() || task.title } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {})
      }
      // A new time is a new reminder: whatever quieted the old one goes.
      if (patch.dueAt !== undefined && patch.dueAt !== task.dueAt) {
        next = { ...next, dueAt: patch.dueAt, snoozedUntil: null, dismissedAt: null }
      }
      if (patch.completed !== undefined) next = completed(next, patch.completed)
      return next
    })
    return this.publish()
  }

  async removeTask(ref: TaskRef): Promise<LeadsState> {
    await this.ready()
    await this.withTasks(ref.parentKind, ref.parentId, (tasks) =>
      tasks.filter((task) => task.id !== ref.taskId)
    )
    return this.publish()
  }

  /** Quiet until then; still overdue in every list. */
  async snoozeTask(ref: TaskRef, snooze: Snooze): Promise<LeadsState> {
    await this.ready()
    const until = snoozeUntil(snooze, new Date())
    await this.changeTask(ref, (task) => ({ ...task, snoozedUntil: until }))
    return this.publish()
  }

  /** No more reminders for it. Never completes it. */
  async dismissTask(ref: TaskRef): Promise<LeadsState> {
    await this.ready()
    await this.changeTask(ref, (task) => ({ ...task, dismissedAt: Date.now() }))
    return this.publish()
  }

  private async changeTask(ref: TaskRef, change: (task: LeadTask) => LeadTask): Promise<void> {
    let found = false
    await this.withTasks(ref.parentKind, ref.parentId, (tasks) =>
      tasks.map((task) => {
        if (task.id !== ref.taskId) return task
        found = true
        return change(task)
      })
    )
    if (!found) {
      throw new AppError('That follow-up is no longer here.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
  }

  private async withTasks(
    parentKind: TaskRef['parentKind'],
    parentId: string,
    change: (tasks: LeadTask[]) => LeadTask[]
  ): Promise<void> {
    const now = Date.now()
    if (parentKind === 'lead') {
      const current = this.lead(parentId)
      await this.saveLead({ ...current, tasks: change(current.tasks), updatedAt: now })
      return
    }
    const current = this.opportunity(parentId)
    await this.saveOpportunity({ ...current, tasks: change(current.tasks), updatedAt: now })
  }

  // ---------------------------------------------------------- opportunities

  private opportunity(id: string): Opportunity {
    const opportunity = this.opportunities.find((entry) => entry.id === id)
    if (!opportunity) {
      throw new AppError('That opportunity is no longer here.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
    return opportunity
  }

  private async saveOpportunity(next: Opportunity): Promise<void> {
    await this.repository.putOpportunity(next)
    const index = this.opportunities.findIndex((entry) => entry.id === next.id)
    if (index >= 0) this.opportunities[index] = next
    else this.opportunities.push(next)
  }

  /**
   * Something concrete to pursue, from a lead. The lead stays, with its
   * contacts and history; the opportunity points at it rather than copying
   * them, so there is one place each lives.
   */
  async convert(draft: OpportunityDraft): Promise<LeadsState> {
    await this.ready()
    const lead = this.lead(draft.leadId)
    const now = Date.now()
    await this.saveOpportunity({
      id: randomUUID(),
      leadId: lead.id,
      title: draft.title.trim(),
      kind: draft.kind,
      stage: 'open',
      amount: draft.amount,
      currency: draft.currency.trim().toUpperCase() || 'CAD',
      notes: draft.notes.trim(),
      tasks: [],
      closedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    })
    logger.info(`"${lead.name}" became an opportunity: ${draft.title}`)
    return this.publish()
  }

  async updateOpportunity(id: string, patch: OpportunityPatch): Promise<LeadsState> {
    await this.ready()
    const current = this.opportunity(id)
    const now = Date.now()
    const stage = patch.stage ?? current.stage
    const closed = CLOSED_STAGES.includes(stage)
    await this.saveOpportunity({
      ...current,
      ...(patch.title !== undefined ? { title: patch.title.trim() || current.title } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.currency !== undefined
        ? { currency: patch.currency.trim().toUpperCase() || current.currency }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now : null } : {}),
      stage,
      // Closing records when; reopening clears it.
      closedAt: closed ? (current.closedAt ?? now) : null,
      updatedAt: now
    })
    return this.publish()
  }

  async removeOpportunity(id: string): Promise<LeadsState> {
    await this.ready()
    this.opportunity(id)
    await this.repository.removeOpportunity(id)
    this.opportunities = this.opportunities.filter((entry) => entry.id !== id)
    return this.publish()
  }

  // ------------------------------------------------------------- read outs

  /**
   * Every follow-up not done, with who it's for: what the reminders watch.
   * Archived leads and opportunities keep quiet.
   */
  async openTasks(): Promise<OpenTask[]> {
    await this.hydrate()
    const tasks: OpenTask[] = []
    const leads = new Map(this.leads.map((lead) => [lead.id, lead]))
    const add = (
      parentKind: TaskRef['parentKind'],
      parentId: string,
      leadId: string,
      who: string,
      list: LeadTask[]
    ): void => {
      for (const task of list) {
        if (task.completedAt !== null) continue
        tasks.push({
          ref: { parentKind, parentId, taskId: task.id },
          leadId,
          title: task.title,
          who,
          dueAt: task.dueAt,
          createdAt: task.createdAt,
          priority: task.priority,
          snoozedUntil: task.snoozedUntil,
          dismissedAt: task.dismissedAt
        })
      }
    }
    for (const lead of this.leads) {
      if (lead.archivedAt === null) add('lead', lead.id, lead.id, lead.name, lead.tasks)
    }
    for (const opportunity of this.opportunities) {
      const lead = leads.get(opportunity.leadId)
      if (!lead || opportunity.archivedAt !== null || lead.archivedAt !== null) continue
      add(
        'opportunity',
        opportunity.id,
        lead.id,
        `${lead.name} · ${opportunity.title}`,
        opportunity.tasks
      )
    }
    return tasks.sort((a, b) => a.dueAt - b.dueAt)
  }

  /** The follow-ups as CALENDAR draws them: each on its day, at its minute. */
  async followUps(): Promise<CalendarFollowUp[]> {
    await this.hydrate()
    const now = Date.now()
    const leads = new Map(this.leads.map((lead) => [lead.id, lead]))
    const out: CalendarFollowUp[] = []
    const add = (
      parentKind: CalendarFollowUp['parentKind'],
      parentId: string,
      leadId: string,
      who: string,
      list: LeadTask[]
    ): void => {
      for (const task of list) {
        const due = new Date(task.dueAt)
        out.push({
          taskId: task.id,
          parentKind,
          parentId,
          leadId,
          title: task.title,
          who,
          date: localIsoDate(due),
          startMinute: due.getHours() * 60 + due.getMinutes(),
          priority: task.priority,
          status: taskStatus(task, now)
        })
      }
    }
    for (const lead of this.leads) {
      if (lead.archivedAt === null) add('lead', lead.id, lead.id, lead.name, lead.tasks)
    }
    for (const opportunity of this.opportunities) {
      const lead = leads.get(opportunity.leadId)
      if (!lead || opportunity.archivedAt !== null || lead.archivedAt !== null) continue
      add(
        'opportunity',
        opportunity.id,
        lead.id,
        `${lead.name} · ${opportunity.title}`,
        opportunity.tasks
      )
    }
    return out
  }

  dispose(): void {
    this.clear()
    this.leads = []
    this.opportunities = []
    this.hydrated = false
  }
}

/** Done (stamped now, its snooze cleared) or undone. */
function completed(task: LeadTask, done: boolean): LeadTask {
  if (!done) return { ...task, completedAt: null }
  return { ...task, completedAt: task.completedAt ?? Date.now(), snoozedUntil: null }
}
