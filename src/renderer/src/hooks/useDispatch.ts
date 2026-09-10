import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DispatchCommentDraft,
  DispatchDraft,
  DispatchItem,
  DispatchRuling,
  DispatchSetup,
  DispatchState
} from '@shared/domain/dispatch'
import {
  DISPATCH_ADJUDICATOR,
  DISPATCH_AUTHORS,
  type DispatchAuthor
} from '@shared/domain/dispatch.constants'

const EMPTY: DispatchState = {
  link: {
    state: 'unconfigured',
    message: 'No Firebase config has been supplied.',
    projectId: null,
    syncedAt: null
  },
  items: [],
  revision: 0
}

/**
 * The shared board, pushed from the main process.
 *
 * Same shape as the overlay hooks: one snapshot on mount, then a subscription.
 * There is no polling and no query cache — the main process holds a live stream
 * to the database and re-broadcasts, so a change either of them makes shows up
 * here without anything asking for it.
 */
export function useDispatch(): DispatchState {
  const [state, setState] = useState<DispatchState>(EMPTY)

  useEffect(() => {
    let alive = true

    void window.candy.dispatch.state().then((next) => {
      if (alive) setState(next)
    })

    const unsubscribe = window.candy.dispatch.onState(setState)

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

export function useDispatchSetup(revision: number): DispatchSetup {
  const [setup, setSetup] = useState<DispatchSetup>({
    configured: false,
    projectId: null,
    databaseUrl: null,
    configPath: ''
  })

  // Re-read whenever the board's revision moves: pasting a config reattaches,
  // and the panel has to stop saying the board is unconfigured.
  useEffect(() => {
    let alive = true
    void window.candy.dispatch.setup().then((next) => {
      if (alive) setSetup(next)
    })
    return () => {
      alive = false
    }
  }, [revision])

  return setup
}

// -------------------------------------------------------------------- identity

const IDENTITY_KEY = 'candy-haven.dispatch.identity'

/**
 * Which of the two people is at this keyboard.
 *
 * In `localStorage` rather than in settings, deliberately. It is a property of
 * the machine, not of the workspace — the whole point is that mist's copy and
 * candy's copy answer differently — and settings are synchronised, validated
 * and versioned, which is a lot of machinery for one of two strings.
 *
 * Null until chosen. The page refuses to file anything until it is, because an
 * item attributed to the wrong person is worse than one nobody filed.
 */
export function useIdentity(): [DispatchAuthor | null, (author: DispatchAuthor) => void] {
  const [identity, setIdentity] = useState<DispatchAuthor | null>(() => {
    const stored = window.localStorage.getItem(IDENTITY_KEY)
    return DISPATCH_AUTHORS.includes(stored as DispatchAuthor) ? (stored as DispatchAuthor) : null
  })

  const choose = useCallback((author: DispatchAuthor) => {
    window.localStorage.setItem(IDENTITY_KEY, author)
    setIdentity(author)
  }, [])

  return [identity, choose]
}

/** Only one of them rules on items. The other files and comments. */
export function canAdjudicate(identity: DispatchAuthor | null): boolean {
  return identity === DISPATCH_ADJUDICATOR
}

// -------------------------------------------------------------------- unread

/**
 * Comments on an item that the reader has not seen.
 *
 * Their own are never counted, however old their `seen` stamp is: a person
 * cannot have unread mail they wrote. Everything else is compared against the
 * one timestamp, which is what keeps this a subtraction rather than a set.
 */
export function unreadCount(item: DispatchItem, identity: DispatchAuthor | null): number {
  if (!identity) return 0

  const since = item.seen[identity] ?? 0
  return Object.values(item.comments).filter(
    (comment) => comment.author !== identity && comment.createdAt > since
  ).length
}

/**
 * True for an item the reader has never opened, filed by the other person.
 *
 * Distinct from having unread comments, and worth its own mark: an item with no
 * discussion yet is exactly the one most likely to be missed, because there is
 * no comment count drawing the eye to it.
 */
export function isUnseen(item: DispatchItem, identity: DispatchAuthor | null): boolean {
  if (!identity) return false
  return item.author !== identity && (item.seen[identity] ?? 0) === 0
}

// -------------------------------------------------------------------- actions

export interface DispatchActions {
  configure(source: string): Promise<void>
  file(draft: DispatchDraft): Promise<void>
  comment(draft: DispatchCommentDraft): Promise<void>
  rule(ruling: DispatchRuling): Promise<void>
  markSeen(itemId: string, author: DispatchAuthor): Promise<void>
  withdraw(id: string): Promise<void>
  pending: string | null
  error: string | null
  dismissError(): void
}

export function useDispatchActions(): DispatchActions {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(key)
    try {
      await action()
      setError(null)
    } catch (cause) {
      const failure = cause as Error & { hint?: string | null }
      setError(failure.hint ? `${failure.message} ${failure.hint}` : failure.message)
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<DispatchActions>(
    () => ({
      configure: (source) => run('configure', () => window.candy.dispatch.configure(source)),
      file: (draft) => run('file', () => window.candy.dispatch.file(draft)),
      comment: (draft) => run('comment', () => window.candy.dispatch.comment(draft)),
      rule: (ruling) => run('rule', () => window.candy.dispatch.rule(ruling)),
      /*
       * Marking read is silent.
       *
       * It runs whenever an item is opened, so routing it through `run` would
       * put the board into a pending state on every click and — worse — clear
       * whatever error the operator was in the middle of reading.
       */
      markSeen: async (itemId, author) => {
        try {
          await window.candy.dispatch.markSeen(itemId, author)
        } catch {
          // Failing to record a read is not worth a message. The next open
          // tries again, and the only cost is a mark that lingers.
        }
      },
      withdraw: (id) => run('withdraw', () => window.candy.dispatch.withdraw(id)),
      pending,
      error,
      dismissError: () => setError(null)
    }),
    [run, pending, error]
  )
}
