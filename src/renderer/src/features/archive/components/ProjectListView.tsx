import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { ProjectSummary } from '@shared/domain/projects'
import { PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import { formatBytes } from '@renderer/lib/format'
import { StageBadge } from './StageBadge'
import { formatKey, formatRelativeDay, formatTempo } from '../lib/present'
import styles from './ProjectListView.module.scss'

export interface RegisterViewProps {
  projects: readonly ProjectSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  /**
   * Supplied only while the folder browser is on screen. Its presence is what
   * makes a project draggable — filing is meaningless in the derived lenses,
   * where there are no shelves to drop onto.
   */
  onProjectDragStart?: (event: DragEvent<HTMLElement>, project: ProjectSummary) => void
  onProjectMenu?: (event: MouseEvent<HTMLElement>, project: ProjectSummary) => void
  /**
   * Toggles the mark from the row itself.
   *
   * The diamond used to be decoration here — drawn when a project was already a
   * favourite, and settable only from the context menu or from a tile. Two
   * views of one register disagreeing about which gestures exist is the kind of
   * thing that makes an interface feel arbitrary, so the ledger gets the same
   * control the tiles have.
   */
  onToggleFavourite?: (id: string) => void
}

/**
 * The ledger.
 *
 * A register of an institution's holdings: numbered rows, aligned figures,
 * every column a fact. Figures are tabular-numeric so the eye can compare down
 * a column without the digits shifting — the reason to have this view at all
 * rather than only cards.
 */
export function ProjectListView({
  projects,
  selectedId,
  onSelect,
  onProjectDragStart,
  onProjectMenu,
  onToggleFavourite
}: RegisterViewProps): ReactNode {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.numeric}>
              ##
            </th>
            <th scope="col">Name</th>
            <th scope="col">Stage</th>
            <th scope="col" className={styles.numeric}>
              BPM
            </th>
            <th scope="col">Key</th>
            <th scope="col" className={styles.numeric}>
              Trk
            </th>
            <th scope="col" className={styles.numeric}>
              Rev
            </th>
            <th scope="col">Ready</th>
            <th scope="col">Touched</th>
            <th scope="col" className={styles.numeric}>
              Size
            </th>
            <th scope="col" className={styles.pinCell}>
              <span className={styles.headHidden}>Favourite</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, index) => (
            <tr
              key={project.id}
              className={styles.row}
              data-selected={project.id === selectedId || undefined}
              data-missing={project.missing || undefined}
              tabIndex={0}
              role="button"
              draggable={onProjectDragStart !== undefined}
              onDragStart={(event) => onProjectDragStart?.(event, project)}
              onContextMenu={(event) => onProjectMenu?.(event, project)}
              onClick={() => onSelect(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(project.id)
                }
              }}
            >
              <td className={styles.numeric}>
                <span className={styles.index}>{String(index + 1).padStart(3, '0')}</span>
              </td>

              <td className={styles.nameCell}>
                <span className={styles.name}>{project.name}</span>
                <span className={styles.sub}>
                  {/* The category replaces the artist line the register used to
                      carry. An artist name was the same on every row of a solo
                      producer's library; what a track *is* differs. */}
                  <span className={styles.artist}>{PROJECT_CATEGORY_LABEL[project.category]}</span>
                  {project.pinnedNote ? (
                    <span className={styles.note}>{project.pinnedNote}</span>
                  ) : null}
                </span>
              </td>

              <td>
                <StageBadge stage={project.stage} describe />
              </td>

              <td className={styles.numeric}>{formatTempo(project.tempo)}</td>

              <td className={styles.mono}>{formatKey(project.key)}</td>

              <td className={styles.numeric}>{project.trackCount || '—'}</td>

              <td className={styles.numeric}>{project.revisionCount || '—'}</td>

              <td>
                <span className={styles.readiness}>
                  {project.readiness.met}/{project.readiness.total}
                </span>
              </td>

              <td className={styles.mono}>{formatRelativeDay(project.lastTouchedAt)}</td>

              <td className={styles.numeric}>{formatBytes(project.sizeBytes)}</td>

              {/* The mark ends the row rather than heading the name.
                  In front of the name it pushed the one column anybody reads
                  down the page out of alignment, and it sat where the eye
                  starts a row — a per-row control belongs where a row's
                  controls belong, at the end. It also matches the tiles, which
                  carry the same diamond in their top-right corner. */}
              <td className={styles.pinCell}>
                {onToggleFavourite ? (
                  <button
                    type="button"
                    className={styles.pin}
                    data-on={project.favourite || undefined}
                    aria-pressed={project.favourite}
                    aria-label={project.favourite ? 'Remove favourite' : 'Favourite'}
                    title={project.favourite ? 'Remove favourite' : 'Favourite'}
                    onClick={(event) => {
                      // The whole row opens the dossier. Without this, marking
                      // a favourite would also open it.
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
