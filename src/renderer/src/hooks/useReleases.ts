import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  ArchiveRelease,
  DeliverableKind,
  ReleaseDraft,
  ReleasePatch,
  ReleaseSummary
} from '@shared/domain/releases'

/**
 * Data access for RELEASES.
 *
 * Nothing optimistic, for the reason recorded in useStacks.ts: raising a
 * release creates a directory, renaming one moves it, and attaching a
 * deliverable copies a file that may be gigabytes. None of that may be drawn as
 * done before the disk agrees.
 */

const RELEASES_KEY = ['releases', 'list'] as const

export function useReleases(enabled = true): UseQueryResult<ReleaseSummary[]> {
  return useQuery({
    queryKey: RELEASES_KEY,
    queryFn: () => window.candy.releases.list(),
    enabled,
    staleTime: 10_000
  })
}

/**
 * Invalidates releases and the register together.
 *
 * A release reads its subject's name and track count out of the register on
 * every list, so the two go stale as one — and raising a release for a project
 * attaches that project's final master, which the dossier also displays.
 */
function useInvalidateReleases(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['releases'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    ])
  }
}

export interface ReleaseMutations {
  create: UseMutationResult<ReleaseSummary, Error, ReleaseDraft>
  update: UseMutationResult<ReleaseSummary, Error, { id: string; patch: ReleasePatch }>
  attach: UseMutationResult<
    ArchiveRelease,
    Error,
    { id: string; kind: DeliverableKind; sourcePath: string | null }
  >
  remove: UseMutationResult<void, Error, string>
}

export function useReleaseMutations(): ReleaseMutations {
  const invalidate = useInvalidateReleases()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    create: useMutation({
      mutationFn: (draft: ReleaseDraft) => window.candy.releases.create(draft),
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.releases.update(id, patch),
      onSuccess
    }),
    attach: useMutation({
      mutationFn: ({ id, kind, sourcePath }) => window.candy.releases.attach(id, kind, sourcePath),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.releases.remove(id),
      onSuccess
    })
  }
}
