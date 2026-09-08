import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { gridVariants } from '@renderer/motion/transitions'
import styles from './dossier.module.scss'

/**
 * Panel grid for a dossier tab.
 *
 * This exists because `Panel` animates through `panelVariants`, whose `initial`
 * state is `opacity: 0`. A Panel does not declare `initial`/`animate` itself —
 * it inherits the state from a parent that drives the variants, which is how
 * every page grid in the console works. A tab that laid its panels out in a
 * plain `<div>` therefore rendered them at zero opacity: the content was
 * present and occupying space, but completely invisible.
 *
 * Wrapping the grid here rather than repeating the motion props in each of the
 * five tabs keeps that from silently regressing the next time a tab is added.
 */
export function DossierGrid({ children }: { children: ReactNode }): ReactNode {
  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      {children}
    </motion.div>
  )
}
