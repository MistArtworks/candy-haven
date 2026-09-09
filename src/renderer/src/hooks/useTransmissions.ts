import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  TransmissionSchedule,
  TransmissionTaskDraft,
  TransmissionTaskPatch
} from '@shared/domain/transmissions'

/**
 * Data access for the scheduling department.
 *
 * Request/response only — there is no push channel here, and deliberately so.
 * The schedule is a projection over records the operator themselves edits from
 * this console; nothing changes it behind their back the way a scan or a chat
 * poll does, so subscribing would be a socket kept open to be told about
 * changes this window just made.
 *
 * Invalidation is what keeps it honest instead, and it runs in both directions:
 * task mutations here invalidate `['transmissions']`, and `useInvalidateProjects`
 * in useProjects.ts does the same after any ARCHIVE edit.
 */

const SCHEDULE_KEY = ['transmissions', 'schedule'] as const

export function useSchedule(): UseQueryResult<TransmissionSchedule> {
  return useQuery({
    queryKey: SCHEDULE_KEY,
    queryFn: () => window.candy.transmissions.schedule(),
    // Longer than the register's ten seconds: a calendar is read for minutes at
    // a time while the operator works out a plan, and refetching under them
    // would move the thing they are reading.
    staleTime: 30_000
  })
}

/**
 * Task writes.
 *
 * Each channel returns the whole rebuilt schedule, so the response is written
 * straight into the cache rather than triggering a refetch — the main process
 * has already done the work of recomputing collisions, and asking for it again
 * would draw the calendar twice for one edit.
 */
export function useTaskMutations(): {
  add: UseMutationResult<TransmissionSchedule, Error, TransmissionTaskDraft>
  update: UseMutationResult<
    TransmissionSchedule,
    Error,
    { id: string; patch: TransmissionTaskPatch }
  >
  remove: UseMutationResult<TransmissionSchedule, Error, { id: string }>
} {
  const queryClient = useQueryClient()

  const settle = (schedule: TransmissionSchedule): void => {
    queryClient.setQueryData(SCHEDULE_KEY, schedule)
  }

  return {
    add: useMutation({
      mutationFn: (draft: TransmissionTaskDraft) => window.candy.transmissions.addTask(draft),
      onSuccess: settle
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: TransmissionTaskPatch }) =>
        window.candy.transmissions.updateTask(id, patch),
      onSuccess: settle
    }),
    remove: useMutation({
      mutationFn: ({ id }: { id: string }) => window.candy.transmissions.removeTask(id),
      onSuccess: settle
    })
  }
}
