import { create } from 'zustand'

interface TooltipState {
  label: string | null
  target: HTMLElement | null
  show: (label: string, target: HTMLElement) => void
  hide: () => void
}

/**
 * The one hint on screen at a time.
 *
 * A single store rather than state local to each trigger: only one tooltip is
 * ever showing, so the console needs exactly one portalled, positioned,
 * animated element — `TooltipHost`, mounted once by `ConsoleLayout` — reading
 * whichever trigger last asked for it, rather than ninety-odd copies of the
 * same machinery sitting dormant across every button that carries a hint. See
 * `useTooltip`, which is what actually calls `show`/`hide`.
 */
export const useTooltipStore = create<TooltipState>((set) => ({
  label: null,
  target: null,
  show: (label, target) => set({ label, target }),
  hide: () => set({ label: null, target: null })
}))
