import { useCallback, useEffect, useState } from 'react'
import {
  createCalendarState,
  type CalendarDraft,
  type CalendarPatch,
  type CalendarState
} from '@shared/domain/calendar'

/**
 * The dated register, pushed from the main process.
 *
 * Subscribes before fetching the snapshot and only applies the snapshot if no
 * push has overtaken it — the ordering guard every pushed department here uses,
 * so a slow first response cannot roll live state backwards over a change the
 * operator has already made.
 */
export function useCalendar(): { state: CalendarState; ready: boolean } {
  const [state, setState] = useState<CalendarState>(createCalendarState)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.calendar.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
      setReady(true)
    })

    void window.candy.calendar
      .state()
      .then((initial) => {
        if (cancelled || claimed) return
        setState(initial)
      })
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

export interface CalendarActions {
  create: (draft: CalendarDraft) => Promise<void>
  patch: (id: string, patch: CalendarPatch) => Promise<void>
  remove: (id: string) => Promise<void>
  busy: boolean
  error: string | null
  clearError: () => void
}

/**
 * Writes to the register.
 *
 * Nothing is applied optimistically. The archive is the register — an entry
 * that appeared on screen and was never filed is the one failure this
 * department cannot afford — so every change waits for the push that confirms
 * it. The round trip is local, and the write is a deliberate act behind a
 * dialog rather than a slider being dragged, so there is nothing to gain by
 * guessing ahead of it.
 */
export function useCalendarActions(): CalendarActions {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    create: useCallback((draft) => run(() => window.candy.calendar.create(draft)), [run]),
    patch: useCallback((id, patch) => run(() => window.candy.calendar.patch(id, patch)), [run]),
    remove: useCallback((id) => run(() => window.candy.calendar.remove(id)), [run]),
    busy,
    error,
    clearError: useCallback(() => setError(null), [])
  }
}
