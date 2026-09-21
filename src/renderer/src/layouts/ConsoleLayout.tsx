import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { SECTIONS, getSection, getSectionByPath } from '@shared/domain/navigation'
import { TimerCues } from '@renderer/app/providers/TimerCues'
import { ConcordCues } from '@renderer/app/providers/ConcordCues'
import { UnsavedBar } from '@renderer/components/feedback/UnsavedBar'
import { ReleaseNotice } from '@renderer/components/feedback/ReleaseNotice'
import { OrientationGate } from '@renderer/components/guide/OrientationGate'
import { GuideCarousel } from '@renderer/components/guide/GuideCarousel'
import { getGuide } from '@renderer/features/catechism/content'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { MiniPlayer } from '@renderer/components/chrome/MiniPlayer'
import { Reticle } from '@renderer/components/chrome/Reticle'
import { CommandRail } from '@renderer/components/nav/CommandRail'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { consoleEnterVariants, pageVariants, sweepVariants } from '@renderer/motion/transitions'
import { PageSweep } from '@renderer/components/chrome/PageSweep'
import { useSystemStore, selectSettings } from '@renderer/app/store/system.store'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { usePageNonce, usePageRefresh } from '@renderer/hooks/usePageRefresh'
import { PageOutlet } from './PageOutlet'
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

  // The refresh, shared between the title bar's control and its two shortcuts.
  const { refresh } = usePageRefresh()
  const nonce = usePageNonce()

  /*
   * Which page transition to run.
   *
   * Two settings feed this and they are not the same question. `pageTransition`
   * is taste — how ceremonial the handover should be. `motion` is
   * accessibility, and it wins: an operator who asked for reduced movement gets
   * the plain fade whatever the other setting says, and `off` gets neither.
   */
  const transition = useSystemStore(selectSettings)?.appearance.pageTransition ?? 'sweep'
  const animating = useAnimationsEnabled()
  const ceremony = animating && transition === 'sweep'
  const silent = transition === 'off'

  /*
   * The quick guide, opened from the keyboard.
   *
   * Owned by the shell rather than by `PageHeader`, because `F1` is a global
   * binding and the shell is what knows which department is on screen. The
   * button in each masthead keeps its own copy of this state — two ways in to
   * one component, rather than a context threaded through every page for a
   * sheet that is open for thirty seconds at a time.
   */
  const [guideOpen, setGuideOpen] = useState(false)
  const guide = section ? getGuide(section.id) : null

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
      /*
       * Ten departments, and a number row has ten keys — the tenth being `0`.
       *
       * Written as `ctrl+${index + 1}` while there were nine, which produced
       * `ctrl+10` the moment a tenth was added: not a chord any keyboard can
       * send, so CATECHISM had a binding that could never fire and the
       * cheatsheet advertised it. `0` for the tenth is what every tabbed
       * application on this desktop does.
       *
       * The rail has now grown past ten — thirteen with DISCOGRAPHY and
       * ARTISTS — so the numbering has stopped being the whole affordance,
       * exactly as this comment used to predict. The three departments past
       * the tenth get **named** chords instead of fictional numbers, below:
       * `Ctrl+Shift+D`, `Ctrl+,` and `Ctrl+Shift+K`. Every department is
       * reachable from the keyboard; only the first ten are reachable by
       * position.
       */
      ...SECTIONS.slice(0, 10).map((entry, index) => ({
        chord: `ctrl+${index === 9 ? '0' : index + 1}`,
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
      },
      {
        /*
         * DISPATCH lost `Ctrl+9` when DISCOGRAPHY and ARTISTS pushed it past
         * the tenth slot, and unlike REGULATION and CATECHISM it had no named
         * chord to fall back on — it would simply have become the one
         * department with no way in from the keyboard.
         */
        chord: 'ctrl+shift+d',
        label: 'Shared board',
        group: 'Global',
        whileTyping: true,
        run: () => navigate(getSection('dispatch').path)
      },
      {
        /*
         * The help key, pointed at whatever department is open.
         *
         * `F1` rather than a chord, because it is the one key every application
         * on this desktop has agreed means "explain this". `whileTyping`
         * because no text field wants it and someone stuck halfway through
         * filling a form is exactly who reaches for it.
         *
         * Registered even where a guide has not been written: the handler
         * resolves to nothing and the sheet does not open, which is quieter
         * than a binding that appears and disappears as the operator walks the
         * rail.
         */
        chord: 'f1',
        label: 'Quick guide for this department',
        group: 'Global',
        whileTyping: true,
        run: () => setGuideOpen(true)
      },
      {
        chord: 'ctrl+shift+k',
        label: 'Full documentation',
        group: 'Global',
        whileTyping: true,
        run: () => navigate(getSection('catechism').path)
      },
      {
        /*
         * The two keys every application on this desktop reloads with, bound
         * to this console's own idea of a reload — see `usePageRefresh`, which
         * refetches and remounts the department rather than dropping the
         * renderer.
         *
         * `whileTyping` is off, unusually for a global. `Ctrl+R` from inside a
         * text field would throw away what is being typed along with the rest
         * of the page's state, and somebody naming a project is not asking for
         * the register to be re-read.
         */
        chord: 'ctrl+r',
        label: 'Refresh this department',
        group: 'Global',
        run: refresh
      },
      {
        chord: 'f5',
        label: 'Refresh this department',
        group: 'Global',
        run: refresh
      }
    ],
    // `setGuideOpen` is listed although a setState function is stable:
    // the compiler infers dependencies from the body, and a manual array
    // narrower than what it infers makes it drop the memo entirely.
    [navigate, setGuideOpen, refresh]
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

  /*
   * The F1 sheet closes on navigation.
   *
   * A guide for the department you have just left is worse than none, and F1 is
   * easy to hit on the way past. Sited here beside the direction adjustment and
   * deliberately *after* the hotkey memo above: the React Compiler cannot
   * preserve a `useMemo` that follows a render-phase setState, so a block like
   * this placed earlier silently de-optimises the binding list.
   */
  const [guideFor, setGuideFor] = useState(section?.id)

  if (guideFor !== section?.id) {
    setGuideFor(section?.id)
    setGuideOpen(false)
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

      {/*
        The orientation tour, on a first launch and whenever the guide revision
        moves. Mounted beside the release notice and for the same reason: being
        new to the console is not a property of whichever department the router
        happened to land on. Renders nothing once it has been read.
      */}
      <OrientationGate />

      {/* F1's sheet. The masthead button renders its own; only one is ever up. */}
      <AnimatePresence>
        {guideOpen && guide && section ? (
          <GuideCarousel
            guide={guide}
            eyebrow={section.label}
            chapter={section.id}
            onClose={() => setGuideOpen(false)}
          />
        ) : null}
      </AnimatePresence>

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
              variants={ceremony ? sweepVariants : pageVariants}
              initial={silent ? false : 'initial'}
              animate="animate"
              exit={silent ? undefined : 'exit'}
            >
              {/*
                Keyed on the refresh nonce, which is the whole of what a
                refresh does to the tree: the page below this remounts, and
                everything above it — the chrome, the transport, playback —
                does not. See `usePageRefresh`.
              */}
              <PageOutlet key={nonce} />
            </motion.div>
          </AnimatePresence>

          {/*
            The registration mark, outside `AnimatePresence` and outside the
            page.

            Outside the presence because it has no exit of its own — it is
            keyed on the section, so a navigation remounts it and it runs once.
            Outside the page because the page wrapper carries a transform and a
            filter, which would both make it the containing block and clip the
            mark to the page's own box; crossing the whole field is the entire
            point of it.
          */}
          {ceremony && section ? <PageSweep sweepKey={section.id} direction={direction} /> : null}

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

      {/*
        The console's own pointer, last because it draws over everything.
        Mounted here rather than at the app root on purpose: the OBS browser
        sources are separate Vite entry points that never mount this layout, so
        a stream overlay can never have a cursor drawn into it.
      */}
      <Reticle />
    </motion.div>
  )
}
