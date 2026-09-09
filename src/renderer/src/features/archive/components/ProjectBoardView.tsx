import { useState, type DragEvent, type ReactNode } from 'react'
import type { ProjectStage, ProjectSummary } from '@shared/domain/projects'
import { PROJECT_STAGES } from '@shared/domain/projects.constants'
import type { RegisterViewProps } from './ProjectListView'
import { formatCountdown } from '@renderer/lib/format'
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
  onStageChange
}: ProjectBoardViewProps): ReactNode {
  const [dragging, setDragging] = useState<string | null>(null)
  const [hovered, setHovered] = useState<ProjectStage | null>(null)

  const onDragStart = (event: DragEvent<HTMLElement>, project: ProjectSummary): void => {
    setDragging(project.id)
    event.dataTransfer.effectAllowed = 'move'
    // A payload is required for the drop to register in Chromium even though
    // the id is also held in state.
    event.dataTransfer.setData('text/plain', project.id)
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
                  onClick={() => onSelect(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(project.id)
                    }
                  }}
                >
                  <span className={styles.cardName}>
                    {project.favourite ? <span className={styles.pin}>◆</span> : null}
                    {project.name}
                  </span>

                  <div className={styles.cardMeta}>
                    <span className={styles.tempo}>{formatTempo(project.tempo)}</span>
                    {project.key ? <span className={styles.key}>{project.key.root}</span> : null}
                    <span className={styles.touched}>
                      {formatRelativeDay(project.lastTouchedAt)}
                    </span>
                  </div>

                  {project.releaseDate ? (
                    <span className={styles.countdown}>{formatCountdown(project.releaseDate)}</span>
                  ) : null}

                  {project.marketing ? (
                    <span className={styles.plan}>
                      PROMO {project.marketing.settled}/{project.marketing.required}
                    </span>
                  ) : null}

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
