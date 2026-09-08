import { useEffect, type ReactNode } from 'react'
import { useSystemStore } from '@renderer/app/store/system.store'

type Channel = 'boot' | 'archive' | 'update' | 'window'

/**
 * Wires main-process push channels into the system store.
 *
 * Mounted exactly once, above the router.
 *
 * Ordering matters here. Subscriptions are established *before* the initial
 * snapshots are requested so no event is missed, but that opens a race: a push
 * can arrive while a snapshot request is still in flight, and applying the
 * older snapshot afterwards would roll state backwards. Boot progress moves
 * fast enough for this to be routine, not theoretical. Each channel therefore
 * records whether it has already received a push, and hydration skips any
 * channel that live data has already claimed.
 */
export function SystemBridge({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    const { setBoot, setArchive, setUpdate, setSettings, setWindow } = useSystemStore.getState()

    const live = new Set<Channel>()
    const claim =
      <T,>(channel: Channel, apply: (value: T) => void) =>
      (value: T): void => {
        live.add(channel)
        apply(value)
      }

    const unsubscribers = [
      window.candy.boot.onProgress(claim('boot', setBoot)),
      window.candy.archive.onStatus(claim('archive', setArchive)),
      window.candy.updates.onStatus(claim('update', setUpdate)),
      window.candy.window.onState(claim('window', setWindow))
    ]

    let cancelled = false

    void (async () => {
      const [boot, archive, update, settings, windowState] = await Promise.all([
        window.candy.boot.snapshot(),
        window.candy.archive.status(),
        window.candy.updates.status(),
        window.candy.settings.get(),
        window.candy.window.state()
      ])

      if (cancelled) return

      if (!live.has('boot')) setBoot(boot)
      if (!live.has('archive')) setArchive(archive)
      if (!live.has('update')) setUpdate(update)
      if (!live.has('window')) setWindow(windowState)
      // Settings have no push channel; the fetched value is always authoritative.
      setSettings(settings)
    })()

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [])

  return children
}
