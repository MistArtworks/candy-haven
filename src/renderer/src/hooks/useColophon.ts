import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { NameCheck } from '@shared/domain/artists.constants'
import type {
  Colophon,
  ColophonDetail,
  ColophonPatch,
  ColophonProfiles,
  ColophonVisibility,
  ProfilePlatform,
  Visibility
} from '@shared/domain/colophon'
import {
  COLOPHON_DETAILS,
  COLOPHON_FIELDS,
  PROFILE_PLATFORMS,
  checkDetail,
  checkProfileUrl
} from '@shared/domain/colophon.constants'

/**
 * Data access for COLOPHON: the details the website carries.
 *
 * One record, edited as a draft and filed through the unsaved-changes bar,
 * the way REGULATION files settings. The roster's sheet commits as it is
 * typed and that would be wrong here: a half-typed address committed on every
 * keystroke is a record the website could be built from mid-word.
 */

const COLOPHON_KEY = ['colophon'] as const

export function useColophon(enabled = true): UseQueryResult<Colophon> {
  return useQuery({
    queryKey: COLOPHON_KEY,
    queryFn: () => window.candy.colophon.get(),
    enabled,
    staleTime: 10_000
  })
}

/** What the page edits: the record without its timestamp. */
export type ColophonFields = Omit<Colophon, 'updatedAt'>

/** An edit: any of the details, any of the platforms, any field's visibility. */
export type ColophonEdit = Partial<Record<ColophonDetail, string>> & {
  profiles?: Partial<ColophonProfiles>
  visibility?: Partial<ColophonVisibility>
}

export type ColophonChecks = Record<ColophonDetail, NameCheck> & {
  profiles: Record<ProfilePlatform, NameCheck>
}

export interface ColophonDraft {
  /** The record as filed, or undefined until it has been read. */
  stored: Colophon | undefined
  /** What is on screen: the record with the unfiled edits laid over it. */
  fields: ColophonFields | null
  /** Each field's verdict on what it currently holds. */
  checks: ColophonChecks
  edit: (edit: ColophonEdit) => void
  dirty: boolean
  saving: boolean
  error: string | null
  save: () => void
  discard: () => void
}

/**
 * The colophon, as a draft.
 *
 * ## The draft is the edits, not a copy
 *
 * Only what has been changed is held, and it is laid over the stored record
 * to draw the page, field by field for the profiles and the visibilities. A
 * copy of the whole record would have to be kept in step with the query every
 * time it refetched, which is an effect writing state from state; holding the
 * edits alone means the page always shows the stored value for anything not
 * touched, and Discard is simply forgetting them.
 *
 * An edit that returns a field to its stored value is still held, but it does
 * not count as a change: `dirty` compares, it does not count keys. The bar
 * goes away when the page matches the record, however it got there.
 *
 * ## Filing refuses what the fields refuse
 *
 * The same rules the service applies, run here first, so a refusal arrives
 * beside the field it is about rather than as a round trip. The service still
 * checks: this page is not the only thing that will ever write a colophon.
 */
export function useColophonDraft(enabled: boolean): ColophonDraft {
  const queryClient = useQueryClient()
  const { data: stored } = useColophon(enabled)

  const [edits, setEdits] = useState<ColophonEdit>({})
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo<ColophonFields | null>(() => {
    if (!stored) return null
    const details = Object.fromEntries(
      COLOPHON_DETAILS.map((detail) => [detail, edits[detail] ?? stored[detail]])
    ) as Record<ColophonDetail, string>
    return {
      ...details,
      profiles: { ...stored.profiles, ...edits.profiles },
      visibility: { ...stored.visibility, ...edits.visibility }
    }
  }, [stored, edits])

  /** Only what differs from the record: what filing would send. */
  const patch = useMemo<ColophonPatch>(() => {
    if (!stored) return {}
    const changed: ColophonPatch = {}
    for (const detail of COLOPHON_DETAILS) {
      const value = edits[detail]
      if (value !== undefined && value !== stored[detail]) changed[detail] = value
    }

    const profiles: Record<string, string> = {}
    for (const platform of PROFILE_PLATFORMS) {
      const url = edits.profiles?.[platform]
      if (url !== undefined && url !== stored.profiles[platform]) profiles[platform] = url
    }
    if (Object.keys(profiles).length > 0) changed.profiles = profiles

    const visibility: Record<string, Visibility> = {}
    for (const field of COLOPHON_FIELDS) {
      const chosen = edits.visibility?.[field]
      if (chosen !== undefined && chosen !== stored.visibility[field]) visibility[field] = chosen
    }
    if (Object.keys(visibility).length > 0) changed.visibility = visibility

    return changed
  }, [stored, edits])

  const dirty = Object.keys(patch).length > 0

  const checks = useMemo<ColophonChecks>(() => {
    const details = Object.fromEntries(
      COLOPHON_DETAILS.map((detail) => [detail, checkDetail(detail, fields?.[detail] ?? '')])
    ) as Record<ColophonDetail, NameCheck>
    const profiles = Object.fromEntries(
      PROFILE_PLATFORMS.map((platform) => [
        platform,
        checkProfileUrl(platform, fields?.profiles[platform] ?? '')
      ])
    ) as Record<ProfilePlatform, NameCheck>
    return { ...details, profiles }
  }, [fields])

  const file = useMutation({
    mutationFn: (next: ColophonPatch) => window.candy.colophon.update(next),
    // The bar reports a refusal itself, in place; a notice as well would say
    // it twice, in two corners of the screen.
    meta: { notify: false },
    onSuccess: (filed) => {
      // The response is the record as stored, so it becomes the baseline and
      // the edits it answers are spent.
      queryClient.setQueryData(COLOPHON_KEY, filed)
      setEdits({})
      setError(null)
    },
    onError: (cause: Error) => setError(cause.message)
  })

  const edit = useCallback((next: ColophonEdit) => {
    setEdits((current) => ({
      ...current,
      ...next,
      // Platforms and visibilities merge one by one, so typing into Spotify's
      // field does not forget what was typed into Instagram's.
      ...(next.profiles ? { profiles: { ...current.profiles, ...next.profiles } } : {}),
      ...(next.visibility ? { visibility: { ...current.visibility, ...next.visibility } } : {})
    }))
    // A refusal is about what was filed; typing again starts a new attempt.
    setError(null)
  }, [])

  const { mutate } = file
  const valid =
    COLOPHON_DETAILS.every((detail) => checks[detail].ok) &&
    PROFILE_PLATFORMS.every((platform) => checks.profiles[platform].ok)

  const save = useCallback(() => {
    if (Object.keys(patch).length === 0) return
    if (!valid) {
      setError('Nothing was filed. The fields marked in red say why.')
      return
    }
    mutate(patch)
  }, [patch, valid, mutate])

  const discard = useCallback(() => {
    setEdits({})
    setError(null)
  }, [])

  return {
    stored,
    fields,
    checks,
    edit,
    dirty,
    saving: file.isPending,
    error,
    save,
    discard
  }
}
