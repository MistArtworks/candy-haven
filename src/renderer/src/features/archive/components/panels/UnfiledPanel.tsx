import { useMemo, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import type { ProjectQuery, ProjectSummary } from '@shared/domain/projects'
import { PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { formatBytes } from '@renderer/lib/format'
import { formatRelativeDay } from '../../lib/present'
import styles from './UnfiledPanel.module.scss'

export interface UnfiledPanelProps {
  onSelect: (id: string) => void
  onProjectDragStart: (event: DragEvent<HTMLElement>, project: ProjectSummary) => void
  onProjectMenu: (event: MouseEvent<HTMLElement>, project: ProjectSummary) => void
  /** True while a scan is walking; dragging during one is refused by the service. */
  disabled?: boolean
}

/**
 * Everything found but not yet filed — the staging strip beside the shelves.
 *
 * This panel exists because of a specific failure. The unfiled projects used to
 * be shown in the register *underneath* the folder tiles, which meant that the
 * moment the operator opened a genre to drag something into it, the register
 * re-filtered to "what is already in this genre" — usually nothing — and the
 * list they were dragging *from* vanished. There was no way to have a
 * destination and a source on screen at once.
 *
 * So it is its own panel, and it deliberately ignores the lens, the folder
 * being browsed and every filter in the control strip. It shows the same thing
 * no matter where the operator has navigated to, which is the entire point:
 * navigate on the left, drag from the right.
 *
 * Its query is its own for the same reason — the register's query changes as
 * the operator types in the search box, and "what is unfiled" must not.
 */
export function UnfiledPanel({
  onSelect,
  onProjectDragStart,
  onProjectMenu,
  disabled = false
}: UnfiledPanelProps): ReactNode {
  const query = useMemo<ProjectQuery>(() => ({ folderId: null, sort: 'recent' }), [])
  const { data, isLoading } = useProjectRegistry(query)

  const unfiled = data?.projects ?? []

  if (isLoading) return <p className={styles.empty}>Reading the register…</p>

  if (unfiled.length === 0) {
    return (
      <div className={styles.stack}>
        <p className={styles.empty}>Every project is filed.</p>
        <p className={styles.hint}>
          Anything the scan finds outside the archive appears here until you put it on a shelf. Add
          the folders your projects already live in from the INDEXING panel.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>
        Drag onto a genre or folder on the left. The whole project folder moves — set, samples,
        backups and all. The UNFILED lens shows the same list full width.
      </p>

      <div className={styles.list}>
        {unfiled.map((project) => (
          <article
            key={project.id}
            className={styles.row}
            draggable={!disabled}
            data-missing={project.missing || undefined}
            title={project.path}
            onDragStart={(event) => onProjectDragStart(event, project)}
            onContextMenu={(event) => onProjectMenu(event, project)}
          >
            {/*
              The grip is decorative but load-bearing: a row that can be dragged
              has to look like one, and the cursor alone does not say so until
              the operator is already hovering it.
            */}
            <span className={styles.grip} aria-hidden="true">
              ⠿
            </span>

            <button type="button" className={styles.name} onClick={() => onSelect(project.id)}>
              {project.favourite ? <span className={styles.pin}>◆</span> : null}
              {project.name}
            </button>

            <span className={styles.meta}>
              <span className={styles.category}>{PROJECT_CATEGORY_LABEL[project.category]}</span>
              <span className={styles.figure}>{formatBytes(project.sizeBytes)}</span>
              <span className={styles.figure}>{formatRelativeDay(project.lastTouchedAt)}</span>
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
