import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref
} from 'react'
import { daysInMonth, toIsoDate } from '@shared/domain/calendar.constants'
import { usePanelAnchor } from '@renderer/hooks/usePanelAnchor'
import { Calendar } from './Calendar'
import { Portal } from './Portal'
import styles from './Input.module.scss'

/**
 * Text entry controls.
 *
 * The console had only readouts and switches until now; the project registry is
 * the first department where the operator authors data rather than adjusts it.
 * These follow the same rules as the rest of the design system — square
 * corners, institutional labels above the control — so a form reads as a filed
 * record rather than as a web form dropped into the shell.
 *
 * A field is **ruled, not boxed**: the value sits on the surface with one
 * hairline under it, which is `Field` — the read primitive — made writable.
 * See `%entry` for why that replaced the sunken slot these started as.
 */

interface ControlShellProps {
  label: string
  htmlFor?: string
  hint?: string
  /** Right-aligned slot in the label row: counts, units, inline actions. */
  aside?: ReactNode
  /** Reddens the hint, for when it is a refusal rather than a note. */
  invalid?: boolean
  /** `gutter` puts the label in a fixed left column. See `.gutter`. */
  layout?: 'stacked' | 'gutter'
  children: ReactNode
  className?: string
}

function ControlShell({
  label,
  htmlFor,
  hint,
  aside,
  invalid = false,
  layout = 'stacked',
  children,
  className
}: ControlShellProps): ReactNode {
  return (
    <div
      className={[styles.control, layout === 'gutter' ? styles.gutter : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
        {aside ? <span className={styles.aside}>{aside}</span> : null}
      </div>
      {children}
      {hint ? (
        <p className={`${styles.hint} ${invalid ? styles.hintInvalid : ''}`}>{hint}</p>
      ) : null}
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
  /** Masks the entry. Also stops the field being read by autofill heuristics. */
  password?: boolean
  /**
   * Commits on Enter.
   *
   * Set only where the field *is* the form — a lone password or a search — and
   * a keyboard-driven operator should not have to reach for a button. A field
   * that carries this also marks itself `data-enter="own"`, so a dialog binding
   * Enter to its own commit leaves this one alone; see `useDialogKeys`.
   */
  onEnter?: () => void
  maxLength?: number
  disabled?: boolean
  /**
   * The value has been refused, so the rule reddens with the hint.
   *
   * Additive and defaulted, because the alternative every caller reached for
   * was passing a `hint` and leaving the field itself looking correct.
   */
  invalid?: boolean
  /** `lg` sets the field in the display face. One per form, at most. */
  size?: 'md' | 'lg'
  /** `gutter` puts the label in a fixed left column beside the value. */
  layout?: 'stacked' | 'gutter'
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
  password = false,
  onEnter,
  maxLength,
  disabled = false,
  invalid = false,
  size = 'md',
  layout = 'stacked',
  className
}: TextInputProps): ReactNode {
  const id = useId()

  return (
    <ControlShell
      label={label}
      htmlFor={id}
      hint={hint}
      aside={aside}
      invalid={invalid}
      layout={layout}
      className={className}
    >
      <input
        id={id}
        type={password ? 'password' : 'text'}
        className={[
          styles.input,
          mono || password ? styles.mono : '',
          size === 'lg' ? styles.lg : '',
          invalid ? styles.invalid : ''
        ]
          .filter(Boolean)
          .join(' ')}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        data-enter={onEnter ? 'own' : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== 'Enter' || !onEnter) return
          event.preventDefault()
          onEnter()
        }}
      />
    </ControlShell>
  )
}

