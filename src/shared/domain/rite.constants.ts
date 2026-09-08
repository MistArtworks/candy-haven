import type { Petition, RiteConfig, RiteState, SpinCommand } from './rite'

/**
 * Zod-free half of the rite domain — see boot.constants.ts for why the split
 * exists.
 *
 * Everything in here is pure arithmetic, and that is the point: the host
 * console and the browser overlay both render the same spin from the same
 * `SpinCommand`, so the maths that turns a command into an angle must be one
 * implementation shared by both. If each surface eased its own way, the two
 * would drift apart mid-spin and land at visibly different times.
 */

export const TAU = Math.PI * 2

/**
 * The pointer sits at twelve o'clock and never moves; the ring rotates beneath
 * it. Canvas angles run clockwise from the +x axis, so straight up is -π/2.
 */
export const POINTER_ANGLE = -Math.PI / 2

// ------------------------------------------------------------------- limits

/** Above this the ring stops being readable, so the roster stops accepting. */
export const MAX_PETITIONS = 48
export const MAX_PETITION_LABEL = 72

/** Rolling record of past selections carried on the state. */
export const RITE_HISTORY_LIMIT = 24

/**
 * Most of the overlay's width that may be reserved at the right edge.
 *
 * The reserve is dead space the overlay never draws into, so a chat panel and a
 * camera can be composited there in OBS without the ring colliding with them.
 * Capped well below half: past this the ring has less room than the furniture
 * beside it, and the composition stops reading as one focal object in a field.
 */
export const MAX_EDGE_RESERVE = 0.4

/** Reference width the host quotes pixel equivalents against. */
export const OVERLAY_REFERENCE_WIDTH = 1920

/**
 * Fixed presentation presets for the overlay.
 *
 * Presets, not a colour picker. The palette is locked to five materials and
 * crimson is reserved for the focal point, so exposing arbitrary colours would
 * hand the operator a way to take the overlay off-model in one drag. Each preset
 * is a different arrangement of the same five materials.
 */
export const OVERLAY_THEMES = ['obsidian', 'sanctum', 'chamber'] as const
export type OverlayTheme = (typeof OVERLAY_THEMES)[number]

export const OVERLAY_THEME_LABEL: Record<OverlayTheme, string> = {
  obsidian: 'OBSIDIAN — void black',
  sanctum: 'SANCTUM — crimson glass',
  chamber: 'CHAMBER — pale stone'
}

export const ROSTER_SIDES = ['left', 'right'] as const
export type RosterSide = (typeof ROSTER_SIDES)[number]

export const ROSTER_SIDE_LABEL: Record<RosterSide, string> = {
  left: 'LEFT',
  right: 'RIGHT'
}

export const SPIN_DURATION_MIN_MS = 3_000
export const SPIN_DURATION_MAX_MS = 20_000
export const DEFAULT_SPIN_DURATION_MS = 7_000

/** Time spent easing back from the overshoot onto the winner. */
export const SPIN_SETTLE_MS = 820

/**
 * Whole turns completed before the ring lands.
 *
 * Revolutions — not the item count — are what supply the tension: four
 * petitions would otherwise give four tick crossings and nothing to watch,
 * whereas five turns across four segments gives twenty. Randomised within a
 * band so consecutive spins do not feel like a replay.
 */
export const SPIN_MIN_REVOLUTIONS = 4
export const SPIN_MAX_REVOLUTIONS = 7

// ------------------------------------------------------------------ geometry

export function segmentAngle(count: number): number {
  return count > 0 ? TAU / count : TAU
}

/**
 * How far past the winner the ring travels before easing back.
 *
 * Proportional to the segment rather than fixed, because the whole purpose is
 * the near-miss: on a crowded ring the overshoot should visibly cross into the
 * neighbouring segment and creep back out of it, and on a four-item ring a
 * fixed 40° would look like a mistake. Capped so a two-item ring does not
 * swing halfway round.
 */
export function overshootRadians(count: number): number {
  const segment = segmentAngle(count)
  return Math.min(segment * 0.55, (16 * Math.PI) / 180)
}

/**
 * Rotation that brings `targetIndex` under the pointer.
 *
 * Segment `i` spans local angles `[i·seg, (i+1)·seg)`, so its centre lands on
 * the pointer when the ring has turned by `POINTER_ANGLE − centre`, normalised
 * into a single positive turn.
 */
