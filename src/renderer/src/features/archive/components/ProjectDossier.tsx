import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ProjectStage } from '@shared/domain/projects'
import {
  PIPELINE_STAGES,
  evaluateReadiness,
  getStage,
  isReleaseReady
} from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { formatBytes } from '@renderer/lib/format'
import { useProject, useProjectMutations } from '@renderer/hooks/useProjects'
import { StageBadge } from './StageBadge'
import { DossierOverview } from './dossier/DossierOverview'
import { DossierFiles } from './dossier/DossierFiles'
import { DossierRelease } from './dossier/DossierRelease'
import { DossierPromotion } from './dossier/DossierPromotion'
import { DossierPlatforms } from './dossier/DossierPlatforms'
import { formatStamp } from '../lib/present'
import styles from './ProjectDossier.module.scss'

const TABS = ['overview', 'files', 'release', 'promotion', 'platforms'] as const
type DossierTab = (typeof TABS)[number]

const TAB_LABEL: Record<DossierTab, string> = {
  overview: 'OVERVIEW',
  files: 'FILES',
  release: 'RELEASE',
  promotion: 'PROMOTION',
  platforms: 'PLATFORMS'
}

export interface ProjectDossierProps {
  projectId: string
  onClose: () => void
}

/**
 * The full record for one project.
 *
 * Presented as an overlay rather than a route so the register keeps its scroll
 * position, filters and view mode — the operator moves through a shortlist of
 * projects one after another, and losing the list each time would make that
 * unusable.
 *
 * Tabbed because a complete record is genuinely large, and because it keeps the
 * single-focal-object rule intact: each tab has one panel carrying the accent
 * rather than six slabs competing across one enormous scroll.
 */