export interface TextAreaProps extends Omit<TextInputProps, 'mono' | 'size'> {
  rows?: number
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  aside,
  rows = 3,
  maxLength,
  disabled = false,
  invalid = false,
  layout = 'stacked',
  className
}: TextAreaProps): ReactNode {
  const id = useId()

  return (
    <ControlShell
      label={label}
      htmlFor={id}
      hint={hint}
      aside={aside}
      invalid={invalid}
      layout={layout}
      className={className}
    >
      <textarea
        id={id}
        className={`${styles.textarea} ${invalid ? styles.invalid : ''}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
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
  invalid?: boolean
  layout?: 'stacked' | 'gutter'
  /** Offers CLEAR in the picker. Only where an empty date means something. */
  clearable?: boolean
  className?: string
}

/** Roughly what the panel wants, for deciding which way it opens. */
const CALENDAR_HEIGHT = 300

/** A real day, not merely ten characters in the right shape. */
function parseTyped(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null

  return toIsoDate(year, month, day)
}

/**
 * A date: typed, or picked from a month drawn in the document.
 *
 * ## Why this is not `input[type=date]` any more
 *
 * It was, and the field's chrome was made ours in D27 — but pressing it still
 * opened **Chromium's** picker, which is drawn outside the page where no
 * stylesheet reaches it, and which arrives on Windows with a system-blue
 * selection. The brief allows exactly one saturated colour and it is crimson.
 * `Select` was written for the same reason about the native `<select>` popup;
 * this is that answer applied to dates.
 *
 * ## Typing survives
 *
 * The one genuine merit of the native control is that a date can be entered
 * without reaching for the mouse, so the field is still a real text input:
 * ISO, monospace, committed on blur or Enter. A value that is not a real day
 * is **kept on screen and refused** with a reason rather than silently
 * dropped — the same commit model `DistributionEditor` uses.
 *
 * ISO rather than `19 SEP 2026` because it is what the register writes
 * everywhere else, it sorts, and it is unambiguous half-typed.
 *
 * ## The mark is a button, and that is load-bearing
 *
 * `fieldset[disabled]` locks the read-only release sheet (D24) and reaches
 * only form-associated elements. A `div` with a role would stay live inside a
 * locked record; a `button` does not.
 */
export function DateInput({
  label,
  value,
  onChange,
  hint,
  aside,
  disabled = false,
  invalid = false,
  layout = 'stacked',
  clearable = true,
  className
}: DateInputProps): ReactNode {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [refused, setRefused] = useState(false)
  const held = useRef(false)

  const { triggerRef, panelRef, position, close } = usePanelAnchor(open, CALENDAR_HEIGHT, () =>
    setOpen(false)
  )

  // The stored value wins whenever it changes underneath, unless the operator
  // is mid-edit — the ownership rule `useEchoedText` documents.
  useEffect(() => {
    if (held.current) return
    setDraft(value)
    setRefused(false)
  }, [value])

  const commitTyped = (): void => {
    const next = draft.trim()
    if (next === value) return

    if (!next) {
      setRefused(false)
      onChange('')
      return
    }

    const parsed = parseTyped(next)
    if (!parsed) {
      setRefused(true)
      return
    }

    setRefused(false)
    onChange(parsed)
  }

  const pick = (iso: string): void => {
    setRefused(false)
    setDraft(iso)
    onChange(iso)
    close()
  }

  return (
    <ControlShell
      label={label}
      htmlFor={id}
      hint={refused ? 'That is not a real date. Use YYYY-MM-DD.' : hint}
      aside={aside}
      invalid={invalid || refused}
      layout={layout}
      className={className}
    >
      <span className={styles.dateWrap}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className={[styles.input, styles.mono, styles.date, invalid || refused ? styles.invalid : '']
            .filter(Boolean)
            .join(' ')}
          value={draft}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            held.current = true
          }}
          onBlur={() => {
            held.current = false
            commitTyped()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitTyped()
            }
          }}
        />

        <button
          ref={triggerRef}
          type="button"
          className={styles.dateMark}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Choose a date"
          data-open={open || undefined}
          onClick={() => setOpen((was) => !was)}
        >
          ◆
        </button>
      </span>

      {open && position ? (
        <Portal>
          <div
            ref={panelRef as React.RefObject<HTMLDivElement>}
            className={styles.datePanel}
            style={position}
          >
            <Calendar
              value={value}
              onChange={pick}
              onDismiss={close}
              clearable={clearable}
            />
          </div>
        </Portal>
      ) : null}
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
  placeholder = 'Search the register',
  inputRef
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /**
   * Handed out so a shortcut can put the caret here.
   *
   * A search field is the one control a keyboard-driven page has to be able to
   * reach without the mouse, and threading the ref is honest about who owns the
   * element — the alternative was a `document.querySelector` from the page,
   * which works right up until there are two search fields on screen.
   */
  inputRef?: Ref<HTMLInputElement>
}): ReactNode {
  return (
    <div className={styles.search}>
      <span className={styles.searchGlyph} aria-hidden="true" />
      <input
        ref={inputRef}
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
