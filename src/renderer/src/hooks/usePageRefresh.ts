import { useCallback } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'

/**
 * Re-reading the department you are standing in.
 *
 * ## Why the console needs this at all
 *
 * Nearly everything on screen is pushed rather than polled — the archive's
 * health, boot progress, the overlay deck — and what is *pulled* sits behind
 * React Query with a thirty-second stale time and no refetch on focus. That is
 * the right default for a console somebody leaves open for a whole broadcast,
 * and it means the one case it handles badly is the one that happens most:
 * something changed **outside the app**. A set moved on disk, a release folder
 * was renamed, Spotify was authorised in a browser tab. The operator knows the
 * screen is stale and the console has no way to be told.
 *
 * Restarting the app is what they did instead, which costs the archive daemon,
 * the overlay server and every browser source attached to it.
 *
 * ## What a refresh is, precisely
 *
 * Two things, and the second is the one that is easy to leave out:
 *
 * 1. **Every query is invalidated**, so anything the page is showing refetches.
 * 2. **The page is remounted**, so component state is discarded and effects run
 *    again. Half the staleness in this console is not in a query at all — it is
 *    a canvas that sized itself against a window that has since changed, a
 *    filter left set, a list scrolled somewhere. A refetch alone leaves all of
 *    that exactly where it was and looks, to the operator, like nothing
 *    happened.
 *
 * The nonce is what makes (2) possible: `ConsoleLayout` keys the outlet on it,
 * so bumping it is a remount of whatever page is routed, and *only* that page.
 * The chrome, the transport and the playback provider live outside it and carry
 * on — refreshing DISCOGRAPHY does not stop the track that is playing.
 *
 * Deliberately **not** `location.reload()`. That would drop the renderer,
 * replay the boot screen, tear down every subscription and reconnect chat —
 * which is a restart wearing the word "refresh".
 */
interface RefreshState {
  nonce: number
  bump: () => void
}

const useRefreshStore = create<RefreshState>()((set) => ({
  nonce: 0,
  bump: () => set((state) => ({ nonce: state.nonce + 1 }))
}))

/** The remount key for the routed page. Read by `ConsoleLayout` alone. */
export function usePageNonce(): number {
  return useRefreshStore((state) => state.nonce)
}

export interface PageRefresh {
  refresh: () => void
  /** Something is in flight. Drives the control's own state, not a spinner. */
  busy: boolean
}

/**
 * The refresh itself, shared by the title bar's control and its shortcut.
 *
 * One hook rather than two call sites doing the same two things, because a
 * button that refetched and a shortcut that also remounted would be two
 * different features with one name.
 */
export function usePageRefresh(): PageRefresh {
  const client = useQueryClient()
  const bump = useRefreshStore((state) => state.bump)

  /*
   * `useIsFetching` counts every fetch in flight, including background
   * refetches this refresh did not start. That is the honest reading: the
   * control says "the console is reading", and while it is, pressing it again
   * would only queue the same work.
   */
  const busy = useIsFetching() > 0

  const refresh = useCallback(() => {
    void client.invalidateQueries()
    bump()
  }, [client, bump])

  return { refresh, busy }
}
