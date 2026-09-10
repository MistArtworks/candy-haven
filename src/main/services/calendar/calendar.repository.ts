import type { Collection } from 'mongodb'
import { CalendarEntrySchema, type CalendarEntry } from '@shared/domain/calendar'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('calendar:repository')

/** One document per entry, keyed by the id the service mints. */
type CalendarDocument = CalendarEntry & { _id: string }

/**
 * Persistence for the dated register.
 *
 * Unlike the overlay repositories, this one does **not** swallow write
 * failures. There the in-memory state is authoritative and storage is a
 * convenience — a timer that forgets its duration is an annoyance. Here the
 * stored document *is* the entry: an operator who books a session and is told
 * it was filed, when it was not, will find out at the worst possible moment.
 * Writes therefore propagate their errors and the department reports them.
 *
 * Reads stay tolerant, because one unreadable document must not take the whole
 * calendar down with it.
 */
export class CalendarRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<CalendarDocument> {
    return this.archive.getDb().collection<CalendarDocument>(Collections.Calendar)
  }

  get attached(): boolean {
    return this.archive.isOnline()
  }

  async list(): Promise<CalendarEntry[]> {
    if (!this.attached) return []

    try {
      const documents = await this.collection().find({}).sort({ date: 1, startMinute: 1 }).toArray()

      const entries: CalendarEntry[] = []
      for (const document of documents) {
        // Parsed rather than cast: a document written by an earlier build is
        // missing whatever has been added since, and the schema's defaults fill
        // those in. One that cannot be repaired is skipped rather than allowed
        // to fail the whole read.
        const parsed = CalendarEntrySchema.safeParse(document)
        if (parsed.success) {
          entries.push(parsed.data)
          continue
        }
        logger.warn(
          `Skipping unreadable calendar entry ${String(document._id)}`,
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
      }

      return entries
    } catch (cause) {
      logger.warn('Could not read the calendar', cause)
      return []
    }
  }

  async put(entry: CalendarEntry): Promise<void> {
    await this.collection().updateOne(
      { _id: entry.id },
      { $set: { ...entry, _id: entry.id } },
      { upsert: true }
    )
  }

  async remove(id: string): Promise<void> {
    await this.collection().deleteOne({ _id: id })
  }
}
