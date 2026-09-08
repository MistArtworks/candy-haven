import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConcordConfigPatch, ConcordState } from '@shared/domain/concord'
import { createEmptyConcordState } from '@shared/domain/concord.constants'
import type { ChatStatus } from '@shared/domain/chat'

/**
 * Live poll state, pushed from the main process.
 *
 * Not in the global system store, for the reason the rite is not: THE CONCORD is
 * only of interest while OBSERVATORY is open, and while a poll is running it
 * changes eight times a second. Putting that churn in a store the whole console
 * subscribes to would re-render every page in the app at 8Hz.
 *
 * Subscribes before fetching the snapshot, then only applies the snapshot if no
 * push has already overtaken it — the same ordering guard `SystemBridge` uses,
 * for the same reason: a slow response must not roll live state backwards. That
 * matters more here than anywhere else in the app, because the state it would
 * roll back is a vote count in front of an audience.
 */
export function useConcordState(): ConcordState {
  const [state, setState] = useState<ConcordState>(createEmptyConcordState)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.concord.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
    })

    void window.candy.concord.state().then((initial) => {
      if (!cancelled && !claimed) setState(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}

/**
 * Live chat ingest status.
 *
 * Mounting this is what *claims* the connection on the console's behalf — the
 * main process holds the socket while anything wants it, and the page wanting it
 * is the operator needing to see chat attending **before** they open a poll.
 * Discovering the channel name was wrong after asking an audience to vote is not
 * a recoverable moment on a broadcast.
 *
 * The claim is released on unmount by the subscription going away, so an idle
 * app holds no socket.
 */
export function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>({
    platform: 'twitch',
    state: 'idle',
    channel: null,
    error: null,
    since: null,
    messages: 0,
    lastMessageAt: null,
    failures: 0,
    claims: []
  })

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.chat.onStatus((next) => {
      if (cancelled) return
      claimed = true
      setStatus(next)
    })

    void window.candy.chat.status().then((initial) => {
      if (!cancelled && !claimed) setStatus(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return status
}

export interface ConcordActions {
  addOption(label: string): Promise<void>
  removeOption(id: string): Promise<void>
  setBallot(labels: string[]): Promise<void>
  clearBallot(): Promise<void>
  configure(patch: ConcordConfigPatch): Promise<void>
  open(): Promise<void>
  close(): Promise<void>
  reset(): Promise<void>
  clearHistory(): Promise<void>
  reconnectChat(): Promise<void>
  simulate(count: number, changeVotes?: boolean): Promise<void>
  /** Channel currently in flight, for button busy states. */
  pending: string | null
  /** Last failure, for the page's notice line. Cleared on the next success. */
  error: string | null
  dismissError(): void
}

/**
 * Poll mutations.
 *
 * Nothing here applies a response to local state — every one of these channels
 * causes the main process to broadcast the new poll, and `useConcordState` is
 * already listening. Applying the response as well would give two sources for
 * the same update and reintroduce exactly the response-ordering race that
 * settings hit.
 */
export function useConcordActions(): ConcordActions {
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

  return useMemo<ConcordActions>(
    () => ({
      addOption: (label) => run('add', () => window.candy.concord.addOption({ label })),
      removeOption: (id) => run(`remove:${id}`, () => window.candy.concord.removeOption(id)),
      setBallot: (labels) => run('ballot', () => window.candy.concord.setBallot(labels)),
      clearBallot: () => run('clear', () => window.candy.concord.clearBallot()),
      configure: (patch) => run('config', () => window.candy.concord.configure(patch)),
      open: () => run('open', () => window.candy.concord.open()),
      close: () => run('close', () => window.candy.concord.close()),
      reset: () => run('reset', () => window.candy.concord.reset()),
      clearHistory: () => run('history', () => window.candy.concord.clearHistory()),
      reconnectChat: () => run('chat', () => window.candy.chat.reconnect()),
      simulate: (count, changeVotes) =>
        run('simulate', () => window.candy.concord.simulate(count, changeVotes)),
      pending,
      error,
      dismissError: () => setError(null)
    }),
    [run, pending, error]
  )
}
