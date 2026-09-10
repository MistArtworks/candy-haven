import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { HotkeyContext, type HotkeyContextValue } from './context'
import { chordOf, isTyping, normaliseChord, type Hotkey } from './registry'
import { HotkeySheet } from './HotkeySheet'

/** Opens the cheatsheet. Deliberately undocumented in the interface itself. */
const SHEET_CHORD = 'ctrl+/'

/**
 * The keyboard layer.
 *
 * Bindings are registered by whatever is on screen and released when it
 * unmounts, so the live set is always exactly what the operator can currently
 * act on — which is what makes the cheatsheet honest rather than a
 * hand-maintained list that drifts from the code.
 *
 * One listener at the document, rather than one per component. A dozen
 * independent `keydown` handlers is how two features end up silently claiming
 * the same chord; here a collision is at least resolvable in one place, and the
 * cheatsheet shows both.
 */
export function HotkeyProvider({ children }: { children: ReactNode }): ReactNode {
  const [sheetOpen, setSheetOpen] = useState(false)

  /*
   * Held in state, replaced immutably.
   *
   * A mutable ref plus a version counter was tried first and is the wrong
   * shape: the cheatsheet renders from this, so it is render data, and reading
   * a ref during render is exactly the pattern that leaves a component showing
   * a stale list. Registration happens in effects, so the extra render this
   * costs on mount is one frame nobody sees.
   */
  const [owners, setOwners] = useState<ReadonlyMap<symbol, readonly Hotkey[]>>(new Map())

  const register = useCallback((owner: symbol, hotkeys: readonly Hotkey[]) => {
    setOwners((current) => new Map(current).set(owner, hotkeys))
  }, [])

  const release = useCallback((owner: symbol) => {
    setOwners((current) => {
      if (!current.has(owner)) return current
      const next = new Map(current)
      next.delete(owner)
      return next
    })
  }, [])

  const active = useMemo(() => [...owners.values()].flat(), [owners])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const chord = chordOf(event)

      if (chord === SHEET_CHORD) {
        event.preventDefault()
        setSheetOpen((open) => !open)
        return
      }

      // The sheet is modal in spirit: while it is up, Escape closes it and
      // nothing else fires, so a shortcut cannot be triggered from behind it.
      if (sheetOpen) {
        if (chord === 'escape') {
          event.preventDefault()
          setSheetOpen(false)
        }
        return
      }

      const typing = isTyping(event.target)

      for (const binding of active) {
        if (binding.disabled) continue
        if (normaliseChord(binding.chord) !== chord) continue
        if (typing && !binding.whileTyping) continue

        event.preventDefault()
        binding.run()
        return
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, sheetOpen])

  const value = useMemo<HotkeyContextValue>(
    () => ({ register, release, active }),
    [register, release, active]
  )

  return (
    <HotkeyContext.Provider value={value}>
      {children}
      {sheetOpen ? <HotkeySheet hotkeys={active} onClose={() => setSheetOpen(false)} /> : null}
    </HotkeyContext.Provider>
  )
}
