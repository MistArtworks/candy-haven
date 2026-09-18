import type { ReactNode } from 'react'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, SelectInput } from '@renderer/components/primitives/Input'
import type { DeckDial } from '../lib/deck'
import styles from './OverlayDials.module.scss'

export interface OverlayDialsProps {
  dials: readonly DeckDial[]
  /** Heading above the group. Omitted where the host panel already names it. */
  label?: string
  className?: string
}

/**
 * The handful of settings that change between segments.
 *
 * The rule that decides what appears here is on `dialsFor`, which is the thing
 * worth reading: **the bench carries what changes between segments, the
 * overlay's page carries what is set once.** Everything below is only the
 * drawing of it.
 *
 * Each kind maps to a primitive the console already has, and that is the point
 * of keeping the union to three — a magnitude is a `Slider`, a switch is a
 * `Checkbox`, a closed set is a `SelectInput`. A setting that fits none of the
 * three is not a dial, and almost certainly belongs on the overlay's page with
 * room to explain itself.
 *
 * Renders nothing at all when an overlay has no dials. Five of the eleven do
 * not, and an empty `SETTINGS` heading on five benches would read as a load
 * failure rather than as an honest absence.
 */
export function OverlayDials({ dials, label, className }: OverlayDialsProps): ReactNode {
  if (dials.length === 0) return null

  return (
    <div className={[styles.dials, className ?? ''].filter(Boolean).join(' ')}>
      {label ? <span className={styles.label}>{label}</span> : null}

      {dials.map((dial) => {
        switch (dial.kind) {
          case 'slider':
            return (
              <Slider
                key={dial.key}
                label={dial.label}
                value={dial.value}
                min={dial.min}
                max={dial.max}
                step={dial.step}
                readout={dial.readout}
                hint={dial.hint}
                disabled={dial.disabled}
                onChange={dial.commit}
                width="full"
              />
            )

          case 'toggle':
            return (
              <Checkbox
                key={dial.key}
                label={dial.label}
                checked={dial.value}
                hint={dial.hint}
                disabled={dial.disabled}
                onChange={dial.commit}
              />
            )

          case 'choice':
            return (
              <SelectInput
                key={dial.key}
                label={dial.label}
                value={dial.value}
                options={dial.options}
                hint={dial.hint}
                disabled={dial.disabled}
                onChange={dial.commit}
              />
            )
        }
      })}
    </div>
  )
}
