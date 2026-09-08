import { useId, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Input.module.scss'

/**
 * Text entry controls.
 *
 * The console had only readouts and switches until now; the project registry is
 * the first department where the operator authors data rather than adjusts it.
 * These follow the same rules as the rest of the design system — square
 * corners, hairline borders, institutional labels above the control — so a form
 * reads as a filed record rather than as a web form dropped into the shell.
 */

interface ControlShellProps {
  label: string
  htmlFor?: string
  hint?: string
  /** Right-aligned slot in the label row: counts, units, inline actions. */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

function ControlShell({
  label,
  htmlFor,
  hint,
  aside,
  children,
  className
}: ControlShellProps): ReactNode {
  return (
    <div className={[styles.control, className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
        {aside ? <span className={styles.aside}>{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

export interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  aside?: ReactNode
  /** Monospace entry — use for identifiers like ISRC and UPC codes. */
  mono?: boolean
  maxLength?: number
  disabled?: boolean
  className?: string
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  aside,
  mono = false,
  maxLength,
  disabled = false,
  className
}: TextInputProps): ReactNode {
  const id = useId()

  return (
    <ControlShell label={label} htmlFor={id} hint={hint} aside={aside} className={className}>
      <input
        id={id}
        type="text"
        className={`${styles.input} ${mono ? styles.mono : ''}`}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </ControlShell>
  )
}

export interface TextAreaProps extends Omit<TextInputProps, 'mono'> {
  rows?: number
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  aside,
  rows = 4,
  disabled = false,
  className
}: TextAreaProps): ReactNode {
  const id = useId()

  return (
    <ControlShell label={label} htmlFor={id} hint={hint} aside={aside} className={className}>
      <textarea
        id={id}
        className={styles.textarea}
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      />
    </ControlShell>
  )
}

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectInputProps<T extends string> {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  hint?: string
  disabled?: boolean
  className?: string
}

export function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled = false,
  className
}: SelectInputProps<T>): ReactNode {
  const id = useId()

  return (
    <ControlShell label={label} htmlFor={id} hint={hint} className={className}>
      <div className={styles.selectWrap}>
        <select
          id={id}
          className={styles.select}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.selectArrow} aria-hidden="true" />
      </div>
    </ControlShell>
  )
}

export interface DateInputProps {
  label: string
  /** `YYYY-MM-DD`, or empty for unset. */
  value: string
  onChange: (value: string) => void
  hint?: string
  aside?: ReactNode
  disabled?: boolean
  className?: string
}

export function DateInput({
  label,
  value,
  onChange,
  hint,
  aside,
  disabled = false,
  className
}: DateInputProps): ReactNode {
  const id = useId()

  return (
    <ControlShell label={label} htmlFor={id} hint={hint} aside={aside} className={className}>
      <input
        id={id}
        type="date"
        className={`${styles.input} ${styles.mono} ${styles.date}`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </ControlShell>
  )
}

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}

/**
 * A filled square rather than a tick: the mark reads as a stamped field on a
 * form, which is the register's whole visual premise.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  disabled = false
}: CheckboxProps): ReactNode {
  return (
    <div className={styles.checkboxRow}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        className={styles.checkbox}
        data-checked={checked || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.checkboxMark} aria-hidden="true" />
        <span className={styles.checkboxLabel}>{label}</span>
      </button>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

export interface TagInputProps {
  label: string
  values: readonly string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  /** Existing values across the registry, offered as a datalist. */
  suggestions?: readonly string[]
}

/**
 * Chip entry for tags and featured artists.
 *
 * Commit is on Enter or comma; Backspace in an empty field removes the last
 * chip. Both are the conventions of every tag field the operator already uses,
 * and getting them wrong is more annoying than having no chips at all.
 */
export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
  suggestions
}: TagInputProps): ReactNode {
  const id = useId()
  const listId = `${id}-suggestions`
  const [draft, setDraft] = useState('')

  const commit = (raw: string): void => {
    const tag = raw.trim().replace(/,$/, '').trim()
    setDraft('')
    if (!tag) return
    if (values.some((value) => value.toLowerCase() === tag.toLowerCase())) return
    onChange([...values, tag])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft.length === 0 && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <ControlShell
      label={label}
      htmlFor={id}
      hint={hint}
      aside={values.length > 0 ? String(values.length) : undefined}
    >
      <div className={styles.chips}>
        {values.map((value) => (
          <span key={value} className={styles.chip}>
            {value}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((entry) => entry !== value))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          className={styles.chipInput}
          value={draft}
          placeholder={values.length === 0 ? placeholder : undefined}
          list={suggestions?.length ? listId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
        />
      </div>
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </ControlShell>
  )
}

/** Bare search field for toolbars — no label row, sits inline with controls. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search the register'
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}): ReactNode {
  return (
    <div className={styles.search}>
      <span className={styles.searchGlyph} aria-hidden="true" />
      <input
        type="search"
        className={styles.searchInput}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
