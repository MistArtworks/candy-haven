import { z } from 'zod'
import { sparseShape } from './patch'
import {
  DEFAULT_SPIN_DURATION_MS,
  RITE_MECHANISMS,
  MAX_EDGE_RESERVE,
  MAX_PETITIONS,
  MAX_PETITION_LABEL,
  OVERLAY_THEMES,
  ROSTER_SIDES,
  SPIN_DURATION_MAX_MS,
  SPIN_DURATION_MIN_MS
} from './rite.constants'

/**
 * Schema half of the rite domain — the selection rite served by the OBSERVATORY
 * department to an OBS browser source.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. The arithmetic that turns a spin command into a ring angle lives in
 * rite.constants.ts so both the host console and the standalone overlay page can
 * import it as values without pulling zod into either bundle.
 *
 * As with the projects domain: **every field added here must carry a default**,
 * because the state is persisted and a record written by an earlier build is
 * missing whatever was added since. The IPC router validates handler output, so
 * a field without a default turns a restored state into a hard failure of every
 * rite channel at once.
 */

export type { RiteMechanism } from './rite.constants'

export const RitePhaseSchema = z.enum(['idle', 'spinning', 'resolved'])
export type RitePhase = z.infer<typeof RitePhaseSchema>

/**
 * One entry in the pool.
 *
 * `filedBy` is null for anything the operator typed. It exists now so that when
 * chat submissions land, attribution is already part of the record rather than a
 * migration — the overlay wants to credit whoever suggested the winner.
 */
export const PetitionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(MAX_PETITION_LABEL),
  /**
   * Entry count. Equal odds ship as 1 for everything; the field exists so a
   * weighted draw (subscriber bonus entries, a returning suggestion) does not
   * require reshaping stored state later.
   */
  weight: z.number().int().min(1).max(999).default(1),
  filedBy: z.string().nullable().default(null),
  filedAt: z.number().default(0)
})
export type Petition = z.infer<typeof PetitionSchema>

/**
 * Everything needed to replay one spin, decided once in the main process.
 *
 * The winner is chosen *before* the animation starts and travels with the
 * command. Both surfaces then render a deterministic function of this object —
 * they are not each rolling their own result and hoping to agree. Getting this
 * wrong is the failure that puts two different winners on screen at once, in
 * front of an audience.
 */
export const SpinCommandSchema = z.object({
  id: z.string(),
  targetIndex: z.number().int().min(0),
  /**
   * Petition count at the moment the spin was armed.
   *
   * Pins the ring's geometry for the duration. The roster is locked while a
   * spin runs, but carrying the count means a late-arriving overlay draws the
   * same ring even if it also received a newer roster.
   */
  segmentCount: z.number().int().min(1),
  revolutions: z.number().min(1).max(24),
  durationMs: z.number().int().min(SPIN_DURATION_MIN_MS).max(SPIN_DURATION_MAX_MS),
  settleMs: z.number().int().min(0).max(4_000),
  /** Epoch milliseconds. Host and overlay share a wall clock — same machine. */
  startedAt: z.number()
})
export type SpinCommand = z.infer<typeof SpinCommandSchema>

/**
 * A settled selection. Carries the label rather than only the petition id so
 * the result still renders after `removeOnSelect` has dropped the entry.
 */
export const RiteResultSchema = z.object({
  petitionId: z.string(),
  label: z.string(),
  filedBy: z.string().nullable().default(null),
  index: z.number().int().min(0),
  at: z.number(),
  /** Pool size the draw was made from, so the odds stay auditable after the fact. */
  poolSize: z.number().int().min(0).default(0)
})
export type RiteResult = z.infer<typeof RiteResultSchema>

