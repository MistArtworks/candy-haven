import { z } from 'zod'
import {
  ENQUIRY_STATUSES,
  INBOX_KINDS,
  INBOX_LINK_STATES,
  INBOX_NOTE_MAX,
  MESSAGE_STATUSES
} from './inbox.constants'

/**
 * Schema half of the website inbox.
 *
 * Every field carries a default, for the reason DISPATCH gives: these records
 * were written by something other than this build. Here it is the website,
 * which can gain a field before the console knows what it is, and a copy that
 * is missing one must fill it in rather than empty the list.
 */

export const MessageStatusSchema = z.enum(MESSAGE_STATUSES)
export const EnquiryStatusSchema = z.enum(ENQUIRY_STATUSES)
export const InboxKindSchema = z.enum(INBOX_KINDS)

/** What every filed thing carries, whichever form it came from. */
const FiledShape = {
  /** The website's id for it. Opaque here; it is only ever sent back. */
  id: z.string(),
  /** The reference the visitor could quote, `MSG-7KQ2XD` or `DJ-…`. */
  ref: z.string().default(''),
  createdAt: z.number().default(0),
  /** When the website last changed it, from either copy of the console. */
  updatedAt: z.number().default(0),
  /** The operator's own note. Kept on this machine and never sent. */
  note: z.string().max(INBOX_NOTE_MAX).default(''),
  /**
   * A status set here that the website has not taken yet.
   *
   * Set while offline, and cleared by the next check-in that delivers it. A
   * check-in that brings the website's older status back does not overwrite
   * one of these: the operator's later word stands.
   */
  pending: z.boolean().default(false)
}

const text = z.string().default('')

/** A message from the website's contact page. */
export const SiteMessageSchema = z.object({
  ...FiledShape,
  status: MessageStatusSchema.default('new'),
  name: text,
  email: text,
  subject: text,
  message: text,
  phone: text,
  organisation: text,
  date: text,
  location: text,
  budget: text,
  links: text
})
export type SiteMessage = z.infer<typeof SiteMessageSchema>

/** A booking enquiry from the website's "Book me as a DJ" page. */
export const SiteEnquirySchema = z.object({
  ...FiledShape,
  status: EnquiryStatusSchema.default('new'),
  name: text,
  /** The sender's role, "Booking agent" or the like, not a title for the event. */
  title: text,
  email: text,
  phone: text,
  eventName: text,
  eventVenue: text,
  budget: text,
  about: text
})
export type SiteEnquiry = z.infer<typeof SiteEnquirySchema>

export const InboxLinkSchema = z.object({
  state: z.enum(INBOX_LINK_STATES).default('signed-out'),
  /** Operator-facing description of the current state. */
  message: z.string().default(''),
  /** The website being read, as an origin. */
  website: z.string().default(''),
  /** The last check-in that went through, or null before the first. */
  syncedAt: z.number().nullable().default(null)
})
export type InboxLink = z.infer<typeof InboxLinkSchema>

export const InboxStateSchema = z.object({
  link: InboxLinkSchema.prefault({}),
  /**
   * What is waiting: messages nobody has opened, enquiries nobody has taken
   * up. The rail and the startup notice read these.
   */
  waiting: z
    .object({
      messages: z.number().int().min(0).default(0),
      enquiries: z.number().int().min(0).default(0)
    })
    .prefault({}),
  /** Moves whenever the copy changes, so the pages know to re-read it. */
  revision: z.number().int().min(0).default(0)
})
export type InboxState = z.infer<typeof InboxStateSchema>

// -------------------------------------------------------------------- inputs

export const MessageStatusChangeSchema = z.object({
  id: z.string(),
  status: MessageStatusSchema
})
export type MessageStatusChange = z.infer<typeof MessageStatusChangeSchema>

export const EnquiryStatusChangeSchema = z.object({
  id: z.string(),
  status: EnquiryStatusSchema
})
export type EnquiryStatusChange = z.infer<typeof EnquiryStatusChangeSchema>

export const InboxNoteSchema = z.object({
  kind: InboxKindSchema,
  id: z.string(),
  note: z.string().max(INBOX_NOTE_MAX)
})
export type InboxNote = z.infer<typeof InboxNoteSchema>

export const InboxTargetSchema = z.object({
  kind: InboxKindSchema,
  id: z.string()
})
export type InboxTarget = z.infer<typeof InboxTargetSchema>
