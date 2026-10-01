import type { Collection, Db } from 'mongodb'
import { ColophonSchema } from '@shared/domain/colophon'
import type { Colophon } from '@shared/domain/colophon'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('colophon:repository')

/**
 * Mongo access for the colophon.
 *
 * Thinner even than the roster's: one document under a fixed key, read whole
 * and written whole. A register of one has no queries to speak of, and
 * pretending otherwise with an id per record would invent a second colophon
 * the website has nowhere to put.
 */

/** The one document's key. */
const COLOPHON_ID = 'colophon'

/** Stored shape: the record, under its fixed `_id`. */
export type ColophonDocument = Colophon & { _id: string }

export class ColophonRepository {
  constructor(private readonly db: Db) {}

  private get colophon(): Collection<ColophonDocument> {
    return this.db.collection<ColophonDocument>(Collections.Colophon)
  }

  /**
   * The record, or null when nothing has been filed.
   *
   * An unreadable document reads as unfiled rather than failing the channel,
   * which is the roster's rule for one bad record applied to a register of
   * one. It is logged, and it can only arise from a hand edit: the stored
   * schema is permissive precisely so a long value cannot cause it.
   */
  async read(): Promise<Colophon | null> {
    const document = await this.colophon.findOne({ _id: COLOPHON_ID })
    if (!document) return null

    const { _id, ...rest } = document
    const parsed = ColophonSchema.safeParse(rest)
    if (!parsed.success) {
      logger.warn(
        `Colophon record ${_id} is unreadable; reading it as unfiled`,
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      )
      return null
    }

    return parsed.data
  }

  async write(colophon: Colophon): Promise<void> {
    await this.colophon.replaceOne({ _id: COLOPHON_ID }, colophon, { upsert: true })
  }
}
