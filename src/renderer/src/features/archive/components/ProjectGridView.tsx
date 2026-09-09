import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { formatBytes } from '@renderer/lib/format'
import { gridVariants, panelVariants } from '@renderer/motion/transitions'
import { Artwork } from './Artwork'
import { StageBadge } from './StageBadge'
import type { RegisterViewProps } from './ProjectListView'
import { formatIsoDate } from '@renderer/lib/format'
import { formatKey, formatRelativeDay, formatTempo } from '../lib/present'
import styles from './ProjectGridView.module.scss'

/**
 * The plate view.
 *
 * Where the ledger answers "what do I have", this answers "what does it look
 * like" — cover art at a size worth judging, with the figures that matter
 * beneath. Cards carry the same facts as the table rows; only the emphasis
 * changes.
 */
export function ProjectGridView({ projects, selectedId, onSelect }: RegisterViewProps): ReactNode {
  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      {projects.map((project) => (
        <motion.button
          key={project.id}
          type="button"
          variants={panelVariants}
          className={styles.card}
          data-selected={project.id === selectedId || undefined}
          data-missing={project.missing || undefined}
          onClick={() => onSelect(project.id)}
        >
          <Artwork
            path={project.coverPath}
            width={360}
            alt={`Cover art for ${project.name}`}
            className={styles.cover}
          />

          <div className={styles.body}>
            <div className={styles.head}>
              <span className={styles.name}>
                {project.favourite ? <span className={styles.pin}>◆</span> : null}
                {project.name}
              </span>
              <StageBadge stage={project.stage} describe />
            </div>

            {project.primaryArtist ? (
              <span className={styles.artist}>{project.primaryArtist}</span>
            ) : null}

            <dl className={styles.figures}>
              <div>
                <dt>BPM</dt>
                <dd>{formatTempo(project.tempo)}</dd>
              </div>
              <div>
                <dt>Key</dt>
                <dd>{formatKey(project.key, true)}</dd>
              </div>
              <div>
                <dt>Rev</dt>
                <dd>{project.revisionCount || '—'}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(project.sizeBytes)}</dd>
              </div>
            </dl>

            {/*
              The package meter is the card's one piece of state: filled ticks
              for requirements met. Shown as a count as well, because a bar
              alone does not say what is missing.
            */}
            <div className={styles.package}>
              <span className={styles.packageLabel}>Package</span>
              <span className={styles.ticks} aria-hidden="true">
                {Array.from({ length: project.readiness.total }, (_, index) => (
                  <span
                    key={index}
                    className={styles.tick}
                    data-met={index < project.readiness.met || undefined}
                  />
                ))}
              </span>
              <span className={styles.packageCount}>
                {project.readiness.met}/{project.readiness.total}
              </span>
            </div>

            <div className={styles.footer}>
              {project.releaseDate ? (
                <span className={styles.release}>{formatIsoDate(project.releaseDate)}</span>
              ) : (
                <span className={styles.touched}>
                  Touched {formatRelativeDay(project.lastTouchedAt)}
                </span>
              )}

              {project.missingSampleCount > 0 ? (
                <span className={styles.warning}>
                  {project.missingSampleCount} missing sample
                  {project.missingSampleCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>

            {project.tags.length > 0 ? (
              <div className={styles.tags}>
                {project.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
                {project.tags.length > 4 ? (
                  <span className={styles.tagMore}>+{project.tags.length - 4}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.button>
      ))}
    </motion.div>
  )
}
