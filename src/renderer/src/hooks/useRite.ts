import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  OverlayServerInfo,
  PetitionDraft,
  RiteConfigPatch,
  RiteState
} from '@shared/domain/rite'
import { createEmptyRiteState } from '@shared/domain/rite.constants'

/**
 * Live rite state, pushed from the main process.
 *
 * Not in the global system store: the rite is only of interest while OBSERVATORY
 * is open, and it changes on every keystroke of the roster. Following the
 * telemetry precedent keeps that churn out of a store the whole console
 * subscribes to.
 *
 * Subscribes before fetching the snapshot, then only applies the snapshot if no
 * push has already overtaken it — the same ordering guard `SystemBridge` uses,
 * for the same reason: a slow response must not roll live state backwards.
 */
export function useRiteState(): RiteState {
  const [state, setState] = useState<RiteState>(createEmptyRiteState)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.rite.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
    })

    void window.candy.rite.state().then((initial) => {
      if (!cancelled && !claimed) setState(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}

/** Live overlay server status, for the broadcast panel. */
export function useOverlayInfo(): OverlayServerInfo {
  const [info, setInfo] = useState<OverlayServerInfo>({
    running: false,
    url: null,
    port: null,
    clients: 0,
    error: null
  })

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.overlay.onInfo((next) => {
      if (cancelled) return
      claimed = true
      setInfo(next)
    })

    void window.candy.overlay.info().then((initial) => {
      if (!cancelled && !claimed) setInfo(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return info
}

export interface RiteActions {
  addPetition(draft: PetitionDraft): Promise<void>
  removePetition(id: string): Promise<void>
  setWeight(id: string, weight: number): Promise<void>
  clearPetitions(): Promise<void>
  configure(patch: RiteConfigPatch): Promise<void>
  spin(): Promise<void>
  reset(): Promise<void>
  clearHistory(): Promise<void>
  restartServer(): Promise<void>
  /** Channel currently in flight, for button busy states. */
  pending: string | null
  /** Last failure, for the page's notice line. Cleared on the next success. */
  error: string | null
  dismissError(): void
}

/**
 * Rite mutations.
 *
 * Nothing here applies a response to local state — every one of these channels
 * causes the main process to broadcast the new rite, and `useRiteState` is
 * already listening. Applying the response as well would give two sources for
 * the same update and reintroduce exactly the response-ordering race that
 * settings hit.
 */
export function useRiteActions(): RiteActions {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(key)
    try {
      await action()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<RiteActions>(
    () => ({
      addPetition: (draft) => run('add', () => window.candy.rite.addPetition(draft)),
      removePetition: (id) => run(`remove:${id}`, () => window.candy.rite.removePetition(id)),
      setWeight: (id, weight) => run(`weight:${id}`, () => window.candy.rite.setWeight(id, weight)),
      clearPetitions: () => run('clear', () => window.candy.rite.clearPetitions()),
      configure: (patch) => run('config', () => window.candy.rite.configure(patch)),
      spin: () => run('spin', () => window.candy.rite.spin()),
      reset: () => run('reset', () => window.candy.rite.reset()),
      clearHistory: () => run('history', () => window.candy.rite.clearHistory()),
      restartServer: () => run('server', () => window.candy.overlay.restart()),
      pending,
      error,
      dismissError: () => setError(null)
    }),
    [run, pending, error]
  )
}
