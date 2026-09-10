import type { Collection, Db } from 'mongodb'
import { ArchiveReleaseSchema } from '@shared/domain/releases'
import type { ArchiveRelease } from '@shared/domain/releases'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('releases:repository')

/**
 * Mongo access for releases.
 *
 * Thin, like every other repository here: it moves documents. Where a release
 * folder lives, what gets copied into it and what happens when its subject
 * disappears are all policy, and live in the service.
 */

/** Stored shape. `_id` carries what the domain calls `id`. */
export type ReleaseDocument = Omit<ArchiveRelease, 'id'> & { _id: string }

/**
 * Normalises a stored document into a domain record.
 *
 * Parsed through the schema rather than cast, for the reason recorded on the
 * projects repository: the database holds documents written by every past
 * version of the app, and the schema's defaults fill in whatever was added
 * since.
 */
export function toRelease(document: ReleaseDocument): ArchiveRelease | null {
  const { _id, ...rest } = document
  const parsed = ArchiveReleaseSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    logger.warn(
      `Skipping unreadable release record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class ReleasesRepository {
  constructor(private readonly db: Db) {}

  private get releases(): Collection<ReleaseDocument> {
    return this.db.collection<ReleaseDocument>(Collections.Releases)
  }

  /**
   * Dated first, undated last.
   *
   * A release with no date yet is still being assembled, so it belongs below
   * the ones with a day attached rather than sorted among them as if it were
   * scheduled for the epoch.
   */
  async listAll(): Promise<ArchiveRelease[]> {
    const documents = await this.releases.find({}).sort({ releaseDate: -1, title: 1 }).toArray()
    return documents.map(toRelease).filter((entry): entry is ArchiveRelease => entry !== null)
  }

  async findById(id: string): Promise<ArchiveRelease | null> {
    const document = await this.releases.findOne({ _id: id })
    return document ? toRelease(document) : null
  }

  async findBySubject(subjectId: string): Promise<ArchiveRelease | null> {
    const document = await this.releases.findOne({ subjectId })
    return document ? toRelease(document) : null
  }

  async insert(release: ArchiveRelease): Promise<void> {
    const { id, ...rest } = release
    await this.releases.insertOne({ _id: id, ...rest })
  }

  async replace(release: ArchiveRelease): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = release
    await this.releases.replaceOne({ _id: id }, rest, { upsert: true })
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.releases.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
