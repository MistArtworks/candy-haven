import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import type {
  DispatchCommentDraft,
  DispatchDraft,
  DispatchRuling,
  DispatchSetup,
  DispatchState
} from '@shared/domain/dispatch'
import { DISPATCH_ADJUDICATOR, type DispatchAuthor } from '@shared/domain/dispatch.constants'

/*
 * What is new on the board lives in the shared domain now, because the main
 * process reads the same rules to raise DISPATCH's notices. Re-exported so the
 * board's own imports stay where they were.
 */
export {
  countWaiting,
  hasNews,
  isUnseen,
  rulingUnseen,
  unreadCount
} from '@shared/domain/dispatch.unread'

const EMPTY: DispatchState = {
  link: {
    state: 'unconfigured',
    message: 'No Firebase config has been supplied.',
    projectId: null,
    identity: null,
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

/**
 * Who is signed in.
 *
 * Read off the link rather than held locally. It used to be a `localStorage`
 * toggle on the reasoning that a password between two people protects nothing —
 * which was the wrong reasoning, because the point is not to keep them apart
 * but to give the *database* something to check so it can refuse everyone else.
 * Identity is now whichever account the credential resolved to, and the main
 * process is the only thing that knows.
 */
export function useIdentity(state: DispatchState): DispatchAuthor | null {
  return state.link.identity
}

/** Only one of them rules on items. The other files and comments. */
export function canAdjudicate(identity: DispatchAuthor | null): boolean {
  return identity === DISPATCH_ADJUDICATOR
}

// -------------------------------------------------------------------- actions

export interface DispatchActions {
  configure(source: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  file(draft: DispatchDraft): Promise<void>
  comment(draft: DispatchCommentDraft): Promise<void>
  rule(ruling: DispatchRuling): Promise<void>
  markSeen(itemId: string, author: DispatchAuthor): Promise<void>
  withdraw(id: string): Promise<void>
  pending: string | null
  error: string | null
}

export function useDispatchActions(): DispatchActions {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * `quiet` is for the one action whose refusal already has a home.
   *
   * Attaching the board is done from REGULATION → BOARD, which draws the
   * failure under its own form — a config that will not parse is about what
   * was pasted, and belongs beside it. Everything else here is done from the
   * board itself, where there is no form to report against, so it takes the
   * console's notice stack.
   *
   * The error state is kept either way, because `BoardPanel` reads it.
   */
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, quiet = false): Promise<void> => {
      setPending(key)
      try {
        await action()
        setError(null)
      } catch (cause) {
        const failure = cause as Error & { hint?: string | null }
        setError(failure.hint ? `${failure.message} ${failure.hint}` : failure.message)
        if (!quiet) notify.refuse(cause)
      } finally {
        setPending((current) => (current === key ? null : current))
      }
    },
    []
  )

  return useMemo<DispatchActions>(
    () => ({
      configure: (source) => run('configure', () => window.candy.dispatch.configure(source), true),
      signIn: (email, password) =>
        run('sign-in', () => window.candy.dispatch.signIn(email, password)),
      signOut: () => run('sign-out', () => window.candy.dispatch.signOut()),
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
      error
    }),
    [run, pending, error]
  )
}
