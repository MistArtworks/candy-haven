import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  DiscographyRegistry,
  DiscographyRelease,
  ReleaseAsset,
  ReleaseDraft,
  ReleasePatch,
  TrackDraft,
  TrackPatch
} from '@shared/domain/discography'

/**
 * Data access for DISCOGRAPHY — the public record of what shipped.
 *
 * Nothing optimistic, for two reasons this time rather than one. Setting
 * artwork copies a file, which can be refused by conditions the renderer
 * cannot see; and every track write **renumbers the running order**, so a
 * local guess would have to re-derive positions the service is about to
 * assign — and would be wrong the moment two windows touched one release.
 *
 * Invalidated alongside the register, because the link runs both ways as far
 * as the *reader* is concerned: the project registry ships the appearance
 * index, so linking a track changes what the ARCHIVE draws.
 */

const REGISTRY_KEY = ['discography', 'registry'] as const

export function useDiscography(enabled = true): UseQueryResult<DiscographyRegistry> {
  return useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: () => window.candy.discography.registry(),
    enabled,
    staleTime: 10_000
  })
}

export function useRelease(id: string | null): UseQueryResult<DiscographyRelease> {
  return useQuery({
    queryKey: ['discography', 'release', id],
    queryFn: () => window.candy.discography.get(id as string),
    enabled: id !== null,
    staleTime: 5_000
  })
}

function useInvalidateDiscography(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['discography'] }),
      // The register draws which release a project is a track on, resolved
      // through the appearance index the registry ships.
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      // The roster counts how many releases credit each artist.
      queryClient.invalidateQueries({ queryKey: ['artists'] })
    ])
  }
}

export interface DiscographyMutations {
  create: UseMutationResult<DiscographyRelease, Error, ReleaseDraft>
  update: UseMutationResult<DiscographyRelease, Error, { id: string; patch: ReleasePatch }>
  remove: UseMutationResult<void, Error, string>
  setAsset: UseMutationResult<
    DiscographyRelease,
    Error,
    { id: string; asset: ReleaseAsset; sourcePath: string | null }
  >
  addTrack: UseMutationResult<DiscographyRelease, Error, { id: string; draft: TrackDraft }>
  updateTrack: UseMutationResult<
    DiscographyRelease,
    Error,
    { id: string; trackId: string; patch: TrackPatch }
  >
  removeTrack: UseMutationResult<DiscographyRelease, Error, { id: string; trackId: string }>
  reorderTracks: UseMutationResult<DiscographyRelease, Error, { id: string; trackIds: string[] }>
  setTrackMaster: UseMutationResult<
    DiscographyRelease,
    Error,
    { id: string; trackId: string; path: string | null }
  >
}

export function useDiscographyMutations(): DiscographyMutations {
  const invalidate = useInvalidateDiscography()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    create: useMutation({
      mutationFn: (draft: ReleaseDraft) => window.candy.discography.create(draft),
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.discography.update(id, patch),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.discography.remove(id),
      onSuccess
    }),
    setAsset: useMutation({
      mutationFn: ({ id, asset, sourcePath }) =>
        window.candy.discography.setAsset(id, asset, sourcePath),
      onSuccess
    }),
    addTrack: useMutation({
      mutationFn: ({ id, draft }) => window.candy.discography.addTrack(id, draft),
      onSuccess
    }),
    updateTrack: useMutation({
      mutationFn: ({ id, trackId, patch }) =>
        window.candy.discography.updateTrack(id, trackId, patch),
      onSuccess
    }),
    removeTrack: useMutation({
      mutationFn: ({ id, trackId }) => window.candy.discography.removeTrack(id, trackId),
      onSuccess
    }),
    reorderTracks: useMutation({
      mutationFn: ({ id, trackIds }) => window.candy.discography.reorderTracks(id, trackIds),
      onSuccess
    }),
    setTrackMaster: useMutation({
      mutationFn: ({ id, trackId, path }) =>
        window.candy.discography.setTrackMaster(id, trackId, path),
      onSuccess
    })
  }
}
