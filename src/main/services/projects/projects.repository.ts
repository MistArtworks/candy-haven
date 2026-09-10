import type { AnyBulkWriteOperation, Collection, Db } from 'mongodb'
import { ProjectRecordSchema } from '@shared/domain/projects'
import type { ProjectRecord } from '@shared/domain/projects'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('projects:repository')

/**
 * Mongo access for the project registry.
 *
 * Deliberately thin: it moves documents, and nothing more. Reconciliation
 * policy — which fields a scan may overwrite, how a moved folder is relinked —
 * lives in the service, where it can be read as one piece of logic.
 */

/** Stored shape. `_id` carries what the domain calls `id`. */
export type ProjectDocument = Omit<ProjectRecord, 'id'> & { _id: string }

/**
 * Normalises a stored document into a domain record.
 *
 * Documents are parsed through the schema on the way out, not merely cast. The
 * database holds records written by every past version of this app, so a
 * document is missing whatever fields have been added since — and the schema's
 * defaults are what fill them in.
 *
 * Doing this here rather than only at the IPC boundary matters: main-process
 * code reads records directly, and a field it assumed was always present
 * crashed the launch scan once. Validating at the boundary where persisted data
 * enters the process means every consumer sees a complete record.
 */
export function toRecord(document: ProjectDocument): ProjectRecord | null {
  const { _id, ...rest } = document
  const parsed = ProjectRecordSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable record must not deny the operator the rest of the
    // registry; a rescan rewrites it.
    logger.warn(
      `Skipping unreadable project record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class ProjectsRepository {
  constructor(private readonly db: Db) {}

  private get projects(): Collection<ProjectDocument> {
    return this.db.collection<ProjectDocument>(Collections.Projects)
  }

  /**
   * Loads the whole registry.
   *
   * The registry is operator-sized — a prolific producer has hundreds of
   * projects, not millions — so reconciliation reads everything once and
   * matches in memory. That makes relinking a moved folder a simple lookup
   * instead of a query per project.
   */
  async listAll(): Promise<ProjectRecord[]> {
    const documents = await this.projects.find({}).toArray()
    return documents.map(toRecord).filter((record): record is ProjectRecord => record !== null)
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    const document = await this.projects.findOne({ _id: id })
    return document ? toRecord(document) : null
  }

  async findByPath(path: string): Promise<ProjectRecord | null> {
    const document = await this.projects.findOne({ path })
    return document ? toRecord(document) : null
  }

  async insert(record: ProjectRecord): Promise<void> {
    const { id, ...rest } = record
    await this.projects.insertOne({ _id: id, ...rest })
  }

  async replace(record: ProjectRecord): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = record
    await this.projects.replaceOne({ _id: id }, rest, { upsert: true })
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.projects.deleteOne({ _id: id })
    return result.deletedCount === 1
  }

  async writeMany(operations: AnyBulkWriteOperation<ProjectDocument>[]): Promise<void> {
    if (operations.length === 0) return
    // Unordered so one rejected document does not abandon the rest of a scan.
    await this.projects.bulkWrite(operations, { ordered: false })
  }
}
