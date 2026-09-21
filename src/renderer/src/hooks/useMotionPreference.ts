import { useEffect } from 'react'
import { useSystemStore, selectSettings } from '@renderer/app/store/system.store'
import type { MotionPreference } from '@shared/domain/settings'

/**
 * Publishes the operator's appearance preferences onto the document root, where
 * the stylesheet's `[data-motion]` / `[data-accent]` selectors, the
 * `motion-safe` mixin and the `rem()` scale can act on them.
 *
 * Keeping this in one place means no component has to consult the setting
 * directly to decide whether to animate or how large to draw.
 *
 * @param zoom Frame zoom to apply instead of the stored interface scale.
 */
export function useThemePreferences(zoom?: number): void {
  const settings = useSystemStore(selectSettings)

  useEffect(() => {
    const root = document.documentElement
    const motion = settings?.appearance.motion ?? 'full'
    const accent = settings?.appearance.accent ?? 'crimson'

    root.dataset.motion = motion
    root.dataset.accent = accent

    /*
     * `data-pointer` is deliberately *not* set here.
     *
     * The reset hides the system cursor off that attribute, so whatever owns it
     * is promising that something else is drawing a pointer in its place. This
     * hook cannot keep that promise: it has no idea whether `Reticle` rendered,
     * and it writes without a cleanup, so a crash inside the mark left the
     * cursor hidden with nothing drawn — on an error screen the operator then
     * had no pointer to click it with.
     *
     * `Reticle` owns it instead, and sets it from an effect that clears on
     * unmount. The thing that hides the cursor and the thing that replaces it
     * are now the same component, so they cannot get out of step.
     */
    root.style.setProperty('--ch-grain-opacity', String(settings?.appearance.grain ?? 0.5))

    /*
     * Interface scale is the frame's zoom, not a style.
     *
     * Set every time the preference changes *and* on first hydration, because
     * Chromium remembers a zoom factor per origin across reloads — without
     * asserting it here, a reload could come back at whatever the last session
     * left rather than at what is stored.
     *
     * `zoom` overrides the stored preference for a window whose *frame* was
     * built around one particular scale and cannot reflow to another. THE
     * VESTIBULE is the only one: it is drawn to the pixel at 880x560 and the
     * main process sizes it to `uiScale` capped at what the display holds, so
     * it passes back the scale it actually got. Everywhere else this is
     * undefined and the stored preference stands.
     */
    window.candy.window.setZoom(zoom ?? settings?.appearance.uiScale ?? 1)
  }, [
    zoom,
    settings?.appearance.motion,
    settings?.appearance.accent,
    settings?.appearance.grain,
    settings?.appearance.uiScale
  ])
}

/**
 * Whether decorative animation should run.
 *
 * Combines the in-app preference with the OS-level `prefers-reduced-motion`
 * setting; the OS wins when it asks for less. Components use this to skip
 * building GSAP timelines entirely rather than animating to a no-op.
 */
export function useAnimationsEnabled(): boolean {
  const settings = useSystemStore(selectSettings)
  const preference: MotionPreference = settings?.appearance.motion ?? 'full'

  if (preference === 'off') return false

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return preference === 'full' && !prefersReduced
}
