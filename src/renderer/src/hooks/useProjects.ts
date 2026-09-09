import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  MarketingAsset,
  MarketingAssetKind,
  NoteDraft,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ScanState,
  UnlinkedMedia
} from '@shared/domain/projects'
import { createEmptyScanState } from '@shared/domain/projects.constants'

/**
 * Data access for the project registry.
 *
 * Two mechanisms, split by direction, as elsewhere in the console: the registry
 * and each dossier are request/response and go through React Query, while scan
 * progress is pushed from the main process and is held in local state by
 * `useScanState`. Scan state is deliberately *not* in the global system store —
 * only this department cares about it, and a scan is a foreground action the
 * operator started, not ambient system state.
 */

const REGISTRY_KEY = ['projects', 'registry'] as const
const PROJECT_KEY = ['projects', 'record'] as const

export function useProjectRegistry(query: ProjectQuery): UseQueryResult<ProjectRegistry> {
  return useQuery({
    // The query is part of the key so switching filters is a cache hit on the
    // way back rather than a refetch.
    queryKey: [...REGISTRY_KEY, query],
    queryFn: () => window.candy.projects.registry(query),
    staleTime: 10_000
  })
}

export function useProject(id: string | null): UseQueryResult<ProjectRecord> {
  return useQuery({
    queryKey: [...PROJECT_KEY, id],
    queryFn: () => window.candy.projects.get(id as string),
    enabled: id !== null,
    staleTime: 5_000
  })
}

export function useUnlinkedMedia(enabled: boolean): UseQueryResult<UnlinkedMedia[]> {
  return useQuery({
    queryKey: ['projects', 'unlinked'],
    queryFn: () => window.candy.projects.unlinked(200),
    enabled,
    staleTime: 30_000
  })
}

/**
 * Live scan state.
 *
 * Subscribes before fetching the current snapshot and then declines to apply
 * that snapshot if a push has already arrived — the same ordering guard
 * SystemBridge uses for boot, and for the same reason: a slow response must not
 * roll fast-moving progress backwards.
 */
export function useScanState(): ScanState {
  const [state, setState] = useState<ScanState>(createEmptyScanState)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let claimedByPush = false

    const unsubscribe = window.candy.projects.onScan((next) => {
      if (cancelled) return
      claimedByPush = true
      setState(next)

      /*
       * A finished scan has rewritten the registry, so anything cached from
       * before it is stale by definition.
       *
       * `error` refreshes too, because a scan that failed part-way through
       * filing has still written some of its records — refetching once more
       * than strictly necessary is cheaper than showing a list that disagrees
       * with what is actually stored.
       */
      if (next.phase === 'done' || next.phase === 'error') {
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
        // A scan can register a project that already carries a release date, so
        // the schedule is stale for the same reason the register is.
        void queryClient.invalidateQueries({ queryKey: ['transmissions'] })
      }
    })

    void window.candy.projects
      .scanState()
      .then((initial) => {
        if (!cancelled && !claimedByPush) setState(initial)
      })
      .catch(() => {
        // The archive may not be connected yet; the empty state is correct.
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [queryClient])

  return state
}

/**
 * Invalidates every projects query. Called after any successful mutation.
 *
 * TRANSMISSIONS is invalidated alongside, because its schedule is a projection
 * over these same records: editing a promotional date in a dossier changes what
 * the calendar should draw, and without this the two departments would disagree
 * until something else happened to refetch.
 */
function useInvalidateProjects(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['transmissions'] })
    ])
  }
}

/**
 * Mutations write through the main process and then invalidate, rather than
 * updating the cache optimistically.
 *
 * Unlike settings — which are local-first because the renderer is their only
 * writer — a project edit can be *rejected* by rules the renderer does not
 * own: a stage gate on an incomplete package, a marketing plan seeded as a side
 * effect, a release date that re-dates nine deliverables. Showing the operator
 * a guess and then correcting it would be worse than a brief wait for the truth.
 */
export function useProjectMutations(): {
  patch: UseMutationResult<ProjectRecord, Error, { id: string; patch: ProjectPatch }>
  addNote: UseMutationResult<ProjectRecord, Error, { id: string; draft: NoteDraft }>
  updateNote: UseMutationResult<
    ProjectRecord,
    Error,
    { id: string; noteId: string; draft: NoteDraft }
  >
  deleteNote: UseMutationResult<ProjectRecord, Error, { id: string; noteId: string }>
  addMarketingAsset: UseMutationResult<
    ProjectRecord,
    Error,
    { id: string; kind: MarketingAssetKind }
  >
  saveMarketingAsset: UseMutationResult<ProjectRecord, Error, { id: string; asset: MarketingAsset }>
  removeMarketingAsset: UseMutationResult<ProjectRecord, Error, { id: string; assetId: string }>
  forget: UseMutationResult<void, Error, string>
} {
  const invalidate = useInvalidateProjects()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    patch: useMutation({
      mutationFn: ({ id, patch }) => window.candy.projects.patch(id, patch),
      onSuccess
    }),
    addNote: useMutation({
      mutationFn: ({ id, draft }) => window.candy.projects.addNote(id, draft),
      onSuccess
    }),
    updateNote: useMutation({
      mutationFn: ({ id, noteId, draft }) => window.candy.projects.updateNote(id, noteId, draft),
      onSuccess
    }),
    deleteNote: useMutation({
      mutationFn: ({ id, noteId }) => window.candy.projects.deleteNote(id, noteId),
      onSuccess
    }),
    addMarketingAsset: useMutation({
      mutationFn: ({ id, kind }) => window.candy.projects.addMarketingAsset(id, kind),
      onSuccess
    }),
    saveMarketingAsset: useMutation({
      mutationFn: ({ id, asset }) => window.candy.projects.saveMarketingAsset(id, asset),
      onSuccess
    }),
    removeMarketingAsset: useMutation({
      mutationFn: ({ id, assetId }) => window.candy.projects.removeMarketingAsset(id, assetId),
      onSuccess
    }),
    forget: useMutation({
      mutationFn: (id: string) => window.candy.projects.forget(id),
      onSuccess
    })
  }
}

/**
 * Loads an image from disk as a data URL.
 *
 * The renderer's CSP permits `img-src 'self' data:` only, so artwork cannot be
 * referenced by path — the main process decodes and downscales it. Keyed on
 * path and width so the same cover at two sizes does not fight over one entry.
 */
export function useArtwork(path: string | null, width = 480): string | null {
  const { data } = useQuery({
    queryKey: ['projects', 'thumbnail', path, width],
    queryFn: () => window.candy.projects.thumbnail(path as string, width),
    enabled: path !== null,
    staleTime: Infinity,
    gcTime: 10 * 60_000
  })

  return data ?? null
}
