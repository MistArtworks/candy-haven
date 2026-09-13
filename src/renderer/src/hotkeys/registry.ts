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
   * someone naming a project is worse than no shortcut.
   *
   * **"Anything with Ctrl" is not the test**, which is what this note used to
   * say and what it cost: `Ctrl+Backspace` is delete-the-previous-word in every
   * text field on this platform, and three overlays had it bound to *clear
   * everything* with this flag set. Deleting a word while filing an entry wiped
   * the roll. `Ctrl+A`, `Ctrl+Z`, `Ctrl+←` and `Ctrl+Home` are the same story.
   *
   * Those chords are now refused outright while a field has focus — see
   * `ownedByTheField` — so this flag can no longer take one. What it is for is
   * the submit-shaped chord an operator wants *without leaving the field*:
   * `Ctrl+Enter` to put the question they have just typed.
   *
   * Destructive actions should not set it at all. Somebody in a text field is
   * not trying to clear the board, and the one time they appear to be, they
   * have made a mistake this flag would help them make.
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

/**
 * Chords a text field owns, whatever a binding claims.
 *
 * These are the editing gestures the platform gives every input on the system.
 * A shortcut that shadows one does not merely fail to fire in the field — it
 * *replaces* an action the operator's hands already know, which is far worse
 * than a shortcut that does nothing: they get a result they did not ask for
 * from a keystroke they did not think about.
 *
 * Enforced in the dispatcher rather than left to each declaration, because the
 * declaration is exactly where it was got wrong. A binding may still claim one
 * of these — it will simply not fire while a field has focus, and will work
 * everywhere else.
 */
const EDITING_CHORDS: ReadonlySet<string> = new Set([
  // Deleting by word.
  'ctrl+backspace',
  'ctrl+delete',
  // The clipboard, selection and history.
  'ctrl+a',
  'ctrl+c',
  'ctrl+v',
  'ctrl+x',
  'ctrl+z',
  'ctrl+y',
  'ctrl+shift+z',
  // Moving and selecting by word and to the ends.
  'ctrl+arrowleft',
  'ctrl+arrowright',
  'ctrl+shift+arrowleft',
  'ctrl+shift+arrowright',
  'ctrl+home',
  'ctrl+end',
  'ctrl+shift+home',
  'ctrl+shift+end'
])

/** Whether a field with focus has the stronger claim on this chord. */
export function ownedByTheField(chord: string): boolean {
  return EDITING_CHORDS.has(normaliseChord(chord))
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
