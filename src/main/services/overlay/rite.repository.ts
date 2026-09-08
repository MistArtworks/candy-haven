import type { Collection } from 'mongodb'
import { RiteStateSchema, type RiteState } from '@shared/domain/rite'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('rite:repository')

/**
 * The single stored document id.
 *
 * There is one live rite at a time. When the department grows to hold saved,
 * named overlay scenes this becomes one document among many, which is why it is
 * keyed rather than being a singleton collection.
 */
const LIVE_RITE_ID = 'rite:resonance-selection'

type RiteDocument = { _id: string; kind: 'rite'; name: string; active: boolean; state: RiteState }

/**
 * Best-effort persistence for the live rite.
 *
 * Every method swallows its failures. The service treats its in-memory state as
 * authoritative and this as a convenience, because the alternative — an action
 * failing mid-broadcast because Mongo was mid-restart — trades a real problem
 * for a much worse one. What this buys is that a crash or a restart during a
 * stream does not discard a roster chat spent ten minutes filling.
 */
export class RiteRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<RiteDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<RiteDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  async load(): Promise<RiteState | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: LIVE_RITE_ID })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the schema's defaults are
      // what fill those in. A state that cannot be repaired is discarded rather
      // than allowed to poison every rite channel at once.
      const parsed = RiteStateSchema.safeParse(document.state)
      if (!parsed.success) {
        logger.warn(
          'Discarding unreadable stored rite',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }
      return parsed.data
    } catch (cause) {
      logger.warn('Could not read the stored rite', cause)
      return null
    }
  }

  async save(state: RiteState): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: LIVE_RITE_ID },
        {
          $set: { kind: 'rite', name: state.config.title, active: true, state },
          $setOnInsert: { _id: LIVE_RITE_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the rite', cause)
    }
  }
}
