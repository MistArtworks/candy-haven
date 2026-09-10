import { useState, type DragEvent, type ReactNode } from 'react'
import type { ProjectStage, ProjectSummary } from '@shared/domain/projects'
import { PROJECT_STAGES } from '@shared/domain/projects.constants'
import type { RegisterViewProps } from './ProjectListView'
import { formatRelativeDay, formatTempo } from '../lib/present'
import styles from './ProjectBoardView.module.scss'

export interface ProjectBoardViewProps extends RegisterViewProps {
  /** Registry-wide counts, so column headers do not change as filters narrow. */
  stageCounts: Record<ProjectStage, number>
  onStageChange: (id: string, stage: ProjectStage) => void
}

/**
 * The pipeline board.
 *
 * One column per stage, in pipeline order, with SHELVED terminating the row as
 * a recessive parking column. Dragging a card between columns *is* the stage
 * change — the field the whole department is organised around is edited by
 * moving the thing itself, which is the reason this view exists rather than a
 * third way of listing.
 *
 * Drag and drop uses the platform's own API. A library would add a dependency
 * and a gesture vocabulary for what is, here, one drag between two containers.
 */
export function ProjectBoardView({
  projects,
  selectedId,
  onSelect,
  stageCounts,
  onStageChange,
  onProjectDragStart,
  onProjectMenu,
  onToggleFavourite
}: ProjectBoardViewProps): ReactNode {
  const [dragging, setDragging] = useState<string | null>(null)
  const [hovered, setHovered] = useState<ProjectStage | null>(null)

  const onDragStart = (event: DragEvent<HTMLElement>, project: ProjectSummary): void => {
    setDragging(project.id)
    event.dataTransfer.effectAllowed = 'move'
    // A payload is required for the drop to register in Chromium even though
    // the id is also held in state.
    event.dataTransfer.setData('text/plain', project.id)

    // While the folder browser is on screen, the same card also carries the
    // filing payload — so one drag can change the stage *or* the shelf,
    // depending on which target it is released over.
    onProjectDragStart?.(event, project)
  }

  const onDrop = (event: DragEvent<HTMLElement>, stage: ProjectStage): void => {
    event.preventDefault()
    setHovered(null)
    setDragging(null)

    const id = event.dataTransfer.getData('text/plain') || dragging
    if (!id) return

    const project = projects.find((entry) => entry.id === id)
    if (!project || project.stage === stage) return

    onStageChange(id, stage)
  }

  return (
    <div className={styles.board}>
      {PROJECT_STAGES.map((stage) => {
        const column = projects.filter((project) => project.stage === stage.id)

        return (
          <section
            key={stage.id}
            className={styles.column}
            data-off-pipeline={stage.offPipeline || undefined}
            data-hovered={hovered === stage.id || undefined}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (hovered !== stage.id) setHovered(stage.id)
            }}
            onDragLeave={(event) => {
              // Only clear when the pointer actually leaves the column, not
              // when it crosses a card inside it.
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setHovered((current) => (current === stage.id ? null : current))
              }
            }}
            onDrop={(event) => onDrop(event, stage.id)}
          >
            <header className={styles.columnHead} title={stage.purpose}>
              <span className={styles.columnLabel}>{stage.label}</span>
              <span className={styles.columnCount}>{stageCounts[stage.id] ?? 0}</span>
            </header>

            <div className={styles.columnBody}>
              {column.map((project) => (
                <article
                  key={project.id}
                  className={styles.card}
                  draggable
                  role="button"
                  tabIndex={0}
                  data-selected={project.id === selectedId || undefined}
                  data-dragging={dragging === project.id || undefined}
                  onDragStart={(event) => onDragStart(event, project)}
                  onDragEnd={() => {
                    setDragging(null)
                    setHovered(null)
                  }}
                  onContextMenu={(event) => onProjectMenu?.(event, project)}
                  onClick={() => onSelect(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(project.id)
                    }
                  }}
                >
                  {/* Top-right corner, as on the tiles. In front of the name
                      it ate the two or three characters that usually tell one
                      card in a column from another. */}
                  {onToggleFavourite ? (
                    <button
                      type="button"
                      className={styles.pin}
                      data-on={project.favourite || undefined}
                      aria-pressed={project.favourite}
                      aria-label={project.favourite ? 'Remove favourite' : 'Favourite'}
                      title={project.favourite ? 'Remove favourite' : 'Favourite'}
                      onClick={(event) => {
                        // The card opens the dossier; the mark must not.
                        event.stopPropagation()
                        onToggleFavourite(project.id)
                      }}
                    >
                      ◆
                    </button>
                  ) : project.favourite ? (
                    <span className={styles.pin} data-on aria-label="Favourite">
                      ◆
                    </span>
                  ) : null}

                  <span className={styles.cardName}>{project.name}</span>

                  <div className={styles.cardMeta}>
                    <span className={styles.tempo}>{formatTempo(project.tempo)}</span>
                    {project.key ? <span className={styles.key}>{project.key.root}</span> : null}
                    <span className={styles.touched}>
                      {formatRelativeDay(project.lastTouchedAt)}
                    </span>
                  </div>

                  {/* A final master is the one fact that changes what a card
                      can do next — it is the gate on READY, SCHEDULED and
                      RELEASED — so it is the one badge worth the space. */}
                  {project.hasFinalMaster ? <span className={styles.plan}>MASTERED</span> : null}

                  {project.missingSampleCount > 0 ? (
                    <span className={styles.warning}>{project.missingSampleCount} missing</span>
                  ) : null}
                </article>
              ))}

              {column.length === 0 ? (
                <p className={styles.empty}>
                  {stage.offPipeline ? 'Nothing parked' : 'None at this stage'}
                </p>
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}