export function landingRotation(targetIndex: number, count: number): number {
  const centre = (targetIndex + 0.5) * segmentAngle(count)
  const raw = POINTER_ANGLE - centre
  return ((raw % TAU) + TAU) % TAU
}

// -------------------------------------------------------------------- easing

/**
 * Position curve for the main phase: `1 − 4(1−u)³ + 3(1−u)⁴`.
 *
 * This is the integral of the velocity profile `30u(1−u)²` normalised to
 * [0,1], which is why it behaves like a real wheel instead of a tween. Velocity
 * is zero at both ends and peaks a third of the way in, so the ring winds up
 * from rest, tears through the middle, and bleeds off speed for the rest of the
 * spin — about 97% of the rotation is done by 80% of the time, leaving a long
 * readable crawl into the result.
 *
 * A conventional ease-out would start at maximum speed, which reads as the ring
 * having already been spinning before you pressed the button.
 */
export function spinEase(u: number): number {
  const t = 1 - clamp01(u)
  return 1 - 4 * t * t * t + 3 * t * t * t * t
}

/**
 * Normalised angular speed at `u`, as a fraction of (total rotation / duration).
 *
 * Derived analytically rather than by differencing successive frames, so it is
 * exact and frame-rate independent. The renderer drives the orb's intensity and
 * the resonance field's agitation from this, which is what gives the spin an
 * energy curve on top of its speed curve.
 */
export function spinVelocity(u: number): number {
  const t = clamp01(u)
  return 12 * t * (1 - t) * (1 - t)
}

/** Settle curve — decelerating return from the overshoot. */
export function settleEase(u: number): number {
  const t = 1 - clamp01(u)
  return 1 - t * t * t
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

// ------------------------------------------------------------------ playback

export interface SpinFrame {
  /** Ring rotation in radians. */
  rotation: number
  /** Normalised speed, 0..~1.8. Drives intensity, not position. */
  velocity: number
  /** Fraction of the whole spin elapsed, for the progress arc. */
  progress: number
  /** True once the ring has come to rest on the winner. */
  settled: boolean
}

export function totalSpinDurationMs(spin: SpinCommand): number {
  return spin.durationMs + spin.settleMs
}

/**
 * The single source of truth for where the ring is at a given instant.
 *
 * Both surfaces call this with `Date.now()` and get the same answer, so a
 * browser source that connects halfway through a spin picks the animation up at
 * the correct offset rather than starting over. Host and overlay run on the same
 * machine, so a shared wall clock is a safe assumption here — one worth stating,
 * because it is what makes this work without a handshake.
 */
export function spinFrameAt(spin: SpinCommand, now: number): SpinFrame {
  const target = spin.revolutions * TAU + landingRotation(spin.targetIndex, spin.segmentCount)
  const overshoot = overshootRadians(spin.segmentCount)
  const elapsed = now - spin.startedAt
  const total = totalSpinDurationMs(spin)

  if (elapsed <= 0) {
    return { rotation: 0, velocity: 0, progress: 0, settled: false }
  }

  if (elapsed < spin.durationMs) {
    const u = elapsed / spin.durationMs
    return {
      rotation: spinEase(u) * (target + overshoot),
      velocity: spinVelocity(u),
      progress: elapsed / total,
      settled: false
    }
  }

  if (elapsed < total) {
    const u = (elapsed - spin.durationMs) / spin.settleMs
    return {
      rotation: target + overshoot * (1 - settleEase(u)),
      velocity: 0,
      progress: elapsed / total,
      settled: false
    }
  }

  return { rotation: target, velocity: 0, progress: 1, settled: true }
}

/**
 * How many segment boundaries have passed the pointer at a given rotation.
 *
 * The renderer watches this for changes and pulses the pointer on each one. The
 * tick rate is therefore a direct read-out of speed — the rhythm slowing down is
 * the part that makes the ending tense.
 */
export function tickIndexAt(rotation: number, count: number): number {
  return Math.floor((rotation - POINTER_ANGLE) / segmentAngle(count))
}

// --------------------------------------------------------------------- odds

/**
 * Resolves a roll in [0,1) to a petition index, honouring entry weights.
 *
 * Pure so the draw can be reasoned about (and, later, replayed) independently
 * of where the randomness came from. The caller supplies the roll; the main
 * process uses a CSPRNG for it.
 */
export function weightedIndex(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(weight, 0), 0)
  if (weights.length === 0) return -1
  if (total <= 0) return Math.min(Math.floor(clamp01(roll) * weights.length), weights.length - 1)

  const threshold = clamp01(roll) * total
  let accumulated = 0
  for (let index = 0; index < weights.length; index += 1) {
    accumulated += Math.max(weights[index], 0)
    if (threshold < accumulated) return index
  }
  return weights.length - 1
}

