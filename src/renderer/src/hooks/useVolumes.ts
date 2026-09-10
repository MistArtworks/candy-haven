import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { VolumeDraft, VolumePatch, VolumeSummary } from '@shared/domain/volumes'

/**
 * Data access for VOLUMES — albums, EPs and compilations.
 *
 * The one ARCHIVE hook whose mutations touch no files at all, which makes it
 * the one place optimism would be defensible. It is still not used: a volume's
 * *tracks* live on the project records, so every write here can change the
 * register too — deleting a volume detaches its tracks and re-categorises each
 * one — and half-optimistic updates across two caches are worse than none.
 */

const VOLUMES_KEY = ['volumes', 'list'] as const

export function useVolumes(enabled = true): UseQueryResult<VolumeSummary[]> {
  return useQuery({
    queryKey: VOLUMES_KEY,
    queryFn: () => window.candy.volumes.list(),
    enabled,
    staleTime: 10_000
  })
}

/**
 * Invalidates volumes and the register together.
 *
 * Never independently stale: a track joins a volume by having its *project*
 * record patched, and dissolving a volume rewrites the category of every track
 * that was on it.
 */
function useInvalidateVolumes(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['volumes'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      // A release can be raised for a volume, and shows its title and track
      // count — both of which this can change.
      queryClient.invalidateQueries({ queryKey: ['releases'] })
    ])
  }
}

export interface VolumeMutations {
  create: UseMutationResult<VolumeSummary, Error, VolumeDraft>
  update: UseMutationResult<VolumeSummary, Error, { id: string; patch: VolumePatch }>
  remove: UseMutationResult<void, Error, string>
  reorder: UseMutationResult<VolumeSummary[], Error, { id: string; projectIds: string[] }>
}

export function useVolumeMutations(): VolumeMutations {
  const invalidate = useInvalidateVolumes()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    create: useMutation({
      mutationFn: (draft: VolumeDraft) => window.candy.volumes.create(draft),
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.volumes.update(id, patch),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.volumes.remove(id),
      onSuccess
    }),
    reorder: useMutation({
      mutationFn: ({ id, projectIds }) => window.candy.volumes.reorder(id, projectIds),
      onSuccess
    })
  }
}
