import type { ReactNode } from 'react'
import { useAudioEngine } from '@renderer/features/auditorium/lib/useAudioEngine'
import { PlaybackContext } from './playback'

/**
 * The console's one audio transport.
 *
 * Mounted above the router, which is the entire point: a page owns its own
 * state and loses it on navigation, and audio that stops because the operator
 * went to look at something else is not a player. The `<audio>` element lives
 * here too, rendered once for the application's life — the Web Audio source
 * node bound to it can only ever be created once, so an element that remounted
 * with a page would take the analysis graph with it.
 *
 * AUDITORIUM drives this rather than holding an engine of its own, so the
 * department page and the bar at the bottom of the console are two views of one
 * transport and cannot disagree about what is playing.
 *
 * The detached player is deliberately *not* part of this. It is a separate
 * renderer process, so it necessarily has its own graph; the two windows agree
 * only on which file is open, over `auditorium:announce`.
 */
export function PlaybackProvider({ children }: { children: ReactNode }): ReactNode {
  const engine = useAudioEngine()

  /*
   * The rule below fires on the engine carrying refs, not on anything this
   * component does with them.
   *
   * `react-hooks/refs` treats a value that holds a ref as a ref, and flags
   * handing one to JSX as reading `.current` during render. Nothing here reads
   * `.current`: the refs are passed *through* — to the element below, and to
   * the canvas loop in the visualiser, both of which touch them in effects.
   * Sharing a transport is the entire purpose of this provider, and a transport
   * without its element and analyser is not one, so there is nothing to
   * restructure into compliance.
   */
  return (
    // eslint-disable-next-line react-hooks/refs
    <PlaybackContext.Provider value={engine}>
      {children}
      {/*
        One element, for the console's life. `hidden` rather than absent: the
        transport is drawn by this application, and the native controls would be
        a second set of chrome in a palette nobody chose.
      */}
      {/* eslint-disable-next-line react-hooks/refs -- passed through, never read here */}
      <audio ref={engine.elementRef} preload="metadata" hidden />
    </PlaybackContext.Provider>
  )
}
