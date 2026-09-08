import { z } from 'zod'
import {
  GRACE_MAX_MS,
  TIMER_ANIMATIONS,
  TIMER_IDS,
  TIMER_MAX_MS,
  TIMER_MIN_MS,
  createDefaultTimerConfig
} from './timer.constants'

/**
 * Schema half of the timer domain — the countdown overlays served by the
 * OBSERVATORY department.
 *
 * As with the rite: **every field carries a default**, because the state is
 * persisted and a document written by an earlier build is missing whatever has
 * been added since. And note `TimerConfigPatchSchema` below — a patch schema
 * derived with `.partial()` is *not* sparse when the fields carry defaults, and
 * that bug presented as none of the rite's options working.
 */

export const TimerIdSchema = z.enum(TIMER_IDS)
export type TimerId = z.infer<typeof TimerIdSchema>

export const TimerAnimationSchema = z.enum(TIMER_ANIMATIONS)
export type TimerAnimation = z.infer<typeof TimerAnimationSchema>

/**
 * Stored phase — only what the operator has done.
 *
 * `grace` and `elapsed` are deliberately absent: they are functions of the
 * clock, so `timerFrameAt` derives them. Storing them would mean the main
 * process needed a timer of its own to flip the state at zero, and a missed or
 * late timer would then be visible on stream.
 */
export const TimerStoredPhaseSchema = z.enum(['idle', 'running', 'paused'])
export type TimerStoredPhase = z.infer<typeof TimerStoredPhaseSchema>

/** Derived phase, as the surfaces render it. */
export type TimerPhase = TimerStoredPhase | 'grace' | 'elapsed'

export const TimerConfigSchema = z.object({
  durationMs: z.number().int().min(TIMER_MIN_MS).max(TIMER_MAX_MS).default(300_000),
  /**
   * Extra period beginning the moment the main duration reaches zero.
   *
   * The readout crosses into crimson and counts the grace down, so overrunning
   * is visible as overrunning rather than as a stopped clock. Zero disables it.
   */
  graceMs: z.number().int().min(0).max(GRACE_MAX_MS).default(0),
  animation: TimerAnimationSchema.default('plates'),
  /** Institutional label above the readout. */
  label: z.string().max(48).default('INTERVAL'),
  /** Word the countdown resolves to. `NOW` for a stream opening. */
  terminalWord: z.string().max(16).default('TIME'),
  /**
   * Audio cues.
   *
   * Played by the console, never by the overlay: OBS can be set to shut a
   * browser source down when it is not visible, so a cue that has to reach the
   * operator cannot live in the scene. It also means a stream-opening countdown
   * is silent on the broadcast without any special handling.
   */
  sound: z.boolean().default(true),
  showLabel: z.boolean().default(true),
  /** Blink the readout once the time is gone. */
  blinkOnElapsed: z.boolean().default(true)
})
export type TimerConfig = z.infer<typeof TimerConfigSchema>

export const TimerStateSchema = z.object({
  id: TimerIdSchema,
  phase: TimerStoredPhaseSchema.default('idle'),
  /**
   * Epoch ms at which the current run segment began, or null when not running.
   *
   * Host and overlay share a wall clock, so both derive the same remaining time
   * from this without anything being pushed per tick.
   */
  startedAt: z.number().nullable().default(null),
  /**
   * Time consumed by earlier run segments.
   *
   * Pauses accumulate here rather than being stored as a paused instant, so
   * resuming is one assignment and no arithmetic has to reason about how long
   * the pause lasted.
   */
  elapsedBeforeMs: z.number().min(0).default(0),
  config: TimerConfigSchema.prefault({}),
  revision: z.number().int().min(0).default(0)
})
export type TimerState = z.infer<typeof TimerStateSchema>

/** Both timers, as the console and the catalogue read them. */
export const TimerSetSchema = z.record(TimerIdSchema, TimerStateSchema)
export type TimerSet = z.infer<typeof TimerSetSchema>

/** Derived per-frame values. Never persisted, never sent — computed locally. */
export interface TimerFrame {
  phase: TimerPhase
  /** Remaining on the main duration; negative once past zero. */
  remainingMs: number
  /** Remaining grace, once the main duration is spent. */
  graceRemainingMs: number
  /** 0..1 through the main duration. */
  progress: number
  /** Whole seconds remaining, rounded up. Drives the readout and cue edges. */
  seconds: number
}

// -------------------------------------------------------------------- patches

/**
 * A genuinely sparse patch — only the keys the caller sent.
 *
 * `TimerConfigSchema.partial()` would not be sparse: every field carries a
 * `.default()`, and zod applies those defaults for absent keys even through
 * `.partial()`, so the patch would arrive carrying all eight fields and writing
 * one option would reset the other seven. Unwrapping each default before making
 * it optional is what lets an absent key stay absent.
 *
 * Derived from the shape rather than re-declared, so the two cannot disagree
 * about what a field accepts.
 */
type TimerConfigPatchShape = {
  [K in keyof TimerConfig]: z.ZodOptional<z.ZodType<TimerConfig[K]>>
}

const timerConfigPatchShape = Object.fromEntries(
  Object.entries(TimerConfigSchema.shape).map(([key, field]) => [key, field.unwrap().optional()])
) as unknown as TimerConfigPatchShape

export const TimerConfigPatchSchema = z.object(timerConfigPatchShape)
export type TimerConfigPatch = z.infer<typeof TimerConfigPatchSchema>

export function createDefaultConfig(id: TimerId): TimerConfig {
  return createDefaultTimerConfig(id)
}
