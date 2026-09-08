import type { Collection } from 'mongodb'
import { NowPlayingConfigSchema, type NowPlayingState } from '@shared/domain/nowplaying'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('nowplaying:repository')

const DOCUMENT_ID = 'overlay:nowplaying'

type NowPlayingDocument = {
  _id: string
  kind: 'nowplaying'
  name: string
  active: boolean
  config: NowPlayingState['config']
}

/**
 * Best-effort persistence for the now-playing configuration.
 *
 * Only the config is stored. A track sample is worthless after a restart — it
 * carries a `sampledAt` from before the app closed, so restoring it would put a
 * stale playhead on screen until the first poll landed. The next poll produces
 * a fresh one within seconds anyway.
 */
export class NowPlayingRepository {
  constructor(private readonly archive: ArchiveService) {}

  private collection(): Collection<NowPlayingDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<NowPlayingDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  async load(): Promise<{ config: NowPlayingState['config'] } | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: DOCUMENT_ID })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the defaults fill it in.
      const parsed = NowPlayingConfigSchema.safeParse(document.config)
      if (!parsed.success) {
        logger.warn(
          'Discarding unreadable now-playing config',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }
      return { config: parsed.data }
    } catch (cause) {
      logger.warn('Could not read the stored now-playing config', cause)
      return null
    }
  }

  async save(state: NowPlayingState): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: DOCUMENT_ID },
        {
          $set: {
            kind: 'nowplaying',
            // The collection carries a unique index on `name`.
            name: 'overlay:nowplaying',
            active: state.link.state === 'connected',
            config: state.config
          },
          $setOnInsert: { _id: DOCUMENT_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the now-playing config', cause)
    }
  }
}
