import type { AnyBulkWriteOperation, Collection, Db, Filter } from 'mongodb'
import {
  ConsultationFeedbackSchema,
  ConsultationSchema,
  type Consultation,
  type ConsultationFeedback
} from '@shared/domain/consultation'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import { identityForUid } from '@main/services/dispatch/identity.auth'
import type { RemoteConsultation, RemoteFeedback } from './consultation.client'

const logger = getLogger('consultation:repository')

/**
 * Mongo access for CONSULTATION: this console's copy of the shared tracks
 * and of the feedback on them, and where its feedback check-ins have got to.
 *
 * Keyed by the website's own ids, so what comes back on a later check-in
 * lands on the copy already held. Each copy carries the website it came
 * from and every read filters on it, as the inbox's do, so a development
 * copy's test links never show among the real ones.
 *
 * **A closed link's feedback is never read from here**, whatever is held:
 * every read goes by the link's dates. The copy itself goes at the next
 * check-in that hears from the website, which decides when a link closes;
 * this copy's dates could be out of date, if the other copy moved them.
 */

type ConsultationDocument = Omit<Consultation, 'id' | 'unread'> & { _id: string; website: string }
type FeedbackDocument = Omit<ConsultationFeedback, 'id'> & { _id: string; website: string }

interface SyncStateDocument {
  _id: string
  cursor: string
  syncedAt: number
}

/** Unread feedback on one open link, for the startup notice. */
export interface WaitingLink {
  id: string
  title: string
  expiresAt: number
  /** The producers who sent it, each once. */
  names: string[]
  count: number
}

const time = (iso: string): number => Date.parse(iso) || 0
const timeOrNull = (iso: string | null): number | null => (iso ? Date.parse(iso) || null : null)

/** The feedback cursor sits beside the inbox's, under the website's address. */
const cursorId = (website: string): string => `${website} consultation feedback`

/** Mongo's filter for a link open at `now`, the same test as `isLinkOpen`. */
const openAt = (now: number): Filter<ConsultationDocument> => ({
  endedAt: null,
  expiresAt: { $gt: now }
})
const closedAt = (now: number): Filter<ConsultationDocument> => ({
  $or: [{ endedAt: { $ne: null } }, { expiresAt: { $lte: now } }]
})

export class ConsultationRepository {
  constructor(private readonly db: Db) {}

  private get consultations(): Collection<ConsultationDocument> {
    return this.db.collection<ConsultationDocument>(Collections.Consultations)
  }

  private get feedback(): Collection<FeedbackDocument> {
    return this.db.collection<FeedbackDocument>(Collections.ConsultationFeedback)
  }

  private get syncState(): Collection<SyncStateDocument> {
    return this.db.collection<SyncStateDocument>(Collections.SyncState)
  }

  // ------------------------------------------------------------------- reads

  /** This website's shared tracks, newest first, each with how much on it is unread. */
  async list(website: string, now: number): Promise<Consultation[]> {
    const documents = await this.consultations.find({ website }).sort({ createdAt: -1 }).toArray()
    const unread = await this.unreadOn(website, documents, now)
    return documents.flatMap(
      (document) => readConsultation(document, unread.get(document._id)) ?? []
    )
  }

  async get(website: string, id: string, now: number): Promise<Consultation | null> {
    const document = await this.consultations.findOne({ _id: id, website })
    if (!document) return null
    const unread = await this.unreadOn(website, [document], now)
    return readConsultation(document, unread.get(id))
  }

  /** One open link's feedback, in the order it was sent. None once it has closed. */
  async feedbackFor(website: string, id: string, now: number): Promise<ConsultationFeedback[]> {
    const link = await this.consultations.findOne({ _id: id, website, ...openAt(now) })
    if (!link) return []
    const documents = await this.feedback
      .find({ website, consultationId: id })
      .sort({ submittedAt: 1 })
      .toArray()
    return documents.flatMap((document) => readFeedback(document) ?? [])
  }

