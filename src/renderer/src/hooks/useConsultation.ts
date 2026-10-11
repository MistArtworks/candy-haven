import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { notify } from '@renderer/components/feedback/notify'
import type {
  Consultation,
  ConsultationFeedback,
  ConsultationProgress,
  ConsultationState
} from '@shared/domain/consultation'
import { STORAGE_FREE_BYTES } from '@shared/domain/consultation.constants'

const EMPTY: ConsultationState = {
  link: { state: 'signed-out', message: '', website: '', syncedAt: null },
  storage: { bucket: null, usedBytes: 0, limitBytes: STORAGE_FREE_BYTES },
  waiting: 0,
  revision: 0
}

/**
 * Data access for CONSULTATION: the shared tracks and the feedback on them,
 * as this machine holds them.
 *
 * Pushed, as the inbox's state is: the main process checks in with the
 * website when the console starts or the operator asks, and broadcasts what
 * changed. The lists are read from the copy and keyed on the revision.
 */
export function useConsultation(): ConsultationState {
  const [state, setState] = useState<ConsultationState>(EMPTY)

  useEffect(() => {
    let alive = true
    void window.candy.consultation.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.consultation.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

/** Whether someone is signed in, which is what shows anything at all. */
export function consultationOpen(state: ConsultationState): boolean {
  return state.link.state !== 'signed-out' && state.link.state !== 'unconfigured'
}

/** Whether a change can be sent: anything but offline, as for the inbox. */
export function consultationReachable(state: ConsultationState): boolean {
  return state.link.state === 'online' || state.link.state === 'syncing'
}

export function useConsultations(state: ConsultationState): UseQueryResult<Consultation[]> {
  return useQuery({
    queryKey: ['consultation', 'list', state.link.website, state.revision],
    queryFn: () => window.candy.consultation.list(),
    enabled: consultationOpen(state),
    // The previous list stays on screen while the next is read.
    placeholderData: (previous) => previous
  })
}

/** One link's feedback. The previous answer is only kept for the same link. */
export function useConsultationFeedback(
  state: ConsultationState,
  id: string | null
): UseQueryResult<ConsultationFeedback[]> {
  return useQuery({
    queryKey: ['consultation', 'feedback', state.link.website, state.revision, id],
    queryFn: () => window.candy.consultation.feedback(id as string),
    enabled: consultationOpen(state) && id !== null,
    placeholderData: (previous, query) => (query?.queryKey[4] === id ? previous : undefined)
  })
}

/** How far the upload under way has got, as main reports it. */
export function useShareProgress(): ConsultationProgress | null {
  const [progress, setProgress] = useState<ConsultationProgress | null>(null)
  useEffect(() => window.candy.consultation.onProgress(setProgress), [])
  return progress
}

// -------------------------------------------------------------------- actions

export interface ConsultationActions {
  sync(): Promise<void>
  /** Marks a link's feedback read. Silent: see `read` below. */
  read(id: string): Promise<void>
  /** Null when it was refused (the notice says why). */
  changeExpiry(id: string, expiresAt: number): Promise<Consultation | null>
  end(id: string): Promise<Consultation | null>
  remove(id: string): Promise<boolean>
  pending: string | null
}

export function useConsultationActions(): ConsultationActions {
  const [pending, setPending] = useState<string | null>(null)

  /** Every refusal takes the notice stack, as on the inbox's pages. */
  const answer = useCallback(
    async <T>(key: string, action: () => Promise<T>): Promise<T | null> => {
      setPending(key)
      try {
        return await action()
      } catch (cause) {
        notify.refuse(cause)
        return null
      } finally {
        setPending((current) => (current === key ? null : current))
      }
    },
    []
  )

  return useMemo<ConsultationActions>(
    () => ({
      sync: async () => {
        await answer('sync', () => window.candy.consultation.sync())
      },
      /*
       * Opening a link's feedback reads it, as opening a message does: on
       * every open, so a busy state or a notice each time would be noise.
       * Failing to record it costs a mark that stays until the next open.
       */
      read: async (id) => {
        try {
          await window.candy.consultation.read(id)
        } catch {
          // See above.
        }
      },
      changeExpiry: (id, expiresAt) =>
        answer('expiry', () => window.candy.consultation.changeExpiry({ id, expiresAt })),
      end: (id) => answer('end', () => window.candy.consultation.end(id)),
      remove: async (id) =>
        (await answer('remove', async () => {
          await window.candy.consultation.remove(id)
          return true
        })) ?? false,
      pending
    }),
    [answer, pending]
  )
}
