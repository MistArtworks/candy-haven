import type { MusterConfig, MusterState } from './muster'

/**
 * Zod-free half of the muster domain — see boot.constants.ts for the split.
 *
 * THE MUSTER is an open call. The operator puts a question to the chamber,
 * citizens file entries against it with a chat command, and the roll fills in
 * front of everyone. When the call closes the roll is *handed on* — to the ring
 * to be drawn from, or to the chamber to be voted on, or both.
 *
 * It is the brief's Processing Floor: "mortals reduced to data; choices
 * measured". The entries arrive as people and leave as options.
 */

/** How the roll is drawn. Two, and the address decides which. */
export const MUSTER_LAYOUTS = ['full', 'widget'] as const
export type MusterLayout = (typeof MUSTER_LAYOUTS)[number]

export const MUSTER_PHASES = [
  /** Nothing has been called. The overlay rests. */
  'idle',
  /** The call is open and chat can file. */
  'open',
  /** Closed, roll intact, waiting to be handed on or cleared. */
  'closed'
] as const
export type MusterPhase = (typeof MUSTER_PHASES)[number]

export const MUSTER_PHASE_LABEL: Record<MusterPhase, string> = {
  idle: 'NO CALL HAS BEEN MADE',
  open: 'THE ROLL IS OPEN',
  closed: 'THE ROLL IS CLOSED'
}

// --------------------------------------------------------------------- limits

/**
 * The roll's ceiling.
 *
 * Not a performance limit — it is a *composition* limit. A hundred entries
 * cannot be read on a broadcast, and a call that silently keeps taking them
 * produces a list nobody can use and a wheel nobody can see. The overlay says
 * the roll is full rather than dropping entries quietly.
 */
export const MAX_ENTRIES = 40

/** One line on a scene. Longer than this and the roll stops being scannable. */
export const MAX_ENTRY_LENGTH = 64

export const MAX_PROMPT_LENGTH = 90

/** Entries one citizen may file. More than a few is one person's list. */
export const PER_CITIZEN_MIN = 1
export const PER_CITIZEN_MAX = 5

export const DURATION_MIN_MS = 15_000
export const DURATION_MAX_MS = 900_000
export const DEFAULT_DURATION_MS = 120_000

/** The word after the bang. Lowercase; matching is case-insensitive. */
export const DEFAULT_COMMAND = 'add'

// ---------------------------------------------------------------- appearance

/** How long a newly filed entry stays lit before joining the roll proper. */
export const ARRIVAL_MS = 2200

/** How long a closed roll holds before the overlay returns to rest. */
export const LINGER_MIN_MS = 5_000
export const LINGER_MAX_MS = 300_000
export const DEFAULT_LINGER_MS = 60_000

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_DURATION_MS
  const rounded = Math.round(ms)
  // Zero is meaningful and must survive: it means the call stays open until
  // the operator closes it, which is the right default for a slow chat.
  if (rounded <= 0) return 0
  return Math.min(Math.max(rounded, DURATION_MIN_MS), DURATION_MAX_MS)
}

export function clampLinger(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_LINGER_MS
  return Math.min(Math.max(Math.round(ms), LINGER_MIN_MS), LINGER_MAX_MS)
}

export function clampPerCitizen(count: number): number {
  if (!Number.isFinite(count)) return 1
  return Math.min(Math.max(Math.round(count), PER_CITIZEN_MIN), PER_CITIZEN_MAX)
}

// ---------------------------------------------------------------- the command

/**
 * The text of an entry, if this message is one.
 *
 * Matched on the configured word after a bang, case-insensitively, and only at
 * the very start — `!add x` files, `I would !add x` does not. Chat is full of
 * people quoting the command back at each other while explaining it, and every
 * one of those would otherwise land on the roll.
 *
 * Returns null for anything that is not a filing, including an empty one:
 * `!add` on its own is somebody working out how it works.
 */
export function parseEntry(text: string, command: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('!')) return null

  const space = trimmed.search(/\s/)
  const word = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase()
  if (word !== command.trim().toLowerCase()) return null
  if (space === -1) return null

  return tidyEntry(trimmed.slice(space + 1))
}

/**
 * An entry, cleaned up.
 *
 * Whitespace collapsed and length capped. Nothing else is stripped — a song
 * title is allowed its punctuation, and an institution that silently rewrote
 * what a citizen filed would be a worse joke than the one this application is
 * already making.
 */
export function tidyEntry(text: string): string | null {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LENGTH)
  return clean.length > 0 ? clean : null
}

/** The instruction shown to the audience, built from the configured command. */
export function fileInstruction(config: MusterConfig): string {
  return `TYPE !${config.command.trim().toLowerCase()} FOLLOWED BY YOUR ENTRY`
}

// ------------------------------------------------------------------ the clock

/**
 * Milliseconds left in the call, or null when it is untimed.
 *
 * Derived from the state and the clock rather than counted down and pushed —
 * the rule every timed thing in this application follows, and the reason a
 * browser source that OBS rebuilds mid-call shows the right number on its
 * first frame instead of starting again.
 */
export function remainingAt(state: MusterState, now: number): number | null {
  if (state.phase !== 'open' || state.closesAt === null) return null
  return Math.max(state.closesAt - now, 0)
}

/** True once a closed roll has held for its linger and should return to rest. */
export function musterAtRest(state: MusterState, now: number): boolean {
  if (state.phase === 'idle') return state.entries.length === 0
  if (state.phase !== 'closed') return false
  if (state.closedAt === null) return false

  return now - state.closedAt > clampLinger(state.config.lingerMs)
}

// ------------------------------------------------------------------ factories

export function createDefaultMusterConfig(): MusterConfig {
  return {
    title: 'THE MUSTER',
    prompt: 'WHAT SHOULD BE PLAYED?',
    command: DEFAULT_COMMAND,
    durationMs: DEFAULT_DURATION_MS,
    lingerMs: DEFAULT_LINGER_MS,
    perCitizen: 1,
    maxEntries: MAX_ENTRIES,
    theme: 'obsidian',
    transparent: false,
    showInstruction: true,
    showAuthors: true,
    showCount: true,
    showField: true,
    reserveRight: 0
  }
}

export function createEmptyMusterState(): MusterState {
  return {
    phase: 'idle',
    prompt: '',
    entries: [],
    config: createDefaultMusterConfig(),
    citizens: 0,
    turnedAway: 0,
    openedAt: null,
    closesAt: null,
    closedAt: null,
    revision: 0
  }
}
