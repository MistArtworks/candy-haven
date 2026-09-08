import type { Collection } from 'mongodb'
import { TimerStateSchema, type TimerId, type TimerState } from '@shared/domain/timer'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('timer:repository')

/** One document per timer, alongside the rite in the overlays collection. */
const documentId = (id: TimerId): string => `timer:${id}`

type TimerDocument = {
  _id: string
  kind: 'timer'
  name: string
  active: boolean
  state: TimerState
}

/**
 * Best-effort persistence for the countdown timers.
 *
 * Every method swallows its failures, as the rite's does: the in-memory state
 * is authoritative and this is a convenience. What it buys is that a restart
 * does not lose a configured duration — which matters more here than for the
 * rite, since a timer's whole configuration is the thing the operator set up
 * once and expects to still be there next stream.
 */
export class TimerRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<TimerDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<TimerDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  async load(id: TimerId): Promise<TimerState | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: documentId(id) })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the schema's defaults fill
      // those in. One that cannot be repaired is discarded rather than allowed
      // to fail every timer channel at once.
      const parsed = TimerStateSchema.safeParse(document.state)
      if (!parsed.success) {
        logger.warn(
          `Discarding unreadable stored timer ${id}`,
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }
      return parsed.data
    } catch (cause) {
      logger.warn(`Could not read stored timer ${id}`, cause)
      return null
    }
  }

  async save(state: TimerState): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: documentId(state.id) },
        {
          $set: {
            kind: 'timer',
            // The collection carries a unique index on `name`, so this has to be
            // distinct per document rather than the operator-facing label.
            name: `timer:${state.id}`,
            active: state.phase === 'running',
            state
          },
          $setOnInsert: { _id: documentId(state.id) }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn(`Could not persist timer ${state.id}`, cause)
    }
  }
}
