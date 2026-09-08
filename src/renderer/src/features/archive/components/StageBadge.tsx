import type { ReactNode } from 'react'
import type { ProjectStage } from '@shared/domain/projects'
import { getStage } from '@shared/domain/projects.constants'
import styles from './StageBadge.module.scss'

/**
 * Pipeline position, as a stamped field.
 *
 * Tone is assigned by what the stage *means*, not by position, so the palette
 * discipline holds: gold marks a project approaching or awaiting release,
 * crimson is reserved for RELEASED because that is genuinely live state, and
 * everything still in production is neutral. SHELVED is recessive — parked work
 * should not compete for attention with work in flight.
 */
type StageTone = 'neutral' | 'approaching' | 'live' | 'dormant'

const STAGE_TONE: Record<ProjectStage, StageTone> = {
  idea: 'neutral',
  sketch: 'neutral',
  arrangement: 'neutral',
  mix: 'neutral',
  master: 'neutral',
  ready: 'approaching',
  scheduled: 'approaching',
  released: 'live',
  shelved: 'dormant'
}

export interface StageBadgeProps {
  stage: ProjectStage
  size?: 'sm' | 'md'
  /** Renders the stage's plain-language meaning as a tooltip. */
  describe?: boolean
}

export function StageBadge({ stage, size = 'sm', describe = false }: StageBadgeProps): ReactNode {
  const definition = getStage(stage)

  return (
    <span
      className={`${styles.badge} ${styles[STAGE_TONE[stage]]} ${styles[size]}`}
      title={describe ? definition.purpose : undefined}
    >
      {definition.label}
    </span>
  )
}
