import { z } from 'zod'

/**
 * CALENDAR — the dated register.
 *
 * The department that replaces TRANSMISSIONS, which was deleted along with the
 * release model it read from. Nothing of that model survives here: an entry is
 * a dated statement of intent, owned by the operator, and it is not derived
 * from a project or a release. Anything that later wants to *appear* on the
 * calendar without being one of these — a release date held on a release
 * record — belongs in a projection over this, not in this schema.
 *
 * Dates are plain `YYYY-MM-DD` strings, as everywhere else in the project: a
 * session booked on the 14th is on the 14th regardless of where the machine
 * thinks it is, and storing an instant would drag it across a day boundary the
 * first time the operator travelled or the clocks changed. Times of day are
 * minutes from local midnight for the same reason — a number, not a moment.
 */

export const CALENDAR_KINDS = ['session', 'delivery', 'broadcast', 'rite', 'deadline'] as const
export const CalendarKindSchema = z.enum(CALENDAR_KINDS)
export type CalendarKind = z.infer<typeof CalendarKindSchema>

/** `YYYY-MM-DD`. Validated by shape rather than parsed, for the reason above. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

/** Minutes from local midnight, 0..1439. */
export const MinuteOfDaySchema = z.number().int().min(0).max(1439)

export const CalendarEntrySchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  kind: CalendarKindSchema,
  date: IsoDateSchema,
  /**
   * Null for an entry that occupies the whole day.
   *
   * The distinction is not cosmetic: an all-day entry is drawn in the day's
   * header band in every timed view, because a deadline that falls "on the
   * 14th" has no business being drawn at midnight, where it would read as an
   * appointment nobody made.
   */
  startMinute: MinuteOfDaySchema.nullable().default(null),
  /** Length in minutes. Ignored when `startMinute` is null. */
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  notes: z.string().max(2000).default(''),
  /** Struck through and dimmed rather than deleted, so the record survives. */
  done: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>

export const CalendarDraftSchema = z.object({
  title: z.string().min(1).max(160),
  kind: CalendarKindSchema.default('session'),
  date: IsoDateSchema,
  startMinute: MinuteOfDaySchema.nullable().default(null),
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  notes: z.string().max(2000).default('')
})
export type CalendarDraft = z.infer<typeof CalendarDraftSchema>

/**
 * Sparse by hand rather than `.partial()` — the same trap documented at length
 * in domain/settings.ts. Every field below carries a default, so `.partial()`
 * would re-materialise them and a title edit would silently reset the notes.
 */
export const CalendarPatchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  kind: CalendarKindSchema.optional(),
  date: IsoDateSchema.optional(),
  startMinute: MinuteOfDaySchema.nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  notes: z.string().max(2000).optional(),
  done: z.boolean().optional()
})
export type CalendarPatch = z.infer<typeof CalendarPatchSchema>

export const CalendarStateSchema = z.object({
  /** Every entry held, sorted by date then start time. */
  entries: z.array(CalendarEntrySchema).default([]),
  /**
   * Whether the register is backed by a connected archive.
   *
   * Reported rather than inferred from an empty list, because "nothing is
   * scheduled" and "the archive is down so nothing could be read" look
   * identical on screen and mean opposite things.
   */
  attached: z.boolean().default(false)
})
export type CalendarState = z.infer<typeof CalendarStateSchema>

export function createCalendarState(): CalendarState {
  return { entries: [], attached: false }
}
