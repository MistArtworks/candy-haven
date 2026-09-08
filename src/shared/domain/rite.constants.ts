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

/**
 * A motion curve, in the one shape every presentation can drive itself from.
 *
 * `rateAt` is a multiple of the curve's *average* rate rather than an absolute
 * speed, which is what lets a renderer turn it into slabs per second, radians
 * per second or an intensity without knowing which curve it was handed.
 */
export interface Easing {
  /** Progress at time `u`. May leave [0,1] where the curve over- or undershoots. */
  at(u: number): number
  /** Rate of change at `u`, as a multiple of the average rate over the curve. */
  rateAt(u: number): number
}

/** The ring's flywheel curve, wrapped so it is interchangeable with a bezier. */
export const SPIN_EASING: Easing = { at: spinEase, rateAt: spinVelocity }

/**
 * A CSS-style cubic bezier easing, solved rather than approximated.
 *
 * `cubic-bezier(x1, y1, x2, y2)` treats x as time and y as progress, so
 * evaluating one means inverting x for the curve parameter and only then
 * reading y — sampling `y(u)` directly gives a different curve than the editor
 * drew. Newton-Raphson reaches the parameter in a few iterations from a good
 * starting guess, with bisection as the fallback for the steep middle of a
 * crossed-control curve, where the x derivative gets small enough to send
 * Newton wandering.
 *
 * Control y values outside [0,1] are allowed and meaningful: a negative `y1` is
 * anticipation, dipping the curve below its start before it sets off.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  // Polynomial form of a bezier through 0, c1, c2, 1 — `At³ + Bt² + Ct`.
  const coefficients = (c1: number, c2: number): [number, number, number] => [
    1 - 3 * c2 + 3 * c1,
    3 * c2 - 6 * c1,
    3 * c1
  ]
  const [ax, bx, cx] = coefficients(x1, x2)
  const [ay, by, cy] = coefficients(y1, y2)

  const valueAt = (a: number, b: number, c: number, t: number): number => ((a * t + b) * t + c) * t
  const slopeAt = (a: number, b: number, c: number, t: number): number =>
    (3 * a * t + 2 * b) * t + c

  /** The curve parameter whose x is `u`. */
  const solve = (u: number): number => {
    let t = u
    for (let index = 0; index < 8; index += 1) {
      const error = valueAt(ax, bx, cx, t) - u
      if (Math.abs(error) < 1e-7) return t
      const slope = slopeAt(ax, bx, cx, t)
      if (Math.abs(slope) < 1e-7) break
      t -= error / slope
    }

    let low = 0
    let high = 1
    t = u
    for (let index = 0; index < 32; index += 1) {
      const x = valueAt(ax, bx, cx, t)
      if (Math.abs(x - u) < 1e-7) break
      if (x > u) high = t
      else low = t
      t = (low + high) / 2
    }
    return t
  }

  return {
    at(u) {
      const time = clamp01(u)
      // Both ends are exact by definition; short-circuiting them keeps the
      // landing frame free of the solver's 1e-7 of slop, which the reel turns
      // into a fraction of a pixel of drift on the resting frame.
      if (time <= 0 || time >= 1) return time
      return valueAt(ay, by, cy, solve(time))
    },
    rateAt(u) {
      const t = solve(clamp01(u))
      const dx = slopeAt(ax, bx, cx, t)
      return dx <= 0 ? 0 : slopeAt(ay, by, cy, t) / dx
    }
  }
}

/**
 * THE PROCESSION's motion curve.
 *
 * An ease-in-out rather than the flywheel coast `spinEase` gives the ring,
 * because a procession is not a wheel let go of — it is a mechanism executing a
 * procedure. It holds almost still for the first fifth, tears through the
 * middle at some eight times its average rate, and arrives on the same long
 * readable crawl the ring has.
 *
 * Counter-intuitively this is *less* of a smear than the flywheel curve, not
 * more: the burst is violent but brief, so the strip spends about 1.2s of a 7s
 * spin moving too fast for a label to be read, against the flywheel's 1.9s.
 *
 * The `-0.02` is anticipation, and it is honest to say it is nearly invisible
 * at these numbers: `x1 = 0.77` stretches time so hard across the opening that
 * the dip bottoms out around -0.0003 of the travel, a pixel or two of backward
 * drift. Deepen `y1` to about -0.15 to make it a wind-up you can actually see.
 */
