import type { Collection, Db } from 'mongodb'
import { ArchiveVolumeSchema } from '@shared/domain/volumes'
import type { ArchiveVolume } from '@shared/domain/volumes'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('volumes:repository')

/**
 * Mongo access for volumes — albums, EPs and compilations.
 *
 * Thin, like the projects and stacks repositories: it moves documents and
 * nothing else. Which tracks belong to a volume is not asked here at all, and
 * deliberately so — membership lives on the project, and the service reads it
 * through the projects service rather than querying a second collection.
 */

/** Stored shape. `_id` carries what the domain calls `id`. */
export type VolumeDocument = Omit<ArchiveVolume, 'id'> & { _id: string }

/**
 * Normalises a stored document into a domain record.
 *
 * Parsed through the schema rather than cast, for the reason recorded on the
 * projects repository: the database holds documents written by every past
 * version of the app, and the schema's defaults are what fill in whatever has
 * been added since.
 */
export function toVolume(document: VolumeDocument): ArchiveVolume | null {
  const { _id, ...rest } = document
  const parsed = ArchiveVolumeSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable volume must not deny the operator the rest of the shelf.
    logger.warn(
      `Skipping unreadable volume record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class VolumesRepository {
  constructor(private readonly db: Db) {}

  private get volumes(): Collection<VolumeDocument> {
    return this.db.collection<VolumeDocument>(Collections.ArchiveVolumes)
  }

  async listAll(): Promise<ArchiveVolume[]> {
    const documents = await this.volumes.find({}).sort({ title: 1 }).toArray()
    return documents.map(toVolume).filter((volume): volume is ArchiveVolume => volume !== null)
  }

  async findById(id: string): Promise<ArchiveVolume | null> {
    const document = await this.volumes.findOne({ _id: id })
    return document ? toVolume(document) : null
  }

  async insert(volume: ArchiveVolume): Promise<void> {
    const { id, ...rest } = volume
    await this.volumes.insertOne({ _id: id, ...rest })
  }

  async replace(volume: ArchiveVolume): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = volume
    await this.volumes.replaceOne({ _id: id }, rest, { upsert: true })
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.volumes.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
