/**
 * THE RETICLE — the console's survey instrument, as data and arithmetic.
 *
 * Framework-free and DOM-free on purpose: everything here takes plain values,
 * so the state mapping and the two pieces of geometry can be checked without a
 * browser. The component and its hook supply the DOM; this decides what the
 * mark should be doing.
 *
 * Of the six keyword anchors in the world brief — Control, Ritual, Harmony,
 * **Surveillance**, Time, Obedience — a pointer is plainly an instrument of the
 * fourth. So it is not a blob that trails the mouse: it tracks, it acquires a
 * target, and it stamps. The geometry is `Sigil.tsx` reduced to something
 * legible at 22px — the consciousness ring, the four cardinal ticks, the focal
 * centre.
 */

// ------------------------------------------------------------------- states

export const RETICLE_STATES = [
  'idle',
  'lock',
  'text',
  'refused',
  'precision',
  'carry',
  'native'
] as const

export type ReticleState = (typeof RETICLE_STATES)[number]

/**
 * What the mark is doing in each state.
 *
 * `native` is the opt-out: the reticle hides and the operating system's own
 * cursor is handed back. It exists for regions the renderer cannot track — see
 * the title bar note in `useReticle`.
 */
export const RETICLE_PURPOSE: Record<ReticleState, string> = {
  idle: 'Tracking. Ring and cardinal ticks, oriented along travel.',
  lock: 'Target acquired. Corner brackets frame the element.',
  text: 'A line of text. The ring collapses to a caret.',
  refused: 'The element declines. Struck through, drained to concrete.',
  precision: 'A surface that wants an exact point. Gapped crosshair.',
  carry: 'Something can be picked up or is being moved. Segmented ring.',
  native: 'Out of the renderer’s reach. The system cursor is restored.'
}

/** Values `data-reticle` accepts, for the rare element that needs to override. */
export const RETICLE_OVERRIDES: readonly ReticleState[] = RETICLE_STATES

/**
 * The attribute that lifts the system-cursor hiding rule off one element.
 *
 * The instrument reads the app's own `cursor` declarations to decide what to
 * draw, and the same stylesheet overwrites every one of them with `none` to
 * hide the arrow. Left alone those two facts cancel out: the probe sees `none`
 * everywhere, and 1.11.0 shipped with the cursor hidden and nothing drawn in
 * its place.
 *
 * So `_reset.scss` exempts anything carrying this, and `useReticle` marks the
 * element it is about to measure — and its ancestors, because `cursor` inherits
 * — for the length of one synchronous read. No frame is painted in between, so
 * the arrow never reappears.
 *
 * Declared here rather than inlined at both ends because the stylesheet and the
 * hook have to agree on the string and cannot import from each other.
 */
export const CURSOR_PROBE_ATTR = 'data-cursor-probe'

// --------------------------------------------------------------- resolution

/**
 * Everything the mapping needs about the element under the pointer.
 *
 * Deliberately primitives rather than an `Element`: it is what makes the table
 * below checkable in a test that never opens a browser.
 */
export interface ReticleProbe {
  /** `getComputedStyle(element).cursor`. */
  cursor: string
  /** Lowercase tag name, e.g. `input`. */
  tagName: string
  /** Nearest `data-reticle` on the element or an ancestor, if any. */
  override?: string | null
  /** Whether the element or an ancestor carries `[data-selectable]`. */
  selectable?: boolean
}

function isOverride(value: string): value is ReticleState {
  return (RETICLE_STATES as readonly string[]).includes(value)
}

