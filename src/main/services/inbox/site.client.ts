import { z } from 'zod'
import type { EnquiryStatus, InboxKind, MessageStatus } from '@shared/domain/inbox.constants'
import { EnquiryStatusSchema, MessageStatusSchema } from '@shared/domain/inbox'

/**
 * The website's private API, as this console calls it.
 *
 * Three calls and nothing else: what changed since a moment, a new status for
 * one thing, and a deletion. Every one carries the board's sign-in as a bearer
 * token, which the website checks against Google's keys and the two accounts'
 * ids before it touches its database. The database itself is never reached
 * from here, and its password is on no machine this console runs on: the
 * repository and the installer are public, and a password in either would be
 * a password for anyone. See docs/INBOX.md.
 *
 * Plain `fetch` rather than `core/net`'s retrying `request`. A check-in that
 * fails is tried again in a minute anyway, and backing off inside one would
 * hold the next one up behind it; what this needs from a failure is its
 * status, so the page can say which kind it was.
 */

/** How long one call may take before it counts as unreachable. */
const TIMEOUT_MS = 15_000

/**
 * Why a call to the website failed, in the terms the page states it in.
 *
 * `unreachable` is the network or the website being down. The rest are the
 * website answering, and each needs something different done about it.
 */
export type SiteFailureKind =
  | 'unreachable'
  /** The token was refused: expired between refresh and use, or not real. */
  | 'refused'
  /** A real sign-in for an account that is not one of the two. */
  | 'forbidden'
  /** Too many refused attempts from here; the website is waiting an hour. */
  | 'limited'
  /** The website has no database or sign-in settings yet. */
  | 'unconfigured'
  /** The thing is gone: deleted from the other copy. */
  | 'missing'
  | 'failed'

export class SiteError extends Error {
  constructor(
    readonly kind: SiteFailureKind,
    message: string
  ) {
    super(message)
    this.name = 'SiteError'
  }
}

const RemoteFiled = {
  id: z.string(),
  ref: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string()
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
  status: MessageStatusSchema.catch('new'),
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
  status: EnquiryStatusSchema.catch('new'),
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

  /** Everything changed or deleted since `since`, or since the start. */
  async changes(since: string | null): Promise<SiteChanges> {
    const query = since ? `?since=${encodeURIComponent(since)}` : ''
    const response = await this.call(`/api/haven/inbox${query}`, { method: 'GET' })

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new SiteError('failed', 'The website answered with something that is not JSON.')
    }

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

  async setStatus(
    kind: InboxKind,
    id: string,
    status: MessageStatus | EnquiryStatus
  ): Promise<void> {
    await this.call(`/api/haven/${PATH[kind]}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
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

  private async call(path: string, init: RequestInit): Promise<Response> {
    const token = await this.token()
    if (!token) throw new SiteError('refused', 'Sign in to reach the website.')

    let response: Response
    try {
      response = await fetch(`${this.origin}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // The website marks these no-store; saying so here as well keeps a
        // cached answer from passing for a fresh one.
        cache: 'no-store'
      })
    } catch {
      throw new SiteError('unreachable', `Could not reach ${this.origin}.`)
    }

    if (response.ok) return response

    // The website names its refusals (`not_configured`, `database_unavailable`)
    // as well as numbering them, and two of them share a 503.
    const code = await response
      .json()
      .then((body: unknown) => (body as { error?: unknown } | null)?.error)
      .catch(() => undefined)
    throw failure(response.status, typeof code === 'string' ? code : '', this.origin)
  }
}

function failure(status: number, code: string, origin: string): SiteError {
  if (status === 503 && code === 'database_unavailable') {
    return new SiteError('unreachable', `${origin} cannot reach its database right now.`)
  }

  switch (status) {
    case 401:
      return new SiteError('refused', 'The website did not accept the sign-in.')
    case 403:
      return new SiteError('forbidden', 'The website does not let this account in.')
    case 404:
      return new SiteError('missing', 'The website no longer has it.')
    case 429:
      return new SiteError(
        'limited',
        'The website is refusing this machine for an hour after too many failed sign-ins.'
      )
    case 503:
      return new SiteError('unconfigured', `${origin} is not set up for the console yet.`)
    default:
      return new SiteError(
        status >= 500 ? 'unreachable' : 'failed',
        `The website answered ${status}.`
      )
  }
}
