import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { NameCheck } from '@shared/domain/artists.constants'
import type { Colophon, ColophonPatch } from '@shared/domain/colophon'
import { checkDiscord, checkEmail, checkPhone } from '@shared/domain/colophon.constants'

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

export interface ColophonChecks {
  email: NameCheck
  phone: NameCheck
  discord: NameCheck
}

export interface ColophonDraft {
  /** The record as filed, or undefined until it has been read. */
  stored: Colophon | undefined
  /** What is on screen: the record with the unfiled edits laid over it. */
  fields: ColophonFields | null
  /** Each text field's verdict on what it currently holds. */
  checks: ColophonChecks
  edit: (patch: Partial<ColophonFields>) => void
  dirty: boolean
  saving: boolean
  error: string | null
  save: () => void
  discard: () => void
}

/** Two values of one field, compared as the record would store them. */
function same<K extends keyof ColophonFields>(
  key: K,
  a: ColophonFields[K],
  b: ColophonFields[K]
): boolean {
  if (key === 'links') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
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

  const [edits, setEdits] = useState<Partial<ColophonFields>>({})
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo<ColophonFields | null>(() => {
    if (!stored) return null
    return {
      email: edits.email ?? stored.email,
      phone: edits.phone ?? stored.phone,
      discord: edits.discord ?? stored.discord,
      links: edits.links ?? stored.links
    }
  }, [stored, edits])

  /** Only what differs from the record: what filing would send. */
  const patch = useMemo<ColophonPatch>(() => {
    if (!stored) return {}
    const changed: ColophonPatch = {}
    if (edits.email !== undefined && !same('email', edits.email, stored.email)) {
      changed.email = edits.email
    }
    if (edits.phone !== undefined && !same('phone', edits.phone, stored.phone)) {
      changed.phone = edits.phone
    }
    if (edits.discord !== undefined && !same('discord', edits.discord, stored.discord)) {
      changed.discord = edits.discord
    }
    if (edits.links !== undefined && !same('links', edits.links, stored.links)) {
      changed.links = edits.links
    }
    return changed
  }, [stored, edits])

  const dirty = Object.keys(patch).length > 0

  const checks = useMemo<ColophonChecks>(
    () => ({
      email: checkEmail(fields?.email ?? ''),
      phone: checkPhone(fields?.phone ?? ''),
      discord: checkDiscord(fields?.discord ?? '')
    }),
    [fields]
  )

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

  const edit = useCallback((next: Partial<ColophonFields>) => {
    setEdits((current) => ({ ...current, ...next }))
    // A refusal is about what was filed; typing again starts a new attempt.
    setError(null)
  }, [])

  const { mutate } = file
  const valid = checks.email.ok && checks.phone.ok && checks.discord.ok

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
