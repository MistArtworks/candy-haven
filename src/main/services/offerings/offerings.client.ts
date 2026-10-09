import { z } from 'zod'
import {
  ServicesSiteSchema,
  type OfferingHours,
  type ServicesSite,
  type SiteService
} from '@shared/domain/offerings'
import { identityForUid } from '@main/services/dispatch/identity.auth'
import { SiteError, callWebsite, jsonBody, readJson } from '@main/services/website/website.http'

/**
 * The website's services API, as SERVICES' OFFERINGS calls it.
 *
 * Three calls: what the website offers (its own list, before the first
 * publish), a publish of the whole list with the hours, and a photo, sent
 * on its own first and published by the addresses the website answers
 * with. How a call is made, signed in, and what its failures mean, is
 * shared with LORE: see website/website.http.ts.
 */

export interface PublishBody {
  items: SiteService[]
  hours: OfferingHours
  /** The website's revision this list started from: 0 before the first publish. */
  baseRevision: number
  force: boolean
}

const PhotoSchema = z.object({ card: z.string(), wide: z.string() })

export class OfferingsClient {
  constructor(
    /** The website's origin. */
    private readonly origin: string,
    private readonly token: () => Promise<string | null>
  ) {}

  async site(): Promise<ServicesSite> {
    return readSite(await readJson(await this.call('/api/haven/services', { method: 'GET' })))
  }

  async publish(body: PublishBody): Promise<ServicesSite> {
    return readSite(await readJson(await this.call('/api/haven/services', jsonBody('PUT', body))))
  }

  /** Sends a photo; the website cuts the card and the banner and answers where they are. */
  async photo(body: Buffer, type: string): Promise<{ card: string; wide: string }> {
    const response = await this.call('/api/haven/services/photo', {
      method: 'PUT',
      headers: { 'Content-Type': type },
      body: new Uint8Array(body)
    })
    const parsed = PhotoSchema.safeParse(await readJson(response))
    if (!parsed.success) {
      throw new SiteError('failed', 'The website answered in a shape this console does not know.')
    }
    return parsed.data
  }

  private call(path: string, init: RequestInit): Promise<Response> {
    return callWebsite(this.origin, this.token, path, init)
  }
}

/** Who published, as DISPATCH names them (`mist`, `candy`), or the account id this build doesn't know. */
const who = (uid: string | null): string | null => (uid ? (identityForUid(uid) ?? uid) : null)

export function readSite(raw: unknown): ServicesSite {
  const parsed = ServicesSiteSchema.safeParse(raw)
  if (!parsed.success) {
    throw new SiteError('failed', 'The website answered in a shape this console does not know.')
  }
  return { ...parsed.data, publishedBy: who(parsed.data.publishedBy) }
}

/** What a refused publish says the website has now; undefined when it says nothing readable. */
export function conflictOf(error: SiteError): ServicesSite | undefined {
  const current = (error.body as { current?: unknown } | null)?.current
  const parsed = ServicesSiteSchema.safeParse(current)
  return parsed.success ? { ...parsed.data, publishedBy: who(parsed.data.publishedBy) } : undefined
}
