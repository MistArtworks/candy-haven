import { useId, type ReactNode } from 'react'
import styles from './Slider.module.scss'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Formatted current value, set at the end of the label row. */
  readout?: ReactNode
  /** Secondary line beneath the track. */
  hint?: ReactNode
  disabled?: boolean
  /**
   * `inline` keeps the compact fixed-width track used in Regulation's control
   * column; `full` fills its container, for panels that lay controls out in a
   * single stack.
   */
  width?: 'full' | 'inline'
  className?: string
}

/**
 * The console's continuous control.
 *
 * Lifted verbatim from Regulation's grain control, which is the house
 * treatment: a 2px concrete rail with a rectangular alabaster slab for a thumb.
 * It reads as a fader on an instrument panel — square, mechanical, no rounded
 * capsule and no browser `accent-color`, which would paint a coloured pill
 * outside the locked palette.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  readout,
  hint,
  disabled = false,
  width = 'full',
  className
}: SliderProps): ReactNode {
  const id = useId()

  return (
    <div className={[styles.control, styles[width], className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {readout ? <span className={styles.readout}>{readout}</span> : null}
      </div>

      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}
