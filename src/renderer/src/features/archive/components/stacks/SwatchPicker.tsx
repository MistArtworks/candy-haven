import { useState, type CSSProperties, type ReactNode } from 'react'
import { FOLDER_SWATCHES, isHexColour, normaliseHex } from '@shared/domain/stacks.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import styles from './stacks.module.scss'

export interface SwatchPickerProps {
  value: string
  onChange: (colour: string) => void
  /** Names the thing being coloured, for the group's accessible label. */
  subject?: string
}

/**
 * Colour selection for a folder, a project or a volume.
 *
 * Fifteen presets from the world's own materials, plus a colour well and a hex
 * field for anything else. **What the operator picks is what gets stored** —
 * exactly, to the byte.
 *
 * That is a reversal worth recording. This component used to run every custom
 * colour through a `clampToPalette` that folded out-of-band hues into the
 * crimson-to-gold range and capped saturation, on the reasoning that the brief
 * permits no sixth colour anywhere in the interface. It previewed the clamped
 * result live, so it was at least honest about it.
 *
 * It was removed on the operator's instruction. The argument that carried:
 * these swatches are a personal index of a personal library, and an index that
 * silently rewrites its own keys is worse than one that admits a green. The
 * presets remain the one-click answer for anyone who wants the house palette,
 * and the brief still governs the chrome — crimson is still the only saturated
 * colour the application itself draws with.
 */
export function SwatchPicker({
  value,
  onChange,
  subject = 'Folder'
}: SwatchPickerProps): ReactNode {
  const [hex, setHex] = useState('')

  const typed = hex.trim()
  const valid = isHexColour(typed)
  // Case normalisation only. `#FFAA00` and `#ffaa00` are the same colour, and
  // matching them lets the preset row light up for a hand-typed swatch.
  const resolved = valid ? normaliseHex(typed) : null
  const selected = normaliseHex(value)

  const apply = (colour: string): void => {
    onChange(normaliseHex(colour))
    setHex('')
  }

  return (
    <div className={styles.picker}>
      <span className={styles.pickerLabel}>Colour</span>

      <div className={styles.swatchGrid} role="group" aria-label={`${subject} colour`}>
        {FOLDER_SWATCHES.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            className={styles.swatch}
            style={{ '--swatch': swatch.hex } as CSSProperties}
            data-selected={selected === swatch.hex.toLowerCase() || undefined}
            aria-pressed={selected === swatch.hex.toLowerCase()}
            title={swatch.label}
            aria-label={swatch.label}
            onClick={() => apply(swatch.hex)}
          />
        ))}
      </div>

      {/*
        Named, because it used to be the sixteenth tile in the grid above and
        nobody could tell. It commits on change: a native picker has its own OK
        button, and asking for a second confirmation would be one click too many.
      */}
      <label className={styles.swatchWell} style={{ '--swatch': selected } as CSSProperties}>
        <span className={styles.swatchWellChip} aria-hidden="true" />
        <span className={styles.swatchWellLabel}>Pick a custom colour</span>
        <input
          type="color"
          aria-label="Pick a custom colour"
          value={selected}
          onChange={(event) => apply(event.target.value)}
        />
      </label>

      <div className={styles.hexRow}>
        <TextInput
          className={styles.hexField}
          label="Or paste a hex value"
          value={hex}
          onChange={setHex}
          placeholder="#7a1e1a"
          mono
          maxLength={7}
          hint="Six-digit hex, stored exactly as entered."
        />

        <div className={styles.hexPreview}>
          <span
            className={styles.hexChip}
            style={{ '--folder-colour': resolved ?? selected } as CSSProperties}
            aria-hidden="true"
          />
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              if (resolved) apply(resolved)
            }}
          >
            Use
          </Button>
        </div>
      </div>
    </div>
  )
}
