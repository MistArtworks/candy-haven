import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings, SettingsPatch } from '@shared/domain/settings'
import { diffSettings, mergeSettings } from '@shared/domain/settings.merge'
import {
  useSystemStore,
  selectSettings,
  selectSettingsBaseline
} from '@renderer/app/store/system.store'

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
  const setSettingsBaseline = useSystemStore((state) => state.setSettingsBaseline)
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
        void window.candy.settings
          .update(patch)
          .then(() => {
            /*
             * Fold what was just written into the persisted baseline.
             *
             * Without this, a write-through change made anywhere else — the
             * ARCHIVE scan roots are the live case — would leave the baseline
             * behind the store, and Regulation, which measures unsaved changes
             * against that baseline, would announce changes that had in fact
             * already been saved.
             *
             * The patch is folded in rather than the response being adopted
             * wholesale, which keeps the ordering race described above out of
             * the baseline as well as out of the settings.
             */
            const baseline = useSystemStore.getState().settingsBaseline
            if (baseline) setSettingsBaseline(mergeSettings(baseline, patch))
          })
          .catch(async () => {
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
    [setSettings, setSettingsBaseline]
  )
}

/**
 * Fields a save asked for that the stored result does not reflect.
 *
 * Compared structurally, because a section can hold an array — the satellite
 * roots are the live case — and two arrays with equal contents are not the same
 * object. Returned as `section.field` names so the message can say which
 * control did not take.
 */
function unappliedFields(patch: SettingsPatch, stored: Settings): string[] {
  const missed: string[] = []

  for (const [section, fields] of Object.entries(patch)) {
    if (!fields) continue
    const applied = stored[section as keyof Settings] as Record<string, unknown> | undefined

    for (const [field, wanted] of Object.entries(fields as Record<string, unknown>)) {
      if (JSON.stringify(applied?.[field]) === JSON.stringify(wanted)) continue
      missed.push(`${section}.${field}`)
    }
  }

  return missed
}

/** Current settings, or `null` before the first hydration completes. */
export function useSettings(): Settings | null {
  return useSystemStore(selectSettings)
}

// ------------------------------------------------------------------- drafting

export interface SettingsDraft {
  settings: Settings | null
  /** Whether anything differs from what is persisted. */
  dirty: boolean
  /**
   * Applies a change to the live settings without persisting it.
   *
   * The change takes effect immediately — an accent or grain adjustment has to
   * be visible while it is being made — but nothing reaches disk until `save`.
   */
  apply: ApplySettings
  save: () => void
  /** Restores the last persisted values. */
  discard: () => void
  saving: boolean
  error: string | null
}

/**
 * Staged settings editing, with an explicit save.
 *
 * The console previously wrote every keystroke straight through, debounced.
 * That is fine for a slider and wrong for anything the operator might be
 * midway through typing — a half-pasted client id would be persisted, and there
 * was no way to abandon a change once made.
 *
 * The compromise keeps what was good about the old behaviour: edits still land
 * in the store instantly, so the theme still previews live and the local-first
 * model in the store is untouched. What changed is that persistence is now an
 * act rather than a side effect, measured against a baseline of what is
 * actually on disk.
 */
export function useSettingsDraft(): SettingsDraft {
  const settings = useSystemStore(selectSettings)
  const baseline = useSystemStore(selectSettingsBaseline)
  const setSettings = useSystemStore((state) => state.setSettings)
  const setSettingsBaseline = useSystemStore((state) => state.setSettingsBaseline)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback<ApplySettings>(
    (patch) => {
      const current = useSystemStore.getState().settings
      if (!current) return
      setSettings(mergeSettings(current, patch))
    },
    [setSettings]
  )

  const dirty = useMemo(() => {
    if (!settings || !baseline) return false
    return Object.keys(diffSettings(baseline, settings)).length > 0
  }, [settings, baseline])

  const save = useCallback(() => {
    const current = useSystemStore.getState().settings
    const persisted = useSystemStore.getState().settingsBaseline
    if (!current || !persisted) return

    // Only what changed is sent, so the write and the dirty indicator are
    // derived from one comparison and cannot disagree.
    const patch = diffSettings(persisted, current)
    if (Object.keys(patch).length === 0) return

    setSaving(true)
    setError(null)
    void window.candy.settings
      .update(patch)
      .then((stored) => {
        /*
         * Check that what came back is what was asked for.
         *
         * The response is authoritative and is adopted wholesale below, which
         * means anything the main process quietly declined to store shows up as
         * the control springing back to its old value with no explanation. That
         * is exactly what happens when main is running older code than the
         * renderer: `SettingsPatchSchema` is a zod object, zod objects **strip
         * unknown keys**, so a field main has never heard of is discarded at the
         * IPC boundary and the save appears to do nothing.
         *
         * It cost a real debugging session — a new text-size setting reverted on
         * every save while every other control worked — so the mismatch is now
         * reported rather than left to be inferred. In a shipped build renderer
         * and main always move together and this can only fire on a genuine bug.
         */
        const rejected = unappliedFields(patch, stored)

        if (rejected.length > 0) {
          setError(
            `The archive did not store ${rejected.join(', ')}. ` +
              'If you are running a development build, restart the app so the main process ' +
              'picks up the current settings schema.'
          )
        }

        // The response is the authoritative persisted state, so it becomes both
        // the baseline and the live value — this is the one moment where
        // applying the response cannot race anything, because the operator
        // asked for it and nothing else is in flight.
        setSettings(stored)
        setSettingsBaseline(stored)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => setSaving(false))
  }, [setSettings, setSettingsBaseline])

  const discard = useCallback(() => {
    const persisted = useSystemStore.getState().settingsBaseline
    if (!persisted) return
    setError(null)
    setSettings(persisted)
  }, [setSettings])

  return { settings, dirty, apply, save, discard, saving, error }
}
