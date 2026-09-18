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

/**
 * Page transition, the ceremonial one.
 *
 * The brief's world is one where "symmetry is worship" and a record is not
 * merely shown but *registered*. So a department does not slide in: it recedes,
 * a mark passes over the field, and the next one is set in place behind it —
 * the console stamping a new page rather than scrolling to one.
 *
 * Mechanically that is three parts, and only two of them are here. The outgoing
 * page drops back and dims; the incoming page is held a beat, then set. The
 * mark itself is `PageSweep`, drawn as a sibling so it passes *over* both.
 *
 * The hold is what makes it read as deliberate. Without the delay the incoming
 * page is already arriving while the rule is still travelling, and the two
 * movements smear into each other instead of following one another.
 */
export const sweepVariants: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    // Enters from the side it is travelling towards, so the movement agrees
    // with the rule passing over it.
    y: direction >= 0 ? 26 : -26,
    scale: 0.988,
    filter: 'blur(8px)'
  }),
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.62,
      ease: EASE_OUT_EXPO,
      // Held while the mark crosses. See `SWEEP_DURATION`.
      delay: 0.16
    }
  },
  exit: (direction: number) => ({
    opacity: 0,
    // Recedes rather than departing sideways: the outgoing department is being
    // *closed*, not pushed off.
    y: direction >= 0 ? -14 : 14,
    scale: 0.985,
    filter: 'blur(10px)',
    transition: {
      duration: 0.24,
      ease: EASE_IN_EXPO,
      /*
       * Opacity leads, and on a linear curve.
       *
       * `EASE_IN_EXPO` is a slow start — exactly the wrong shape for the one
       * property that decides whether the departing page is still readable. It
       * held the page near full opacity for most of the exit. Clearing it in
       * 140ms while the recede continues underneath reads the same and leaves
       * nothing legible on the way out.
       */
      opacity: { duration: 0.14, ease: 'linear' }
    }
  })
}

/** How long the mark takes to cross. The page's hold is measured against it. */
export const SWEEP_DURATION = 0.55

/**
 * The mark itself: a crimson rule crossing the content area once.
 *
 * Full width and travelling vertically, because the rail is vertical and the
 * transition should agree with the direction of travel. Scales its own opacity
 * so it arrives and leaves rather than being clipped at the edges.
 */
export const sweepMarkVariants: Variants = {
  initial: (direction: number) => ({
    top: direction >= 0 ? '-2%' : '102%',
    opacity: 0
  }),
  animate: (direction: number) => ({
    top: direction >= 0 ? '102%' : '-2%',
    opacity: [0, 1, 1, 0],
    transition: {
      duration: SWEEP_DURATION,
      ease: EASE_IN_OUT,
      opacity: { duration: SWEEP_DURATION, times: [0, 0.12, 0.8, 1] }
    }
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

/**
 * One slide of a guide carousel.
 *
 * Directional for the same reason `pageVariants` is: the movement says which
 * way you went, not merely that something changed. `direction` is supplied as a
 * custom prop, which is also why this is a variant rather than inline targets —
 * Motion resolves a custom function only through `variants`.
 */
export const slideVariants: Variants = {
  initial: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 24 : -24 }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT_EXPO }
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -16 : 16,
    transition: { duration: DURATION.fast, ease: EASE_IN_EXPO }
  })
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

/**
 * Swapping the body of a tabbed record sheet.
 *
 * ## Why this is not `gridVariants` / `panelVariants`
 *
 * Those are tuned for a page arriving: `y: 14`, `DURATION.slow`, a 0.08s
 * delay before the first child. That is right once, on entry. A tab strip is
 * pressed repeatedly and often in sequence, and 0.6s of travel per press turns
 * five tabs into something the operator waits for rather than reads.
 *
 * So: shorter throw, no lead-in delay, a tighter stagger, and `DURATION.base`
 * — enough that the eye registers the content as new, not enough to hold it up.
 */
export const sheetTabVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.03 }
  }
}

export const sheetTabItemVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT_EXPO }
  }
}

/**
 * The size change a tabbed sheet makes when its body is swapped.
 *
 * Used with motion's `layout` on the sheet itself. `DURATION.base` rather than
 * `slow`, for the reason above: the height change and the content arriving
 * should finish together, or the sheet is still settling after the text has
 * stopped moving.
 */
export const sheetResizeTransition: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT_EXPO
}
