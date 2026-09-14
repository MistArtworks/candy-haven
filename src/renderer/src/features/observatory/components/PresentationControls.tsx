import type { ReactNode } from 'react'
import { PRESENTATION_LIMITS } from '@shared/domain/presentation'
import { Slider } from '@renderer/components/primitives/Slider'
import { Button } from '@renderer/components/primitives/Button'
import styles from './PresentationControls.module.scss'

/** The three knobs every overlay carries, plus whatever that overlay adds. */
export interface PresentationValues {
  scale: number
  typeScale: number
  opacity: number
}

export interface PresentationControlsProps {
  values: PresentationValues
  onChange: (patch: Partial<PresentationValues>) => void
  /** Reset, including any overlay-specific knobs the caller owns. */
  onReset: () => void
  /**
   * Whether anything has been moved, including the caller's own knobs.
   *
   * Asked of the caller rather than derived here, because only it knows about
   * its extra knobs — a page whose cover size is cranked but whose three shared
   * knobs are at rest has still been adjusted, and hiding Reset there would
   * strand it.
   */
  adjusted: boolean
  /** The overlay's own knobs, rendered beneath the shared three. */
  children?: ReactNode
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const times = (value: number): string => `${value.toFixed(2)}×`

/**
 * The presentation knobs, identical on every overlay page.
 *
 * One component rather than a block copied into each host page, so the ranges,
 * the wording and the reset behave the same everywhere — the kit already has
 * six overlays and every one of them is somebody's scene.
 *
 * Everything here is *relative*. The preset or style chosen elsewhere on the
 * page decides what the overlay looks like; these nudge it from there, which is
 * why they read in multiples rather than pixels and why Reset returns to 1.00×
 * rather than to a remembered value.
 */
export function PresentationControls({
  values,
  onChange,
  onReset,
  adjusted,
  children
}: PresentationControlsProps): ReactNode {
  return (
    <div className={styles.controls}>
      <Slider
        label="Scale"
        value={values.scale}
        min={PRESENTATION_LIMITS.scale.min}
        max={PRESENTATION_LIMITS.scale.max}
        step={PRESENTATION_LIMITS.scale.step}
        onChange={(scale) => onChange({ scale })}
        readout={times(values.scale)}
        hint="The whole layout, relative to the preset."
        width="full"
      />

      <Slider
        label="Type size"
        value={values.typeScale}
        min={PRESENTATION_LIMITS.typeScale.min}
        max={PRESENTATION_LIMITS.typeScale.max}
        step={PRESENTATION_LIMITS.typeScale.step}
        onChange={(typeScale) => onChange({ typeScale })}
        readout={times(values.typeScale)}
        hint="Text only, on top of scale. Spacing follows the type."
        width="full"
      />

      <Slider
        label="Opacity"
        value={values.opacity}
        min={PRESENTATION_LIMITS.opacity.min}
        max={PRESENTATION_LIMITS.opacity.max}
        step={PRESENTATION_LIMITS.opacity.step}
        onChange={(opacity) => onChange({ opacity })}
        readout={percent(values.opacity)}
        hint="The whole surface. Any fade the overlay does of its own still applies."
        width="full"
      />

      {children}

      <div className={styles.actions}>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={!adjusted}>
          Reset to preset
        </Button>
      </div>
    </div>
  )
}
