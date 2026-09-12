import { type ReactNode } from 'react'
import { motion } from 'motion/react'
import { sweepMarkVariants } from '@renderer/motion/transitions'
import styles from './PageSweep.module.scss'

export interface PageSweepProps {
  /**
   * Re-runs the sweep. The department's id: changing it remounts the mark,
   * which is what makes the animation fire once per navigation rather than
   * needing to be triggered.
   */
  sweepKey: string
  /** Down the rail is `1`, up is `-1`. The mark travels the same way. */
  direction: number
}

/**
 * The mark that passes over the content area as a department changes.
 *
 * A single crimson rule, full width, crossing once. It is the console's
 * registration stamp: the outgoing page recedes, the mark passes, and the
 * incoming page is set behind it.
 *
 * Drawn as a sibling of the animated page rather than inside it, for the
 * reason `UnsavedBar` documents — the page wrapper carries a transform and a
 * filter, either of which makes it the containing block for anything
 * positioned within. A rule rendered inside the page would also be clipped by
 * it, and the point of this one is that it crosses the whole field.
 *
 * `pointer-events: none` throughout. It passes over a page the operator may
 * still be clicking, and a decorative element that eats a click is worse than
 * no decoration.
 */
export function PageSweep({ sweepKey, direction }: PageSweepProps): ReactNode {
  return (
    <motion.span
      key={sweepKey}
      className={styles.sweep}
      aria-hidden="true"
      custom={direction}
      variants={sweepMarkVariants}
      initial="initial"
      animate="animate"
    />
  )
}
