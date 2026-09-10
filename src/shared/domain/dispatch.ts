import { z } from 'zod'
import {
  DISPATCH_AREAS,
  DISPATCH_AUTHORS,
  DISPATCH_BODY_MAX,
  DISPATCH_COMMENT_MAX,
  DISPATCH_KINDS,
  DISPATCH_LINK_STATES,
  DISPATCH_PRIORITIES,
  DISPATCH_REASON_MAX,
  DISPATCH_STATUSES,
  DISPATCH_TITLE_MAX
} from './dispatch.constants'

/**
 * Schema half of the DISPATCH domain.
 *
 * **Every field carries a default**, and here that is load-bearing twice over.
 * The router validates handler *output*, so one field without one fails the
 * whole channel rather than one record — but these records also arrive from a
 * *remote* database that the other operator's copy of the app wrote, possibly
 * running an older build. A missing key has to fill itself in rather than take
 * the board down mid-conversation.
 */

export const DispatchAuthorSchema = z.enum(DISPATCH_AUTHORS)
export const DispatchKindSchema = z.enum(DISPATCH_KINDS)
export const DispatchStatusSchema = z.enum(DISPATCH_STATUSES)
export const DispatchPrioritySchema = z.enum(DISPATCH_PRIORITIES)
export const DispatchAreaSchema = z.enum(DISPATCH_AREAS)

export const DispatchCommentSchema = z.object({
  id: z.string().default(''),
  author: DispatchAuthorSchema.default('candy'),
  body: z.string().max(DISPATCH_COMMENT_MAX).default(''),
  createdAt: z.number().default(0)
})
export type DispatchComment = z.infer<typeof DispatchCommentSchema>

/**
 * When each person last opened an item.
 *
 * A pair of timestamps rather than a per-comment read flag, which is what makes
 * the unread mark cheap: a comment is unread if it is newer than the reader's
 * stamp and somebody else wrote it. Two numbers replace a set that would grow
 * with the conversation, and both surfaces can compute it without asking.
 */
export const DispatchSeenSchema = z.object({
  mist: z.number().default(0),
  candy: z.number().default(0)
})
export type DispatchSeen = z.infer<typeof DispatchSeenSchema>

export const DispatchItemSchema = z.object({
  id: z.string().default(''),
  title: z.string().max(DISPATCH_TITLE_MAX).default(''),
  body: z.string().max(DISPATCH_BODY_MAX).default(''),
  kind: DispatchKindSchema.default('idea'),
  area: DispatchAreaSchema.default('general'),
  priority: DispatchPrioritySchema.default('normal'),
  author: DispatchAuthorSchema.default('candy'),

  createdAt: z.number().default(0),
  /** Bumped by any edit, comment or ruling. Drives RECENTLY DISCUSSED. */
  updatedAt: z.number().default(0),

  status: DispatchStatusSchema.default('pending'),
  /**
   * Why it was denied.
   *
   * Required by the interface for a denial and optional for a resolution: "no"
   * without a reason is the thing that makes a board like this stop being used,
   * whereas "done" usually speaks for itself.
   */
  statusReason: z.string().max(DISPATCH_REASON_MAX).nullable().default(null),
  statusAt: z.number().nullable().default(null),

  /**
   * Keyed rather than an array.
   *
   * The Realtime Database has no list type — an array is stored as an object
   * with numeric keys — and two people commenting at once would collide on an
   * index. Keyed writes cannot.
   */
  comments: z.record(z.string(), DispatchCommentSchema).default({}),
  seen: DispatchSeenSchema.prefault({})
})
export type DispatchItem = z.infer<typeof DispatchItemSchema>

export const DispatchLinkSchema = z.object({
  state: z.enum(DISPATCH_LINK_STATES).default('unconfigured'),
  /** Operator-facing description of the current state. */
  message: z.string().default(''),
  /** The project the board is attached to, once known. */
  projectId: z.string().nullable().default(null),
  /** When the last frame arrived from the database. */
  syncedAt: z.number().nullable().default(null)
})
export type DispatchLink = z.infer<typeof DispatchLinkSchema>

export const DispatchStateSchema = z.object({
  link: DispatchLinkSchema.prefault({}),
  items: z.array(DispatchItemSchema).default([]),
  revision: z.number().int().min(0).default(0)
})
export type DispatchState = z.infer<typeof DispatchStateSchema>

// -------------------------------------------------------------------- inputs

export const DispatchDraftSchema = z.object({
  title: z.string().min(1).max(DISPATCH_TITLE_MAX),
  body: z.string().max(DISPATCH_BODY_MAX).default(''),
  kind: DispatchKindSchema.default('idea'),
  area: DispatchAreaSchema.default('general'),
  priority: DispatchPrioritySchema.default('normal'),
  author: DispatchAuthorSchema
})
export type DispatchDraft = z.infer<typeof DispatchDraftSchema>

export const DispatchCommentDraftSchema = z.object({
  itemId: z.string(),
  author: DispatchAuthorSchema,
  body: z.string().min(1).max(DISPATCH_COMMENT_MAX)
})
export type DispatchCommentDraft = z.infer<typeof DispatchCommentDraftSchema>

/**
 * A ruling.
 *
 * `pending` is here alongside the two settled states because an item can be put
 * back — a denial made in haste should be reversible without deleting and
 * refiling, which would lose the discussion attached to it.
 */
export const DispatchRulingSchema = z.object({
  itemId: z.string(),
  status: DispatchStatusSchema,
  reason: z.string().max(DISPATCH_REASON_MAX).default('')
})
export type DispatchRuling = z.infer<typeof DispatchRulingSchema>

/** Marks everything on an item read, for one person, as of now. */
export const DispatchSeenMarkSchema = z.object({
  itemId: z.string(),
  author: DispatchAuthorSchema
})
export type DispatchSeenMark = z.infer<typeof DispatchSeenMarkSchema>

/**
 * The Firebase web config, as the console hands it out.
 *
 * Only `databaseURL` is load-bearing: the board talks to the Realtime Database
 * over its REST interface, which needs an address and nothing else. The rest is
 * kept because the operator pastes the whole snippet and throwing away four
 * fifths of it would make the saved file look wrong next to the console's.
 *
 * None of it is secret. A Firebase web config ships inside every web app that
 * uses one; access is governed by the database's rules, not by hiding this.
 */
export const FirebaseConfigSchema = z.object({
  apiKey: z.string().default(''),
  authDomain: z.string().default(''),
  databaseURL: z.string().default(''),
  projectId: z.string().default(''),
  storageBucket: z.string().default(''),
  messagingSenderId: z.string().default(''),
  appId: z.string().default('')
})
export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>

/** What the console needs to show the setup panel. Never returns the config. */
export const DispatchSetupSchema = z.object({
  configured: z.boolean().default(false),
  projectId: z.string().nullable().default(null),
  databaseUrl: z.string().nullable().default(null),
  /** Where a pasted config gets written, quoted so it can be edited by hand. */
  configPath: z.string().default('')
})
export type DispatchSetup = z.infer<typeof DispatchSetupSchema>
