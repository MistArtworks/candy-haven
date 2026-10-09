import type { AnyBulkWriteOperation, Collection, Db } from 'mongodb'
import {
  OfferingHoursSchema,
  OfferingSchema,
  OfferingsBaseSchema,
  ServicesSiteSchema,
  type Offering,
  type OfferingHours,
  type OfferingsBase,
  type ServicesSite
} from '@shared/domain/offerings'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('offerings:repository')

/**
 * Mongo access for SERVICES' OFFERINGS and HOURS: the services and the
 * hours as written here, what each website was last sent from here, and a
 * copy of what each website offers, as last fetched.
 *
 * The services are keyed by this console's own ids and carry their place
 * in the list, so the order survives a restart. The hours are one document.
 * What was sent, and the copy, are one document per website: a development
 * server is another website, with its own.
 */

type OfferingDocument = Omit<Offering, 'id'> & { _id: string; order: number }

interface HoursDocument extends OfferingHours {
  _id: 'hours'
  updatedAt: number
}

type BaseDocument = OfferingsBase & { _id: string }

interface CacheDocument {
  /** The website, as an origin. */
  _id: string
  site: ServicesSite
  fetchedAt: number
}

export class OfferingsRepository {
  constructor(private readonly db: Db) {}

  private get collection(): Collection<OfferingDocument> {
    return this.db.collection<OfferingDocument>(Collections.ServiceOfferings)
  }

  private get hoursCollection(): Collection<HoursDocument> {
    return this.db.collection<HoursDocument>(Collections.ServiceHours)
  }

  private get links(): Collection<BaseDocument> {
    return this.db.collection<BaseDocument>(Collections.ServiceLinks)
  }

  private get cache(): Collection<CacheDocument> {
    return this.db.collection<CacheDocument>(Collections.ServiceCache)
  }

  // --------------------------------------------------------------- services

  /** Every service here, in its order. */
  async offerings(): Promise<Offering[]> {
    const documents = await this.collection.find().sort({ order: 1 }).toArray()
    return documents.flatMap((document) => {
      const { _id, order: _order, ...rest } = document
      void _order
      const parsed = OfferingSchema.safeParse({ ...rest, id: _id })
      if (parsed.success) return [parsed.data]
      logger.warn(`Service ${_id} is unreadable; leaving it out`)
      return []
    })
  }

  async saveOffering(offering: Offering, order: number): Promise<void> {
    const { id, ...rest } = offering
    await this.collection.replaceOne({ _id: id }, { ...rest, order }, { upsert: true })
  }

  async deleteOffering(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id })
  }

  /** Puts the services in this order, by id. */
  async saveOrder(ids: readonly string[]): Promise<void> {
    if (!ids.length) return
    const operations: AnyBulkWriteOperation<OfferingDocument>[] = ids.map((id, order) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order } } }
    }))
    await this.collection.bulkWrite(operations, { ordered: false })
  }

  /** The whole list replaced: what a copy from the website does. */
  async replaceAll(offerings: readonly Offering[]): Promise<void> {
    await this.collection.deleteMany({})
    if (!offerings.length) return
    await this.collection.insertMany(
      offerings.map(({ id, ...rest }, order) => ({ ...rest, _id: id, order }))
    )
  }

  // ------------------------------------------------------------------ hours

  async hours(): Promise<OfferingHours | null> {
    const document = await this.hoursCollection.findOne({ _id: 'hours' })
    if (!document) return null
    const parsed = OfferingHoursSchema.safeParse(document)
    if (parsed.success) return parsed.data
    logger.warn('The hours kept here are unreadable; showing the website’s')
    return null
  }

  async saveHours(hours: OfferingHours): Promise<void> {
    await this.hoursCollection.replaceOne(
      { _id: 'hours' },
      { ...hours, updatedAt: Date.now() },
      { upsert: true }
    )
  }

  // ------------------------------------------------------------ the website

  /** What this PC last published to a website, or null before it ever has. */
  async base(website: string): Promise<OfferingsBase | null> {
    const document = await this.links.findOne({ _id: website })
    if (!document) return null
    const parsed = OfferingsBaseSchema.safeParse(document)
    return parsed.success ? parsed.data : null
  }

  async saveBase(website: string, base: OfferingsBase): Promise<void> {
    await this.links.replaceOne({ _id: website }, base, { upsert: true })
  }

  async readSite(website: string): Promise<{ site: ServicesSite; fetchedAt: number } | null> {
    const document = await this.cache.findOne({ _id: website })
    if (!document) return null
    const parsed = ServicesSiteSchema.safeParse(document.site)
    return parsed.success ? { site: parsed.data, fetchedAt: document.fetchedAt } : null
  }

  async writeSite(website: string, site: ServicesSite): Promise<void> {
    await this.cache.replaceOne({ _id: website }, { site, fetchedAt: Date.now() }, { upsert: true })
  }
}