export const PROCESSION_EASING = cubicBezier(0.77, -0.02, 0.01, 0.94)

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
 * The three ways a selection can be presented.
 *
 * All three render the *same* draw. The winner is decided once in the main
 * process and travels in the spin command, so a mechanism is a presentation
 * choice and never a different result — which is what makes adding one of these
 * cheap and makes none of them able to disagree with the console.
 *
 * They differ in shape, in what carries the tension, and in how far they have
 * to go to reconcile a live presentation with a result that was settled before
 * it began:
 *   - `ring`       a rotating ring read against a fixed bezel
 *   - `procession` slabs streaming past a fixed mark
 *   - `descent`    motes falling through a gauntlet into Nayara
 *
 * `descent` is the one that cannot be solved for a position at time `t`, so it
 * simulates and bakes instead — see `rite.descent.ts`, which also explains how
 * an unrigged physics sim is made to agree with a predetermined winner.
 *
 * Two earlier mechanisms — `tribunal` and `attrition` — were retired. A stored
 * config naming either still parses, because `RiteConfigSchema` catches an
 * unknown mechanism back to `ring` rather than failing; without that, the
 * repository's `safeParse` would discard the whole rite, roster and history
 * included, over a single dead string.
 */
export const RITE_MECHANISMS = ['ring', 'procession', 'descent'] as const
export type RiteMechanism = (typeof RITE_MECHANISMS)[number]

export const RITE_MECHANISM_LABEL: Record<RiteMechanism, string> = {
  ring: 'RESONANCE RING — the ring turns beneath a fixed pointer',
  procession: 'THE PROCESSION — petitions stream past the mark and one is held',
  descent: 'THE DESCENT — the motes are loosed and Nayara takes one'
}

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
 * How far past the winner a strip travels before easing back, in plates.
 *
 * Held strictly under half a plate, which is the entire point of it being a
 * named constant rather than the ring's `overshootRadians` converted into
 * plates. A ring is a continuous rim read against a blade, so a swing that
 * crosses into the neighbouring segment reads as a near-miss and creeps back
 * out. A rail is discrete slabs with visible gaps between them: the same swing
 * puts the mark *fully onto the neighbouring slab* and holds it there for the
 * whole settle, which does not read as a near-miss at all — it reads as the
 * wrong petition having been chosen and then quietly swapped for another.
 *
 * Constant rather than proportional to the roster, unlike the ring's, because a
 * ring's near-miss is measured in segments crossed while a rail's is measured
 * in slab — and a slab is the same width whether two petitions are filed or
 * twenty.
 */
export const REEL_OVERSHOOT_PLATES = 0.42

/**
 * The linear equivalent of `spinFrameAt`, for the presentations that move a
 * strip rather than turn a ring.
 *
 * Takes the curve rather than assuming one, defaulting to the ring's. What has
 * to be shared between surfaces is the *result* and the *timing* — both derive
 * from the one command, so the console and the broadcast land on the same
 * petition at the same instant whatever curve is passed. How a mechanism gets
 * there is already its own business: the descent does not ease at all, it falls
 * through a simulation and is resampled onto the same duration.
 *
 * The overshoot is the one number that cannot vary — see
 * `REEL_OVERSHOOT_PLATES`.
 */
export function reelFrameAt(
  spin: SpinCommand,
  now: number,
  easing: Easing = SPIN_EASING
): ReelFrame {
  const target = spin.revolutions * spin.segmentCount + spin.targetIndex
  const overshoot = REEL_OVERSHOOT_PLATES
  const elapsed = now - spin.startedAt
  const total = totalSpinDurationMs(spin)

  if (elapsed <= 0) return { plates: 0, velocity: 0, progress: 0, settled: false }

  if (elapsed < spin.durationMs) {
    const u = elapsed / spin.durationMs
    return {
      plates: easing.at(u) * (target + overshoot),
      velocity: easing.rateAt(u),
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
