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
 */
export function useThemePreferences(): void {
  const settings = useSystemStore(selectSettings)

  useEffect(() => {
    const root = document.documentElement
    const motion = settings?.appearance.motion ?? 'full'
    const accent = settings?.appearance.accent ?? 'crimson'

    root.dataset.motion = motion
    root.dataset.accent = accent
    root.style.setProperty('--ch-grain-opacity', String(settings?.appearance.grain ?? 0.5))

    /*
     * Interface scale is the frame's zoom, not a style.
     *
     * Set every time the preference changes *and* on first hydration, because
     * Chromium remembers a zoom factor per origin across reloads — without
     * asserting it here, a reload could come back at whatever the last session
     * left rather than at what is stored.
     */
    window.candy.window.setZoom(settings?.appearance.uiScale ?? 1)
  }, [
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
