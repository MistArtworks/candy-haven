import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  NoteDraft,
  ProjectDraft,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ScanState
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
        // A scan re-files projects from their paths, so folder counts move with
        // the register. Volumes and releases read the register too — a relinked
        // project changes a volume's track count and un-orphans a release.
        void queryClient.invalidateQueries({ queryKey: ['stacks'] })
        void queryClient.invalidateQueries({ queryKey: ['volumes'] })
        void queryClient.invalidateQueries({ queryKey: ['releases'] })
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
 * Invalidates every query that reads the register. Called after any successful
 * mutation.
 *
 * Four keys rather than one, because three other views are projections over
 * these same records and none of them can tell on their own that a record
 * changed: filing moves a folder's count, a category change moves a track
 * between volumes, and trashing a project orphans its release. Refetching all
 * four is a few kilobytes against a local database; leaving them stale means
 * two panels on one screen disagreeing.
 */
function useInvalidateProjects(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['volumes'] }),
      queryClient.invalidateQueries({ queryKey: ['releases'] })
    ])
  }
}

/**
 * Mutations write through the main process and then invalidate, rather than
 * updating the cache optimistically.
 *
 * Unlike settings — which are local-first because the renderer is their only
 * writer — a project edit can be *rejected* by rules the renderer does not
 * own: a stage gate with no final master chosen, a category that demands a
 * volume, a folder that turns out to be a genre. Showing the operator a guess
 * and then correcting it would be worse than a brief wait for the truth.
 *
 * `create` and `trash` are the strongest case for that rule: one makes
 * directories and copies a template, the other moves a folder to the Recycle
 * Bin. Neither may be drawn as done before the disk agrees.
 */
export function useProjectMutations(): {
  patch: UseMutationResult<ProjectRecord, Error, { id: string; patch: ProjectPatch }>
  create: UseMutationResult<ProjectRecord, Error, ProjectDraft>
  addNote: UseMutationResult<ProjectRecord, Error, { id: string; draft: NoteDraft }>
  updateNote: UseMutationResult<
    ProjectRecord,
    Error,
    { id: string; noteId: string; draft: NoteDraft }
  >
  deleteNote: UseMutationResult<ProjectRecord, Error, { id: string; noteId: string }>
  forget: UseMutationResult<void, Error, string>
  trash: UseMutationResult<ProjectRecord, Error, string>
  restore: UseMutationResult<ProjectRecord, Error, string>
  purge: UseMutationResult<void, Error, string>
} {
  const invalidate = useInvalidateProjects()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    patch: useMutation({
      mutationFn: ({ id, patch }) => window.candy.projects.patch(id, patch),
      onSuccess
    }),
    create: useMutation({
      mutationFn: (draft: ProjectDraft) => window.candy.projects.create(draft),
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
    forget: useMutation({
      mutationFn: (id: string) => window.candy.projects.forget(id),
      onSuccess
    }),
    trash: useMutation({
      mutationFn: (id: string) => window.candy.projects.trash(id),
      onSuccess
    }),
    restore: useMutation({
      mutationFn: (id: string) => window.candy.projects.restore(id),
      onSuccess
    }),
    purge: useMutation({
      mutationFn: (id: string) => window.candy.projects.purge(id),
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
