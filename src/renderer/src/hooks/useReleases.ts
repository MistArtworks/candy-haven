import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import type { ReleasesState } from '@shared/domain/releases'
import type { StageAction } from '@shared/domain/releases.constants'

const EMPTY: ReleasesState = {
  link: { state: 'signed-out', message: '', website: '', syncedAt: null },
  site: null,
  entries: [],
  remote: [],
  pending: 0,
  staged: { visibility: {}, shelf: null, send: [] },
  working: null,
  covers: null,
  revision: 0
}

/**
 * RELEASES, pushed from the main process: every release in DISCOGRAPHY
 * against what the website had when last fetched, and what's been picked
 * to send with Update. One snapshot on mount, then a subscription, as
 * LORE's hook does.
 */
export function useReleases(): ReleasesState {
  const [state, setState] = useState<ReleasesState>(EMPTY)

  useEffect(() => {
    let alive = true
    void window.candy.releases.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.releases.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}

export interface ReleasesActions {
  sync(): Promise<void>
  syncNow(): Promise<boolean>
  publishEverything(): Promise<boolean>
  /** Picks an action for some releases, held until Update. */
  stage(action: StageAction, ids: string[]): Promise<boolean>
  /** The shelf as reordered, held until Update. */
  stageShelf(siteIds: string[]): Promise<boolean>
  discard(): Promise<boolean>
  /** Sends everything picked, in one request. */
  update(): Promise<boolean>
  /** What's in flight, by name, so a page can show which button is busy. */
  pending: string | null
}

export function useReleasesActions(): ReleasesActions {
  const [pending, setPending] = useState<string | null>(null)

  // Every refusal takes the console's notice stack: an update the website
  // turned down is worth reading, and the page has nowhere better to say it.
  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<boolean> => {
    setPending(key)
    try {
      await action()
      return true
    } catch (cause) {
      notify.refuse(cause)
      return false
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<ReleasesActions>(
    () => ({
      sync: async () => {
        await run('sync', () => window.candy.releases.sync())
      },
      syncNow: () => run('sync-now', () => window.candy.releases.syncNow()),
      publishEverything: () =>
        run('publish-everything', () => window.candy.releases.publishEverything()),
      stage: (action, ids) =>
        run('stage', async () => {
          const { skipped } = await window.candy.releases.stage({ action, ids })
          // A pick that left some out says which, and why, once.
          if (skipped.length) {
            notify.report(
              skipped.length === 1 ? `${skipped[0].title} left out` : `${skipped.length} left out`,
              {
                detail: skipped.map(({ title, why }) => `${title}: ${why}`).join(' '),
                id: 'releases-skipped'
              }
            )
          }
        }),
      stageShelf: (siteIds) => run('stage', () => window.candy.releases.stageShelf(siteIds)),
      discard: () => run('discard', () => window.candy.releases.discard()),
      update: () => run('update', () => window.candy.releases.update()),
      pending
    }),
    [run, pending]
  )
}
