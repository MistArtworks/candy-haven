import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'
import { useTooltipStore } from '@renderer/app/store/tooltip.store'

/** A hover has to linger this long before it counts as asking for the hint. */
const SHOW_DELAY_MS = 320

export interface TooltipTrigger {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onBlur: (event: FocusEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

let showTimer: number | null = null

function cancelShow(): void {
  if (showTimer !== null) {
    window.clearTimeout(showTimer)
    showTimer = null
  }
}

function schedule(label: string, target: HTMLElement): void {
  cancelShow()
  showTimer = window.setTimeout(() => useTooltipStore.getState().show(label, target), SHOW_DELAY_MS)
}

function dismiss(): void {
  cancelShow()
  useTooltipStore.getState().hide()
}

/**
 * Spread onto whatever element used to carry a `title`.
 *
 * A plain function rather than a hook. Most of what carries a hint in this
 * console is rendered inside a `.map()` — every row of the directory, every
 * option in a list, every tile in a grid — where the Rules of Hooks would
 * refuse a `useTooltip` called per item outright. There is exactly one
 * tooltip on screen at a time regardless of how many triggers exist — see
 * `TooltipHost` — so the state this needs (the pending show timer) is
 * module-level, not per-component, and calling it is as free as reading a
 * constant.
 *
 * Returns no-op handlers for an empty label rather than being refused: a call
 * site computing its own hint text sometimes has none to give, and the
 * alternative is every caller guarding the call itself.
 */
export function tooltipTrigger(label: string): TooltipTrigger {
  if (!label) {
    const noop = (): void => {}
    return { onMouseEnter: noop, onMouseLeave: noop, onFocus: noop, onBlur: noop, onKeyDown: noop }
  }

  return {
    onMouseEnter: (event) => schedule(label, event.currentTarget),
    onMouseLeave: dismiss,
    onFocus: (event) => schedule(label, event.currentTarget),
    onBlur: dismiss,
    onKeyDown: (event) => {
      if (event.key === 'Escape') dismiss()
    }
  }
}
