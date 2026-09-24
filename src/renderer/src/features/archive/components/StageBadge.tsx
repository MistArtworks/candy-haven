import type { ReactNode } from 'react'
import type { ProjectStage } from '@shared/domain/projects'
import { getStage } from '@shared/domain/projects.constants'
import { tooltipTrigger } from '@renderer/lib/tooltip'
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
  /*
   * TRACK READY is gold again, and RELEASED takes the crimson back.
   *
   * It held `live` for one release, while it ended the pipeline and there was
   * nothing beyond it to be approaching. RELEASED now sits after it, so the
   * original assignment is the right one: gold for work awaiting release,
   * crimson for the one stage that is genuinely out in the world.
   *
   * This is the palette rule doing its job rather than a preference. Crimson
   * is the only saturated colour in the console and it is reserved for live
   * state — a register where the second-to-last stage wore it would spend
   * most of its rows shouting.
   */
  ready: 'approaching',
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
      {...tooltipTrigger(describe ? definition.purpose : '')}
    >
      {definition.label}
    </span>
  )
}
