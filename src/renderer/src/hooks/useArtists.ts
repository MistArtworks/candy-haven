import { useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  ArtistCredits,
  ArtistDraft,
  ArtistPatch,
  ArtistRecord,
  ArtistSummary
} from '@shared/domain/artists'

/**
 * Data access for ARTISTS — the roster.
 *
 * Metadata plus one copied picture, and invalidated across three caches
 * rather than one: an artist's counts are derived from the register *and* the
 * catalogue, and removing one strips ids out of both. Leaving any of the
 * three stale would show a roster reporting credits that are no longer there.
 *
 * Nothing optimistic. Names are unique and the service resolves a collision
 * by returning the existing record rather than erroring, so a local guess
 * would sometimes be a different record from the one that came back.
 */

const ARTISTS_KEY = ['artists', 'list'] as const

export function useArtists(enabled = true): UseQueryResult<ArtistSummary[]> {
  return useQuery({
    queryKey: ARTISTS_KEY,
    queryFn: () => window.candy.artists.list(),
    enabled,
    staleTime: 10_000
  })
}

/**
 * What one artist is on, named.
 *
 * Its own query rather than part of the summary: the roster draws every
 * artist and would be paying for a list nobody has asked to see, while a
 * sheet has room for it and is opened one at a time. Keyed under `artists`,
 * so the same invalidation that follows a credit change clears it too.
 *
 * `enabled` is how the sheet asks for it only once it is open — a query keyed
 * on a null id would be a cache entry per closed sheet.
 */
export function useArtistCredits(id: string | null): UseQueryResult<ArtistCredits> {
  return useQuery({
    queryKey: ['artists', 'credits', id],
    queryFn: () => window.candy.artists.credits(id as string),
    enabled: id !== null,
    staleTime: 10_000
  })
}

function useInvalidateArtists(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['artists'] }),
      // The project registry ships the roster and resolves credits against it.
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      // The catalogue draws credited names on every card.
      queryClient.invalidateQueries({ queryKey: ['discography'] })
    ])
  }
}

export interface ArtistMutations {
  create: UseMutationResult<ArtistRecord, Error, ArtistDraft>
  update: UseMutationResult<ArtistRecord, Error, { id: string; patch: ArtistPatch }>
  setPicture: UseMutationResult<ArtistRecord, Error, { id: string; sourcePath: string | null }>
  remove: UseMutationResult<{ projects: number; releases: number }, Error, string>
}

export function useArtistMutations(): ArtistMutations {
  const invalidate = useInvalidateArtists()
  const onSuccess = (): Promise<void> => invalidate()

  return {
    create: useMutation({
      mutationFn: (draft: ArtistDraft) => window.candy.artists.create(draft),
      /*
       * Refused in the dialog, not as a notice.
       *
       * This is the only one of the four raised from a form being submitted,
       * and a refusal about what was typed belongs beside the field it is
       * about. The other three are edits inside an open sheet, where fields
       * commit as they change and there is no submit to sit next to, so those
       * take the console's notice stack like everything else.
       */
      meta: { notify: false },
      onSuccess
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => window.candy.artists.update(id, patch),
      onSuccess
    }),
    setPicture: useMutation({
      mutationFn: ({ id, sourcePath }) => window.candy.artists.setPicture(id, sourcePath),
      onSuccess
    }),
    remove: useMutation({
      mutationFn: (id: string) => window.candy.artists.remove(id),
      onSuccess
    })
  }
}

/**
 * Resolves a record's `artistIds` into artists, in roster order.
 *
 * Roster order rather than the order they were credited in, so the same pair
 * of people read identically on every project they are on — a credits row
 * whose sequence depends on which was added first is one the eye has to
 * re-read each time. Lifted from `useResolvedTags`, which made the same call.
 *
 * Ids that resolve to nothing are dropped rather than drawn as placeholders.
 * A patch can legitimately name somebody removed a moment earlier in another
 * window, and a name-shaped hole explains less than their plain absence.
 */
export function useResolvedArtists<T extends { id: string }>(
  artistIds: readonly string[],
  roster: readonly T[]
): T[] {
  return useMemo(() => {
    if (artistIds.length === 0) return []
    const credited = new Set(artistIds)
    return roster.filter((artist) => credited.has(artist.id))
  }, [artistIds, roster])
}
