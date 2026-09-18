import type { Collection, Db } from 'mongodb'
import { DiscographyReleaseSchema } from '@shared/domain/discography'
import type { DiscographyRelease } from '@shared/domain/discography'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('discography:repository')

/**
 * Mongo access for the catalogue.
 *
 * Thin, like the tags and artists repositories: it moves documents and
 * nothing else. Which running order a release has, whether a track may be
 * linked, what happens when an artist is removed — all policy, and all in the
 * service where it can be read as one piece of logic.
 */

export type ReleaseDocument = Omit<DiscographyRelease, 'id'> & { _id: string }

export function toRelease(document: ReleaseDocument): DiscographyRelease | null {
  const { _id, ...rest } = document
  const parsed = DiscographyReleaseSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable release must not deny the operator the whole catalogue.
    logger.warn(
      `Skipping unreadable release record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class DiscographyRepository {
  constructor(private readonly db: Db) {}

  private get releases(): Collection<ReleaseDocument> {
    return this.db.collection<ReleaseDocument>(Collections.Discography)
  }

  /**
   * The catalogue, newest first.
   *
   * Undated entries sort last rather than first, which is what `releaseDate`
   * being null has to mean here: an idea with no date is not the most recent
   * thing that happened. Mongo sorts null below any string on a descending
   * index, which gives that for free.
   */
  async listAll(): Promise<DiscographyRelease[]> {
    const documents = await this.releases.find({}).sort({ releaseDate: -1, title: 1 }).toArray()
    return documents
      .map(toRelease)
      .filter((release): release is DiscographyRelease => release !== null)
  }

  async findById(id: string): Promise<DiscographyRelease | null> {
    const document = await this.releases.findOne({ _id: id })
    return document ? toRelease(document) : null
  }

  async insert(release: DiscographyRelease): Promise<void> {
    const { id, ...rest } = release
    await this.releases.insertOne({ _id: id, ...rest })
  }

  async replace(release: DiscographyRelease): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = release
    await this.releases.replaceOne({ _id: id }, rest, { upsert: true })
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.releases.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
