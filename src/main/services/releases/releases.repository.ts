import type { Collection, Db } from 'mongodb'
import { ReleasesSiteSchema, type ReleasesSite, type SiteFields } from '@shared/domain/releases'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('releases:repository')

/**
 * One DISCOGRAPHY release on one website: its id there, and what was last
 * sent of it, so a change sends only the fields that changed.
 */
export interface ReleaseLink {
  website: string
  /** Its id in DISCOGRAPHY. */
  releaseId: string
  /** Its id on the website. */
  siteId: string
  /** The fields as last sent; null when the last send couldn't be read back. */
  sent: SiteFields | null
  sentAt: number
  /** A send that didn't reach the website, tried again on Sync now. */
  pending: boolean
  /** It left DISCOGRAPHY, and the website hasn't been told yet. */
  removed: boolean
  /**
   * Which cover the website was sent (`coverSignature`), or null for none.
   * Missing on links made before covers went.
   */
  cover?: string | null
}

interface LinkDocument extends ReleaseLink {
  _id: string
}

interface SiteDocument {
  _id: string
  site: unknown
  fetchedAt: number
}

const keyOf = (website: string, releaseId: string): string => `${website} ${releaseId}`

/**
 * What RELEASES keeps here, per website: which release is which there, and
 * a copy of what the website has, so the department opens at once and with
 * the network down. Another address (a development server) is another
 * website, with its own links, so testing there never touches the real one.
 */
export class ReleasesRepository {
  constructor(private readonly db: Db) {}

  private get links(): Collection<LinkDocument> {
    return this.db.collection<LinkDocument>(Collections.ReleasesLinks)
  }

  private get cache(): Collection<SiteDocument> {
    return this.db.collection<SiteDocument>(Collections.ReleasesCache)
  }

  async linksFor(website: string): Promise<ReleaseLink[]> {
    const documents = await this.links.find({ website }, { projection: { _id: 0 } }).toArray()
    return documents as ReleaseLink[]
  }

  async saveLink(link: ReleaseLink): Promise<void> {
    const _id = keyOf(link.website, link.releaseId)
    await this.links.replaceOne({ _id }, link, { upsert: true })
  }

  async deleteLink(website: string, releaseId: string): Promise<void> {
    await this.links.deleteOne({ _id: keyOf(website, releaseId) })
  }

  async readSite(website: string): Promise<{ site: ReleasesSite; fetchedAt: number } | null> {
    const document = await this.cache.findOne({ _id: website })
    if (!document) return null
    const parsed = ReleasesSiteSchema.safeParse(document.site)
    if (!parsed.success) {
      logger.warn(`Left out the releases kept for ${website}: this build cannot read them`)
      return null
    }
    return { site: parsed.data, fetchedAt: document.fetchedAt }
  }

  async saveSite(website: string, site: ReleasesSite, fetchedAt: number): Promise<void> {
    await this.cache.replaceOne({ _id: website }, { site, fetchedAt }, { upsert: true })
  }
}
