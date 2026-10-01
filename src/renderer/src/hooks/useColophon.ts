import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { NameCheck } from '@shared/domain/artists.constants'
import type {
  Colophon,
  ColophonPatch,
  ColophonProfiles,
  ProfilePlatform
} from '@shared/domain/colophon'
import {
  checkDiscord,
  checkEmail,
  checkPhone,
  checkProfileUrl,
  isCoreProfile,
  isProfilePlatform
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

/** An edit to any of the three details. Profiles have their own two calls. */
export interface ColophonEdit {
  email?: string
  phone?: string
  discord?: string
}

export interface ColophonChecks {
  email: NameCheck
  phone: NameCheck
  discord: NameCheck
  /** One verdict per platform on the page. */
  profiles: Partial<Record<ProfilePlatform, NameCheck>>
}

export interface ColophonDraft {
  /** The record as filed, or undefined until it has been read. */
  stored: Colophon | undefined
  /** What is on screen: the record with the unfiled edits laid over it. */
  fields: ColophonFields | null
  /** Each field's verdict on what it currently holds. */
  checks: ColophonChecks
  edit: (edit: ColophonEdit) => void
  /** Sets a platform's address, putting the platform on the page if it was not. */
  setProfile: (platform: ProfilePlatform, url: string) => void
  /** Takes a platform off the page. The core ones stay. */
  removeProfile: (platform: ProfilePlatform) => void
  dirty: boolean
  saving: boolean
  error: string | null
  save: () => void
  discard: () => void
}

/** The same platforms with the same addresses, whatever order they were added in. */
function sameProfiles(a: Readonly<ColophonProfiles>, b: Readonly<ColophonProfiles>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/** The draft's edits: the three details, and the profiles once one is touched. */
interface Edits extends ColophonEdit {
  profiles?: ColophonProfiles
}

/**
 * The colophon, as a draft.
 *
 * ## The draft is the edits, not a copy
 *
 * Only what has been changed is held, and it is laid over the stored record
 * to draw the page. A copy of the whole record would have to be kept in step
 * with the query every time it refetched, which is an effect writing state
 * from state; holding the edits alone means the page always shows the stored
 * value for anything not touched, and Discard is simply forgetting them.
 *
 * The profiles are the exception in grain, not in kind: once one is touched
 * the whole set is held, because taking a platform off the page is a change to
 * the set rather than to any one address.
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

  const [edits, setEdits] = useState<Edits>({})
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo<ColophonFields | null>(() => {
    if (!stored) return null
    return {
      email: edits.email ?? stored.email,
      phone: edits.phone ?? stored.phone,
      discord: edits.discord ?? stored.discord,
      profiles: edits.profiles ?? stored.profiles
    }
  }, [stored, edits])

  /** Only what differs from the record: what filing would send. */
  const patch = useMemo<ColophonPatch>(() => {
    if (!stored) return {}
    const changed: ColophonPatch = {}
    if (edits.email !== undefined && edits.email !== stored.email) changed.email = edits.email
    if (edits.phone !== undefined && edits.phone !== stored.phone) changed.phone = edits.phone
    if (edits.discord !== undefined && edits.discord !== stored.discord) {
      changed.discord = edits.discord
    }
    if (edits.profiles !== undefined && !sameProfiles(edits.profiles, stored.profiles)) {
      changed.profiles = edits.profiles
    }
    return changed
  }, [stored, edits])

  const dirty = Object.keys(patch).length > 0

  const checks = useMemo<ColophonChecks>(() => {
    const profiles: Partial<Record<ProfilePlatform, NameCheck>> = {}
    for (const [platform, url] of Object.entries(fields?.profiles ?? {})) {
      if (isProfilePlatform(platform)) profiles[platform] = checkProfileUrl(platform, url)
    }
    return {
      email: checkEmail(fields?.email ?? ''),
      phone: checkPhone(fields?.phone ?? ''),
      discord: checkDiscord(fields?.discord ?? ''),
      profiles
    }
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
    setEdits((current) => ({ ...current, ...next }))
    // A refusal is about what was filed; typing again starts a new attempt.
    setError(null)
  }, [])

  /*
   * Both read the held set inside the updater rather than `fields` from the
   * render, so two changes made in one tick build on each other instead of
   * the later one quietly undoing the earlier.
   */
  const changeProfiles = useCallback(
    (change: (profiles: ColophonProfiles) => ColophonProfiles) => {
      if (!stored) return
      setEdits((current) => ({ ...current, profiles: change(current.profiles ?? stored.profiles) }))
      setError(null)
    },
    [stored]
  )

  const setProfile = useCallback(
    (platform: ProfilePlatform, url: string) =>
      changeProfiles((profiles) => ({ ...profiles, [platform]: url })),
    [changeProfiles]
  )

  const removeProfile = useCallback(
    (platform: ProfilePlatform) => {
      if (isCoreProfile(platform)) return
      changeProfiles((profiles) =>
        Object.fromEntries(Object.entries(profiles).filter(([key]) => key !== platform))
      )
    },
    [changeProfiles]
  )

  const { mutate } = file
  const valid =
    checks.email.ok &&
    checks.phone.ok &&
    checks.discord.ok &&
    Object.values(checks.profiles).every((check) => check.ok)

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
    setProfile,
    removeProfile,
    dirty,
    saving: file.isPending,
    error,
    save,
    discard
  }
}
