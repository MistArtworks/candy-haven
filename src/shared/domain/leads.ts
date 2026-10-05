import { z } from 'zod'
import { ArtistLinkSchema } from './artists'
import {
  DEFAULT_COOLING_PER_WEEK,
  DEFAULT_CURRENCY,
  DEFAULT_INTERACTIONS,
  MAX_INTERACTION_POINTS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_STAGES,
  SNOOZES,
  TASK_PRIORITIES
} from './leads.constants'

/**
 * LEADS and OPPORTUNITIES: ARTISTS' light CRM, as schemas.
 *
 * A lead holds its own interactions and tasks rather than pointing at rows
 * elsewhere: a relationship is read whole, a handful of leads at a time, and
 * nothing else in the archive needs a task on its own. The same for an
 * opportunity's tasks. CALENDAR shows the tasks by projection (see
 * `CalendarFollowUpSchema`), never by copy.
 *
 * Everything stays on the PC it's entered on, like the rest of the archive.
 * Nothing here goes to the website. See leads.constants.ts for the rules.
 */

const Points = z.number().int().min(-MAX_INTERACTION_POINTS).max(MAX_INTERACTION_POINTS)
const Temperature = z.number().min(0).max(100)

/**
 * A profile or a page of theirs: Instagram, TikTok, a website. The roster's
 * own shape, so ARTISTS' link editor serves both, and a lead who joins the
 * roster brings theirs across as they are.
 */
export const LeadLinkSchema = ArtistLinkSchema
export type LeadLink = z.infer<typeof LeadLinkSchema>

/** Something that happened between them, as Candy logged it, with its points. */
export const InteractionSchema = z.object({
  id: z.string().min(1),
  at: z.number(),
  text: z.string().min(1).max(200),
  points: Points
})
export type Interaction = z.infer<typeof InteractionSchema>

/**
 * A follow-up. Its status is worked out, never stored (`taskStatus`): done
 * once `completedAt` is set, else pending or overdue by the clock. A snooze
 * quiets its reminders until then; a dismissal quiets them for good, without
 * completing it.
 */
export const LeadTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  dueAt: z.number(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  notes: z.string().max(2000).default(''),
  completedAt: z.number().nullable().default(null),
  snoozedUntil: z.number().nullable().default(null),
  dismissedAt: z.number().nullable().default(null),
  createdAt: z.number()
})
export type LeadTask = z.infer<typeof LeadTaskSchema>

export const LeadSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  notes: z.string().max(4000).default(''),
  links: z.array(LeadLinkSchema).max(12).default([]),
  email: z.string().max(200).default(''),
  phone: z.string().max(60).default(''),
  /** Someone already on the roster, when they are. */
  artistId: z.string().nullable().default(null),
  /**
   * Set by hand on the slider; null follows the interactions
   * (`automaticTemperature`). Pinned, it stays put until set back.
   */
  pinnedTemperature: Temperature.nullable().default(null),
  /** Oldest first. */
  interactions: z.array(InteractionSchema).default([]),
  tasks: z.array(LeadTaskSchema).default([]),
  archivedAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Lead = z.infer<typeof LeadSchema>

/**
 * Real work that came of a lead. Its stage is its own, and separate from the
 * lead's temperature: a hot relationship can carry a stalled project.
 */
