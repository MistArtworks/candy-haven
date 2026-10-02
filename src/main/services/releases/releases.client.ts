import {
  ReleasesSiteSchema,
  SiteReleaseSchema,
  type ReleasesSite,
  type SiteFields
} from '@shared/domain/releases'
import { getLogger } from '@main/core/logger'
import { identityForUid } from '@main/services/dispatch/identity.auth'
import { SiteError, callWebsite, jsonBody, readJson } from '@main/services/website/website.http'

const logger = getLogger('releases:client')

/** What the website hands back for a send: what it has, and its id for each release sent. */
export interface SendResult {
  site: ReleasesSite
  ids: Record<string, string>
}

/** Everything the Update bar sends, in one request. */
export interface SiteChanges {
  /** Releases the website doesn't have from here yet, keyed by DISCOGRAPHY id. */
  add: { ref: string; fields: SiteFields }[]
  /** Fields changed since last sent, by website id. */
  update: { id: string; fields: Partial<SiteFields> }[]
  /** Hidden by hand (false), or not (null), by website id. */
  visibility: { id: string; shown: boolean | null }[]
  /** The whole shelf, when it changed. */
  shelf?: string[]
}

/**
 * The website's releases API, as this console calls it
 * (`/api/haven/releases/*`).
 *
 * Every call answers with what the website has again, so the page never has
 * to work out what the other computer sent in the meantime. The website
 * names who sent a release by account id; this console names them by who
 * they are (mist, candy), as DISPATCH does.
 */
export class ReleasesClient {
  constructor(
    /** The website's origin, `https://candy-heist.vercel.app`. */
    private readonly origin: string,
    private readonly token: () => Promise<string | null>
  ) {}

  site(): Promise<ReleasesSite> {
    return this.ask('/api/haven/releases', { method: 'GET' })
  }

  /** "Publish everything": every release, keyed by its DISCOGRAPHY id. */
  async everything(releases: { ref: string; fields: SiteFields }[]): Promise<SendResult> {
    return this.send('/api/haven/releases/all', jsonBody('POST', { releases }))
  }

  /** A release this console hasn't sent before. */
  async add(ref: string, fields: SiteFields): Promise<SendResult> {
    return this.send('/api/haven/releases', jsonBody('POST', { ref, fields }))
  }

  /** The fields that changed since this console last sent them. */
  update(siteId: string, fields: Partial<SiteFields>): Promise<ReleasesSite> {
    return this.ask(`/api/haven/releases/${encodeURIComponent(siteId)}`, jsonBody('PATCH', fields))
  }

  remove(siteId: string): Promise<ReleasesSite> {
    return this.ask(`/api/haven/releases/${encodeURIComponent(siteId)}`, { method: 'DELETE' })
  }

  /**
   * A release's cover, shrunk here; the website makes it a 750×750 WebP and
   * keeps it in its own storage.
   */
  cover(siteId: string, body: Buffer, type: string): Promise<ReleasesSite> {
    return this.ask(`/api/haven/releases/${encodeURIComponent(siteId)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': type },
      body: new Uint8Array(body)
    })
  }

  /** Back to the placeholder: the release has no cover here any more. */
  clearCover(siteId: string): Promise<ReleasesSite> {
    return this.ask(`/api/haven/releases/${encodeURIComponent(siteId)}/cover`, {
      method: 'DELETE'
    })
  }

  /**
   * Many changes at once. The website checks them all before it writes any,
   * so they land together or not at all.
   */
  changes(changes: SiteChanges): Promise<SendResult> {
    return this.send('/api/haven/releases/changes', jsonBody('POST', changes))
  }

  // ----------------------------------------------------------------- private

  private async ask(path: string, init: RequestInit): Promise<ReleasesSite> {
    const response = await callWebsite(this.origin, this.token, path, init)
    return readSite(await readJson(response))
  }

  private async send(path: string, init: RequestInit): Promise<SendResult> {
    const response = await callWebsite(this.origin, this.token, path, init)
    const raw = await readJson(response)
    const ids = (raw as { ids?: unknown } | null)?.ids
    return {
      site: readSite(raw),
      ids:
        ids && typeof ids === 'object'
          ? Object.fromEntries(
              Object.entries(ids).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
              )
            )
          : {}
    }
  }
}

/** `mist`, `candy`, or the id as it came when it's neither. */
const who = (uid: unknown): string => (typeof uid === 'string' ? (identityForUid(uid) ?? uid) : '')

/**
 * What the website has, from what it sent. One release in a shape this
 * build can't read is left out on its own, not all of them.
 */
export function readSite(raw: unknown): ReleasesSite {
  const value = (raw ?? {}) as { live?: unknown; releases?: unknown; shelf?: unknown }
  if (!Array.isArray(value.releases)) {
    throw new SiteError('failed', 'The website answered in a shape this console does not know.')
  }
  const releases = value.releases.flatMap((raw) => {
    const release = (raw ?? {}) as Record<string, unknown>
    const parsed = SiteReleaseSchema.safeParse({ ...release, updatedBy: who(release.updatedBy) })
    if (parsed.success) return [parsed.data]
    logger.warn('Left out a release this build cannot read', parsed.error.issues)
    return []
  })
  return ReleasesSiteSchema.parse({
    live: value.live === true,
    releases,
    shelf: Array.isArray(value.shelf) ? value.shelf.filter((id) => typeof id === 'string') : []
  })
}
