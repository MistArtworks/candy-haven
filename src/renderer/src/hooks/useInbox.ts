import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { notify } from '@renderer/components/feedback/notify'
import type {
  EnquiryStatusChange,
  InboxNote,
  InboxState,
  InboxTarget,
  MessageStatusChange,
  SiteEnquiry,
  SiteMessage
} from '@shared/domain/inbox'

const EMPTY: InboxState = {
  link: { state: 'signed-out', message: '', website: '', syncedAt: null },
  waiting: { messages: 0, enquiries: 0 },
  revision: 0
}

/**
 * Data access for CONTACT and SERVICES: the website's messages and DJ
 * enquiries, as this machine holds them.
 *
 * The state is pushed, like the board's: the main process checks in with the
 * website every minute and broadcasts what changed. The lists are read from
 * the copy and keyed on the state's revision, so a check-in that brings
 * something re-reads them and one that brings nothing does not.
 */
export function useInbox(): InboxState {
  const [state, setState] = useState<InboxState>(EMPTY)

  useEffect(() => {
    let alive = true

    void window.candy.inbox.state().then((next) => {
      if (alive) setState(next)
    })

    const unsubscribe = window.candy.inbox.onState(setState)

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

/** Whether someone is signed in, which is what shows anything at all. */
export function inboxOpen(state: InboxState): boolean {
  return state.link.state !== 'signed-out' && state.link.state !== 'unconfigured'
}

/**
 * Whether a deletion can be sent.
 *
 * Offline is the one state that cannot. A check-in in progress can: it is
 * talking to the website at that moment, which is the opposite of offline.
 */
export function inboxReachable(state: InboxState): boolean {
  return state.link.state === 'online' || state.link.state === 'syncing'
}

export function useSiteMessages(state: InboxState): UseQueryResult<SiteMessage[]> {
  return useQuery({
    queryKey: ['inbox', 'messages', state.link.website, state.revision],
    queryFn: () => window.candy.inbox.messages(),
    enabled: inboxOpen(state),
    // The previous list stays on screen while the next is read, so a check-in
    // does not blank the page for the moment it takes.
    placeholderData: keepPreviousData
  })
}

export function useSiteEnquiries(state: InboxState): UseQueryResult<SiteEnquiry[]> {
  return useQuery({
    queryKey: ['inbox', 'enquiries', state.link.website, state.revision],
    queryFn: () => window.candy.inbox.enquiries(),
    enabled: inboxOpen(state),
    placeholderData: keepPreviousData
  })
}

// -------------------------------------------------------------------- actions

export interface InboxActions {
  sync(): Promise<void>
  read(id: string): Promise<void>
  setMessageStatus(change: MessageStatusChange): Promise<void>
  setEnquiryStatus(change: EnquiryStatusChange): Promise<void>
  setNote(note: InboxNote): Promise<void>
  remove(target: InboxTarget): Promise<boolean>
  pending: string | null
}

export function useInboxActions(): InboxActions {
  const [pending, setPending] = useState<string | null>(null)

  /*
   * Every refusal takes the console's notice stack, as on the board. The one
   * that is expected (deleting offline) is prevented on the page before it is
   * tried, so a refusal here is always worth reading.
   */
  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<boolean> => {
    setPending(key)
    try {
      await action()
      return true
    } catch (cause) {
      notify.refuse(cause)
      return false
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<InboxActions>(
    () => ({
      sync: async () => {
        await run('sync', () => window.candy.inbox.sync())
      },
      /*
       * Opening is silent, as marking an item seen is on the board: it runs on
       * every open, and a pending state or a notice on each would be noise.
       * Failing to record it costs a mark that lingers until the next open.
       */
      read: async (id) => {
        try {
          await window.candy.inbox.read(id)
        } catch {
          // See above.
        }
      },
      setMessageStatus: async (change) => {
        await run('status', () => window.candy.inbox.setMessageStatus(change))
      },
      setEnquiryStatus: async (change) => {
        await run('status', () => window.candy.inbox.setEnquiryStatus(change))
      },
      setNote: async (note) => {
        await run('note', () => window.candy.inbox.setNote(note))
      },
      remove: (target) => run('delete', () => window.candy.inbox.remove(target)),
      pending
    }),
    [run, pending]
  )
}
