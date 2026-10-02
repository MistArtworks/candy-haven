import { useId, useState, type ReactNode } from 'react'
import { SWATCHES } from '@shared/planets/engine'
import { Toggle } from '@renderer/components/primitives/Toggle'
import styles from '../Lore.module.scss'

/*
 * The small controls the planet editor is built from, beside the console's
 * own Slider and Toggle: a colour (the site's palette first, then any), a
 * row of switches, and the folding sections they're grouped in.
 */

/**
 * A group of settings that folds away, so only what's being changed is
 * open. Closed, its title says what it is about and its summary what it's
 * set to, so nothing has to be opened just to be read.
 */
export function Section({
  title,
  summary,
  defaultOpen = false,
  children
}: {
  title: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={styles.fold} data-open={open || undefined}>
      <button
        type="button"
        className={styles.foldHead}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <svg
          className={styles.foldChevron}
          viewBox="0 0 10 10"
          width="10"
          height="10"
          aria-hidden="true"
        >
          <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className={styles.foldTitle}>{title}</span>
        <span className={styles.spacer} />
        {summary ? <span className={styles.foldSummary}>{summary}</span> : null}
      </button>
      {open ? (
        <div id={id} className={styles.foldBody}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

/**
 * A colour: the site's palette as swatches, and a picker for anything else.
 * The palette comes first because a planet in the site's own colours sits
 * right on its pages without anyone having to think about it.
 */
export function ColorField({
  label,
  value,
  onChange,
  disabled = false
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
}): ReactNode {
  const lower = value.toLowerCase()
  return (
    <div className={styles.colorField}>
      <div className={styles.colorRow}>
        <span className={styles.controlLabel}>{label}</span>
        <span className={styles.spacer} />
        <span className={styles.hex}>{lower}</span>
        <input
          type="color"
          className={styles.colorWell}
          value={lower}
          disabled={disabled}
          aria-label={`${label}: any colour`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className={styles.swatches} role="group" aria-label={`${label}: the site's colours`}>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className={styles.swatchButton}
            style={{ background: swatch.hex }}
            title={swatch.name}
            aria-label={swatch.name}
            data-selected={swatch.hex === lower || undefined}
            disabled={disabled}
            onClick={() => onChange(swatch.hex)}
          />
        ))}
      </div>
    </div>
  )
}

/** A row of hard-edged switches, one of them on. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
}): ReactNode {
  return (
    <div className={styles.control}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.segmented} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.segment}
            data-selected={option.value === value || undefined}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A switch with its name beside it. The console's Toggle is the switch
 * alone, named only for screen readers, because REGULATION and COLOPHON
 * set their own labels; the planet editor's settings need theirs on show.
 */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): ReactNode {
  return (
    <div className={styles.switchRow}>
      <span className={styles.controlLabel}>{label}</span>
      <Toggle label={label} checked={checked} disabled={disabled} tone="gold" onChange={onChange} />
    </div>
  )
}