/**
 * What the mark should be, given what is under the pointer.
 *
 * **No component is annotated for this.** The state is read from the `cursor`
 * the stylesheet already computes, which `styles/base/_reset.scss` sets across
 * the whole app: `pointer` on every button, `not-allowed` on `:disabled`,
 * `auto` on inputs and `[data-selectable]`, `default` on the body. Every
 * component that exists is therefore already supported, and so is every one
 * written later, because the rule is simply "whatever the app says the cursor
 * should be". Driving it off a hand-maintained selector list would have been a
 * list to keep in step with the entire interface forever.
 *
 * `auto` is the one value that cannot decide on its own — it computes
 * identically over an `<input>` and over a plain `<div>` — so that branch falls
 * back to the tag and to `[data-selectable]`, which is exactly the distinction
 * the reset was making when it set the value.
 *
 * `none` lands in the same branch, and the reason is worth stating because the
 * obvious reading of it is wrong. Nothing in this app ever *asks* for `none`:
 * it is what the reset writes to hide the system arrow, so the probe sees it
 * only where no element in reach declared a cursor at all — which is precisely
 * what `auto` means here too. Reading it as "this element wants no pointer" and
 * standing the instrument down is what blacked the pointer out in 1.11.0. An
 * element that genuinely wants the system cursor says so with
 * `data-reticle="native"`, which is explicit, and which is checked first.
 */
export function resolveState(probe: ReticleProbe): ReticleState {
  const override = probe.override?.trim()
  if (override && isOverride(override)) return override

  const cursor = probe.cursor.trim().toLowerCase()

  switch (cursor) {
    case 'pointer':
      return 'lock'
    case 'not-allowed':
    case 'no-drop':
      return 'refused'
    case 'crosshair':
      return 'precision'
    case 'grab':
    case 'grabbing':
    case 'move':
      return 'carry'
    case 'text':
    case 'vertical-text':
      return 'text'
    // The reset's own hiding value. See the note above — it means "nothing in
    // reach declared a cursor", not "draw nothing".
    case 'none':
    case 'auto': {
      const tag = probe.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return 'text'
      return probe.selectable ? 'text' : 'idle'
    }
    default:
      return 'idle'
  }
}

// ------------------------------------------------------------------ geometry

/** The mark's own dimensions, in CSS pixels. */
export const RETICLE_GEOMETRY = {
  /** Diameter of the consciousness ring at rest. */
  ring: 22,
  /** The SVG canvas the mark is drawn on. Generous, so nothing clips when it stretches. */
  field: 48,
  /** The focal centre that sits at the true pointer position. */
  dot: 3,
  /** Length of each corner mark on an acquired target. */
  bracket: 7,
  /** How far the brackets sit outside the target's own box. */
  bracketInset: 3
} as const

/**
 * Spring configurations, one per thing that moves.
 *
 * The ring is the loosest — its lag *is* the effect, the instrument catching up
 * with the operator. The bracket is tight, because a target frame that wobbles
 * after it has locked reads as indecision rather than as precision.
 */
export const RETICLE_SPRINGS = {
  ring: { stiffness: 380, damping: 26, mass: 0.42 },
  bracket: { stiffness: 520, damping: 38, mass: 0.6 },
  shape: { stiffness: 460, damping: 34, mass: 0.5 }
} as const

/** Reduced motion keeps the mark and drops the travel. See `useAnimationsEnabled`. */
export const RETICLE_SPRINGS_REDUCED = {
  stiffness: 1400,
  damping: 70,
  mass: 0.2
} as const

// ------------------------------------------------------------------- stretch

/** Below this speed, in px/s, the mark neither stretches nor steers. */
export const STEER_THRESHOLD = 42
/** Speed, in px/s, at which stretch reaches its maximum. */
export const STRETCH_CEILING = 1500

export const STRETCH_MAX = 1.34
export const SQUASH_MIN = 0.78

/**
 * How far the ring elongates along its direction of travel.
 *
 * Remapped from speed rather than from raw distance, so a slow deliberate drag
 * across the whole screen leaves the ring round while a short flick does not.
 * Both axes come from one input so the mark conserves its apparent area, which
 * is what makes it read as a rigid object being dragged through something
 * rather than as a shape being resized.
 */
