import { createContext } from 'react'
import type { Hotkey } from './registry'

export interface HotkeyContextValue {
  /** Registers a set for as long as the caller is mounted. */
  register: (owner: symbol, hotkeys: readonly Hotkey[]) => void
  release: (owner: symbol) => void
  /** Everything currently registered, in registration order. */
  active: readonly Hotkey[]
}

/**
 * Split from the provider so neither file exports both a component and a
 * value — which breaks React Fast Refresh, reloading the whole page on every
 * edit instead of swapping the component in place.
 */
export const HotkeyContext = createContext<HotkeyContextValue | null>(null)