export const RiteConfigSchema = z.object({
  /**
   * How the selection is presented.
   *
   * A presentation choice only. The winner is drawn once in the main process
   * and travels in the spin command, so every mechanism renders the same
   * result and none of them can disagree with the console.
   *
   * Caught rather than merely defaulted, because mechanisms get retired. The
   * repository parses a stored rite with `safeParse` and discards the whole
   * thing if it fails, so without this a config naming a mechanism that no
   * longer exists would take the roster and the history down with it.
   */
  mechanism: z.enum(RITE_MECHANISMS).default('ring').catch('ring'),
  /** Masthead on the overlay. */
  title: z.string().max(64).default('RESONANCE SELECTION'),
  /** The question being put to the field, e.g. `WHICH TRACK DO WE REMIX`. */
  prompt: z.string().max(96).default('THE FIELD WILL CHOOSE'),
  durationMs: z
    .number()
    .int()
    .min(SPIN_DURATION_MIN_MS)
    .max(SPIN_DURATION_MAX_MS)
    .default(DEFAULT_SPIN_DURATION_MS),
  /** Drop the winner from the pool once it resolves, for elimination rounds. */
  removeOnSelect: z.boolean().default(false),
  /** Show the roster column on the overlay alongside the ring. */
  showRoster: z.boolean().default(true),
  /**
   * Fraction of the overlay's width held clear at the right edge.
   *
   * Nothing is drawn into it — it is there so a chat panel and a camera can be
   * composited over that band in OBS. Stored as a fraction rather than pixels
   * because a browser source can be sized to anything, and a reserve measured
   * in pixels would stop lining up with the artwork the moment it was.
   */
  reserveRight: z.number().min(0).max(MAX_EDGE_RESERVE).default(0.2),

  // ------------------------------------------------------------ presentation
  // Look, as opposed to behaviour. All of it is a fixed set of choices within
  // the locked palette rather than free-form styling.

  /**
   * Composite over the scene instead of drawing a backdrop.
   *
   * Config rather than only a URL flag, so it is a checkbox in the console. The
   * `?transparent=1` parameter is kept as a per-source override, for running two
   * browser sources off the same overlay with different compositing.
   */
  transparent: z.boolean().default(false),
  theme: z.enum(OVERLAY_THEMES).default('obsidian'),
  /** Which side the roster column occupies. */
  rosterSide: z.enum(ROSTER_SIDES).default('left'),
  /** The title block: eyebrow, title, question and rule. */
  showMasthead: z.boolean().default(true),
  /** The rotating resonance field behind the ring. */
  showField: z.boolean().default(true),
  /** Per-petition odds in the roster column. Hidden keeps the draw opaque. */
  showOdds: z.boolean().default(true),
  /** The faint connection diagnostic at the foot of the overlay. */
  showStatus: z.boolean().default(true)
})
export type RiteConfig = z.infer<typeof RiteConfigSchema>

export const RiteStateSchema = z.object({
  phase: RitePhaseSchema.default('idle'),
  petitions: z.array(PetitionSchema).max(MAX_PETITIONS).default([]),
  config: RiteConfigSchema.prefault({}),
  spin: SpinCommandSchema.nullable().default(null),
  winner: RiteResultSchema.nullable().default(null),
  history: z.array(RiteResultSchema).default([]),
  /**
   * Incremented on every mutation.
   *
   * The overlay redraws its roster only when this changes, so a heartbeat or a
   * reconnect does not rebuild the DOM mid-spin.
   */
  revision: z.number().int().min(0).default(0)
})
export type RiteState = z.infer<typeof RiteStateSchema>

/** Live state of the local overlay server, for the host's connection panel. */
export const OverlayServerInfoSchema = z.object({
  running: z.boolean(),
  /** The URL to paste into OBS. Null until the server is listening. */
  url: z.string().nullable(),
  port: z.number().int().nullable(),
  /** Browser sources currently attached to the event stream. */
  clients: z.number().int().min(0),
  /** Why the server is not listening, when it is not. */
  error: z.string().nullable()
})
export type OverlayServerInfo = z.infer<typeof OverlayServerInfoSchema>

// -------------------------------------------------------------------- inputs

export const PetitionDraftSchema = z.object({
  label: z.string().min(1).max(MAX_PETITION_LABEL),
  weight: z.number().int().min(1).max(999).optional(),
  filedBy: z.string().max(64).nullable().optional()
})
export type PetitionDraft = z.infer<typeof PetitionDraftSchema>

/**
 * A genuinely sparse patch — only the keys the caller actually sent.
 *
 * `RiteConfigSchema.partial()` is **not** sufficient here, and this bit hard.
 * Every field above carries a `.default()` because the config is persisted and a
 * document written by an earlier build is missing whatever has been added since.
 * But zod still applies those defaults for absent keys through `.partial()`, so
 * the "patch" arrived carrying all thirteen fields at their default values —
 * and `updateConfig`'s merge therefore reset twelve options every time one was
 * written. It presented as none of the presentation options working: each
 * change silently undid the one before it.
 *
 * Unwrapping each field's default before making it optional is what lets an
 * absent key stay absent. Derived from `RiteConfigSchema.shape` rather than
 * re-declared, so the two cannot disagree about what a field accepts.
 */
/** Every config field, unwrapped out of its default and made optional. */
type RiteConfigPatchShape = {
  [K in keyof RiteConfig]: z.ZodOptional<z.ZodType<RiteConfig[K]>>
}

/*
 * `Object.fromEntries` inside `sparseShape` erases key types, so the mapping has
 * to be asserted.
 *
 * This used to call `field.unwrap()` directly, which peeled exactly one layer —
 * and that quietly stopped being enough the moment `mechanism` gained a
 * `.catch()`, because a catch wrapping a default leaves the default in place. So
 * every `rite:config` write had begun re-injecting `mechanism: 'ring'` and
 * resetting the operator's chosen presentation. `sparseShape` loops instead.
 */
const riteConfigPatchShape = sparseShape(RiteConfigSchema.shape) as unknown as RiteConfigPatchShape

export const RiteConfigPatchSchema = z.object(riteConfigPatchShape)
export type RiteConfigPatch = z.infer<typeof RiteConfigPatchSchema>