export const OpportunitySchema = z.object({
  id: z.string(),
  leadId: z.string(),
  title: z.string().min(1).max(160),
  kind: z.enum(OPPORTUNITY_KINDS).default('collaboration'),
  stage: z.enum(OPPORTUNITY_STAGES).default('open'),
  /** What it's worth, when that's known. */
  amount: z.number().min(0).nullable().default(null),
  currency: z.string().min(1).max(8).default(DEFAULT_CURRENCY),
  notes: z.string().max(4000).default(''),
  tasks: z.array(LeadTaskSchema).default([]),
  /** When it reached Won or Lost; null while open. */
  closedAt: z.number().nullable().default(null),
  archivedAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Opportunity = z.infer<typeof OpportunitySchema>

export const LeadsStateSchema = z.object({
  leads: z.array(LeadSchema).default([]),
  opportunities: z.array(OpportunitySchema).default([]),
  /** Whether a connected archive backs this; "none yet" and "can't read" differ. */
  attached: z.boolean().default(false)
})
export type LeadsState = z.infer<typeof LeadsStateSchema>

// -------------------------------------------------------------------- drafts

export const LeadDraftSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(4000).default(''),
  links: z.array(LeadLinkSchema).max(12).default([]),
  email: z.string().max(200).default(''),
  phone: z.string().max(60).default(''),
  artistId: z.string().nullable().default(null),
  /** When the first interaction is due; left out, now. */
  firstTaskDueAt: z.number().nullable().default(null)
})
export type LeadDraft = z.infer<typeof LeadDraftSchema>

/** Sparse by hand, not `.partial()`: see the note in domain/settings.ts. */
export const LeadPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(4000).optional(),
  links: z.array(LeadLinkSchema).max(12).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  artistId: z.string().nullable().optional(),
  archived: z.boolean().optional()
})
export type LeadPatch = z.infer<typeof LeadPatchSchema>

export const InteractionDraftSchema = z.object({
  text: z.string().min(1).max(200),
  points: Points,
  /** Left out, now. */
  at: z.number().optional()
})
export type InteractionDraft = z.infer<typeof InteractionDraftSchema>

/** Which task: a lead's or an opportunity's. */
export const TaskRefSchema = z.object({
  parentKind: z.enum(['lead', 'opportunity']),
  parentId: z.string().min(1),
  taskId: z.string().min(1)
})
export type TaskRef = z.infer<typeof TaskRefSchema>

export const TaskDraftSchema = z.object({
  title: z.string().min(1).max(160),
  dueAt: z.number(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  notes: z.string().max(2000).default('')
})
export type TaskDraft = z.infer<typeof TaskDraftSchema>

export const TaskPatchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  dueAt: z.number().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  notes: z.string().max(2000).optional(),
  /** Done, or not done after all. */
  completed: z.boolean().optional()
})
export type TaskPatch = z.infer<typeof TaskPatchSchema>

export const SnoozeSchema = z.enum(SNOOZES)

export const OpportunityDraftSchema = z.object({
  leadId: z.string().min(1),
  title: z.string().min(1).max(160),
  kind: z.enum(OPPORTUNITY_KINDS).default('collaboration'),
  amount: z.number().min(0).nullable().default(null),
  currency: z.string().min(1).max(8).default(DEFAULT_CURRENCY),
  notes: z.string().max(4000).default('')
})
export type OpportunityDraft = z.infer<typeof OpportunityDraftSchema>

export const OpportunityPatchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  kind: z.enum(OPPORTUNITY_KINDS).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  amount: z.number().min(0).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  notes: z.string().max(4000).optional(),
  archived: z.boolean().optional()
})
export type OpportunityPatch = z.infer<typeof OpportunityPatchSchema>

// ------------------------------------------------------------------ settings

/** One of the suggestions when logging, kept in REGULATION. */
export const PredefinedInteractionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  points: Points
})
export type PredefinedInteraction = z.infer<typeof PredefinedInteractionSchema>

/** REGULATION's LEADS section. */
export const LeadsSettingsSchema = z.object({
  /** The suggestions Candy picks from when logging, each with its points. */
  interactions: z
    .array(PredefinedInteractionSchema)
    .max(40)
    .default(DEFAULT_INTERACTIONS.map((entry) => ({ ...entry }))),
  /** Points a lead loses for each week nothing is logged. */
  coolingPerWeek: z.number().int().min(0).max(50).default(DEFAULT_COOLING_PER_WEEK),
  /** A Windows notification when a follow-up comes due, and one on opening. */
  reminders: z.boolean().default(true)
})
export type LeadsSettings = z.infer<typeof LeadsSettingsSchema>
