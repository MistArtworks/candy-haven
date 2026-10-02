import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import type {
  ChapterDraft,
  DeleteChapterInput,
  LoreCreated,
  LoreState,
  PlanetDraft,
  PublishChapterInput,
  PublishResult,
  SaveChapterInput,
  SavePlanetInput
} from '@shared/domain/lore'

const EMPTY: LoreState = {
  link: { state: 'signed-out', message: '', website: '', syncedAt: null },
  site: null,
  drafts: [],
  planets: [],
  order: [],
  revision: 0
}

/**
 * LORE, pushed from the main process: the drafts, planets and order kept
 * here, what the website had published when last fetched, and how it was
 * reached. One snapshot on mount, then a subscription, as the board's hook
 * does; the main process re-broadcasts after every change.
 */
export function useLore(): LoreState {
  const [state, setState] = useState<LoreState>(EMPTY)

  useEffect(() => {
    let alive = true
    void window.candy.lore.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.lore.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

export interface LoreActions {
  sync(): Promise<void>
  createChapter(draft: ChapterDraft): Promise<LoreCreated | null>
  saveChapter(input: SaveChapterInput): Promise<LoreState | null>
  deleteChapter(input: DeleteChapterInput): Promise<boolean>
  publish(input: PublishChapterInput): Promise<PublishResult | null>
  unpublish(id: string): Promise<boolean>
  reorder(ids: string[]): Promise<boolean>
  publishOrder(): Promise<boolean>
  createPlanet(draft: PlanetDraft): Promise<LoreCreated | null>
  savePlanet(input: SavePlanetInput): Promise<LoreState | null>
  deletePlanet(id: string): Promise<boolean>
  /** What's in flight, by name, so a page can show which button is busy. */
  pending: string | null
}

export function useLoreActions(): LoreActions {
  const [pending, setPending] = useState<string | null>(null)

  // Every refusal takes the console's notice stack: a save or a publish
  // that was turned down is worth reading, and the page has nowhere better
  // to say it. Null (or false) tells the caller it didn't happen.
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

  return useMemo<LoreActions>(
    () => ({
      sync: async () => {
        await run('sync', () => window.candy.lore.sync())
      },
      createChapter: (draft) => run('create-chapter', () => window.candy.lore.createChapter(draft)),
      saveChapter: (input) => run('save-chapter', () => window.candy.lore.saveChapter(input)),
      deleteChapter: async (input) =>
        (await run('delete-chapter', () => window.candy.lore.deleteChapter(input))) !== null,
      publish: (input) => run('publish', () => window.candy.lore.publish(input)),
      unpublish: async (id) =>
        (await run('unpublish', () => window.candy.lore.unpublish(id))) !== null,
      reorder: async (ids) => (await run('reorder', () => window.candy.lore.reorder(ids))) !== null,
      publishOrder: async () =>
        (await run('publish-order', () => window.candy.lore.publishOrder())) !== null,
      createPlanet: (draft) => run('create-planet', () => window.candy.lore.createPlanet(draft)),
      savePlanet: (input) => run('save-planet', () => window.candy.lore.savePlanet(input)),
      deletePlanet: async (id) =>
        (await run('delete-planet', () => window.candy.lore.deletePlanet(id))) !== null,
      pending
    }),
    [run, pending]
  )
}
