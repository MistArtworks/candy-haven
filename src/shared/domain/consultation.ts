import { z } from 'zod'
import { ChainSchema, NoteSchema } from '../consult/engine'
import { DISPATCH_AUTHORS } from './dispatch.constants'
import {
  CONSULTATION_LINK_STATES,
  MAX_BPM,
  MAX_LINK_DAYS,
  MAX_MESSAGE,
  MAX_TITLE,
  MIN_BPM,
  SHARE_STAGES,
  STORAGE_LIMIT_BYTES
} from './consultation.constants'

/**
 * Schema half of CONSULTATION.
 *
 * The stored shapes default throughout, for the reason the inbox gives:
 * they were written from what the website said, and the website can gain a
 * field before this build knows what it is. A producer's notes and tools are
 * the exception. They are checked by the same schema the website checked
 * them with (`src/shared/consult/engine`, copied from the website), because
 * a note this console half-understood would be played back wrong.
 */

export const ConsultationLinkSchema = z.object({
  state: z.enum(CONSULTATION_LINK_STATES).default('signed-out'),
  /** Operator-facing description of the current state. */
  message: z.string().default(''),
  /** The website being read, as an origin. */
  website: z.string().default(''),
  /** The last check-in that went through, or null before the first. */
  syncedAt: z.number().nullable().default(null)
})
export type ConsultationLink = z.infer<typeof ConsultationLinkSchema>

/** What the meter shows: whether there's a store, and how much of it is used. */
export const ConsultationStorageSchema = z.object({
  /**
   * Whether the website has a Blob store to keep tracks in, as it last
   * said; null before it has said.
   */
  configured: z.boolean().nullable().default(null),
  /**
   * The tracks not yet deleted, shared from either copy of the console, by
   * the website's count; this copy's own sum before it has answered.
   */
  usedBytes: z.number().min(0).default(0),
  /** What Vercel's free plan includes. */
  limitBytes: z.number().positive().default(STORAGE_LIMIT_BYTES)
})
export type ConsultationStorage = z.infer<typeof ConsultationStorageSchema>

export const ConsultationStateSchema = z.object({
  link: ConsultationLinkSchema.prefault({}),
  storage: ConsultationStorageSchema.prefault({}),
  /** Feedback nobody here has opened yet, on links still open. The rail's mark. */
  waiting: z.number().int().min(0).default(0),
  /** Moves whenever the copy changes, so the page knows to re-read it. */
  revision: z.number().int().min(0).default(0)
})
export type ConsultationState = z.infer<typeof ConsultationStateSchema>

/** A shared track: the website's record of it, and this machine's own beside it. */
export const ConsultationSchema = z.object({
  /** The website's id for it. */
  id: z.string(),
  title: z.string().default(''),
  /** What the producers are asked, shown above the track on the page. */
  message: z.string().default(''),
  durationMs: z.number().min(0).default(0),
  bpm: z.number().nullable().default(null),
  /** The track in the website's Blob store. */
  audio: z
    .object({
      path: z.string().default(''),
      /** Its public address, which stops answering once the website deletes it. */
      url: z.string().default(''),
      bytes: z.number().min(0).default(0),
      contentType: z.string().default('')
    })
    .prefault({}),
  createdAt: z.number().default(0),
  /** Which of the two shared it, or null for an account this build doesn't know. */
  sharedBy: z.enum(DISPATCH_AUTHORS).nullable().default(null),
  expiresAt: z.number().default(0),
  /** Set when it was closed early. */
  endedAt: z.number().nullable().default(null),
  /** Set once the website deleted the track from its store. */
  audioDeletedAt: z.number().nullable().default(null),
  /** The page's address while it is open; null once it isn't. */
  link: z.string().nullable().default(null),
  /** The compact waveform (engine/peaks.ts), while it is open. */
  waveform: z.string().nullable().default(null),
  /** How much feedback the website held for it when it was last listed. */
  feedbackCount: z.number().int().min(0).default(0),
  /** The file it was shared from, when it was shared from this machine. Kept here only. */
  sourcePath: z.string().nullable().default(null),
  /** Feedback on it that nobody here has opened. Counted, not stored. */
  unread: z.number().int().min(0).default(0)
})
export type Consultation = z.infer<typeof ConsultationSchema>

/** One producer's feedback: their notes and sections, and any tools on the whole track. */
export const ConsultationFeedbackSchema = z.object({
  id: z.string(),
  consultationId: z.string(),
  /** The name the producer gave. */
  name: z.string().default(''),
  notes: z.array(NoteSchema).default([]),
  /** The tools they put on the whole track, or null for none. */
  chain: ChainSchema.nullable().default(null),
  submittedAt: z.number().default(0),
  /** When someone here first opened it; null while it is new. */
  readAt: z.number().nullable().default(null)
})
export type ConsultationFeedback = z.infer<typeof ConsultationFeedbackSchema>

// -------------------------------------------------------------------- inputs

/** A track to share, as the share dialog sends it. */
export const ConsultationDraftSchema = z.object({
  /** The file, wherever it sits on this machine. */
  path: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_TITLE),
  message: z.string().trim().max(MAX_MESSAGE).default(''),
  /** How long the link stays open: whole days, a week at most. */
  days: z.number().int().min(1).max(MAX_LINK_DAYS),
  bpm: z.number().min(MIN_BPM).max(MAX_BPM).nullable().default(null),
  /** The track's length, as the dialog decoded it. */
  durationMs: z.number().int().positive(),
  /** The compact waveform, as base64 (engine/peaks.ts). */
  waveform: z.string().min(1).max(20_000)
})
export type ConsultationDraft = z.infer<typeof ConsultationDraftSchema>

export const ConsultationTargetSchema = z.object({ id: z.string() })
export type ConsultationTarget = z.infer<typeof ConsultationTargetSchema>

/** A new time for an open link to close. A week from when it was shared, at the latest. */
export const ConsultationExpirySchema = z.object({
  id: z.string(),
  expiresAt: z.number()
})
export type ConsultationExpiry = z.infer<typeof ConsultationExpirySchema>

/** How far an upload has got, pushed while the share dialog waits. */
export const ConsultationProgressSchema = z.object({
  stage: z.enum(SHARE_STAGES),
  sent: z.number().min(0),
  total: z.number().min(0)
})
export type ConsultationProgress = z.infer<typeof ConsultationProgressSchema>
