import type { Collection, Db } from 'mongodb'
import {
  LoreDraftSchema,
  LorePlanetSchema,
  LoreSiteSchema,
  type LoreDraft,
  type LorePlanet,
  type LoreSite
} from '@shared/domain/lore'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('lore:repository')

/**
 * LORE's half of the archive.
 *
 * The drafts, the planet library and the chapters' order live here and
 * nowhere else: the website is sent a chapter only when it's published.
 * Beside them, what the website has published as last fetched, one
 * document per website, so the department opens at once and still opens
 * with the network down; a development copy reading a development server
 * never shows its test chapters as the real ones.
 *
 * Every record is read back through its schema, and one this build can't
 * read is left out on its own, with a warning, rather than failing the lot.
 */

type Stored<T extends { id: string }> = Omit<T, 'id'> & { _id: string }

interface OrderDocument {
  _id: 'order'
  ids: string[]
}

interface SiteDocument {
  /** The website, as an origin. */
  _id: string
  site: unknown
  fetchedAt: number
}

const stored = <T extends { id: string }>({ id, ...rest }: T): Stored<T> => ({ ...rest, _id: id })

function readAll<T>(
  documents: Array<{ _id: string } & Record<string, unknown>>,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
  what: string
): T[] {
  return documents.flatMap(({ _id, ...rest }) => {
    const parsed = parse({ ...rest, id: _id })
    if (parsed.success) return [parsed.data]
    logger.warn(`Left out ${what} ${_id}: this build cannot read it`)
    return []
  })
}

export class LoreRepository {
  constructor(private readonly db: Db) {}

  private get chapters(): Collection<Stored<LoreDraft>> {
    return this.db.collection<Stored<LoreDraft>>(Collections.LoreChapters)
  }

  private get planetDocs(): Collection<Stored<LorePlanet>> {
    return this.db.collection<Stored<LorePlanet>>(Collections.LorePlanets)
  }

  private get orderDoc(): Collection<OrderDocument> {
    return this.db.collection<OrderDocument>(Collections.LoreOrder)
  }

  private get cache(): Collection<SiteDocument> {
    return this.db.collection<SiteDocument>(Collections.LoreCache)
  }

  // ------------------------------------------------------------------ drafts

  async drafts(): Promise<LoreDraft[]> {
    const documents = await this.chapters.find().sort({ createdAt: 1 }).toArray()
    return readAll(documents, (value) => LoreDraftSchema.safeParse(value), 'a chapter')
  }

  async saveDraft(draft: LoreDraft): Promise<void> {
    const { _id, ...rest } = stored(draft)
    await this.chapters.replaceOne({ _id }, rest, { upsert: true })
  }

  async deleteDraft(id: string): Promise<void> {
    await this.chapters.deleteOne({ _id: id })
  }

  // ----------------------------------------------------------------- planets

  async planets(): Promise<LorePlanet[]> {
    const documents = await this.planetDocs.find().sort({ createdAt: 1 }).toArray()
    return readAll(documents, (value) => LorePlanetSchema.safeParse(value), 'a planet')
  }

  async savePlanet(planet: LorePlanet): Promise<void> {
    const { _id, ...rest } = stored(planet)
    await this.planetDocs.replaceOne({ _id }, rest, { upsert: true })
  }

  async deletePlanet(id: string): Promise<void> {
    await this.planetDocs.deleteOne({ _id: id })
  }

  // ------------------------------------------------------------------- order

  async order(): Promise<string[]> {
    const document = await this.orderDoc.findOne({ _id: 'order' })
    return Array.isArray(document?.ids) ? document.ids.filter((id) => typeof id === 'string') : []
  }

  async saveOrder(ids: string[]): Promise<void> {
    await this.orderDoc.replaceOne({ _id: 'order' }, { ids }, { upsert: true })
  }

  // ------------------------------------------------- what's published, kept

  async readSite(website: string): Promise<{ site: LoreSite; fetchedAt: number } | null> {
    const document = await this.cache.findOne({ _id: website })
    if (!document?.site) return null
    const parsed = LoreSiteSchema.safeParse(document.site)
    if (parsed.success) return { site: parsed.data, fetchedAt: document.fetchedAt }
    logger.warn(`The kept copy of what ${website} has published is unreadable; ignoring it`)
    return null
  }

  async writeSite(website: string, site: LoreSite): Promise<void> {
    await this.cache.replaceOne({ _id: website }, { site, fetchedAt: Date.now() }, { upsert: true })
  }
}
