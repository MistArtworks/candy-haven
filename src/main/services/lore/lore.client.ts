import {
  LoreSiteSchema,
  PublishedChapterSchema,
  type LoreSite,
  type PublishedChapter
} from '@shared/domain/lore'
import type { PlanetSpec } from '@shared/planets/engine'
import { getLogger } from '@main/core/logger'
import { identityForUid } from '@main/services/dispatch/identity.auth'
import { SiteError, callWebsite, jsonBody, readJson } from '@main/services/website/website.http'

const logger = getLogger('lore:client')

/** A chapter as it's sent to be published: all of it, with a copy of its planet. */
export interface PublishBody {
  slug: string
  title: string
  line: string
  body: string
  planet: { id: string; name: string; spec: PlanetSpec }
  /** The published revision the draft started from: 0 for one never published. */
  baseRevision: number
  force: boolean
}

/**
 * The website's lore API, as this console calls it (`/api/haven/lore/*`).
 *
 * The website keeps only what's published, so there are four calls: what's
 * published, publish a chapter, take one down, and the order. Every one
 * answers with what's published again, so the console never has to work
 * out what the other person published in the meantime. A publish the
 * website refuses because the other person published that chapter first
 * throws a SiteError of kind `conflict`, whose body carries their version
 * (`conflictOf` reads it out).
 *
 * The website names who published by account id; this console names them
 * by who they are (mist, candy), as DISPATCH does.
 */
export class LoreClient {
  constructor(
    /** The website's origin, `https://candy-heist.vercel.app`. */
    private readonly origin: string,
    private readonly token: () => Promise<string | null>
  ) {}

  site(): Promise<LoreSite> {
    return this.ask('/api/haven/lore', { method: 'GET' })
  }

  publish(id: string, body: PublishBody): Promise<LoreSite> {
    return this.ask(`/api/haven/lore/chapters/${encodeURIComponent(id)}`, jsonBody('PUT', body))
  }

  unpublish(id: string): Promise<LoreSite> {
    return this.ask(`/api/haven/lore/chapters/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  publishOrder(ids: string[]): Promise<LoreSite> {
    return this.ask('/api/haven/lore/order', jsonBody('PUT', { ids }))
  }

  // ----------------------------------------------------------------- private

  private async ask(path: string, init: RequestInit): Promise<LoreSite> {
    const response = await callWebsite(this.origin, this.token, path, init)
    return readSite(await readJson(response))
  }
}

/** `mist`, `candy`, or the id as it came when it's neither. */
const who = (uid: unknown): string => (typeof uid === 'string' ? (identityForUid(uid) ?? uid) : '')

function readChapter(raw: unknown): PublishedChapter | null {
  const value = (raw ?? {}) as Record<string, unknown>
  const parsed = PublishedChapterSchema.safeParse({
    ...value,
    publishedBy: who(value.publishedBy)
  })
  if (parsed.success) return parsed.data
  logger.warn('Left out a published chapter this build cannot read', parsed.error.issues)
  return null
}

/**
 * What's published, from what the website sent. One chapter in a shape this
 * build can't read is left out on its own, not the whole lore.
 */
export function readSite(raw: unknown): LoreSite {
  const value = (raw ?? {}) as { live?: unknown; chapters?: unknown }
  if (!Array.isArray(value.chapters)) {
    throw new SiteError('failed', 'The website answered in a shape this console does not know.')
  }
  return LoreSiteSchema.parse({
    live: value.live === true,
    chapters: value.chapters.flatMap((chapter) => readChapter(chapter) ?? [])
  })
}

/**
 * The version a refused publish was refused for: the other person's, or
 * null when they took the chapter down. Undefined when the refusal carried
 * neither, which isn't a conflict this console can settle.
 */
export function conflictOf(error: SiteError): PublishedChapter | null | undefined {
  const body = error.body as { current?: unknown } | null
  if (!body || !('current' in body)) return undefined
  if (body.current === null) return null
  return readChapter(body.current) ?? undefined
}
