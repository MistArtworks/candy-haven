import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { HotkeyContext } from './context'
import { normaliseChord, type Hotkey } from './registry'

/**
 * What the provider has to re-render for.
 *
 * Registration is state on `HotkeyProvider` — it has to be, because the
 * cheatsheet is drawn from it — so every registration re-renders the whole
 * console beneath it. That is fine once per mount and catastrophic per render,
 * which is what this signature exists to tell apart: everything the sheet
 * *prints* is in it, and the handler is not.
 *
 * `run` is deliberately absent. A closure is a new function on every render of
 * its owner, so including it would mean re-registering whenever anything in
 * the page changed — which is the loop described on `useHotkeys`.
 */
function signatureOf(hotkeys: readonly Hotkey[]): string {
  return hotkeys
    .map(
      (hotkey) =>
        `${normaliseChord(hotkey.chord)}\u0000${hotkey.label}\u0000${hotkey.group}\u0000${
          hotkey.disabled ? 1 : 0
        }${hotkey.whileTyping ? 1 : 0}`
    )
    .join('\u0001')
}

/**
 * Registers shortcuts for as long as the caller is mounted.
 *
 * ## Why this does not simply depend on the array
 *
 * It used to, and asked callers to memoise. That contract could not hold, and
 * when it broke it took the whole console with it:
 *
 * THE CONCORD builds its bindings from `actionsFor(...)`, which returns a
 * fresh array of `DeckAction`s on every render — so the page's `useMemo` over
 * it never held, so this hook saw a new array every render, so it re-registered
 * every render, so the provider set state every render, so every page beneath
 * it rendered again. **An unbroken render loop, on every overlay console page.**
 *
 * The visible symptom was not a slow console; it was a console that would not
 * navigate. React never reached the update carrying the new location, so the
 * URL changed and nothing else did — the rail highlighted under the pointer and
 * did nothing when pressed, `Ctrl+Shift+O` did nothing, and the way back to the
 * desk did nothing. Everything already on the page kept working, which is what
 * made it look like a navigation bug rather than a loop.
 *
 * So the dependency is a **signature of what the cheatsheet prints**, and the
 * handlers are read from a ref at press time. A page may now build its bindings
 * however it likes: identity churn costs nothing, and a binding that genuinely
 * changes — a verb becoming refused, a label changing with the phase — still
 * re-registers, because that is what the signature covers.
 *
 * Memoising the array is still worth doing where it is free. It is no longer
 * load-bearing.
 */
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  const context = useContext(HotkeyContext)
  const owner = useRef<symbol | null>(null)
  owner.current ??= Symbol('hotkeys')

  /*
   * The live bindings, read when a key is actually pressed.
   *
   * Written in a layout effect rather than during render — writing a ref while
   * rendering is the thing that makes a component's output depend on when it
   * happened to run, and the compiler refuses it. Layout is early enough by a
   * wide margin: it lands before the frame is painted, and a keystroke cannot
   * be delivered before that.
   */
  const latest = useRef(hotkeys)

  useLayoutEffect(() => {
    latest.current = hotkeys
  })

  const register = context?.register
  const release = context?.release
  const signature = signatureOf(hotkeys)

  useEffect(() => {
    const id = owner.current
    if (!register || !release || !id) return

    /*
     * Registered as a stable copy whose `run` delegates to the ref.
     *
     * By index, because the signature pins the order: if the list reorders or
     * changes length, the signature changed and this effect ran again. The
     * optional call covers the frame between a shorter list arriving and this
     * re-registering.
     */
    const bound: Hotkey[] = latest.current.map((hotkey, index) => ({
      ...hotkey,
      run: () => latest.current[index]?.run()
    }))

    register(id, bound)
    return () => release(id)
  }, [signature, register, release])
}
