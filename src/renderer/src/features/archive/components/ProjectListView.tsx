import type { ReactNode } from 'react'
import type { ProjectSummary } from '@shared/domain/projects'
import { formatBytes } from '@renderer/lib/format'
import { StageBadge } from './StageBadge'
import { formatKey, formatRelativeDay, formatTempo } from '../lib/present'
import styles from './ProjectListView.module.scss'

export interface RegisterViewProps {
  projects: readonly ProjectSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * The ledger.
 *
 * A register of an institution's holdings: numbered rows, aligned figures,
 * every column a fact. Figures are tabular-numeric so the eye can compare down
 * a column without the digits shifting — the reason to have this view at all
 * rather than only cards.
 */
export function ProjectListView({ projects, selectedId, onSelect }: RegisterViewProps): ReactNode {
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
            <th scope="col">Package</th>
            <th scope="col">Touched</th>
            <th scope="col" className={styles.numeric}>
              Size
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
                <span className={styles.name}>
                  {project.favourite ? (
                    <span className={styles.pin} aria-label="Favourite">
                      ◆
                    </span>
                  ) : null}
                  {project.name}
                </span>
                {project.primaryArtist || project.pinnedNote ? (
                  <span className={styles.sub}>
                    {project.primaryArtist ? (
                      <span className={styles.artist}>{project.primaryArtist}</span>
                    ) : null}
                    {project.pinnedNote ? (
                      <span className={styles.note}>{project.pinnedNote}</span>
                    ) : null}
                  </span>
                ) : null}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
