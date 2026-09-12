import { useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import type { ProjectQuery, ProjectSummary } from '@shared/domain/projects'
import { PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { formatBytes } from '@renderer/lib/format'
import { formatRelativeDay } from '../../lib/present'
import { resolveRange } from '../../lib/marking'
import styles from './UnfiledPanel.module.scss'
import { SkeletonRows } from '@renderer/components/primitives/Skeleton'

export interface UnfiledPanelProps {
  onSelect: (id: string) => void
  onProjectDragStart: (event: DragEvent<HTMLElement>, project: ProjectSummary) => void
  onProjectMenu: (event: MouseEvent<HTMLElement>, project: ProjectSummary) => void
  /**
   * Projects picked out for a bulk move, shared with the register's own views.
   *
   * One set for the department rather than one per panel: a project marked here
   * and a project marked on a shelf are the same claim about the same thing,
   * and two sets would disagree the moment a drag started.
   */
  marked?: ReadonlySet<string>
  /** Ctrl/Cmd-click. `additive` false replaces the set with this one project. */
  onMark?: (id: string, additive: boolean) => void
  /** Shift-click: this panel resolves the span from its own order. */
  onMarkRange?: (ids: readonly string[]) => void
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
  marked,
  onMark,
  onMarkRange,
  disabled = false
}: UnfiledPanelProps): ReactNode {
  const query = useMemo<ProjectQuery>(() => ({ folderId: null, sort: 'recent' }), [])
  const { data, isLoading } = useProjectRegistry(query)
  /** Where a Shift-click measures from. The last row deliberately touched. */
  const [anchor, setAnchor] = useState<string | null>(null)

  const unfiled = data?.projects ?? []
  const ordered = unfiled.map((project) => project.id)
  const markable = onMark !== undefined && !disabled
  const markedCount = marked?.size ?? 0
  const allMarked = ordered.length > 0 && ordered.every((id) => marked?.has(id))

  /** One row's box, or a Ctrl/Shift-click on it. Shared by both gestures. */
  const mark = (id: string, shift: boolean): void => {
    if (shift && onMarkRange) {
      onMarkRange(resolveRange(ordered, anchor, id))
      return
    }
    onMark?.(id, true)
    setAnchor(id)
  }

  const toggleAll = (): void => {
    if (!onMarkRange || !onMark) return
    // Clearing goes through `onMark` one at a time rather than a bulk call, so
    // this panel needs no third handler for a case the page already covers:
    // marking an already-marked id removes it.
    if (allMarked) ordered.forEach((id) => onMark(id, true))
    else onMarkRange(ordered)
  }

  if (isLoading) return <SkeletonRows count={4} label="Reading the register" />

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

      {/*
        The marking bar. Drawn only where marking is offered, so the panel is
        unchanged anywhere this is rendered without the handlers.
      */}
      {markable ? (
        <div className={styles.selection} data-active={markedCount > 0 || undefined}>
          <button type="button" className={styles.selectAll} onClick={toggleAll}>
            {allMarked ? 'Clear all' : 'Mark all'}
          </button>

          <span className={styles.selectionHint}>
            {markedCount > 0
              ? `${markedCount} marked — drag any one onto a shelf`
              : 'Tick to mark · Ctrl-click or Shift-click for a run'}
          </span>
        </div>
      ) : null}

      <div className={styles.list} data-marking={markedCount > 0 || undefined}>
        {unfiled.map((project) => (
          <article
            key={project.id}
            className={styles.row}
            draggable={!disabled}
            data-missing={project.missing || undefined}
            data-marked={marked?.has(project.id) || undefined}
            title={project.path}
            onDragStart={(event) => onProjectDragStart(event, project)}
            onContextMenu={(event) => onProjectMenu(event, project)}
            // Ctrl or Shift anywhere on the row marks it, so the chords work
            // without having to hit the box.
            onClick={(event) => {
              if (!markable) return
              if (event.ctrlKey || event.metaKey || event.shiftKey) {
                event.preventDefault()
                mark(project.id, event.shiftKey)
              }
            }}
          >
            {markable ? (
              <button
                type="button"
                className={styles.check}
                role="checkbox"
                aria-checked={marked?.has(project.id) ?? false}
                aria-label={`Mark ${project.name}`}
                onClick={(event) => {
                  // The row is itself clickable and the name inside it is a
                  // button; without this the box would mark and then open.
                  event.stopPropagation()
                  mark(project.id, event.shiftKey)
                }}
              >
                <span className={styles.checkMark} aria-hidden="true" />
              </button>
            ) : (
              /*
                The grip is decorative but load-bearing: a row that can be
                dragged has to look like one, and the cursor alone does not say
                so until the operator is already hovering it. The box takes its
                place where marking is offered — two leading marks on one row
                would be one too many.
              */
              <span className={styles.grip} aria-hidden="true">
                ⠿
              </span>
            )}

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
