import type { TimerConfig, TimerFrame, TimerId, TimerPhase, TimerState } from './timer'

/**
 * Zod-free half of the timer domain — see boot.constants.ts for why the split
 * exists.
 *
 * As with the rite, the arithmetic lives here because it has three consumers
 * that must agree exactly: the console's preview, the browser source, and the
 * cue scheduler that decides when a warning tone fires. A timer that reads
 * 00:01 on stream while the console has already moved on is the whole failure
 * mode this module exists to prevent.
 */

// -------------------------------------------------------------------- timers

/**
 * The two timers, each with its own state and its own address.
 *
 * Deliberately two rather than one overlay with a mode switch: a stream-opening
 * countdown and a break timer are configured once and left alone, and a mode
 * switch would make them share a duration. Both ids are also overlay ids, so
 * the slug and catalogue label come from the overlay registry rather than being
 * restated here.
 */
export const TIMER_IDS = ['interval', 'convene'] as const

/**
 * What a timer is for, as opposed to how it is configured.
 *
 * `convene` counts a room in and resolves to a word; `interval` counts work
 * down and has to be able to interrupt the operator. That difference decides
 * default behaviour, not operator preference, so it is not in the config.
 */
export const TIMER_KIND: Record<TimerId, 'interval' | 'convene'> = {
  interval: 'interval',
  convene: 'convene'
}

// ---------------------------------------------------------------- animations

/**
 * The countdown presentations.
 *
 * All of them are built from the same five materials and share the readout;
 * they differ in what carries the passage of time. Fixed set, as with the
 * rite's presets — the palette is locked, so this is a choice of mechanism
 * rather than of styling.
 */
export const TIMER_ANIMATIONS = ['plates', 'roll', 'arc', 'column', 'pulse'] as const

export const TIMER_ANIMATION_LABEL: Record<TimerAnimation, string> = {
  plates: 'SPLIT PLATES — engraved slabs, each digit turning over',
  roll: 'ROLLING DIGITS — bare numerals, the spent digit rising out as the next arrives',
  arc: 'RESONANCE ARC — a graduated ring draining around the readout',
  column: 'SEDIMENT COLUMN — a brutalist stack emptying downward',
  pulse: 'HARMONIC PULSE — a ring emitted on every second'
}

export type TimerAnimation = (typeof TIMER_ANIMATIONS)[number]

// -------------------------------------------------------------------- limits

export const TIMER_MIN_MS = 1_000
/** Twelve hours. Past this a countdown is a calendar, not a timer. */
export const TIMER_MAX_MS = 12 * 60 * 60 * 1_000
export const GRACE_MAX_MS = 60 * 60 * 1_000

/** Durations the console offers as one-tap presets, in seconds. */
export const TIMER_QUICK_SET = [60, 180, 300, 600, 900, 1_800] as const
export const GRACE_QUICK_SET = [0, 30, 60, 120, 300] as const

/**
 * Cue points, as ms remaining.
 *
 * The one-minute reminder and a final call. Both fire only on an `interval`
 * timer — a room being counted in does not need to be warned that it is nearly
 * counted in.
 */
export const CUE_ONE_MINUTE_MS = 60_000
export const CUE_FINAL_MS = 10_000

/** How long the readout blinks after reaching zero before settling. */
export const BLINK_PERIOD_MS = 900

// ------------------------------------------------------------------- frames

/**
 * Total time consumed by the current run.
 *
 * Pauses are stored as accumulated milliseconds rather than as a paused
 * timestamp, so resuming is a single assignment and the arithmetic never has to
 * reason about how long a pause lasted.
 */
export function consumedMs(state: TimerState, now: number): number {
  if (state.startedAt === null) return state.elapsedBeforeMs
  return state.elapsedBeforeMs + Math.max(now - state.startedAt, 0)
}

/**
 * Everything both surfaces need to draw a frame, derived from the state and the
 * wall clock.
 *
 * Nothing ticks over IPC or the event stream: the state carries a start instant
 * and the durations, and each surface derives the rest at its own frame rate.
 * A once-per-second push would arrive jittery and would put the console and the
 * broadcast a variable fraction of a second apart. Host and overlay share a
 * clock — they are the same machine — which is the assumption that makes this
 * work without a handshake.
 */
export function timerFrameAt(state: TimerState, now: number): TimerFrame {
  const { durationMs, graceMs } = state.config
  const consumed = consumedMs(state, now)
  const remainingMs = durationMs - consumed
  const graceRemainingMs = graceMs > 0 ? graceMs + remainingMs : 0

  let phase: TimerPhase
  if (state.phase === 'idle') {
    phase = 'idle'
  } else if (state.phase === 'paused') {
    phase = 'paused'
  } else if (remainingMs > 0) {
    phase = 'running'
  } else if (graceRemainingMs > 0) {
    phase = 'grace'
  } else {
    phase = 'elapsed'
  }

  // Idle shows the configured duration rather than a spent clock, so setting a
  // time previews it immediately.
  const shown = phase === 'idle' ? durationMs : remainingMs

  return {
    phase,
    remainingMs: shown,
    graceRemainingMs: Math.max(graceRemainingMs, 0),
    progress: durationMs > 0 ? clamp01(consumed / durationMs) : 1,
    // Rounded up, so the readout shows 00:01 for the whole of the final second
    // and reaches 00:00 exactly when the time is gone. Rounding down would show
    // zero for a second while time remained.
    seconds: Math.max(Math.ceil(shown / 1000), 0)
  }
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

// ------------------------------------------------------------------ readout

/**
 * `MM:SS`, or `H:MM:SS` past an hour.
 *
 * Fixed-width by construction: the readout is set in the monospace face and
 * must not change width as it counts, or every animation built around it jitters.
 */
export function formatClock(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** The digits a preset lays out, without the separators. */
export function clockDigits(ms: number): string[] {
  return formatClock(ms)
    .split('')
    .filter((character) => character !== ':')
}

export function formatDurationLabel(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total === 0) return 'None'
  if (total % 60 === 0) return `${total / 60} min`
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m ${total % 60}s`
}

// ------------------------------------------------------------------- factories

export function createDefaultTimerConfig(id: TimerId): TimerConfig {
  const convene = TIMER_KIND[id] === 'convene'

  return {
    // Ten minutes to open a stream, five for a break — the common cases, so
    // neither timer needs configuring before its first use.
    durationMs: convene ? 10 * 60_000 : 5 * 60_000,
    // Grace is for work that runs over, which counting a room in does not.
    graceMs: convene ? 0 : 60_000,
    animation: convene ? 'pulse' : 'plates',
    label: convene ? 'TRANSMISSION BEGINS' : 'INTERVAL',
    terminalWord: convene ? 'NOW' : 'TIME',
    // A room being counted in is not warned; work running out is.
    sound: !convene,
    showLabel: true,
    blinkOnElapsed: !convene
  }
}

export function createTimerState(id: TimerId): TimerState {
  return {
    id,
    phase: 'idle',
    startedAt: null,
    elapsedBeforeMs: 0,
    config: createDefaultTimerConfig(id),
    revision: 0
  }
}

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return 5 * 60_000
  return Math.min(Math.max(Math.round(ms), TIMER_MIN_MS), TIMER_MAX_MS)
}

export function clampGrace(ms: number): number {
  if (!Number.isFinite(ms)) return 0
  return Math.min(Math.max(Math.round(ms), 0), GRACE_MAX_MS)
}
