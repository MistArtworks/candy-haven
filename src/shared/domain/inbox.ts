import { z } from 'zod'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  CANCEL_NOTE_MAX,
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
  /** When the visitor sent it. */
  createdAt: z.number().default(0),
  /** The operator's own note. Kept on this machine and never sent. */
  note: z.string().max(INBOX_NOTE_MAX).default('')
}

const text = z.string().default('')

/**
 * A message from the website's contact page.
 *
 * `status`, like `note`, is the operator's and this machine's: every copy
 * starts new, and where it goes from there is never sent anywhere.
 */
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

export const BookingStatusSchema = z.enum(BOOKING_STATUSES)

/**
 * A booking from the website's "Book me as a music producer": paid for, a
 * commission's first half or a session's whole fee.
 *
 * The website owns everything here but `status` and `note`: what the client
 * gave, what they paid, a session's time (moved or not) and whether it was
 * cancelled. Each check-in lays its latest over the copy. Times are
 * instants, as milliseconds; the page shows them in this PC's zone.
 */
export const SiteBookingSchema = z.object({
  id: z.string(),
  /** The reference the client was given, `CH-K3P2Q8`. */
  ref: z.string().default(''),
  kind: z.enum(BOOKING_KINDS).catch('commission'),
  /** The service's address on the website, and its name when booked. */
  itemId: text,
  itemName: text,
  /** A session cancelled from here: its time is open again. */
  cancelled: z.boolean().default(false),
  /** A session's time; null for a commission. */
  start: z.number().nullable().default(null),
  end: z.number().nullable().default(null),
  /** Where the client booked from, so their time can be shown beside this one's. */
  visitorTimeZone: text,
  name: text,
  email: text,
  /** A session's call: Google Meet, or Discord with the Meet link as a fallback. */
  meetOn: z.enum(['meet', 'discord']).catch('meet'),
  instagram: text,
  discord: text,
  phone: text,
  /** What the client wrote when they booked. */
  clientNote: text,
  /** In cents, Canadian dollars. */
  totalCents: z.number().int().min(0).default(0),
  /** Paid at booking: a session in full, half a commission. */
  nowCents: z.number().int().min(0).default(0),
  /** A commission's other half, on its invoice. */
  laterCents: z.number().int().min(0).default(0),
  createdAt: z.number().default(0),
  paidAt: z.number().nullable().default(null),
  /** When the website last changed it. */
  updatedAt: z.number().default(0),
  meetLink: text,
  /** A commission's other half: its ID, and whether it's paid. */
  invoice: z
    .object({
      ref: text,
      status: z.enum(['open', 'paid']).catch('open'),
      dueCents: z.number().int().min(0).default(0),
      paidAt: z.number().nullable().default(null)
    })
    .nullable()
    .default(null),
  /** The payment, in Stripe's dashboard. */
  paymentUrl: text,
  /** Each time it was moved, oldest first. */
  moves: z.array(z.object({ from: z.number(), to: z.number(), at: z.number() })).default([]),
  cancelledAt: z.number().nullable().default(null),
  /** What the client was told when it was cancelled. */
  cancelNote: text,
  /** The operator's own, as with enquiries: kept here, never sent. */
  status: BookingStatusSchema.default('new'),
  note: z.string().max(INBOX_NOTE_MAX).default('')
})
export type SiteBooking = z.infer<typeof SiteBookingSchema>

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
      enquiries: z.number().int().min(0).default(0),
      /** Producer bookings nobody has taken up yet. */
      bookings: z.number().int().min(0).default(0)
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

export const BookingStatusChangeSchema = z.object({
  id: z.string(),
  status: BookingStatusSchema
})
export type BookingStatusChange = z.infer<typeof BookingStatusChangeSchema>

export const BookingNoteSchema = z.object({
  id: z.string(),
  note: z.string().max(INBOX_NOTE_MAX)
})
export type BookingNote = z.infer<typeof BookingNoteSchema>

/** A session to another time, the same length. */
export const BookingMoveSchema = z.object({
  id: z.string(),
  /** The new start, as an instant. */
  start: z.number(),
  /** Move it even though the calendar has something then. */
  force: z.boolean().default(false)
})
export type BookingMove = z.infer<typeof BookingMoveSchema>

export const BookingCancelSchema = z.object({
  id: z.string(),
  /** Said to the client in the website's email, if anything. */
  note: z.string().max(CANCEL_NOTE_MAX).default('')
})
export type BookingCancel = z.infer<typeof BookingCancelSchema>

/**
 * A move or a cancel: done, with whether the calendar and the client were
 * told; or, for a move, the calendar has something else on then, which is
 * a question (move it anyway?) rather than a refusal.
 */
export const BookingChangeResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('done'),
    booking: SiteBookingSchema,
    calendar: z.enum(['updated', 'removed', 'not-connected', 'failed']),
    email: z.enum(['sent', 'not-connected', 'failed'])
  }),
  z.object({ status: z.literal('busy'), message: z.string() })
])
export type BookingChangeResult = z.infer<typeof BookingChangeResultSchema>
