import type { Collection } from 'mongodb'
import { TransmissionTaskSchema, type TransmissionTask } from '@shared/domain/transmissions'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('transmissions:repository')

/** Stored shape. `_id` carries what the domain calls `id`. */
type TaskDocument = Omit<TransmissionTask, 'id'> & { _id: string }

/**
 * Persistence for operator-filed tasks.
 *
 * Unlike the overlay repositories, this one is **not** best-effort. A timer's
 * stored duration is a convenience — losing it costs the operator a few seconds
 * of reconfiguration. A task is a record the operator wrote down precisely so
 * they would not have to remember it, and silently dropping the write would be
 * worse than refusing it: they would believe it was filed. So writes surface a
 * structured error when the archive is unavailable.
 *
 * Reads stay forgiving in one specific way: a single unparseable document is
 * discarded with a warning rather than failing the whole schedule, because one
 * corrupt row should not take the calendar down with it.
 */
export class TransmissionsRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<TaskDocument> {
    // Throws a structured AppError when the archive is not connected, which the
    // IPC router turns into a recoverable failure the page can report.
    return this.archive.getDb().collection<TaskDocument>(Collections.TransmissionTasks)
  }

  /**
   * Every task, oldest day first.
   *
   * Read whole, like the project registry and for the same reason: this is an
   * operator's own backlog, hundreds of rows at the outside, and reading it in
   * one pass means the calendar can range over any month without a query per
   * view.
   */
  async listAll(): Promise<TransmissionTask[]> {
    if (!this.archive.isOnline()) return []

    const documents = await this.collection().find({}).sort({ date: 1 }).toArray()

    return documents
      .map((document) => {
        const { _id, ...rest } = document
        // Parsed rather than cast: a document written by an earlier build is
        // missing whatever has been added since, and the schema's defaults fill
        // those in.
        const parsed = TransmissionTaskSchema.safeParse({ ...rest, id: _id })
        if (!parsed.success) {
          logger.warn(
            `Discarding unreadable task ${_id}`,
            parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          )
          return null
        }
        return parsed.data
      })
      .filter((task): task is TransmissionTask => task !== null)
  }

  async findById(id: string): Promise<TransmissionTask | null> {
    if (!this.archive.isOnline()) return null

    const document = await this.collection().findOne({ _id: id })
    if (!document) return null

    const { _id, ...rest } = document
    const parsed = TransmissionTaskSchema.safeParse({ ...rest, id: _id })
    return parsed.success ? parsed.data : null
  }

  async save(task: TransmissionTask): Promise<void> {
    this.requireArchive()

    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = task
    await this.collection().replaceOne({ _id: id }, rest, { upsert: true })
  }

  async deleteById(id: string): Promise<void> {
    this.requireArchive()
    await this.collection().deleteOne({ _id: id })
  }

  private requireArchive(): void {
    if (this.archive.isOnline()) return
    throw new AppError('The archive is not connected, so the task was not filed.', {
      code: ErrorCode.ArchiveConnectFailed,
      hint: 'Check the archive status in REGULATION, then try again.',
      recoverable: true
    })
  }
}
