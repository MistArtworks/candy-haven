import type { ReactNode } from 'react'
import type { ProjectStage } from '@shared/domain/projects'
import { PIPELINE_STAGES, getStage } from '@shared/domain/projects.constants'
import styles from './StageStrip.module.scss'

export interface StageStripProps {
  stage: ProjectStage
  busy?: boolean
  onChange: (stage: ProjectStage) => void
}

/**
 * The production pipeline, as a row you press.
 *
 * This is the third answer to "where does the stage control go", and the
 * first that stopped fighting the masthead. The first was a full-width band
 * of nine double-height cells between the header and the tabs — legible and
 * enormous, about a seventh of the sheet's height, permanently, for something
 * most visits never touch. The second was a dropdown, moved four times and
 * never once looking like it belonged: a bordered form control adrift in a
 * header that is otherwise pure typography.
 *
 * The mistake both shared was treating the stage as **chrome**. It is not —
 * it is the operator's own statement about the work, exactly like a tag or a
 * note, and it belongs where those live. So the masthead reads the stage and
 * this sets it, which is the same split the whole dossier is built on:
 * glanced at in the header, written to in OVERVIEW, detailed in RECORD.
 *
 * Sited in a panel, the band's original design costs nothing it did not earn.
 * It is on one tab instead of all three, it has a heading explaining what it
 * is, and the space it takes is space the tab has.
 *
 * What the design keeps from the first attempt:
 *
 * - **Every stage in one action.** Work does not always advance linearly and
 *   a mislabelled stage should be correctable directly, so all eight are
 *   present rather than a next/previous pair.
 * - **Position without colour.** Passed stages carry a gold underline and the
 *   current one a lifted fill, so the run reads as progress even where the
 *   accent does not register.
 * - **Gates that explain themselves.** TRACK READY is refused by the main
 *   process when no final mix and master is chosen. The cell stays live and
 *   the refusal surfaces in the dossier's notice bar, because a silently dead
 *   control teaches nothing. OVERVIEW also names what is outstanding beneath
 *   this strip, since the refusal only ever reaches the operator who tries —
 *   and the first question is "where do I choose it", not "why was I stopped".
 */
export function StageStrip({ stage, busy = false, onChange }: StageStripProps): ReactNode {
  const current = getStage(stage)

  return (
    <div className={styles.strip} role="group" aria-label="Production stage">
      {PIPELINE_STAGES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={styles.step}
          aria-pressed={stage === entry.id}
          data-current={stage === entry.id || undefined}
          data-passed={!current.offPipeline && entry.order < current.order ? true : undefined}
          title={entry.purpose}
          disabled={busy}
          onClick={() => onChange(entry.id)}
        >
          <span className={styles.index}>{String(entry.order + 1).padStart(2, '0')}</span>
          <span className={styles.label}>{entry.label}</span>
        </button>
      ))}

      {/*
        SHELVE is off the pipeline, so it sits apart from the run rather than
        at the end of it — parking a project is not the ninth thing that
        happens to it.
      */}
      <button
        type="button"
        className={`${styles.step} ${styles.shelve}`}
        aria-pressed={stage === 'shelved'}
        data-current={stage === 'shelved' || undefined}
        title={getStage('shelved').purpose}
        disabled={busy}
        onClick={() => onChange('shelved')}
      >
        <span className={styles.label}>SHELVE</span>
      </button>
    </div>
  )
}
