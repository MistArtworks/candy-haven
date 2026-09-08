import { useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getSectionByPath } from '@shared/domain/navigation'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { CommandRail } from '@renderer/components/nav/CommandRail'
import { consoleEnterVariants, pageVariants } from '@renderer/motion/transitions'
import styles from './ConsoleLayout.module.scss'

/**
 * The application shell: window chrome, navigation rail and the routed view.
 *
 * Page transitions are directional. The rail is an ordered list of departments,
 * so moving down it enters from below and moving up enters from above — the
 * motion tells the operator where they went, not merely that something changed.
 */
export function ConsoleLayout(): ReactNode {
  const location = useLocation()
  const section = getSectionByPath(location.pathname)

  // Direction is derived from the section we navigated away from.
  //
  // This is React's documented "adjusting state when a value changes" pattern:
  // comparing against the previous value during render and setting state
  // immediately. React discards the in-progress render and re-runs this
  // component before touching the DOM, so no extra frame is committed — which
  // is why this is preferred over an effect, whose setState would cascade a
  // second visible render mid-transition.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const currentOrder = section?.order ?? 0
  const [previousOrder, setPreviousOrder] = useState(currentOrder)
  const [direction, setDirection] = useState(1)

  if (previousOrder !== currentOrder) {
    setDirection(currentOrder >= previousOrder ? 1 : -1)
    setPreviousOrder(currentOrder)
  }

  return (
    <motion.div
      className={styles.shell}
      variants={consoleEnterVariants}
      initial="initial"
      animate="animate"
    >
      <TitleBar />

      <div className={styles.body}>
        <CommandRail />

        <main className={styles.main}>
          {/*
            `mode="wait"` holds the incoming page until the outgoing one has
            cleared. With the blur-and-lift transition, overlapping the two
            reads as a smear rather than a handover.
          */}
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={section?.id ?? location.pathname}
              className={styles.page}
              custom={direction}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </motion.div>
  )
}
