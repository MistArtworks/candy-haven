import type { Collection, Db } from 'mongodb'
import { ArchiveTagSchema } from '@shared/domain/tags'
import type { ArchiveTag } from '@shared/domain/tags'
import { tagKey } from '@shared/domain/tags.constants'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('tags:repository')

/**
 * Mongo access for tags — the operator's own labels.
 *
 * Thin, like the volumes repository: it moves documents and nothing else.
 * Which projects carry a tag is not asked here at all, and deliberately so —
 * membership lives on the project, and the service reads it through the
 * projects service rather than querying a second collection.
 */

/**
 * Stored shape. `_id` carries what the domain calls `id`.
 *
 * `nameKey` is the one field on disk that the domain has no member for: the
 * case-folded name, stored so the unique index can enforce what the service
 * checks. Derived on every write and never read back into a record — deriving
 * it in the repository rather than asking callers to remember means the index
 * cannot be defeated by a caller that forgets.
 */
export type TagDocument = Omit<ArchiveTag, 'id'> & { _id: string; nameKey: string }

/**
 * Normalises a stored document into a domain record.
 *
 * Parsed through the schema rather than cast, for the reason recorded on the
 * projects repository: the database holds documents written by every past
 * version of the app, and the schema's defaults are what fill in whatever has
 * been added since.
 */
export function toTag(document: TagDocument): ArchiveTag | null {
  // `nameKey` rides along in `rest` and is dropped by the parse: zod strips
  // keys the schema does not declare, which is exactly the right behaviour for
  // a field the storage layer owns and the domain has no member for.
  const { _id, ...rest } = document
  const parsed = ArchiveTagSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable tag must not deny the operator the rest of the library.
    logger.warn(
      `Skipping unreadable tag record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class TagsRepository {
  constructor(private readonly db: Db) {}

  private get tags(): Collection<TagDocument> {
    return this.db.collection<TagDocument>(Collections.ArchiveTags)
  }

  async listAll(): Promise<ArchiveTag[]> {
    const documents = await this.tags.find({}).sort({ nameKey: 1 }).toArray()
    return documents.map(toTag).filter((tag): tag is ArchiveTag => tag !== null)
  }

  async findById(id: string): Promise<ArchiveTag | null> {
    const document = await this.tags.findOne({ _id: id })
    return document ? toTag(document) : null
  }

  /** Case-insensitive, which is the only way a name is ever looked up. */
  async findByName(name: string): Promise<ArchiveTag | null> {
    const document = await this.tags.findOne({ nameKey: tagKey(name) })
    return document ? toTag(document) : null
  }

  async insert(tag: ArchiveTag): Promise<void> {
    const { id, ...rest } = tag
    await this.tags.insertOne({ _id: id, nameKey: tagKey(tag.name), ...rest })
  }

  async replace(tag: ArchiveTag): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = tag
    await this.tags.replaceOne(
      { _id: id },
      { nameKey: tagKey(tag.name), ...rest },
      { upsert: true }
    )
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.tags.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
