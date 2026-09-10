import { useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { SECTIONS, getSection, getSectionByPath } from '@shared/domain/navigation'
import { TimerCues } from '@renderer/app/providers/TimerCues'
import { ConcordCues } from '@renderer/app/providers/ConcordCues'
import { UnsavedBar } from '@renderer/components/feedback/UnsavedBar'
import { ReleaseNotice } from '@renderer/components/feedback/ReleaseNotice'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { MiniPlayer } from '@renderer/components/chrome/MiniPlayer'
import { CommandRail } from '@renderer/components/nav/CommandRail'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
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
  const navigate = useNavigate()
  const section = getSectionByPath(location.pathname)

  /*
   * Ctrl+1..n walks the rail, in the order the rail is drawn.
   *
   * Numbered from the registry rather than hard-coded, so a department added or
   * removed renumbers the shortcuts with it and the cheatsheet cannot drift.
   * Reserved sections are bound too — they are on the rail, and a shortcut that
   * silently skips one would make the numbering stop matching what is on screen.
   *
   * All are `whileTyping`: Ctrl is a modifier no text field wants, and someone
   * naming a project should still be able to leave for another department.
   */
  const navigation = useMemo<Hotkey[]>(
    () => [
      ...SECTIONS.map((entry, index) => ({
        chord: `ctrl+${index + 1}`,
        label: entry.label,
        group: 'Global',
        whileTyping: true,
        run: () => navigate(entry.path)
      })),
      {
        // What every application on this desktop opens its settings with.
        chord: 'ctrl+,',
        label: 'Settings',
        group: 'Global',
        whileTyping: true,
        run: () => navigate(getSection('regulation').path)
      },
      {
        chord: 'ctrl+shift+o',
        label: 'Broadcast kit',
        group: 'Global',
        whileTyping: true,
        run: () => navigate(getSection('observatory').path)
      }
    ],
    [navigate]
  )

  useHotkeys(navigation)

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
      {/*
        Mounted here rather than on the timer's own page: a cue exists to reach
        the operator while they are looking at something else. Renders nothing.
      */}
      <TimerCues />
      <ConcordCues />

      {/*
        Mounted in the shell rather than on a page: an update is not a property
        of wherever the operator happened to be when they launched. Renders
        nothing until there is a version they have not been told about.
      */}
      <ReleaseNotice />

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

          {/*
            Outside the animated page wrapper on purpose. That element carries a
            transform and `will-change`, either of which makes it the containing
            block for fixed positioning — so a bar rendered inside it lands
            relative to the page instead of at the bottom of the app. As a
            sibling of the page inside the content area it is also automatically
            clear of the rail, with no width to keep in step.
          */}
          <UnsavedBar />
        </main>
      </div>

      {/*
        A sibling of the body rather than a child of the page, for two reasons.
        The page wrapper carries a transform, which would make it the containing
        block for anything positioned inside it — the trap UnsavedBar documents
        — and what is playing is a property of the console rather than of
        whichever department is on screen, so it belongs under the rail as well.
      */}
      <MiniPlayer />
    </motion.div>
  )
}
