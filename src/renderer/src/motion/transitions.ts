import type { Transition, Variants } from 'motion/react'

/**
 * Shared motion vocabulary.
 *
 * Curves mirror the Sass tokens in styles/abstracts/_tokens.scss so CSS
 * transitions and JS-driven animation share one physical language: fast
 * departure, long settle.
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
export const EASE_IN_EXPO = [0.7, 0, 0.84, 0] as const
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

export const DURATION = {
  instant: 0.09,
  fast: 0.16,
  base: 0.28,
  slow: 0.52,
  cinematic: 1.2
} as const

export const enterTransition: Transition = {
  duration: DURATION.slow,
  ease: EASE_OUT_EXPO
}

export const exitTransition: Transition = {
  duration: DURATION.base,
  ease: EASE_IN_EXPO
}

/**
 * Page transition.
 *
 * Sections are ordered in the navigation rail, so movement carries meaning:
 * navigating "down" the rail enters from below, navigating "up" enters from
 * above. `direction` is supplied as a custom prop by the router.
 */
export const pageVariants: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    y: direction >= 0 ? 18 : -18,
    // A trace of scale keeps the monumental feel without reading as a zoom.
    scale: 0.994,
    filter: 'blur(6px)'
  }),
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: DURATION.slow, ease: EASE_OUT_EXPO }
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction >= 0 ? -12 : 12,
    scale: 0.996,
    filter: 'blur(4px)',
    transition: { duration: DURATION.base, ease: EASE_IN_EXPO }
  })
}

/** Staggered reveal for panel grids. Applied to the container. */
export const gridVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.045, delayChildren: 0.08 }
  },
  exit: {}
}

/** Individual panel within a staggered grid. */
export const panelVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE_OUT_EXPO }
  },
  exit: { opacity: 0, transition: { duration: DURATION.fast } }
}

/** Full-screen boot layer leaving as the console takes over. */
export const bootExitVariants: Variants = {
  initial: { opacity: 1 },
  exit: {
    opacity: 0,
    // Scaling up slightly as it fades reads as passing *through* the boot
    // interface into the console behind it, rather than dismissing a panel.
    scale: 1.06,
    filter: 'blur(14px)',
    transition: { duration: 0.9, ease: EASE_IN_OUT }
  }
}

/** Console shell arriving behind the departing boot layer. */
/**
 * The boot screen's enter affordance.
 *
 * Mounted for the whole sequence rather than added on completion, so it holds
 * its place in the layout from the first frame and the meter and log never
 * shift under it. Readiness is a transition between two states of the same
 * element, not an insertion — which is what stops the control snapping into
 * existence the instant the sequence finishes.
 */
export const enterAffordanceVariants: Variants = {
  waiting: { y: 6, filter: 'blur(1px)' },
  ready: {
    y: 0,
    filter: 'blur(0px)',
    // Slower than the house entrance curve: this is the last beat of a
    // two-and-a-half second cinematic, so it should arrive rather than snap.
    transition: { duration: 0.62, ease: EASE_OUT_EXPO, delay: 0.14 }
  }
}

/**
 * The `Press Enter` hint beside it.
 *
 * Opacity only, and on its own delay, so it arrives just after the control it
 * describes. Kept off the parent variant because the button carries its own
 * dormant opacity through `:disabled` — fading the whole row as well would
 * multiply the two and leave the control nearly invisible while booting.
 */
export const enterHintVariants: Variants = {
  waiting: { opacity: 0 },
  ready: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO, delay: 0.42 } }
}

export const consoleEnterVariants: Variants = {
  initial: { opacity: 0, scale: 1.015 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1, ease: EASE_OUT_EXPO, delay: 0.12 }
  }
}
