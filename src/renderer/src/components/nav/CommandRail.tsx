import type { ReactNode } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import { SECTIONS, getSectionGroups } from '@shared/domain/navigation'
import { APP_SUBTITLE } from '@shared/constants'
import { formatIndex } from '@renderer/lib/format'
import { useSystemStore, selectArchive, selectUpdate } from '@renderer/app/store/system.store'
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
export function CommandRail(): ReactNode {
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
  const commissioned = SECTIONS.filter((section) => section.implemented).length
  const groups = getSectionGroups()

  return (
    <nav className={styles.rail} aria-label="Sections">
      <div className={styles.top}>
        {/* Directory masthead — gives the list a header rule to sit under,
            matching how every panel in the console is titled. */}
        <header className={styles.masthead}>
          <span className={styles.mastheadLabel}>Directory</span>
          <span className={styles.mastheadRule} aria-hidden="true" />
          <span className={styles.mastheadCount}>
            {formatIndex(commissioned)}/{formatIndex(SECTIONS.length)}
          </span>
        </header>

        {groups.map((group) => (
          <section key={group.definition.id} className={styles.group}>
            {/* The division heading is a rule with a word on it — the same
                furniture as the masthead above, one order quieter. */}
            <h2 className={styles.groupHeading} title={group.definition.purpose}>
              <span className={styles.groupLabel}>{group.definition.label}</span>
              <span className={styles.groupRule} aria-hidden="true" />
            </h2>

            <ul className={styles.list}>
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
                          title={
                            section.implemented ? 'In service' : 'Reserved — not yet in service'
                          }
                          aria-label={section.implemented ? 'In service' : 'Reserved'}
                        />
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className={styles.footer}>
        {updateReady ? (
          <NavLink to="/regulation" className={styles.updateBadge}>
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
