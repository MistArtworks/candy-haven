import { useContext, useEffect, useRef } from 'react'
import { HotkeyContext } from './context'
import type { Hotkey } from './registry'

/**
 * Registers shortcuts for as long as the caller is mounted.
 *
 * **Pass a memoised array.** Its identity drives re-registration, so an inline
 * literal would register on every render. Callers wrap theirs in `useMemo` over
 * the handlers they close on.
 */
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  const context = useContext(HotkeyContext)
  const owner = useRef<symbol | null>(null)
  owner.current ??= Symbol('hotkeys')

  const register = context?.register
  const release = context?.release

  useEffect(() => {
    const id = owner.current
    if (!register || !release || !id) return

    register(id, hotkeys)
    return () => release(id)
  }, [hotkeys, register, release])
}
