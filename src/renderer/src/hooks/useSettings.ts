import { useCallback, useEffect, useRef } from 'react'
import type { Settings, SettingsPatch } from '@shared/domain/settings'
import { mergeSettings } from '@shared/domain/settings.merge'
import { useSystemStore, selectSettings } from '@renderer/app/store/system.store'

export interface ApplySettingsOptions {
  /**
   * Wait this long before persisting, restarting the wait on each further call
   * with the same `key`. Use for continuously-adjusted controls like sliders.
   */
  debounceMs?: number
  /** Debounce bucket. Controls sharing a key coalesce into one write. */
  key?: string
}

export type ApplySettings = (patch: SettingsPatch, options?: ApplySettingsOptions) => void

/**
 * Applies settings changes local-first.
 *
 * The renderer is the only writer of settings, so the store — not the main
 * process — is the source of truth for what the operator has chosen. Each patch
 * is merged into the store immediately and then persisted in the background.
 *
 * This is deliberate rather than incidental. The previous design applied the
 * main process's *response* to each write, which made the UI hostage to
 * response ordering: adjusting one control while another write was still in
 * flight would apply a response that predated the newer change, visibly
 * reverting it. Because every write is a round-trip, that race was reachable
 * with ordinary interaction — changing the accent and then dragging the grain
 * slider was enough. Not applying responses at all removes the race entirely.
 *
 * Failures reconcile by refetching, so a rejected write cannot leave the UI
 * showing a value that was never stored.
 */
export function useApplySettings(): ApplySettings {
  const setSettings = useSystemStore((state) => state.setSettings)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return useCallback(
    (patch, options) => {
      // Read through getState so this callback never needs settings as a
      // dependency, keeping its identity stable across renders.
      const current = useSystemStore.getState().settings
      if (!current) return

      setSettings(mergeSettings(current, patch))

      const key = options?.key ?? 'default'
      const delay = options?.debounceMs ?? 0

      const existing = timers.current.get(key)
      if (existing) clearTimeout(existing)

      const persist = (): void => {
        timers.current.delete(key)
        void window.candy.settings.update(patch).catch(async () => {
          // The write failed; fall back to whatever was actually stored rather
          // than leaving the operator looking at a value that never landed.
          try {
            setSettings(await window.candy.settings.get())
          } catch {
            // Nothing further can be done from here; the store keeps its
            // optimistic value and the next successful write will reconcile.
          }
        })
      }

      if (delay > 0) {
        timers.current.set(key, setTimeout(persist, delay))
      } else {
        persist()
      }
    },
    [setSettings]
  )
}

/** Current settings, or `null` before the first hydration completes. */
export function useSettings(): Settings | null {
  return useSystemStore(selectSettings)
}