export function stretchFor(speed: number): { scaleX: number; scaleY: number } {
  if (speed <= STEER_THRESHOLD) return { scaleX: 1, scaleY: 1 }

  const t = Math.min(1, (speed - STEER_THRESHOLD) / (STRETCH_CEILING - STEER_THRESHOLD))
  return {
    scaleX: 1 + (STRETCH_MAX - 1) * t,
    scaleY: 1 - (1 - SQUASH_MIN) * t
  }
}

// ------------------------------------------------------------------ rotation

/**
 * The next rotation, in radians, taking the short way round.
 *
 * `Math.atan2` wraps at ±π, so a pointer crossing due west jumps from just
 * under +π to just over −π. Fed straight to a spring that is a full turn, and
 * the reticle spins on the spot for no reason the operator can see. This
 * accumulates the shortest angular delta onto the previous value instead, so
 * the number handed to the spring is continuous and the mark always rotates the
 * short way.
 */
export function unwrapAngle(previous: number, target: number): number {
  const twoPi = Math.PI * 2
  let delta = (target - previous) % twoPi

  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi

  return previous + delta
}

// ---------------------------------------------------------------- the lean

/** Fraction of the pointer's offset from centre that the bracket follows. */
export const LEAN_FACTOR = 0.14
/** Hard ceiling on the lean, as a fraction of the element's half-extent. */
export const LEAN_LIMIT = 0.2

/**
 * How far the target frame leans toward the pointer.
 *
 * This is the magnetism, and it is applied to **the bracket, never to the
 * element**. The reference implementations get their pull by putting a
 * transform on whatever is hovered; doing that here would make every hovered
 * element a containing block for its `position: fixed` descendants, which is
 * precisely the trap `Portal.tsx` exists to document — dialogs and menus nested
 * inside a leaning element would resolve their position against it. Leaning the
 * frame instead gives the same read and cannot break a single component.
 *
 * Clamped against the element's own half-extent so the frame can never crawl
 * off the thing it is framing, however far away the pointer is.
 */
export function leanFor(offset: number, extent: number): number {
  const limit = Math.abs(extent) * LEAN_LIMIT
  const leaned = offset * LEAN_FACTOR
  return Math.max(-limit, Math.min(limit, leaned))
}

// ------------------------------------------------------------ window chrome

/** How near the chrome counts as "approaching" it. */
export const CHROME_APPROACH_PX = 64
/** How long the pointer must go silent before silence means anything. */
export const CHROME_STALL_MS = 140
/** Upward speed, px/s, that counts as heading for the title bar. */
export const CHROME_ESCAPE_SPEED = 260

export interface ChromeProbe {
  /** Pointer's last reported y. */
  y: number
  /** Bottom edge of the window chrome, measured from the DOM. */
  chromeBottom: number
  /** Milliseconds since the last pointer event. */
  sinceMove: number
  /** Vertical speed at that last event, px/s. Negative is upward. */
  vy: number
}

/**
 * Whether the pointer has gone into the window chrome, where it cannot be
 * followed.
 *
 * `-webkit-app-region: drag` regions swallow mouse events outright in Electron,
 * so there is no event to listen for — the last one we ever see is the one just
 * short of the title bar, and a naive implementation leaves the mark frozen
 * there while the operator drags the window. This infers the crossing instead.
 *
 * **All three conditions are required, and the third is the one that matters.**
 * Proximity and silence alone are not enough: pausing thirty pixels below the
 * title bar to aim at a rail item satisfies both, and an earlier version of
 * this handed the arrow back every time the operator hesitated over a button.
 * Requiring that the pointer was still travelling *upward* when the events
 * stopped separates a throw at the chrome — which decelerates to nothing only
 * after it has crossed — from a deliberate stop, which decelerates to nothing
 * before it.
 */
export function enteredChrome(probe: ChromeProbe): boolean {
  if (probe.y < probe.chromeBottom) return true

  return (
    probe.y < probe.chromeBottom + CHROME_APPROACH_PX &&
    probe.sinceMove > CHROME_STALL_MS &&
    probe.vy < -CHROME_ESCAPE_SPEED
  )
}
