import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  InteractionDraft,
  LeadDraft,
  LeadPatch,
  LeadsState,
  OpportunityDraft,
  OpportunityPatch,
  TaskDraft,
  TaskPatch,
  TaskRef
} from '@shared/domain/leads'
import type { LeadsSettings } from '@shared/domain/leads'
import {
  DEFAULT_COOLING_PER_WEEK,
  DEFAULT_INTERACTIONS,
  type Snooze
} from '@shared/domain/leads.constants'
import { notify } from '@renderer/components/feedback/notify'
import { selectSettings, useSystemStore } from '@renderer/app/store/system.store'

const EMPTY: LeadsState = { leads: [], opportunities: [], attached: false }

const DEFAULT_SETTINGS: LeadsSettings = {
  interactions: DEFAULT_INTERACTIONS.map((entry) => ({ ...entry })),
  coolingPerWeek: DEFAULT_COOLING_PER_WEEK,
  reminders: true
}

/** REGULATION's LEADS section, as it stands, in the console or the strip. */
export function useLeadsSettings(): LeadsSettings {
  const settings = useSystemStore(selectSettings)
  return settings?.leads ?? DEFAULT_SETTINGS
}

/**
 * The time, ticking: what makes a follow-up overdue while it's on screen, and
 * a quiet lead cool. Half a minute is as fine as either is drawn.
 *
 * Read afresh, too, whenever `refreshOn` changes (the leads, as pushed), so a
 * follow-up made due this moment is drawn overdue at once rather than
 * pending until the next tick.
 */
export function useNow(everyMs = 30_000, refreshOn?: unknown): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [everyMs, refreshOn])
  return now
}

/**
 * ARTISTS' leads and opportunities, pushed from the main process.
 *
 * The same ordering guard as CALENDAR's: subscribe first, and apply the
 * snapshot only if no push has overtaken it, so a slow first answer can't
 * roll back a change already made. Used by the console and the strip alike.
 */
export function useLeads(): { state: LeadsState; ready: boolean } {
  const [state, setState] = useState<LeadsState>(EMPTY)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.leads.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
      setReady(true)
    })

    void window.candy.leads
      .state()
      .then((initial) => {
        if (cancelled || claimed) return
        setState(initial)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { state, ready }
}

export interface LeadsActions {
  create: (draft: LeadDraft) => Promise<LeadsState | null>
  update: (id: string, patch: LeadPatch) => Promise<LeadsState | null>
  remove: (id: string) => Promise<LeadsState | null>
  setTemperature: (id: string, value: number | null) => Promise<LeadsState | null>
  log: (
    leadId: string,
    interaction: InteractionDraft,
    complete?: TaskRef | null
  ) => Promise<LeadsState | null>
  unlog: (leadId: string, interactionId: string) => Promise<LeadsState | null>
  addTask: (
    parentKind: TaskRef['parentKind'],
    parentId: string,
    task: TaskDraft
  ) => Promise<LeadsState | null>
  updateTask: (ref: TaskRef, patch: TaskPatch) => Promise<LeadsState | null>
  removeTask: (ref: TaskRef) => Promise<LeadsState | null>
  snooze: (ref: TaskRef, snooze: Snooze) => Promise<LeadsState | null>
  dismiss: (ref: TaskRef) => Promise<LeadsState | null>
  convert: (draft: OpportunityDraft) => Promise<LeadsState | null>
  updateOpportunity: (id: string, patch: OpportunityPatch) => Promise<LeadsState | null>
  removeOpportunity: (id: string) => Promise<LeadsState | null>
  busy: boolean
}

/**
 * Writes to leads and opportunities.
 *
 * Nothing optimistic, as in CALENDAR: the push confirms each change, and the
 * round trip is local. A refusal is raised in the notice stack (most of these
 * are edits made in passing, with no form to put an error beside) and the
 * call answers null, so a dialog knows to stay open.
 */
export function useLeadsActions(): LeadsActions {
  const [pending, setPending] = useState(0)

  const run = useCallback(async (work: () => Promise<LeadsState>): Promise<LeadsState | null> => {
    setPending((count) => count + 1)
    try {
      return await work()
    } catch (cause) {
      notify.refuse(cause, { id: 'leads-refused' })
      return null
    } finally {
      setPending((count) => count - 1)
    }
  }, [])

  const api = window.candy.leads
  const actions = useMemo(
    () => ({
      create: (draft: LeadDraft) => run(() => api.create(draft)),
      update: (id: string, patch: LeadPatch) => run(() => api.update(id, patch)),
      remove: (id: string) => run(() => api.remove(id)),
      setTemperature: (id: string, value: number | null) =>
        run(() => api.setTemperature(id, value)),
      log: (leadId: string, interaction: InteractionDraft, complete?: TaskRef | null) =>
        run(() => api.log(leadId, interaction, complete ?? null)),
      unlog: (leadId: string, interactionId: string) => run(() => api.unlog(leadId, interactionId)),
      addTask: (parentKind: TaskRef['parentKind'], parentId: string, task: TaskDraft) =>
        run(() => api.addTask(parentKind, parentId, task)),
      updateTask: (ref: TaskRef, patch: TaskPatch) => run(() => api.updateTask(ref, patch)),
      removeTask: (ref: TaskRef) => run(() => api.removeTask(ref)),
      snooze: (ref: TaskRef, snooze: Snooze) => run(() => api.snooze(ref, snooze)),
      dismiss: (ref: TaskRef) => run(() => api.dismiss(ref)),
      convert: (draft: OpportunityDraft) => run(() => api.convert(draft)),
      updateOpportunity: (id: string, patch: OpportunityPatch) =>
        run(() => api.updateOpportunity(id, patch)),
      removeOpportunity: (id: string) => run(() => api.removeOpportunity(id))
    }),
    [api, run]
  )

  return { ...actions, busy: pending > 0 }
}
