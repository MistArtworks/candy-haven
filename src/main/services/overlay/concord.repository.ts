import type { Collection } from 'mongodb'
import { ConcordStateSchema, type ConcordState } from '@shared/domain/concord'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('concord:repository')

/**
 * The single stored document id.
 *
 * There is one live poll at a time, keyed rather than kept in a singleton
 * collection — the same shape the rite uses, and for the same reason: when the
 * department grows to hold saved, named ballots this becomes one document among
 * many without a migration.
 */
const LIVE_CONCORD_ID = 'concord:the-concord'

type ConcordDocument = {
  _id: string
  kind: 'concord'
  name: string
  active: boolean
  state: ConcordState
}

/**
 * Best-effort persistence for the live poll.
 *
 * Every method swallows its failures, exactly as the rite's does. The service
 * treats its in-memory state as authoritative and this as a convenience,
 * because the alternative — an action failing mid-broadcast because Mongo was
 * mid-restart — trades a real problem for a much worse one.
 *
 * What it buys is that a crash during a stream does not cost the operator a
 * ballot they spent the ad break writing.
 *
 * Note what is *not* written: the vote ledger. It lives only in the service, so
 * a poll cannot be resumed as `open` after a restart — see the service's
 * `initialize`, which explains why that is the correct outcome rather than a
 * limitation.
 */
export class ConcordRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<ConcordDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<ConcordDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  async load(): Promise<ConcordState | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: LIVE_CONCORD_ID })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the schema's defaults fill
      // those in. A state that cannot be repaired is discarded rather than
      // allowed to poison every concord channel at once.
      const parsed = ConcordStateSchema.safeParse(document.state)
      if (!parsed.success) {
        logger.warn(
          'Discarding unreadable stored poll',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }
      return parsed.data
    } catch (cause) {
      logger.warn('Could not read the stored poll', cause)
      return null
    }
  }

  async save(state: ConcordState): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: LIVE_CONCORD_ID },
        {
          $set: { kind: 'concord', name: state.config.title, active: true, state },
          $setOnInsert: { _id: LIVE_CONCORD_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the poll', cause)
    }
  }
}
