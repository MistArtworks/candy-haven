import type { Collection } from 'mongodb'
import { NowPlayingSourceSchema, type NowPlayingState } from '@shared/domain/nowplaying'
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
  sources: NowPlayingState['sources']
  pollSeconds: number
}

/**
 * Best-effort persistence for the configured sources.
 *
 * Only the sources and the poll interval are stored. A track sample is
 * worthless after a restart — it carries a `sampledAt` from before the app
 * closed, so restoring it would put a stale playhead on screen until the first
 * poll landed. The next poll produces a fresh one within seconds anyway.
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

  async load(): Promise<{ sources: NowPlayingState['sources']; pollSeconds?: number } | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: DOCUMENT_ID })
      if (!document) return null

      /*
       * Parsed per source rather than as a batch.
       *
       * A document written by an earlier build is missing whatever has been
       * added since, and the defaults fill that in — but one source the
       * operator has broken beyond repair should cost them that source, not
       * every source they have configured. Discarding the lot would take a
       * whole scene collection's worth of addresses with it.
       */
      const sources = (document.sources ?? []).flatMap((entry) => {
        const parsed = NowPlayingSourceSchema.safeParse(entry)
        if (parsed.success) return [parsed.data]

        logger.warn(
          'Discarding an unreadable now-playing source',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return []
      })

      if (sources.length === 0) return null
      return { sources, pollSeconds: document.pollSeconds }
    } catch (cause) {
      logger.warn('Could not read the stored now-playing sources', cause)
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
            sources: state.sources,
            pollSeconds: state.pollSeconds
          },
          $setOnInsert: { _id: DOCUMENT_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the now-playing sources', cause)
    }
  }
}
