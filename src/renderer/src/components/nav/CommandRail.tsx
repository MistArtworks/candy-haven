import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  getSectionByPath,
  searchSections,
  type SectionDefinition,
  type SectionId
} from '@shared/domain/navigation'
import { APP_SUBTITLE } from '@shared/constants'
import { formatIndex } from '@renderer/lib/format'
import { useSystemStore, selectArchive, selectUpdate } from '@renderer/app/store/system.store'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { useNavigation } from '@renderer/hooks/useNavigation'
import { sheetResizeTransition } from '@renderer/motion/transitions'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { useInbox } from '@renderer/hooks/useInbox'
import { countWaiting, useDispatch } from '@renderer/hooks/useDispatch'
import styles from './CommandRail.module.scss'

/** What a department's count is of, for its tooltip and its category's dot. */
const WAITING_WORDS: Partial<Record<SectionId, string>> = {
  contact: 'waiting from the website',
  services: 'waiting from the website',
  dispatch: 'new on the board'
}

function capitalised(words: string | undefined): string {
  if (!words) return 'Waiting'
  return `${words[0].toUpperCase()}${words.slice(1)}`
}

/** A folded category's dot says what its count is of: the first department with one. */
function groupWords(
  sections: readonly { id: SectionId }[],
  waiting: Partial<Record<SectionId, number>>
): string {
  const counted = sections.find((section) => (waiting[section.id] ?? 0) > 0)
  return (counted && WAITING_WORDS[counted.id]) ?? 'waiting'
}

/**
 * Primary navigation.
 *
 * Sections are numbered and ordered — the rail reads as a directory of
 * departments rather than a menu, which is what carries the institutional
 * register. Sections that have not shipped yet are still listed and reachable;
 * they render a reserved-state page rather than being hidden, so the shape of
 * the whole system is legible from day one.
 *
 * Filed under categories rather than listed flat, and since 1.27.0 under the
 * operator's own: REGULATION, under DIRECTORY, makes and renames categories,
 * moves departments between them, and pins pages (a block at the top, always
 * open) and categories (first, and always open). `useNavigation` turns that
 * into this list. Numbers follow the rail top to bottom, so the page header
 * prints the department's place here and Ctrl+N opens it.
 *
 * The search under the masthead finds a department by name, purpose, the
 * words it is known by ("settings") or its category, and Enter opens the
 * first. Ctrl+Shift+F puts the cursor in it from anywhere.
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
  /** Bumped to put the cursor in the search (Ctrl+Shift+F). */
  searchRequest?: number
}

