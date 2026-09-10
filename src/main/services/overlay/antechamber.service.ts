import type { Collection } from 'mongodb'
import {
  AntechamberConfigSchema,
  type AntechamberConfig,
  type AntechamberConfigPatch,
  type AntechamberState
} from '@shared/domain/antechamber'
import { createAntechamberState } from '@shared/domain/antechamber.constants'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'
import type { OverlayServer } from './overlay-server'

const logger = getLogger('antechamber')

const DOCUMENT_ID = 'overlay:antechamber'

interface AntechamberEvents {
  state: AntechamberState
}

type AntechamberDocument = {
  _id: string
  kind: 'antechamber'
  name: string
  active: boolean
  config: AntechamberConfig
}

/**
 * THE ANTECHAMBER — the field a broadcast waits on.
 *
 * The simplest service in the kit, and deliberately so: there is no live state
 * to hold. Nothing counts down, nobody votes, nothing is playing. The overlay
 * is a visual, the configuration is the whole of it, and this exists to hold
 * that configuration, persist it, and broadcast a change so the browser source
 * repaints without being reloaded.
 *
 * Persistence matters more here than the small amount of code suggests. This is
 * set up once, tuned until it looks right, and then expected to be exactly the
 * same six months later at the top of a stream.
 */
export class AntechamberService extends TypedEmitter<AntechamberEvents> {
  private state: AntechamberState = createAntechamberState()

  constructor(
    private readonly archive: ArchiveService,
    private readonly server: OverlayServer
  ) {
    super()
  }

  get current(): AntechamberState {
    return this.state
  }

  /** Restores the stored configuration. Never throws; this runs during boot. */
  async initialize(): Promise<void> {
    const stored = await this.load()
    if (stored) this.state = { ...this.state, config: stored }
  }

  configure(patch: AntechamberConfigPatch): AntechamberState {
    return this.commit({ ...this.state.config, ...patch })
  }

  /** Back to the shipped defaults, for when a tuning session has gone wrong. */
  reset(): AntechamberState {
    return this.commit(createAntechamberState().config)
  }

  private commit(config: AntechamberConfig): AntechamberState {
    this.state = { config, revision: this.state.revision + 1 }

    this.emit('state', this.state)
    this.server.broadcast('antechamber', this.state)
    void this.save()

    return this.state
  }

  // ------------------------------------------------------------- persistence

  private collection(): Collection<AntechamberDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<AntechamberDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  private async load(): Promise<AntechamberConfig | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: DOCUMENT_ID })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the defaults fill it in.
      const parsed = AntechamberConfigSchema.safeParse(document.config)
      if (!parsed.success) {
        logger.warn(
          'Discarding an unreadable antechamber config',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }

      return parsed.data
    } catch (cause) {
      logger.warn('Could not read the stored antechamber config', cause)
      return null
    }
  }

  /** Best-effort, as everywhere in the kit: the in-memory state is the truth. */
  private async save(): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: DOCUMENT_ID },
        {
          $set: {
            kind: 'antechamber',
            // The collection carries a unique index on `name`.
            name: 'overlay:antechamber',
            active: true,
            config: this.state.config
          },
          $setOnInsert: { _id: DOCUMENT_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the antechamber config', cause)
    }
  }
}
