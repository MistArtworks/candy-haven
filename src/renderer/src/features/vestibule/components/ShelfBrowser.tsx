import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { ArchiveFolder } from '@shared/domain/stacks'
import { FOLDER_KIND_LABEL } from '@shared/domain/stacks.constants'
import { trailTo } from './shelf-tree'
import styles from '../VestibulePage.module.scss'

export interface ShelfBrowserProps {
  folders: readonly ArchiveFolder[]
  /** The folder currently open. Null is the top of the tree. */
  currentId: string | null
  onNavigate: (id: string | null) => void
}

/**
 * A miniature of the ARCHIVE's filing tree, for choosing where a set lands.
 *
 * The console's browser is a tile grid with drag and drop, context menus and
 * six lenses. None of that belongs in a window this size, and the question
 * being asked here is much narrower: *which shelf*. So this is a breadcrumb and
 * a list, and the folder you are standing in is the answer.
 *
 * It navigates through categories without being able to file into them.
 * `VALID_CHILD_KINDS` puts genres and artists under a category and projects
 * under those, so a category is always a place you pass through — and the
 * service refuses one outright (`refuseCategoryAsShelf`). The list stays
 * enterable and the commit is what is withheld, because hiding categories
 * would hide everything underneath them.
 */
export function ShelfBrowser({ folders, currentId, onNavigate }: ShelfBrowserProps): ReactNode {
  const trail = useMemo(() => trailTo(folders, currentId), [folders, currentId])

  const children = useMemo(
    () =>
      folders
        .filter((folder) => folder.parentId === currentId && folder.trashedAt === null)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [folders, currentId]
  )

  return (
    <div className={styles.browser}>
      <nav className={styles.trail} aria-label="Filing location">
        <button
          type="button"
          className={styles.crumb}
          onClick={() => onNavigate(null)}
          data-current={currentId === null || undefined}
        >
          ARCHIVE
        </button>
        {trail.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={styles.crumb}
            onClick={() => onNavigate(folder.id)}
            data-current={folder.id === currentId || undefined}
          >
            {folder.name}
          </button>
        ))}
      </nav>

      <ul className={styles.shelves}>
        {children.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              className={styles.shelf}
              style={{ '--folder-colour': folder.colour } as CSSProperties}
              onClick={() => onNavigate(folder.id)}
            >
              <span className={styles.shelfChip} aria-hidden="true" />
              <span className={styles.shelfName}>{folder.name}</span>
              <span className={styles.shelfKind}>{FOLDER_KIND_LABEL[folder.kind]}</span>
              <span className={styles.shelfArrow} aria-hidden="true">
                {/* Enter: a single chevron, matching the console's trail. */}
                <svg viewBox="0 0 8 12" width="8" height="12" fill="none">
                  <path
                    d="M2.5 2.5 6 6l-3.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="square"
                  />
                </svg>
              </span>
            </button>
          </li>
        ))}

        {children.length === 0 ? (
          <li className={styles.shelvesEmpty}>
            {currentId === null
              ? 'NO CATEGORIES YET. MAKE ONE IN THE CONSOLE.'
              : 'NOTHING FILED INSIDE THIS ONE.'}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
