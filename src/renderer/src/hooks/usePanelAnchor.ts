import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/** The gap between a trigger and the panel it opens. */
const GAP = 4

export interface PanelAnchor {
  /** Put this on the control that opens the panel. */
  triggerRef: React.RefObject<HTMLButtonElement | null>
  /** Put this on the portalled panel itself. */
  panelRef: React.RefObject<HTMLElement | null>
  /** `style` for the panel. Null until it has been measured. */
  position: CSSProperties | null
  /** Closes, and returns focus to the trigger. */
  close: () => void
}

/**
 * A panel pinned to the control that opened it.
 *
 * Lifted out of `Select`, which had all of this and was the only thing using
 * it. It moved here when the date picker needed the same four behaviours —
 * duplicating them would have meant one of the two copies eventually getting a
 * fix the other did not.
 *
 * What it carries, all of it learned the hard way in the original:
 *
 *   - the position is measured **after layout**, because whether the panel
 *     fits below depends on how tall it actually is;
 *   - it **flips upward** only when there is genuinely more room above, rather
 *     than whenever it does not fit below;
 *   - it closes on `pointerdown` outside, on `resize`, and on `scroll` **in
 *     the capture phase** — scroll does not bubble from an element that is not
 *     the document, so a bubbling listener misses every inner scroller, of
 *     which this application has many;
 *   - closing returns focus to the trigger, so a keyboard operator is not
 *     dropped at the top of the page.
 *
 * The panel must be portalled by the caller: a page carries a transform, which
 * makes it the containing block for anything `position: fixed` inside it. See
 * `Portal`.
 *
 * @param open    Whether the panel is showing.
 * @param wanted  How tall the panel would like to be, in pixels. Used only to
 *                decide which way to open; the panel is capped at `maxHeight`.
 * @param onClose Called when something outside the panel should dismiss it.
 */
export function usePanelAnchor(open: boolean, wanted: number, onClose: () => void): PanelAnchor {
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  // Held in a ref rather than a dependency: `onClose` is an inline arrow at
  // every call site, so depending on it would rebuild the listeners on every render.
  const latest = useRef(onClose)
  useEffect(() => {
    latest.current = onClose
  })

  const close = useCallback((): void => {
    latest.current()
    triggerRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - GAP
    const above = rect.top - GAP
    const flip = below < wanted && above > below

    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.min(flip ? above : below, wanted),
      ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP })
    })
  }, [open, wanted])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      // Not `close()`: a pointer dismissal should not yank focus back to the
      // trigger, because the operator has just pressed something else.
      latest.current()
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  return { triggerRef, panelRef, position, close }
}
