import type { Collection, Db } from 'mongodb'
import { ArtistRecordSchema } from '@shared/domain/artists'
import type { ArtistRecord } from '@shared/domain/artists'
import { artistNameKey } from '@shared/domain/artists.constants'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'

const logger = getLogger('artists:repository')

/**
 * Mongo access for the roster.
 *
 * Thin, like the tags repository: it moves documents and nothing else. Which
 * projects credit an artist is not asked here at all — membership lives on the
 * project in `artistIds` and on the release in its tracklist, and the service
 * reads both through their owners rather than opening second repositories on
 * collections it does not own.
 */

/**
 * Stored shape. `_id` carries what the domain calls `id`.
 *
 * Unlike `TagDocument`, `nameKey` is a real member of the domain record rather
 * than a storage-only field — it is on `ArtistRecordSchema` because the roster
 * sorts and groups by it in the renderer, and shipping it beats making every
 * consumer re-derive it. It is still written here on every save so a caller
 * cannot defeat the unique index by forgetting.
 */
export type ArtistDocument = Omit<ArtistRecord, 'id'> & { _id: string }

export function toArtist(document: ArtistDocument): ArtistRecord | null {
  const { _id, ...rest } = document
  const parsed = ArtistRecordSchema.safeParse({ id: _id, ...rest })

  if (!parsed.success) {
    // One unreadable artist must not deny the operator the rest of the roster.
    logger.warn(
      `Skipping unreadable artist record ${_id}`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
    return null
  }

  return parsed.data
}

export class ArtistsRepository {
  constructor(private readonly db: Db) {}

  private get artists(): Collection<ArtistDocument> {
    return this.db.collection<ArtistDocument>(Collections.Artists)
  }

  /**
   * The roster, favourites first and then alphabetical.
   *
   * Sorted in the query rather than the renderer because the index
   * `artist_roster_order` exists for exactly this read, and because every
   * surface that draws the roster wants the same order — a picker that
   * disagreed with the register about who comes first would be read as a bug.
   */
  async listAll(): Promise<ArtistRecord[]> {
    const documents = await this.artists.find({}).sort({ favourite: -1, nameKey: 1 }).toArray()
    return documents.map(toArtist).filter((artist): artist is ArtistRecord => artist !== null)
  }

  async findById(id: string): Promise<ArtistRecord | null> {
    const document = await this.artists.findOne({ _id: id })
    return document ? toArtist(document) : null
  }

  /** Case-insensitive, which is the only way a name is ever looked up. */
  async findByName(name: string): Promise<ArtistRecord | null> {
    const document = await this.artists.findOne({ nameKey: artistNameKey(name) })
    return document ? toArtist(document) : null
  }

  async insert(artist: ArtistRecord): Promise<void> {
    const { id, ...rest } = artist
    await this.artists.insertOne({ _id: id, ...rest, nameKey: artistNameKey(artist.name) })
  }

  async replace(artist: ArtistRecord): Promise<void> {
    // `replaceOne` rejects a replacement carrying `_id`; the filter supplies it.
    const { id, ...rest } = artist
    await this.artists.replaceOne(
      { _id: id },
      { ...rest, nameKey: artistNameKey(artist.name) },
      { upsert: true }
    )
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.artists.deleteOne({ _id: id })
    return result.deletedCount === 1
  }
}
