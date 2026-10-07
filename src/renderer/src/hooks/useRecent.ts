import { useCallback } from 'react'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { RecentSet } from '@shared/domain/recent'

const RECENT_KEY = ['projects', 'recent'] as const
/**
 * Kept between openings, so a menu opens on the list it showed last while
 * it reads the list again, rather than on nothing.
 */
const KEPT_MS = 30 * 60_000

/**
 * Recently opened sets, newest first: Live's own recent list, what Haven
 * opened, and the set Live has open now (`RecentService`).
 *
 * Read when asked rather than pushed: Live's list changes when Live saves its
 * preferences, which nothing here is told about, so a menu reads it as it
 * opens and the ARCHIVE lens as it comes into view or the window gains focus.
 */
export function useRecentSets(enabled = true): UseQueryResult<RecentSet[]> {
  return useQuery({
    queryKey: RECENT_KEY,
    queryFn: () => window.candy.projects.recent(),
    enabled,
    staleTime: 4_000,
    gcTime: KEPT_MS,
    refetchOnWindowFocus: true
  })
}

/** Opens a recent set in Live, then reads the list again: it moved to the top. */
export function useOpenRecentSet(): (set: RecentSet) => Promise<void> {
  const client = useQueryClient()
  return useCallback(
    async (set: RecentSet) => {
      await window.candy.projects.openSet(set.path)
      await client.invalidateQueries({ queryKey: RECENT_KEY })
    },
    [client]
  )
}

/**
 * Reads the list ahead of a menu opening, from the pointer arriving on its
 * trigger, so the menu opens on it read; nothing if it's fresh.
 */
export function usePrefetchRecentSets(): () => void {
  const client = useQueryClient()
  return useCallback(() => {
    void client.prefetchQuery({
      queryKey: RECENT_KEY,
      queryFn: () => window.candy.projects.recent(),
      staleTime: 4_000
    })
  }, [client])
}