/** Per-petition probability, for the host's odds column. */
export function petitionOdds(petitions: readonly Petition[]): number[] {
  const total = petitions.reduce((sum, petition) => sum + Math.max(petition.weight, 0), 0)
  if (total <= 0) return petitions.map(() => (petitions.length > 0 ? 1 / petitions.length : 0))
  return petitions.map((petition) => Math.max(petition.weight, 0) / total)
}

// ------------------------------------------------------------------ factories

export function createDefaultRiteConfig(): RiteConfig {
  return {
    mechanism: 'ring',
    title: 'RESONANCE SELECTION',
    prompt: 'THE FIELD WILL CHOOSE',
    durationMs: DEFAULT_SPIN_DURATION_MS,
    removeOnSelect: false,
    showRoster: true,
    reserveRight: 0.2,
    transparent: false,
    theme: 'obsidian',
    rosterSide: 'left',
    showMasthead: true,
    showField: true,
    showOdds: true,
    showStatus: true
  }
}

export function createEmptyRiteState(): RiteState {
  return {
    phase: 'idle',
    petitions: [],
    config: createDefaultRiteConfig(),
    spin: null,
    winner: null,
    history: [],
    revision: 0
  }
}

/** Clamps operator-supplied duration into the range the curve is tuned for. */
export function clampSpinDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return DEFAULT_SPIN_DURATION_MS
  return Math.min(Math.max(Math.round(durationMs), SPIN_DURATION_MIN_MS), SPIN_DURATION_MAX_MS)
}

/**
 * Normalises a label for duplicate detection.
 *
 * Chat will eventually be filing these, and "Midnight Drive" arriving three
 * times because three people typed it with different spacing would silently
 * triple its odds.
 */
export function normalisePetitionLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, MAX_PETITION_LABEL)
}

export function petitionKey(label: string): string {
  return normalisePetitionLabel(label).toLowerCase()
}

// -------------------------------------------------------------- mechanisms

/**
 * The four ways a selection can be presented.
 *
 * All four render the *same* draw. The winner is decided once in the main
 * process and travels in the spin command, so a mechanism is a presentation
 * choice and never a different result — which is what makes adding one of these
 * cheap and makes none of them able to disagree with the console.
 *
 * They differ in shape and in what carries the tension:
 *   - `ring`       a rotating ring read against a fixed bezel
 *   - `procession` plates streaming past a fixed marker
 *   - `tribunal`   a selection bar stepping down a fixed docket
 *   - `attrition`  records struck out until one survives
 */
export const RITE_MECHANISMS = ['ring', 'procession', 'tribunal', 'attrition'] as const
export type RiteMechanism = (typeof RITE_MECHANISMS)[number]

export const RITE_MECHANISM_LABEL: Record<RiteMechanism, string> = {
  ring: 'RESONANCE RING — the ring turns beneath a fixed pointer',
  procession: 'THE PROCESSION — petitions stream past the mark and one is held',
  tribunal: 'THE TRIBUNAL — the docket is scanned and one file is sanctioned',
  attrition: 'RITE OF ATTRITION — records are redacted until one survives'
}

/** How many petitions a docket shows before it has to scroll. */
export const DOCKET_VISIBLE_ROWS = 9

// ---------------------------------------------------------------- the reel

export interface ReelFrame {
  /**
   * Plates travelled, in plate units.
   *
   * Fractional: the strip sits between plates for most of a spin. At rest this
   * is exactly `revolutions * count + targetIndex`, so the plate whose reel
   * index has that value sits on the mark — and since `revolutions * count` is
   * a whole number of passes, its petition index is the target.
   */
  plates: number
  velocity: number
  progress: number
  settled: boolean
}

