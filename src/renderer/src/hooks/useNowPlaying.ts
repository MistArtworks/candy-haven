import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  NowPlayingConfigPatch,
  NowPlayingSourceDraft,
  NowPlayingState,
  SpotifySetup
} from '@shared/domain/nowplaying'
import { createNowPlayingState } from '@shared/domain/nowplaying.constants'

/**
 * Live playback state, pushed from the main process.
 *
 * Subscribing is what starts the Spotify poll — it is reference-counted in the
 * service, so leaving the page stops the polling and an idle app spends none of
 * the operator's rate limit. Same arrangement as telemetry, for the same reason.
 */
export function useNowPlaying(): NowPlayingState {
  const [state, setState] = useState<NowPlayingState>(createNowPlayingState)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.nowPlaying.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
    })

    void window.candy.nowPlaying.subscribe().then((initial) => {
      if (!cancelled && !claimed) setState(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
      void window.candy.nowPlaying.unsubscribe()
    }
  }, [])

  return state
}

/** Redirect URI to register, and whether a client id has been saved. */
export function useSpotifySetup(revision: number): SpotifySetup {
  const [setup, setSetup] = useState<SpotifySetup>({ hasClientId: false, redirectUri: null })

  useEffect(() => {
    let cancelled = false
    void window.candy.nowPlaying.setup().then((next) => {
      if (!cancelled) setSetup(next)
    })
    return () => {
      cancelled = true
    }
    // Re-read on every state change: the redirect URI depends on the live
    // server port, which can shift, and the client id can be edited elsewhere.
  }, [revision])

  return setup
}

/**
 * A wall clock for React readouts, ticking only while something is playing.
 *
 * Held in state and written only from the interval, so render stays pure —
 * `trackProgressAt` is a function of its arguments. The initial zero is safe
 * for the same reason it is in the timers: the drift term clamps at zero, so a
 * clock behind the sample reads as "no time since the sample", which is exactly
 * right for the frame before the first tick.
 *
 * The canvas face does not use this; it reads the clock directly in its own
 * frame loop. This is only for the text figures beside it.
 */
export function usePlaybackClock(active: boolean): number {
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!active) return
    const handle = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(handle)
  }, [active])

  return now
}

export interface NowPlayingActions {
  /** Presentation, addressed to one source. There is no single config. */
  configure(id: string, patch: NowPlayingConfigPatch): Promise<void>
  addSource(draft: NowPlayingSourceDraft): Promise<void>
  renameSource(id: string, name: string, note: string): Promise<void>
  removeSource(id: string): Promise<void>
  setPollSeconds(seconds: number): Promise<void>
  link(): Promise<void>
  unlink(): Promise<void>
  pending: string | null
  error: string | null
  dismissError(): void
}

export function useNowPlayingActions(): NowPlayingActions {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(key)
    try {
      await action()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending((current) => (current === key ? null : current))
    }
  }, [])

  return useMemo<NowPlayingActions>(
    () => ({
      configure: (id, patch) =>
        run('config', () => window.candy.nowPlaying.configureSource(id, patch)),
      addSource: (draft) => run('add', () => window.candy.nowPlaying.addSource(draft)),
      renameSource: (id, name, note) =>
        run('rename', () => window.candy.nowPlaying.renameSource(id, name, note)),
      removeSource: (id) => run('remove', () => window.candy.nowPlaying.removeSource(id)),
      setPollSeconds: (seconds) =>
        run('poll', () => window.candy.nowPlaying.setPollSeconds(seconds)),
      link: () => run('link', () => window.candy.nowPlaying.link()),
      unlink: () => run('unlink', () => window.candy.nowPlaying.unlink()),
      pending,
      error,
      dismissError: () => setError(null)
    }),
    [run, pending, error]
  )
}
