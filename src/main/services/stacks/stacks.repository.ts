import type { Collection, Db } from 'mongodb'
import { ArchiveFolderSchema } from '@shared/domain/stacks'
import type { ArchiveFolder } from '@shared/domain/stacks'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('stacks:repository')

/**
 * Mongo access for the filing tree.
 *
 * Thin, like the projects repository: it moves documents and nothing else.
 * Which folder may hold what, how a rename cascades, what happens to the
 * contents of a deleted folder — all of that is policy and lives in the
 * service, where it can be read as one piece of logic.
 */

/** Stored shape. `_id` carries what the domain calls `id`. */
export type FolderDocument = Omit<ArchiveFolder, 'id'> & { _id: string }

/**
 * Normalises a stored document into a domain record.
 *
 * Parsed through the schema rather than cast, for the reason recorded on the
 * projects repository: the database holds documents written by every past
 * version of the app, and the schema's defaults are what fill in whatever has
 * been added since.
 */
export function toFolder(document: FolderDocument): ArchiveFolder | null {
  const { _id, ...rest } = document
  const parsed = ArchiveFolderSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable folder must not deny the operator the rest of the tree.
    logger.warn(
      `Skipping unreadable folder record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class StacksRepository {
  constructor(private readonly db: Db) {}

  private get folders(): Collection<FolderDocument> {
    return this.db.collection<FolderDocument>(Collections.ArchiveFolders)
  }

  /**
   * The whole tree.
   *
   * A filing tree is tens of folders, not thousands, so it is read entire and
   * walked in memory. That makes an ancestor lookup, a depth check and a
   * descendant cascade plain array work instead of a recursive query.
   */
  async listAll(): Promise<ArchiveFolder[]> {
    const documents = await this.folders.find({}, { sort: { order: 1, name: 1 } }).toArray()
    return documents.map(toFolder).filter((folder): folder is ArchiveFolder => folder !== null)
  }

  async findById(id: string): Promise<ArchiveFolder | null> {
    const document = await this.folders.findOne({ _id: id })
    return document ? toFolder(document) : null
  }

  async insert(folder: ArchiveFolder): Promise<void> {
    const { id, ...rest } = folder
    await this.folders.insertOne({ _id: id, ...rest })
  }

  async replace(folder: ArchiveFolder): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = folder
    await this.folders.replaceOne({ _id: id }, rest, { upsert: true })
  }

  /** Writes several folders at once, for a rename that cascades down a subtree. */
  async replaceMany(folders: readonly ArchiveFolder[]): Promise<void> {
    if (folders.length === 0) return

    await this.folders.bulkWrite(
      folders.map((folder) => {
        const { id, ...rest } = folder
        return { replaceOne: { filter: { _id: id }, replacement: rest, upsert: true } }
      }),
      // Unordered so one rejected document does not abandon the rest of a cascade.
      { ordered: false }
    )
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.folders.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
