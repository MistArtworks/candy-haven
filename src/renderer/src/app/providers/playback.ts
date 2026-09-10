import { createContext, useContext } from 'react'
import { AUDIO_EXTENSIONS } from '@shared/domain/auditorium'
import type { AudioEngine } from '@renderer/features/auditorium/lib/useAudioEngine'

/**
 * The console's shared transport, and the ways into it.
 *
 * Split from `PlaybackProvider.tsx` rather than living beside the component,
 * because Vite's fast refresh can only replace a module that exports
 * components and nothing else — a hook exported alongside a provider makes
 * every edit to either one a full reload of the application.
 */
export const PlaybackContext = createContext<AudioEngine | null>(null)

/**
 * The shared transport.
 *
 * Throws rather than returning null for a missing provider: every caller is
 * inside the console shell, so an absent provider is a wiring mistake visible
 * the first time the page is opened, not a state a shipped build can reach.
 */
export function usePlayback(): AudioEngine {
  const engine = useContext(PlaybackContext)
  if (!engine) throw new Error('usePlayback used outside PlaybackProvider')
  return engine
}

/**
 * Whether a path is something the room can open.
 *
 * Used to decide whether to *offer* playback beside a file elsewhere in the
 * console — a cover image sitting next to a master should not grow a play
 * button. The main process checks the same list again before reading anything;
 * this one only governs what the interface shows.
 */
export function isPlayableAudio(path: string | null | undefined): boolean {
  if (!path) return false
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return (AUDIO_EXTENSIONS as readonly string[]).includes(extension)
}
