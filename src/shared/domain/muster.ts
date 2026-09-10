import { z } from 'zod'
import { OVERLAY_THEMES } from './concord.constants'
import {
  DEFAULT_DURATION_MS,
  DEFAULT_LINGER_MS,
  MAX_ENTRIES,
  MAX_ENTRY_LENGTH,
  MAX_PROMPT_LENGTH,
  MUSTER_PHASES,
  PER_CITIZEN_MAX,
  PER_CITIZEN_MIN
} from './muster.constants'

/**
 * Schema half of the muster domain — the open call.
 *
 * As with the rite and the concord: **every field carries a default**, because
 * the state is persisted and the router validates handler *output*, so one
 * field without one fails the whole channel rather than one record.
 */

export const MusterPhaseSchema = z.enum(MUSTER_PHASES)

/**
 * One filing.
 *
 * `authorId` is the chat user id, not the display name, and it is what the
 * per-citizen limit counts. A display name can change mid-stream and two
 * people can have names that differ only in case; the id cannot.
 */
export const MusterEntrySchema = z.object({
  id: z.string().default(''),
  text: z.string().max(MAX_ENTRY_LENGTH).default(''),
  /** Display name, credited on the overlay. */
  author: z.string().default(''),
  authorId: z.string().default(''),
  at: z.number().default(0)
})
export type MusterEntry = z.infer<typeof MusterEntrySchema>

export const MusterConfigSchema = z.object({
  title: z.string().max(48).default('THE MUSTER'),
  /** The standing question. A call can override it without changing this. */
  prompt: z.string().max(MAX_PROMPT_LENGTH).default('WHAT SHOULD BE PLAYED?'),
  /** The word after the bang. Stored without it. */
  command: z.string().max(24).default('add'),

  /** How long a call runs. Zero means until the operator closes it. */
  durationMs: z.number().int().min(0).default(DEFAULT_DURATION_MS),
  /** How long a closed roll holds on screen before returning to rest. */
  lingerMs: z.number().int().min(0).default(DEFAULT_LINGER_MS),

  perCitizen: z.number().int().min(PER_CITIZEN_MIN).max(PER_CITIZEN_MAX).default(1),
  maxEntries: z.number().int().min(1).max(MAX_ENTRIES).default(MAX_ENTRIES),

  theme: z.enum(OVERLAY_THEMES).default('obsidian').catch('obsidian'),
  transparent: z.boolean().default(false),
  showInstruction: z.boolean().default(true),
  /** Credit each entry to whoever filed it. */
  showAuthors: z.boolean().default(true),
  showCount: z.boolean().default(true),
  showField: z.boolean().default(true),
  /** Fraction of the width held clear at the right, for compositing. */
  reserveRight: z.number().min(0).max(0.6).default(0)
})
export type MusterConfig = z.infer<typeof MusterConfigSchema>

export const MusterStateSchema = z.object({
  phase: MusterPhaseSchema.default('idle'),
  /**
   * The question this call put, captured when it opened.
   *
   * Held separately from `config.prompt` so that editing the standing question
   * mid-call does not rewrite the one the audience is answering — the roll and
   * the question it was filed against have to stay together.
   */
  prompt: z.string().max(MAX_PROMPT_LENGTH).default(''),
  entries: z.array(MusterEntrySchema).max(MAX_ENTRIES).default([]),
  config: MusterConfigSchema.prefault({}),

  /**
   * Distinct people who have filed, and filings refused for the cap.
   *
   * Two numbers because they answer different questions: how many the call
   * reached, and whether it was cut short by its own ceiling.
   */
  citizens: z.number().int().min(0).default(0),
  turnedAway: z.number().int().min(0).default(0),

  openedAt: z.number().nullable().default(null),
  closesAt: z.number().nullable().default(null),
  closedAt: z.number().nullable().default(null),

  /** Incremented on every published change, as the concord's is. */
  revision: z.number().int().min(0).default(0)
})
export type MusterState = z.infer<typeof MusterStateSchema>

// -------------------------------------------------------------------- inputs

/** Opening a call, optionally with a question other than the standing one. */
export const MusterCallSchema = z.object({
  prompt: z.string().max(MAX_PROMPT_LENGTH).default('')
})
export type MusterCall = z.infer<typeof MusterCallSchema>

/** The operator filing on someone's behalf, or seeding a roll before a call. */
export const MusterEntryDraftSchema = z.object({
  text: z.string().min(1).max(MAX_ENTRY_LENGTH),
  author: z.string().max(48).default('')
})
export type MusterEntryDraft = z.infer<typeof MusterEntryDraftSchema>

/**
 * Where a finished roll goes.
 *
 * The whole point of the call: entries arrive as people and leave as options.
 * `both` exists because the two are not exclusive — a roll can be voted down
 * to a shortlist in the chamber and the shortlist then drawn from on the ring.
 */
export const MUSTER_DESTINATIONS = ['selection', 'concord', 'both'] as const
export type MusterDestination = (typeof MUSTER_DESTINATIONS)[number]

export const MusterHandoffSchema = z.object({
  destination: z.enum(MUSTER_DESTINATIONS),
  /** Clear the roll once it has been handed on. */
  clear: z.boolean().default(false)
})
export type MusterHandoff = z.infer<typeof MusterHandoffSchema>

/**
 * A genuinely sparse patch.
 *
 * `.partial()` would not be: every field carries a `.default()`, and zod
 * applies those for absent keys, so a patch would arrive carrying all fifteen
 * and writing one option would reset the other fourteen. Same reasoning as
 * `ConcordConfigPatchSchema`.
 */
type MusterConfigPatchShape = {
  [K in keyof MusterConfig]: z.ZodOptional<z.ZodType<MusterConfig[K]>>
}

const musterConfigPatchShape = Object.fromEntries(
  Object.entries(MusterConfigSchema.shape).map(([key, field]) => [key, field.unwrap().optional()])
) as unknown as MusterConfigPatchShape

export const MusterConfigPatchSchema = z.object(musterConfigPatchShape)
export type MusterConfigPatch = z.infer<typeof MusterConfigPatchSchema>
