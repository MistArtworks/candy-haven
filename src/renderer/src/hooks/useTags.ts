import { useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { TagDraft, TagPatch, TagSummary } from '@shared/domain/tags'

/**
 * Data access for TAGS — the operator's own labels.
 *
 * Metadata only, like volumes, and invalidated the same way: a tag's usage
 * count is derived from the register, and deleting one rewrites every project
 * that carried it, so the two caches are never independently stale.
 */

const TAGS_KEY = ['tags', 'list'] as const

export function useTags(enabled = true): UseQueryResult<TagSummary[]> {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: () => window.candy.tags.list(),
    enabled,
    staleTime: 10_000
  })
}

function useInvalidateTags(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
      // The registry ships the library with its usage counts, and a delete
      // strips ids off the records themselves.
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    ])
  }
}

export interface TagMutations {
  create: UseMutationResult<TagSummary, Error, TagDraft>
  update: UseMutationResult<TagSummary, Error, { id: string; patch: TagPatch }>
  remove: UseMutationResult<{ detached: number }, Error, string>
}

export function useTagMutations(): TagMutations {
  const invalidate = useInvalidateTags()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    create: useMutation({
      mutationFn: (draft: TagDraft) => window.candy.tags.create(draft),
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.tags.update(id, patch),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.tags.remove(id),
      onSuccess
    })
  }
}

/**
 * Resolves a project's `tagIds` into tags, in library order.
 *
 * Library order rather than the order the ids were written in, so a given set
 * of tags reads identically on every project that carries it — a chip row
 * whose sequence depends on the sequence they were applied in is one the eye
 * has to re-read each time.
 *
 * Ids that resolve to nothing are dropped rather than drawn as placeholders.
 * A patch can legitimately name a tag deleted a moment earlier in another
 * window, and a chip-shaped hole explains less than the tag's plain absence.
 */
export function useResolvedTags(
  tagIds: readonly string[],
  library: readonly TagSummary[]
): TagSummary[] {
  return useMemo(() => {
    if (tagIds.length === 0) return []
    const carried = new Set(tagIds)
    return library.filter((tag) => carried.has(tag.id))
  }, [tagIds, library])
}