  /** Unread feedback on links still open, link by link, longest-waiting link first. */
  async waiting(website: string, now: number): Promise<WaitingLink[]> {
    const open = await this.consultations
      .find({ website, ...openAt(now) }, { projection: { _id: 1, title: 1, expiresAt: 1 } })
      .toArray()
    if (!open.length) return []

    const groups = await this.feedback
      .aggregate<{ _id: string; count: number; names: string[]; first: number }>([
        {
          $match: { website, consultationId: { $in: open.map((link) => link._id) }, readAt: null }
        },
        {
          $group: {
            _id: '$consultationId',
            count: { $sum: 1 },
            names: { $addToSet: '$name' },
            first: { $min: '$submittedAt' }
          }
        },
        { $sort: { first: 1 } }
      ])
      .toArray()

    const byId = new Map(open.map((link) => [link._id, link]))
    return groups.flatMap((group) => {
      const link = byId.get(group._id)
      if (!link) return []
      return [
        {
          id: link._id,
          title: link.title,
          expiresAt: link.expiresAt,
          names: group.names.filter(Boolean),
          count: group.count
        }
      ]
    })
  }

  /**
   * The tracks still in the bucket, by the records of them: what the meter
   * counts. A record keeps counting its track until a copy has deleted it.
   */
  async usedBytes(website: string): Promise<number> {
    const [row] = await this.consultations
      .aggregate<{ bytes: number }>([
        { $match: { website, audioDeletedAt: null } },
        { $group: { _id: null, bytes: { $sum: '$audio.bytes' } } }
      ])
      .toArray()
    return row?.bytes ?? 0
  }

  /** Closed links whose track no copy has deleted yet. */
  async undeleted(website: string, now: number): Promise<Consultation[]> {
    const documents = await this.consultations
      .find({ website, audioDeletedAt: null, ...closedAt(now) })
      .toArray()
    return documents.flatMap((document) => readConsultation(document) ?? [])
  }

  /** When the next open link closes whose track is still to delete, or null for none. */
  async nextClose(website: string, now: number): Promise<number | null> {
    const [next] = await this.consultations
      .find({ website, audioDeletedAt: null, ...openAt(now) }, { projection: { expiresAt: 1 } })
      .sort({ expiresAt: 1 })
      .limit(1)
      .toArray()
    return next?.expiresAt ?? null
  }

  // -------------------------------------------------------------- check-ins

  /**
   * Lays the website's whole list over the copy. What it no longer lists
   * was removed from the other copy, and goes from this one too, with any
   * feedback held for it.
   */
  async applyList(website: string, remote: readonly RemoteConsultation[]): Promise<void> {
    await this.upsert(website, remote)
    const ids = remote.map((record) => record.id)
    await this.consultations.deleteMany({ website, _id: { $nin: ids } })
    await this.feedback.deleteMany({ website, consultationId: { $nin: ids } })
  }

  /**
   * Lays one record the website answered with over the copy, and the file
   * it was shared from beside it when that is known.
   */
  async applyOne(website: string, remote: RemoteConsultation, sourcePath?: string): Promise<void> {
    await this.upsert(website, [remote], sourcePath)
  }

  /** Lays a page of feedback over the copy. What is new arrives unread. */
  async applyFeedback(website: string, remote: readonly RemoteFeedback[]): Promise<void> {
    if (!remote.length) return
    const operations = remote.map((record) => ({
      updateOne: {
        filter: { _id: record.id },
        update: {
          $set: {
            website,
            consultationId: record.consultationId,
            name: record.name,
            notes: record.notes,
            chain: record.chain,
            submittedAt: time(record.submittedAt)
          },
          $setOnInsert: { readAt: null }
        },
        upsert: true
      }
    })) as unknown as AnyBulkWriteOperation<FeedbackDocument>[]
    await this.feedback.bulkWrite(operations, { ordered: false })
  }

  /**
   * Deletes the feedback of links that have closed, as the website deletes
   * its own. Only run straight after the website's list was laid over the
   * copy, so the dates it goes by are the website's.
   */
  async purgeClosed(website: string, now: number): Promise<void> {
    const closed = await this.consultations
      .find({ website, ...closedAt(now) }, { projection: { _id: 1 } })
      .toArray()
    if (!closed.length) return
    await this.feedback.deleteMany({
      website,
      consultationId: { $in: closed.map((link) => link._id) }
    })
  }

