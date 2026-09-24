import { useState, type ReactNode } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getSectionByPath, getSectionGroups, type SectionGroupId } from '@shared/domain/navigation'
import { APP_SUBTITLE } from '@shared/constants'
import { formatIndex } from '@renderer/lib/format'
import { useSystemStore, selectArchive, selectUpdate } from '@renderer/app/store/system.store'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { sheetResizeTransition } from '@renderer/motion/transitions'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from './CommandRail.module.scss'

/**
 * Primary navigation.
 *
 * Sections are numbered and ordered — the rail reads as a directory of
 * departments rather than a menu, which is what carries the institutional
 * register. Sections that have not shipped yet are still listed and reachable;
 * they render a reserved-state page rather than being hidden, so the shape of
 * the whole system is legible from day one.
 *
 * Filed under divisions rather than listed flat. At six departments a single
 * column was still a list; at nine it had become a menu, and the operator was
 * reading every entry to find the one they wanted. The divisions come from the
 * registry, so a department added there appears under its heading without a
 * second edit — and the numbering stays continuous across the whole directory,
 * because a department's index is its identity: it is what the page header
 * prints and what Ctrl+N selects, not its position within a group.
 */
export interface CommandRailProps {
  /** Collapsed to zero width when the operator has hidden it. See `TitleBar`. */
  hidden?: boolean
  /**
   * Puts the rail away. The masthead's own switch, beside the switch in the
   * title bar that is the only way to bring it back — the two share one
   * handler because they share one piece of state.
   */
  onToggleRail: () => void
}