/**
 * The linear equivalent of `spinFrameAt`, for the presentations that move a
 * strip rather than turn a ring.
 *
 * Shares the ring's easing and overshoot deliberately: a spin should feel the
 * same whichever way it is drawn, and the console and the broadcast derive both
 * from the one command.
 */
export function reelFrameAt(spin: SpinCommand, now: number): ReelFrame {
  const target = spin.revolutions * spin.segmentCount + spin.targetIndex
  // A fraction of a plate, so the mark visibly passes the winner and creeps
  // back onto it — the same near-miss the ring gets from its angular overshoot.
  const overshoot = 0.55
  const elapsed = now - spin.startedAt
  const total = totalSpinDurationMs(spin)

  if (elapsed <= 0) return { plates: 0, velocity: 0, progress: 0, settled: false }

  if (elapsed < spin.durationMs) {
    const u = elapsed / spin.durationMs
    return {
      plates: spinEase(u) * (target + overshoot),
      velocity: spinVelocity(u),
      progress: elapsed / total,
      settled: false
    }
  }

  if (elapsed < total) {
    const u = (elapsed - spin.durationMs) / spin.settleMs
    return {
      plates: target + overshoot * (1 - settleEase(u)),
      velocity: 0,
      progress: elapsed / total,
      settled: false
    }
  }

  return { plates: target, velocity: 0, progress: 1, settled: true }
}

/** Which petition a reel index shows. */
export function reelPetitionIndex(reelIndex: number, count: number): number {
  if (count <= 0) return 0
  return ((reelIndex % count) + count) % count
}

// ------------------------------------------------------------- the docket

/**
 * Which row the selection bar rests on at `now`, for the TRIBUNAL.
 *
 * Steps between whole rows rather than gliding: a bar that slides continuously
 * reads as a scrollbar, whereas one that jumps reads as a machine considering
 * each file in turn. The step rate follows the same easing as everything else,
 * so it slows to a crawl before it settles.
 */
export function docketRowAt(spin: SpinCommand, now: number): number {
  const frame = reelFrameAt(spin, now)
  if (frame.settled) return spin.targetIndex
  return reelPetitionIndex(Math.round(frame.plates), spin.segmentCount)
}

// ----------------------------------------------------------- the attrition

/**
 * FNV-1a over the spin id.
 *
 * The elimination order has to be identical on every surface, and the only
 * thing they share is the command — so the order is derived from its id rather
 * than rolled locally. Any stable hash would do; this one is short and has no
 * dependencies.
 */
function seedFrom(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** xorshift32. Small, deterministic, and adequate for shuffling a list. */
function nextSeed(seed: number): number {
  let next = seed
  next ^= next << 13
  next ^= next >>> 17
  next ^= next << 5
  return next >>> 0
}

/**
 * The order in which petitions are struck out, ending with the winner surviving.
 *
 * Every index except the target, shuffled deterministically from the spin id.
 * Computed identically by the console and the broadcast, so both strike the
 * same record at the same moment.
 */
export function attritionOrder(spin: SpinCommand): number[] {
  const victims: number[] = []
  for (let index = 0; index < spin.segmentCount; index += 1) {
    if (index !== spin.targetIndex) victims.push(index)
  }

  // Fisher-Yates, seeded.
  let seed = seedFrom(spin.id)
  for (let index = victims.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed)
    const swap = seed % (index + 1)
    ;[victims[index], victims[swap]] = [victims[swap], victims[index]]
  }

  return victims
}

/**
 * How many records have been struck out at `now`.
 *
 * Reuses the decelerating curve rather than accelerating into the end. The last
 * elimination is the one that decides it, so it gets the longest beat — an
 * accelerating tempo would rush precisely the moment worth watching.
 */
export function attritionStruckAt(spin: SpinCommand, now: number): number {
  const elapsed = now - spin.startedAt
  if (elapsed <= 0) return 0

  const doomed = Math.max(spin.segmentCount - 1, 0)
  if (elapsed >= spin.durationMs) return doomed

  return Math.min(Math.floor(spinEase(elapsed / spin.durationMs) * doomed), doomed)
}