  async cursor(website: string): Promise<string | null> {
    return (await this.syncState.findOne({ _id: cursorId(website) }))?.cursor ?? null
  }

  async saveCursor(website: string, cursor: string): Promise<void> {
    await this.syncState.updateOne(
      { _id: cursorId(website) },
      { $set: { cursor, syncedAt: Date.now() } },
      { upsert: true }
    )
  }

  // ------------------------------------------------------------------ writes

  /** Marks a link's feedback read, as of `now`. Whether anything was unread. */
  async markRead(website: string, id: string, now: number): Promise<boolean> {
    const result = await this.feedback.updateMany(
      { website, consultationId: id, readAt: null },
      { $set: { readAt: now } }
    )
    return result.modifiedCount > 0
  }

  async remove(website: string, id: string): Promise<void> {
    await this.feedback.deleteMany({ website, consultationId: id })
    await this.consultations.deleteOne({ _id: id, website })
  }

  // ----------------------------------------------------------------- private

  /**
   * Upserts records. The website's fields are set and nothing else: the
   * file a track was shared from is this machine's, and set only by the
   * copy that shared it.
   */
  private async upsert(
    website: string,
    remote: readonly RemoteConsultation[],
    sourcePath?: string
  ): Promise<void> {
    if (!remote.length) return
    const operations = remote.map((record) => {
      const fields = { ...consultationFields(record), website }
      return {
        updateOne: {
          filter: { _id: record.id },
          update:
            sourcePath === undefined
              ? { $set: fields, $setOnInsert: { sourcePath: null } }
              : { $set: { ...fields, sourcePath } },
          upsert: true
        }
      }
    }) as unknown as AnyBulkWriteOperation<ConsultationDocument>[]
    await this.consultations.bulkWrite(operations, { ordered: false })
  }

  /** How much is unread on each of `links`. Only open links have any. */
  private async unreadOn(
    website: string,
    links: readonly ConsultationDocument[],
    now: number
  ): Promise<Map<string, number>> {
    const open = links.filter((link) => link.endedAt === null && link.expiresAt > now)
    if (!open.length) return new Map()
    const counts = await this.feedback
      .aggregate<{ _id: string; count: number }>([
        {
          $match: { website, consultationId: { $in: open.map((link) => link._id) }, readAt: null }
        },
        { $group: { _id: '$consultationId', count: { $sum: 1 } } }
      ])
      .toArray()
    return new Map(counts.map(({ _id, count }) => [_id, count]))
  }
}

/** A record as kept here, from what the website sent. */
function consultationFields(record: RemoteConsultation): Record<string, unknown> {
  return {
    title: record.title,
    message: record.message,
    durationMs: record.durationMs,
    bpm: record.bpm,
    audio: record.audio,
    createdAt: time(record.createdAt),
    sharedBy: identityForUid(record.createdBy),
    expiresAt: time(record.expiresAt),
    endedAt: timeOrNull(record.endedAt),
    audioDeletedAt: timeOrNull(record.audioDeletedAt),
    link: record.link,
    waveform: record.waveform,
    feedbackCount: record.feedbackCount
  }
}

/**
 * A stored copy, or null when it cannot be read: left out of the list
 * rather than failing it, the rule every repository here follows.
 */
function readConsultation(document: ConsultationDocument, unread = 0): Consultation | null {
  const { _id, ...rest } = document
  const parsed = ConsultationSchema.safeParse({ ...rest, id: _id, unread })
  if (parsed.success) return parsed.data
  logger.warn(`Shared track ${_id} is unreadable; leaving it out`)
  return null
}

function readFeedback(document: FeedbackDocument): ConsultationFeedback | null {
  const { _id, ...rest } = document
  const parsed = ConsultationFeedbackSchema.safeParse({ ...rest, id: _id })
  if (parsed.success) return parsed.data
  logger.warn(`Feedback ${_id} is unreadable; leaving it out`)
  return null
}
