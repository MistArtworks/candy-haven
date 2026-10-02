import { z } from 'zod'
import type { InboxKind } from '@shared/domain/inbox.constants'
import { SiteError, callWebsite, readJson } from '@main/services/website/website.http'

/**
 * The website's private API, as this console calls it.
 *
 * Two calls and nothing else: what was sent or deleted since a moment, and a
 * deletion. Where each thing stands is the operator's and stays on this
 * machine, so there is nothing else to send. How a call is made, signed in,
 * and what its failures mean, is shared with LORE: see website/website.http.ts.
 */

export { SiteError, type SiteFailureKind } from '@main/services/website/website.http'

const RemoteFiled = {
  id: z.string(),
  ref: z.string().default(''),
  createdAt: z.string()
}

const text = z.string().catch('')

/**
 * The website's message, as it sends it.
 *
 * Text fields fall back to empty rather than failing, for the same reason the
 * stored schemas default: the website may change before this build does.
 */
const RemoteMessageSchema = z.object({
  ...RemoteFiled,
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
export type RemoteMessage = z.infer<typeof RemoteMessageSchema>

const RemoteEnquirySchema = z.object({
  ...RemoteFiled,
  name: text,
  title: text,
  email: text,
  phone: text,
  eventName: text,
  eventVenue: text,
  budget: text,
  about: text
})
export type RemoteEnquiry = z.infer<typeof RemoteEnquirySchema>

const RemoteDeletionSchema = z.object({
  kind: z.enum(['message', 'enquiry']),
  id: z.string(),
  deletedAt: z.string()
})
export type RemoteDeletion = z.infer<typeof RemoteDeletionSchema>

/**
 * One page of changes.
 *
 * Records are validated one at a time by the caller rather than here, so one
 * the website wrote in a shape this build cannot read is dropped on its own
 * instead of taking the page, and every page after it, with it.
 */
const ChangesSchema = z.object({
  messages: z.array(z.unknown()).default([]),
  enquiries: z.array(z.unknown()).default([]),
  deletions: z.array(z.unknown()).default([]),
  cursor: z.string(),
  more: z.boolean().default(false)
})

export interface SiteChanges {
  messages: RemoteMessage[]
  enquiries: RemoteEnquiry[]
  deletions: RemoteDeletion[]
  /** Where to ask from next time. Opaque; it is handed straight back. */
  cursor: string
  /** Whether there was more than one page held, so ask again now. */
  more: boolean
  /** How many records could not be read and were left out. */
  unreadable: number
}

const PATH: Record<InboxKind, string> = {
  message: 'messages',
  enquiry: 'enquiries'
}

export class SiteClient {
  constructor(
    /** The website's origin, `https://candy-heist.vercel.app`. */
    private readonly origin: string,
    private readonly token: () => Promise<string | null>
  ) {}

  /** Everything sent or deleted since `since`, or since the start. */
  async changes(since: string | null): Promise<SiteChanges> {
    const query = since ? `?since=${encodeURIComponent(since)}` : ''
    const response = await this.call(`/api/haven/inbox${query}`, { method: 'GET' })
    const body = await readJson(response)

    const page = ChangesSchema.safeParse(body)
    if (!page.success) {
      throw new SiteError('failed', 'The website answered in a shape this console does not know.')
    }

    let unreadable = 0
    const each = <T>(schema: z.ZodType<T>, values: unknown[]): T[] =>
      values.flatMap((value) => {
        const parsed = schema.safeParse(value)
        if (parsed.success) return [parsed.data]
        unreadable += 1
        return []
      })

    return {
      messages: each(RemoteMessageSchema, page.data.messages),
      enquiries: each(RemoteEnquirySchema, page.data.enquiries),
      deletions: each(RemoteDeletionSchema, page.data.deletions),
      cursor: page.data.cursor,
      more: page.data.more,
      unreadable
    }
  }

  /** Deletes it from the website. Already gone counts as done. */
  async remove(kind: InboxKind, id: string): Promise<void> {
    try {
      await this.call(`/api/haven/${PATH[kind]}/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (error) {
      if (error instanceof SiteError && error.kind === 'missing') return
      throw error
    }
  }

  // ----------------------------------------------------------------- private

  private call(path: string, init: RequestInit): Promise<Response> {
    return callWebsite(this.origin, this.token, path, init)
  }
}
