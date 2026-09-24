import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from './RailHandle.module.scss'

export interface RailHandleProps {
  /** Whether the department rail is currently shown. */
  railOpen: boolean
  /** Shows the rail, animated. See `CommandRail`. */
  onToggleRail: () => void
}

/**
 * Brings the rail back once it has been put away.
 *
 * A floating switch rather than a permanent one in the title bar: with the
 * whole directory gone, nothing else on screen stands for it, so this is
 * drawn at the same corner the rail used to occupy rather than folded in among
 * window controls the operator was not looking at when they put it away.
 */
export function RailHandle({ railOpen, onToggleRail }: RailHandleProps): ReactNode {
  const animating = useAnimationsEnabled()

  return (
    <AnimatePresence>
      {railOpen ? null : (
        <motion.button
          type="button"
          className={styles.handle}
          onClick={onToggleRail}
          aria-label="Show the department rail"
          {...tooltipTrigger('Show the rail (Ctrl+])')}
          initial={animating ? { opacity: 0, x: -6 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={animating ? { opacity: 0, x: -6 } : undefined}
          transition={{ duration: 0.16 }}
        >
          {/* The rail's leading edge, unfolding back out to the right. */}
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
            <line x1="2.6" y1="2.2" x2="2.6" y2="9.8" stroke="currentColor" strokeWidth="1" />
            <path
              d="M4.8 3.7 7.4 6 4.8 8.3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="square"
            />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