export function CommandRail({ hidden = false, onToggleRail }: CommandRailProps): ReactNode {
  const location = useLocation()
  const animating = useAnimationsEnabled()
  const update = useSystemStore(selectUpdate)

  /*
   * Navigation guard.
   *
   * A page holding unsaved changes claims the guard, and clicking a rail entry
   * nudges its bar instead of leaving. Implemented here rather than with a
   * route blocker because the app uses a plain `<Routes>` tree, which has no
   * blocker — and because the rail is the only way out of a page, so guarding
   * it is complete rather than partial.
   */
  const dirty = useSystemStore((state) => state.unsaved?.dirty ?? false)
  const nudgeUnsaved = useSystemStore((state) => state.nudgeUnsaved)

  const guard = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (!dirty) return
    event.preventDefault()
    nudgeUnsaved()
  }
  const archive = useSystemStore(selectArchive)
  const updateReady = update?.state === 'downloaded' || update?.state === 'available'
  const groups = getSectionGroups()
  const activeSection = getSectionByPath(location.pathname)

  /*
   * One division open at a time.
   *
   * Thirteen departments across four divisions read as a wall of purpose
   * lines the moment a department joined each of them — the operator had to
   * read past everything to find the one they wanted. An accordion keeps the
   * directory's shape always visible while showing the detail of one division.
   *
   * Defaults to, and follows, whichever division the console currently stands
   * in — including after a keyboard shortcut, which never touches this list
   * at all. A department reached that way must still show open and current
   * here, so a manual collapse cannot leave the rail disagreeing with the page.
   */
  const [openGroupId, setOpenGroupId] = useState<SectionGroupId | null>(
    activeSection?.group ?? groups[0]?.definition.id ?? null
  )

  /*
   * Adjusted during render rather than in an effect — the same pattern
   * `ConsoleLayout` uses for its own direction and guide state. Comparing
   * against the previous section while rendering lets React discard this
   * in-progress render and re-run the component before anything is painted,
   * instead of committing one frame and cascading a second from an effect.
   *
   * Keyed on section identity alone, so a query string changing under
   * REGULATION does not reopen a division the operator has since collapsed.
   */
  const [trackedSectionId, setTrackedSectionId] = useState(activeSection?.id)

  if (activeSection && trackedSectionId !== activeSection.id) {
    setTrackedSectionId(activeSection.id)
    setOpenGroupId(activeSection.group)
  }

  const toggleGroup = (id: SectionGroupId): void => {
    setOpenGroupId((current) => (current === id ? null : id))
  }

  return (
    <nav
      className={styles.rail}
      aria-label="Sections"
      aria-hidden={hidden || undefined}
      data-hidden={hidden || undefined}
    >
      <div className={styles.top}>
        {/* Directory masthead — gives the list a header rule to sit under,
            matching how every panel in the console is titled. Where the
            department count used to sit is now the rail's own put-away
            switch — the only one, since putting it away is a gesture this
            masthead is right there for. Bringing it back is `RailHandle`'s
            job, once there is no rail left to reach into. */}
        <header className={styles.masthead}>
          <span className={styles.mastheadLabel}>Directory</span>
          <span className={styles.mastheadRule} aria-hidden="true" />
          <button
            type="button"
            className={styles.mastheadToggle}
            onClick={onToggleRail}
            aria-label="Hide the department rail"
            {...tooltipTrigger('Hide the rail (Ctrl+])')}
          >
            {/* The rail's trailing edge, folding away to the left. */}
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
              <line x1="9.4" y1="2.2" x2="9.4" y2="9.8" stroke="currentColor" strokeWidth="1" />
              <path
                d="M7.2 3.7 4.6 6 7.2 8.3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="square"
              />
            </svg>
          </button>
        </header>

        {groups.map((group) => {
          const open = openGroupId === group.definition.id

          return (
            <section key={group.definition.id} className={styles.group}>
              {/* The division heading is a rule with a word on it — the same
                  furniture as the masthead above, one order quieter — and now
                  the disclosure for its own list. */}
              <h2 className={styles.groupHeading}>
                <button
                  type="button"
                  className={styles.groupToggle}
                  onClick={() => toggleGroup(group.definition.id)}
                  aria-expanded={open}
                  {...tooltipTrigger(group.definition.purpose)}
                >
                  <span className={styles.groupLabel}>{group.definition.label}</span>
                  <span className={styles.groupRule} aria-hidden="true" />
                  <svg
                    className={styles.groupChevron}
                    data-open={open || undefined}
                    viewBox="0 0 12 12"
                    width="10"
                    height="10"
                    aria-hidden="true"
                    fill="none"
                  >
                    <path
                      d="M3.6 4.1 6 6.5 8.4 4.1"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="square"
                    />
                  </svg>
                </button>
              </h2>

              <AnimatePresence initial={false}>
                {open ? (
                  <motion.ul
                    key="list"
                    className={styles.list}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={animating ? sheetResizeTransition : { duration: 0 }}
                  >
                    {group.sections.map((section) => (
                      <li key={section.id}>
                        <NavLink
                          to={section.path}
                          onClick={guard}
                          end={section.path === '/'}
                          className={({ isActive }) =>
                            [styles.item, isActive ? styles.active : ''].filter(Boolean).join(' ')
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {/* The active marker is a shared layout element, so it
                                  slides between sections instead of cross-fading in
                                  place — across divisions as well as within one. */}
                              {isActive ? (
                                <motion.span
                                  layoutId="rail-marker"
                                  className={styles.marker}
                                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                                />
                              ) : null}

                              <span className={styles.index}>{formatIndex(section.order + 1)}</span>

                              <span className={styles.body}>
                                <span className={styles.label}>{section.label}</span>
                                <span className={styles.purpose}>{section.purpose}</span>
                              </span>

                              <span
                                className={styles.state}
                                data-reserved={!section.implemented || undefined}
                                aria-label={section.implemented ? 'In service' : 'Reserved'}
                                {...tooltipTrigger(
                                  section.implemented
                                    ? 'In service'
                                    : 'Reserved — not yet in service'
                                )}
                              />
                            </>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </section>
          )
        })}
      </div>

      <footer className={styles.footer}>
        {updateReady ? (
          <NavLink to="/regulation?section=updates" className={styles.updateBadge}>
            <span className={styles.updateDot} aria-hidden="true" />
            UPDATE {update?.version ? `v${update.version}` : 'AVAILABLE'}
          </NavLink>
        ) : null}

        {/* A live readout anchors the rail: the console always shows the state
            of the thing it is a console for. */}
        <dl className={styles.readout}>
          <div className={styles.readoutRow}>
            <dt>Archive</dt>
            <dd data-state={archive.state}>{archive.state.toUpperCase()}</dd>
          </div>
          <div className={styles.readoutRow}>
            <dt>Port</dt>
            <dd>{archive.port ?? '—'}</dd>
          </div>
        </dl>

        <p className={styles.subtitle}>{APP_SUBTITLE}</p>
      </footer>
    </nav>
  )
}