export function CommandRail({
  hidden = false,
  onToggleRail,
  searchRequest = 0
}: CommandRailProps): ReactNode {
  const location = useLocation()
  const navigate = useNavigate()
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
  const rail = useNavigation()
  const activeSection = getSectionByPath(location.pathname)

  /*
   * What the website has sent that nobody has dealt with yet.
   *
   * Counted on the department and, while its category is folded away, marked
   * on the category's heading, so a message is not missed for sitting under a
   * closed heading. Zero while signed out: the copy is not shown to whoever
   * has the machine, and a count of it would be showing it.
   */
  const inbox = useInbox()
  /*
   * DISPATCH counts the same way: items with something new from the other
   * person since the reader last opened them. Zero while signed out, as the
   * board itself is empty then.
   */
  const board = useDispatch()
  const waiting: Partial<Record<SectionId, number>> = {
    contact: inbox.waiting.messages,
    services: inbox.waiting.enquiries,
    dispatch: countWaiting(board.items, board.link.identity)
  }

  /*
   * One category open at a time, pinned ones aside: those stay open.
   *
   * Thirteen departments across four divisions read as a wall of purpose
   * lines the moment a department joined each of them — the operator had to
   * read past everything to find the one they wanted. An accordion keeps the
   * directory's shape always visible while showing the detail of one category.
   *
   * Defaults to, and follows, whichever category the console currently stands
   * in — including after a keyboard shortcut, which never touches this list
   * at all. A department reached that way must still show open and current
   * here, so a manual collapse cannot leave the rail disagreeing with the page.
   */
  const [openGroupId, setOpenGroupId] = useState<string | null>(
    (activeSection ? rail.categoryOf(activeSection.id)?.id : undefined) ??
      rail.categories[0]?.id ??
      null
  )

  /*
   * Adjusted during render rather than in an effect — the same pattern
   * `ConsoleLayout` uses for its own direction and guide state. Comparing
   * against the previous section while rendering lets React discard this
   * in-progress render and re-run the component before anything is painted,
   * instead of committing one frame and cascading a second from an effect.
   *
   * Keyed on section identity alone, so a query string changing under
   * REGULATION does not reopen a category the operator has since collapsed.
   */
  const [trackedSectionId, setTrackedSectionId] = useState(activeSection?.id)

  if (activeSection && trackedSectionId !== activeSection.id) {
    setTrackedSectionId(activeSection.id)
    setOpenGroupId(rail.categoryOf(activeSection.id)?.id ?? null)
  }

  const toggleGroup = (id: string): void => {
    setOpenGroupId((current) => (current === id ? null : id))
  }

  // ------------------------------------------------------------- the search

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const searching = query.trim().length > 0
  const results = useMemo(() => searchSections(rail, query), [rail, query])
  const searchTip = tooltipTrigger('Search pages and categories (Ctrl+Shift+F)')

  useEffect(() => {
    if (searchRequest > 0) searchRef.current?.focus()
  }, [searchRequest])

  const open = (section: SectionDefinition): void => {
    if (dirty) {
      nudgeUnsaved()
      return
    }
    void navigate(section.path)
    setQuery('')
    searchRef.current?.blur()
  }

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) setQuery('')
      else event.currentTarget.blur()
      return
    }
    if (!searching || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => Math.min(current + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      open(results[Math.min(cursor, results.length - 1)])
    }
  }

  // --------------------------------------------------------------- one row

  const row = (
    section: SectionDefinition,
    marker: string,
    options: { cursor?: boolean; category?: string } = {}
  ): ReactNode => (
    <li key={section.id}>
      <NavLink
        to={section.path}
        onClick={(event) => {
          guard(event)
          if (!event.defaultPrevented) setQuery('')
        }}
        end={section.path === '/'}
        data-cursor={options.cursor || undefined}
        className={({ isActive }) =>
          [styles.item, isActive ? styles.active : ''].filter(Boolean).join(' ')
        }
      >
        {({ isActive }) => (
          <>
            {/* The active marker is a shared layout element, so it slides
                between sections instead of cross-fading in place — across
                categories as well as within one. Pinned rows and search
                results keep a marker of their own. */}
            {isActive ? (
              <motion.span
                layoutId={marker}
                className={styles.marker}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null}

            <span className={styles.index}>{formatIndex(rail.numberOf(section.id))}</span>

            <span className={styles.body}>
              <span className={styles.label}>{section.label}</span>
              <span className={styles.purpose}>
                {options.category ? (
                  <span className={styles.resultCategory}>{options.category}</span>
                ) : null}
                {section.purpose}
              </span>
            </span>

            <span className={styles.end}>
              {waiting[section.id] ? (
                <span
                  className={styles.waiting}
                  {...tooltipTrigger(capitalised(WAITING_WORDS[section.id]))}
                >
                  {waiting[section.id]}
                </span>
              ) : null}
              <span
                className={styles.state}
                data-reserved={!section.implemented || undefined}
                aria-label={section.implemented ? 'In service' : 'Reserved'}
                {...tooltipTrigger(
                  section.implemented ? 'In service' : 'Reserved — not yet in service'
                )}
              />
            </span>
          </>
        )}
      </NavLink>
    </li>
  )

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

        <div className={styles.search} data-active={searching || undefined}>
          <svg
            className={styles.searchGlyph}
            viewBox="0 0 12 12"
            width="11"
            height="11"
            aria-hidden="true"
            fill="none"
          >
            <circle cx="5.2" cy="5.2" r="3.4" stroke="currentColor" strokeWidth="1.1" />
            <line
              x1="7.7"
              y1="7.7"
              x2="10.4"
              y2="10.4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="square"
            />
          </svg>
          <input
            ref={searchRef}
            className={styles.searchInput}
            value={query}
            placeholder="Search pages"
            aria-label="Search pages and categories"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={onSearchKey}
            // Hover only: a tooltip on focus would sit over the results.
            onMouseEnter={searchTip.onMouseEnter}
            onMouseLeave={searchTip.onMouseLeave}
          />
          {query ? (
            <button
              type="button"
              className={styles.searchClear}
              aria-label="Clear the search"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              ✕
            </button>
          ) : null}
        </div>

        {searching ? (
          <section className={styles.group} aria-label="Search results">
            {results.length === 0 ? (
              <p className={styles.noResults}>Nothing matches “{query.trim()}”.</p>
            ) : (
              <ul className={styles.list}>
                {results.map((section, index) =>
                  row(section, 'rail-marker-search', {
                    cursor: index === cursor,
                    category: rail.categoryOf(section.id)?.label
                  })
                )}
              </ul>
            )}
          </section>
        ) : (
          <>
            {rail.pinned.length > 0 ? (
              <section className={styles.group} data-pinned>
                <h2 className={styles.groupHeading}>
                  <span className={styles.groupStatic}>
                    <span className={styles.groupLabel}>Pinned</span>
                    <span className={styles.groupRule} aria-hidden="true" />
                    <PinGlyph />
                  </span>
                </h2>
                <ul className={styles.list}>
                  {rail.pinned.map((section) => row(section, 'rail-marker-pin'))}
                </ul>
              </section>
            ) : null}

            {rail.categories.map((category) => {
              const shown = category.pinned || openGroupId === category.id
              const groupWaiting = category.sections.reduce(
                (total, section) => total + (waiting[section.id] ?? 0),
                0
              )

              return (
                <section key={category.id} className={styles.group}>
                  {/* The category heading is a rule with a word on it — the
                      same furniture as the masthead above, one order quieter —
                      and the disclosure for its own list. A pinned category
                      has nothing to disclose: it stays open. */}
                  <h2 className={styles.groupHeading}>
                    {category.pinned ? (
                      <span
                        className={styles.groupStatic}
                        {...tooltipTrigger(
                          category.purpose
                            ? `${category.purpose}. Pinned open in REGULATION, under DIRECTORY`
                            : 'Pinned open in REGULATION, under DIRECTORY'
                        )}
                      >
                        <span className={styles.groupLabel}>{category.label}</span>
                        <span className={styles.groupRule} aria-hidden="true" />
                        <PinGlyph />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.groupToggle}
                        onClick={() => toggleGroup(category.id)}
                        aria-expanded={shown}
                        {...(category.purpose ? tooltipTrigger(category.purpose) : {})}
                      >
                        <span className={styles.groupLabel}>{category.label}</span>
                        {!shown && groupWaiting > 0 ? (
                          <span
                            className={styles.groupWaiting}
                            aria-label={`${groupWaiting} waiting`}
                            {...tooltipTrigger(
                              `${groupWaiting} ${groupWords(category.sections, waiting)}`
                            )}
                          />
                        ) : null}
                        <span className={styles.groupRule} aria-hidden="true" />
                        <svg
                          className={styles.groupChevron}
                          data-open={shown || undefined}
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
                    )}
                  </h2>

                  <AnimatePresence initial={false}>
                    {shown ? (
                      <motion.ul
                        key="list"
                        className={styles.list}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={animating ? sheetResizeTransition : { duration: 0 }}
                      >
                        {category.sections.map((section) => row(section, 'rail-marker'))}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </section>
              )
            })}
          </>
        )}
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

/** The mark on a pinned heading: a pushpin, small. */
function PinGlyph(): ReactNode {
  return (
    <svg
      className={styles.pinGlyph}
      viewBox="0 0 12 12"
      width="10"
      height="10"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M4.2 1.6h3.6l-.5 3.1 1.6 1.6H3.1l1.6-1.6-.5-3.1Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="6" y1="6.4" x2="6" y2="10.4" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
