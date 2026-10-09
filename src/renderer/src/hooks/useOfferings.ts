import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import type {
  NewOffering,
  OfferingCreated,
  OfferingHours,
  OfferingPhotoInput,
  OfferingsPublishResult,
  OfferingsState,
  SaveOffering
} from '@shared/domain/offerings'

const EMPTY: OfferingsState = {
  link: { state: 'signed-out', message: '', website: '', syncedAt: null },
  site: null,
  offerings: [],
  hours: null,
  base: null,
  working: null,
  revision: 0
}

/**
 * SERVICES' OFFERINGS and HOURS, pushed from the main process: the
 * services and hours kept here, what the website offered when last
 * fetched, and what this PC last published to it. One snapshot on mount,
 * then a subscription, as LORE's hook does.
 */
export function useOfferings(): OfferingsState {
  const [state, setState] = useState<OfferingsState>(EMPTY)

  useEffect(() => {
    let alive = true
    void window.candy.offerings.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.offerings.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

export interface OfferingsActions {
  sync(): Promise<void>
  create(input: NewOffering): Promise<OfferingCreated | null>
  save(input: SaveOffering): Promise<OfferingsState | null>
  remove(id: string): Promise<boolean>
  reorder(ids: string[]): Promise<boolean>
  setPhoto(input: OfferingPhotoInput): Promise<boolean>
  saveHours(hours: OfferingHours): Promise<OfferingsState | null>
  importFromSite(): Promise<boolean>
  takeTheirs(): Promise<boolean>
  publish(force?: boolean): Promise<OfferingsPublishResult | null>
  /** What's in flight, by name, so a page can show which button is busy. */
  pending: string | null
}

export function useOfferingsActions(): OfferingsActions {
  const [pending, setPending] = useState<string | null>(null)

  // Every refusal takes the console's notice stack, as LORE's do. Null (or
  // false) tells the caller it didn't happen.
  const run = useCallback(async <T>(key: string, action: () => Promise<T>): Promise<T | null> => {
    setPending(key)
    try {
      return await action()
    } catch (cause) {
      notify.refuse(cause)
      return null
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<OfferingsActions>(
    () => ({
      sync: async () => {
        await run('sync', () => window.candy.offerings.sync())
      },
      create: (input) => run('create', () => window.candy.offerings.create(input)),
      save: (input) => run('save', () => window.candy.offerings.save(input)),
      remove: async (id) => (await run('delete', () => window.candy.offerings.remove(id))) !== null,
      reorder: async (ids) =>
        (await run('reorder', () => window.candy.offerings.reorder(ids))) !== null,
      setPhoto: async (input) =>
        (await run('photo', () => window.candy.offerings.setPhoto(input))) !== null,
      saveHours: (hours) => run('save-hours', () => window.candy.offerings.saveHours(hours)),
      importFromSite: async () =>
        (await run('import', () => window.candy.offerings.importFromSite())) !== null,
      takeTheirs: async () =>
        (await run('take-theirs', () => window.candy.offerings.takeTheirs())) !== null,
      publish: (force = false) => run('publish', () => window.candy.offerings.publish(force)),
      pending
    }),
    [run, pending]
  )
}

/** A service's photo to show, as a data URL, read again when it changes. */
export function useOfferingPhoto(id: string, version: string): string | null {
  const [held, setHeld] = useState<{ key: string; data: string | null } | null>(null)
  const key = `${id}|${version}`

  useEffect(() => {
    let alive = true
    void window.candy.offerings
      .photoPreview(id)
      .then((data) => {
        if (alive) setHeld({ key, data })
      })
      .catch(() => {
        if (alive) setHeld({ key, data: null })
      })
    return () => {
      alive = false
    }
  }, [id, key])

  return held && held.key === key ? held.data : null
}
