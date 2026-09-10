import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { ProjectRecord } from '@shared/domain/projects'
import type {
  ArchiveSetupDraft,
  ArchiveSetupState,
  FolderDraft,
  FolderPatch,
  StacksTree
} from '@shared/domain/stacks'

/**
 * Data access for THE STACKS — the ARCHIVE's filing tree.
 *
 * Every mutation here moves the operator's actual project folders, which sets
 * the rule for how this hook behaves: **nothing is optimistic.** A move can be
 * refused by conditions the renderer cannot see — a set open in Ableton Live, a
 * name already taken in the destination, a scan walking the same directories —
 * and showing a folder in its new place before the disk agrees would be a lie
 * the operator has no way to detect. The brief wait for the truth is the point.
 *
 * This mirrors the reasoning already recorded for project mutations in
 * useProjects.ts; the stakes here are simply higher.
 */

const STACKS_KEY = ['stacks', 'tree'] as const
const SETUP_KEY = ['stacks', 'setup'] as const

export function useStacksTree(enabled = true): UseQueryResult<StacksTree> {
  return useQuery({
    queryKey: STACKS_KEY,
    queryFn: () => window.candy.stacks.tree(),
    enabled,
    staleTime: 10_000
  })
}

/**
 * Whether the department can be used at all.
 *
 * Fetched separately from the tree, and asked first: with no filing root there
 * is no wrapper to read folders out of, so the tree query is held back until
 * this says the gate is clear. `retry: false` because the failure mode here is
 * a missing directory rather than a flaky call — retrying an unplugged drive
 * three times only delays telling the operator about it.
 */
export function useArchiveSetup(): UseQueryResult<ArchiveSetupState> {
  return useQuery({
    queryKey: SETUP_KEY,
    queryFn: () => window.candy.stacks.setupState(),
    retry: false,
    staleTime: 5_000
  })
}

/**
 * Invalidates the tree and everything that reads it.
 *
 * They are never independently stale: filing a project changes a folder's count
 * *and* which projects the register should list, a rename rewrites paths the
 * open dossier is displaying, and completing setup turns the whole department
 * on.
 */
function useInvalidateStacks(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    ])
  }
}

export interface StacksMutations {
  /** Saves the root and template, then provisions the wrapper. */
  setup: UseMutationResult<ArchiveSetupState, Error, ArchiveSetupDraft>
  create: UseMutationResult<StacksTree, Error, FolderDraft>
  update: UseMutationResult<StacksTree, Error, { id: string; patch: FolderPatch }>
  /** Moves the folder and everything in it into the recycle bin. */
  remove: UseMutationResult<StacksTree, Error, string>
  /** Puts a binned folder and its subtree back. */
  restore: UseMutationResult<StacksTree, Error, string>
  /** Removes a binned folder from disk for good. */
  purge: UseMutationResult<StacksTree, Error, string>
  /** Moves a project into a folder, or out of the tree with `folderId: null`. */
  file: UseMutationResult<ProjectRecord, Error, { id: string; folderId: string | null }>
}

export function useStacksMutations(): StacksMutations {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateStacks()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    setup: useMutation({
      mutationFn: (draft: ArchiveSetupDraft) => window.candy.stacks.setup(draft),
      onSuccess: async () => {
        // Settings changed as well as the tree: the root and template both live
        // there, and the INDEXING panel reads them from the settings cache.
        await queryClient.invalidateQueries({ queryKey: ['settings'] })
        await invalidate()
      }
    }),
    create: useMutation({
      mutationFn: (draft: FolderDraft) => window.candy.stacks.create(draft),
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.stacks.update(id, patch),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.stacks.remove(id),
      onSuccess
    }),
    restore: useMutation({
      mutationFn: (id: string) => window.candy.stacks.restore(id),
      onSuccess
    }),
    purge: useMutation({
      mutationFn: (id: string) => window.candy.stacks.purge(id),
      onSuccess
    }),
    file: useMutation({
      mutationFn: ({ id, folderId }) => window.candy.projects.file(id, folderId),
      onSuccess
    })
  }
}
