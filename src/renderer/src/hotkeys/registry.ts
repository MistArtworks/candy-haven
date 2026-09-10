/**
 * Keyboard shortcuts: what a binding is, and how a keystroke matches one.
 *
 * Zod-free and React-free so both the provider and the cheatsheet can read it.
 */

export interface Hotkey {
  /**
   * The chord, written as `ctrl+shift+k`.
   *
   * Modifiers in a fixed order — `ctrl`, `alt`, `shift`, `meta` — then the key.
   * Normalised on both sides of the comparison, so the order in a declaration
   * only affects how it reads here.
   */
  chord: string
  /** What it does, in the imperative. Shown in the cheatsheet. */
  label: string
  /** Cheatsheet heading. Group by department, or "Global". */
  group: string
  run: () => void
  /**
   * Fire even while a text field has focus.
   *
   * Off by default and rarely right. A shortcut that steals a keystroke from
   * someone naming a project is worse than no shortcut, so only chords a text
   * field could never want — anything with Ctrl, or Escape — should set this.
   */
  whileTyping?: boolean
  /** Registered but inert, and shown greyed. For a control that is unavailable. */
  disabled?: boolean
}

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const

/**
 * Canonical form of a chord string, so `Shift+Ctrl+K` and `ctrl+shift+k` are
 * the same binding.
 */
export function normaliseChord(chord: string): string {
  const parts = chord
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier))
  const key = parts.find((part) => !MODIFIER_ORDER.includes(part as never)) ?? ''

  return [...modifiers, key].join('+')
}

/**
 * The chord a keyboard event represents.
 *
 * `event.key` rather than `event.code`, so the binding follows the character
 * the operator actually typed rather than a physical position — which matters
 * the moment anyone uses a layout that is not US QWERTY.
 */
export function chordOf(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  if (event.metaKey) parts.push('meta')

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  parts.push(key)

  return parts.join('+')
}

/** True when the event originated somewhere that owns the keyboard. */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false

  const tag = element.tagName
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true
  )
}

const KEY_LABEL: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Win',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'Esc',
  enter: 'Enter',
  delete: 'Del',
  backspace: 'Backspace',
  ' ': 'Space',
  '/': '/'
}

/** A chord as a list of key caps, for rendering. */
export function chordKeys(chord: string): string[] {
  return normaliseChord(chord)
    .split('+')
    .map((part) => KEY_LABEL[part] ?? (part.length === 1 ? part.toUpperCase() : part))
}
