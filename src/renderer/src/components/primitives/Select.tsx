import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { Portal } from './Portal'
import styles from './Select.module.scss'

export interface SelectChoice<T extends string> {
  value: T
  label: string
  /** Second line in the list, for options whose name is not self-explanatory. */
  hint?: string
}

export interface SelectProps<T extends string> {
  value: T
  options: readonly SelectChoice<T>[]
  onChange: (value: T) => void
  /** Accessible name. Rendered by the caller, not by this component. */
  ariaLabel: string
  /** Shown when `value` matches no option — an empty picker, usually. */
  placeholder?: string
  disabled?: boolean
  /** `inline` sheds the border so it can sit inside another bordered control. */
  variant?: 'boxed' | 'inline'
  id?: string
  className?: string
}

/** How far the list may extend before it scrolls. */
const MAX_LIST_HEIGHT = 280
const GAP = 4

/**
 * The console's dropdown.
 *
 * A native `<select>` was used until its popup was actually looked at on
 * Windows: the list is drawn by the operating system, so it arrives as a white
 * panel with a system-blue highlight. No stylesheet reaches it — `option` takes
 * a background and a colour and nothing else — which put the one saturated blue
 * in the entire application in the middle of a page whose premise is that no
 * such colour exists here.
 *
 * So the list is drawn in the document. That means re-implementing what the
 * native control gave for free, and the parts worth naming are:
 *
 *   - it is **portalled**, because a page carries a transform and a fixed
 *     element inside one resolves against the page rather than the viewport
 *     (see `Portal`);
 *   - it **flips upward** when there is not enough room below, which is why the
 *     position is measured after layout rather than guessed;
 *   - it closes on scroll rather than following the trigger. A dropdown that
 *     tracks its anchor down a scrolling page is more machinery than a dropdown
 *     warrants, and closing is what every native control does anyway.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Choose…',
  disabled = false,
  variant = 'boxed',
  id,
  className
}: SelectProps<T>): ReactNode {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.findIndex((option) => option.value === value)
  /** Which row the keyboard is on. Follows the selection when reopened. */
  const [cursor, setCursor] = useState(Math.max(selected, 0))

  const close = useCallback((): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Measured after layout, because whether the list fits below depends on how
  // many options it has.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - GAP
    const above = rect.top - GAP
    const wanted = Math.min(options.length * 30 + 8, MAX_LIST_HEIGHT)
    const flip = below < wanted && above > below

    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.min(flip ? above : below, MAX_LIST_HEIGHT),
      ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP })
    })
  }, [open, options.length])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    // Capture phase: a scroll inside any ancestor should close it, and scroll
    // does not bubble from an element that is not the document.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  const commit = (index: number): void => {
    const option = options[index]
    if (option) onChange(option.value)
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor(Math.max(selected, 0))
        setOpen(true)
      }
      return
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        setCursor((current) => Math.min(current + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setCursor((current) => Math.max(current - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setCursor(0)
        break
      case 'End':
        event.preventDefault()
        setCursor(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(cursor)
        break
    }
  }

  const current = options[selected]

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={[styles.trigger, styles[variant], className ?? ''].filter(Boolean).join(' ')}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-open={open || undefined}
        onKeyDown={onKeyDown}
        onClick={() => {
          setCursor(Math.max(selected, 0))
          setOpen((was) => !was)
        }}
      >
        <span className={styles.value} data-placeholder={current ? undefined : true}>
          {current?.label ?? placeholder}
        </span>
        <span className={styles.caret} aria-hidden="true" />
      </button>

      {open && position ? (
        <Portal>
          <ul
            ref={listRef}
            className={styles.list}
            style={position}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
          >
            {options.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  className={styles.option}
                  role="option"
                  aria-selected={option.value === value}
                  data-selected={option.value === value || undefined}
                  data-cursor={index === cursor || undefined}
                  // Pointer rather than mouse enter: the keyboard cursor and the
                  // pointer share one highlight, so moving the mouse takes it.
                  onPointerEnter={() => setCursor(index)}
                  onClick={() => commit(index)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.hint ? <span className={styles.optionHint}>{option.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Portal>
      ) : null}
    </>
  )
}
