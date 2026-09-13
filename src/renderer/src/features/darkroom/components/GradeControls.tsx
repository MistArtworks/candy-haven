import type { ReactNode } from 'react'
import type { GradeSettings } from '@shared/domain/darkroom'
import { DEFAULT_GRADE, GRADE_LIMITS } from '@shared/domain/darkroom'
import { Slider } from '@renderer/components/primitives/Slider'
import styles from '../DarkroomPage.module.scss'

export interface GradeControlsProps {
  settings: GradeSettings
  onChange: (patch: Partial<GradeSettings>) => void
}

/** Which numeric controls exist, in the order the grade applies them. */
type Knob = keyof typeof GRADE_LIMITS

const LABEL: Record<Knob, string> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  blackPoint: 'Black point',
  whitePoint: 'White point',
  gamma: 'Gamma',
  amount: 'Amount',
  saturation: 'Saturation'
}

const HINT: Partial<Record<Knob, string>> = {
  amount: 'How far towards the ramp. At nothing, the original comes through.',
  saturation: 'Applied after the map, so it pushes the ramp’s own colours.'
}

/** Formatted for reading at a glance, in the unit the control actually means. */
function readout(knob: Knob, value: number): string {
  switch (knob) {
    case 'exposure':
      return `${value > 0 ? '+' : ''}${value.toFixed(2)} EV`
    case 'contrast':
      return `${value > 0 ? '+' : ''}${Math.round(value)}`
    case 'blackPoint':
    case 'whitePoint':
    case 'amount':
      return `${Math.round(value * 100)}%`
    case 'gamma':
      return value.toFixed(2)
    case 'saturation':
      return `${Math.round(value * 100)}%`
  }
}

/**
 * The tonal controls, in the order the grade applies them.
 *
 * Ordered rather than grouped by how often they are reached for: the panel
 * reads top to bottom as the pipeline runs, so an operator who wonders why
 * their black point did nothing can see that exposure happens first.
 *
 * Double-clicking a row returns that one control to rest, which is the escape
 * hatch that makes the sliders safe to explore — the alternative is resetting
 * the whole grade to undo one experiment.
 */
export function GradeControls({ settings, onChange }: GradeControlsProps): ReactNode {
  const knobs: Knob[] = [
    'exposure',
    'blackPoint',
    'whitePoint',
    'gamma',
    'contrast',
    'saturation',
    'amount'
  ]

  return (
    <div className={styles.knobs}>
      {knobs.map((knob) => (
        <div
          key={knob}
          className={styles.knob}
          onDoubleClick={() => onChange({ [knob]: DEFAULT_GRADE[knob] } as Partial<GradeSettings>)}
          title="Double-click to reset this control"
        >
          <Slider
            label={LABEL[knob]}
            value={settings[knob]}
            min={GRADE_LIMITS[knob].min}
            max={GRADE_LIMITS[knob].max}
            step={GRADE_LIMITS[knob].step}
            width="full"
            readout={readout(knob, settings[knob])}
            hint={HINT[knob]}
            onChange={(value) => onChange({ [knob]: value } as Partial<GradeSettings>)}
          />
        </div>
      ))}
    </div>
  )
}