export function ProjectDossier({ projectId, onClose }: ProjectDossierProps): ReactNode {
  const { data: project, isLoading, error } = useProject(projectId)
  const mutations = useProjectMutations()
  const [tab, setTab] = useState<DossierTab>('overview')
  const [dismissed, setDismissed] = useState<string | null>(null)

  // Escape closes, as it does for any modal layer in the shell.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /*
   * A rejected edit is the interesting case here — the stage gates deliberately
   * refuse incomplete releases — so the reason is surfaced rather than
   * swallowed. Derived during render rather than copied into state by an
   * effect: the mutations already hold the error, and duplicating it would mean
   * a second render pass every time one failed.
   */
  const failure = [
    mutations.patch.error,
    mutations.addNote.error,
    mutations.saveMarketingAsset.error,
    mutations.addMarketingAsset.error
  ].find((value): value is Error => value instanceof Error) as
    (Error & { hint?: string | null }) | undefined

  const failureText = failure
    ? failure.hint
      ? `${failure.message} ${failure.hint}`
      : failure.message
    : null

  // Dismissal is remembered by message, so a repeat of the same refusal stays
  // hidden while a different one still surfaces.
  const notice = failureText && failureText !== dismissed ? failureText : null

  const setStage = (stage: ProjectStage): void => {
    setDismissed(failureText)
    mutations.patch.mutate({ id: projectId, patch: { stage } })
  }

  return (
    <motion.div
      className={styles.layer}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Project record"
    >
      {/* Backdrop click closes; the sheet stops propagation. */}
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close project record"
        onClick={onClose}
      />

      <motion.section
        className={styles.sheet}
        initial={{ opacity: 0, y: 18, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.997 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        {isLoading || !project ? (
          <div className={styles.loading}>
            {error ? (
              <p className={styles.noticeText}>{(error as Error).message}</p>
            ) : (
              <p className={styles.noticeText}>Retrieving record…</p>
            )}
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <header className={styles.header}>
              <div className={styles.identity}>
                <div className={styles.titleRow}>
                  <h2 className={styles.title}>{project.name}</h2>
                  <StageBadge stage={project.stage} size="md" describe />
                  {project.missing ? <span className={styles.missing}>FOLDER MISSING</span> : null}
                </div>

                <div className={styles.metaRow}>
                  <button
                    type="button"
                    className={styles.path}
                    title={`Open ${project.path}`}
                    onClick={() => void window.candy.shell.reveal(project.path)}
                  >
                    {project.path}
                  </button>
                  <span className={styles.metaFigure}>{formatBytes(project.sizeBytes)}</span>
                  <span className={styles.metaFigure}>
                    {project.sets.length} set{project.sets.length === 1 ? '' : 's'}
                  </span>
                  <span className={styles.metaFigure}>
                    {project.revisions.length} revision{project.revisions.length === 1 ? '' : 's'}
                  </span>
                  <span className={styles.metaFigure}>
                    Indexed {formatStamp(project.scannedAt)}
                  </span>
                </div>
              </div>

              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.favourite}
                  data-on={project.favourite || undefined}
                  aria-pressed={project.favourite}
                  aria-label="Favourite"
                  onClick={() =>
                    mutations.patch.mutate({
                      id: projectId,
                      patch: { favourite: !project.favourite }
                    })
                  }
                >
                  ◆
                </button>
                <Button size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </header>

            {/*
              The stage stepper. Every stage is reachable directly rather than
              only one step at a time: work does not always advance linearly,
              and a mislabelled stage should be correctable in one action. The
              gates on SCHEDULED and RELEASED are enforced in the main process,
              so the buttons stay live and the refusal explains itself.
            */}
            <div className={styles.stepper} role="group" aria-label="Production stage">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className={styles.step}
                  data-current={project.stage === stage.id || undefined}
                  data-passed={
                    !getStage(project.stage).offPipeline &&
                    stage.order < getStage(project.stage).order
                      ? true
                      : undefined
                  }
                  title={stage.purpose}
                  disabled={mutations.patch.isPending}
                  onClick={() => setStage(stage.id)}
                >
                  <span className={styles.stepIndex}>
                    {String(stage.order + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.stepLabel}>{stage.label}</span>
                </button>
              ))}

              <button
                type="button"
                className={`${styles.step} ${styles.shelve}`}
                data-current={project.stage === 'shelved' || undefined}
                title={getStage('shelved').purpose}
                disabled={mutations.patch.isPending}
                onClick={() => setStage('shelved')}
              >
                <span className={styles.stepLabel}>SHELVE</span>
              </button>
            </div>

            {notice ? (
              <div className={styles.notice} role="alert">
                <p className={styles.noticeText}>{notice}</p>
                <button
                  type="button"
                  className={styles.noticeClose}
                  onClick={() => setDismissed(notice)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <nav className={styles.tabs} aria-label="Record sections">
              {TABS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={styles.tab}
                  data-selected={tab === entry || undefined}
                  aria-current={tab === entry}
                  onClick={() => setTab(entry)}
                >
                  {TAB_LABEL[entry]}
                  {entry === 'release' ? (
                    <span
                      className={styles.tabBadge}
                      data-complete={isReleaseReady(project) || undefined}
                    >
                      {evaluateReadiness(project).filter((item) => item.met).length}/
                      {evaluateReadiness(project).length}
                    </span>
                  ) : null}
                  {entry === 'promotion' && project.marketing ? (
                    <span className={styles.tabBadge}>{project.marketing.assets.length}</span>
                  ) : null}
                  {entry === 'platforms' && project.distribution.liveLinks.length > 0 ? (
                    <span className={styles.tabBadge}>{project.distribution.liveLinks.length}</span>
                  ) : null}
                </button>
              ))}
            </nav>

            <div className={styles.body}>
              {tab === 'overview' ? (
                <DossierOverview project={project} mutations={mutations} />
              ) : null}
              {tab === 'files' ? <DossierFiles project={project} mutations={mutations} /> : null}
              {tab === 'release' ? (
                <DossierRelease project={project} mutations={mutations} />
              ) : null}
              {tab === 'promotion' ? (
                <DossierPromotion project={project} mutations={mutations} />
              ) : null}
              {tab === 'platforms' ? (
                <DossierPlatforms project={project} mutations={mutations} />
              ) : null}
            </div>
          </>
        )}
      </motion.section>
    </motion.div>
  )
}
