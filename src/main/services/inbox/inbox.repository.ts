import type { AnyBulkWriteOperation, Collection, Db } from 'mongodb'
import {
  SiteEnquirySchema,
  SiteMessageSchema,
  type SiteEnquiry,
  type SiteMessage
} from '@shared/domain/inbox'
import type { EnquiryStatus, InboxKind, MessageStatus } from '@shared/domain/inbox.constants'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { RemoteDeletion, RemoteEnquiry, RemoteMessage } from './site.client'

const logger = getLogger('inbox:repository')

/**
 * Mongo access for the website inbox: this console's copy of what the
 * website filed, and where each website's check-ins have got to.
 *
 * Keyed by the website's own id, so a record that comes back on a later
 * check-in lands on the copy already held rather than beside it. Each copy
 * also carries the website it came from, and every read filters on it: a
 * development copy reading a development server keeps its test messages
 * apart from the real ones without a database of its own.
 */

type Stored<T> = Omit<T, 'id'> & { _id: string; website: string }
type MessageDocument = Stored<SiteMessage>
type EnquiryDocument = Stored<SiteEnquiry>

interface SyncStateDocument {
  /** The website's origin. */
  _id: string
  /** What the website handed back last, to ask from next time. */
  cursor: string
  syncedAt: number
}

/** The website's text fields, in the order the forms ask for them. */
const MESSAGE_TEXT = [
  'name',
  'email',
  'subject',
  'message',
  'phone',
  'organisation',
  'date',
  'location',
  'budget',
  'links'
] as const satisfies readonly (keyof SiteMessage)[]

const ENQUIRY_TEXT = [
  'name',
  'title',
  'email',
  'phone',
  'eventName',
  'eventVenue',
  'budget',
  'about'
] as const satisfies readonly (keyof SiteEnquiry)[]

const time = (iso: string): number => Date.parse(iso) || 0

export class InboxRepository {
  constructor(private readonly db: Db) {}

  private get messages(): Collection<MessageDocument> {
    return this.db.collection<MessageDocument>(Collections.SiteMessages)
  }

  private get enquiries(): Collection<EnquiryDocument> {
    return this.db.collection<EnquiryDocument>(Collections.SiteEnquiries)
  }

  private collection(kind: InboxKind): Collection<MessageDocument | EnquiryDocument> {
    return (kind === 'message' ? this.messages : this.enquiries) as Collection<
      MessageDocument | EnquiryDocument
    >
  }

  private get syncState(): Collection<SyncStateDocument> {
    return this.db.collection<SyncStateDocument>(Collections.SyncState)
  }

  // ------------------------------------------------------------------- reads

  async listMessages(website: string): Promise<SiteMessage[]> {
    const documents = await this.messages.find({ website }).sort({ createdAt: -1 }).toArray()
    return documents.flatMap((document) => readMessage(document) ?? [])
  }

  async listEnquiries(website: string): Promise<SiteEnquiry[]> {
    const documents = await this.enquiries.find({ website }).sort({ createdAt: -1 }).toArray()
    return documents.flatMap((document) => readEnquiry(document) ?? [])
  }

  async message(website: string, id: string): Promise<SiteMessage | null> {
    const document = await this.messages.findOne({ _id: id, website })
    return document ? readMessage(document) : null
  }

  async enquiry(website: string, id: string): Promise<SiteEnquiry | null> {
    const document = await this.enquiries.findOne({ _id: id, website })
    return document ? readEnquiry(document) : null
  }

  /** Messages nobody has opened and enquiries nobody has taken up. */
  async waiting(website: string): Promise<{ messages: number; enquiries: number }> {
    const [messages, enquiries] = await Promise.all([
      this.messages.countDocuments({ website, status: 'new' }),
      this.enquiries.countDocuments({ website, status: 'new' })
    ])
    return { messages, enquiries }
  }

  /** Statuses set here that the website has not taken yet. */
  async pending(
    kind: InboxKind,
    website: string
  ): Promise<{ id: string; status: MessageStatus | EnquiryStatus }[]> {
    const documents = await this.collection(kind)
      .find({ website, pending: true }, { projection: { _id: 1, status: 1 } })
      .toArray()
    return documents.map((document) => ({ id: document._id, status: document.status }))
  }

  // -------------------------------------------------------------- check-ins

  /**
   * Lays a page of the website's messages over the copy, and returns the ones
   * that are new to this machine.
   */
  async applyMessages(website: string, remote: readonly RemoteMessage[]): Promise<SiteMessage[]> {
    const inserted = await this.apply(
      this.messages,
      website,
      remote.map((record) => ({
        id: record.id,
        status: record.status,
        fields: {
          ref: record.ref,
          createdAt: time(record.createdAt),
          updatedAt: time(record.updatedAt),
          ...pickText(MESSAGE_TEXT, record)
        }
      }))
    )
    return this.found(inserted, (id) => this.message(website, id))
  }

  async applyEnquiries(website: string, remote: readonly RemoteEnquiry[]): Promise<SiteEnquiry[]> {
    const inserted = await this.apply(
      this.enquiries,
      website,
      remote.map((record) => ({
        id: record.id,
        status: record.status,
        fields: {
          ref: record.ref,
          createdAt: time(record.createdAt),
          updatedAt: time(record.updatedAt),
          ...pickText(ENQUIRY_TEXT, record)
        }
      }))
    )
    return this.found(inserted, (id) => this.enquiry(website, id))
  }

  /**
   * Removes what the website says was deleted.
   *
   * Not filtered by website: an id names one record wherever it is held, and
   * a deletion from the other copy of the console is meant to reach this one
   * whichever address it was read through.
   */
  async applyDeletions(deletions: readonly RemoteDeletion[]): Promise<void> {
    for (const kind of ['message', 'enquiry'] as const) {
      const ids = deletions.filter((deletion) => deletion.kind === kind).map((d) => d.id)
      if (ids.length) await this.collection(kind).deleteMany({ _id: { $in: ids } })
    }
  }

  async cursor(website: string): Promise<string | null> {
    return (await this.syncState.findOne({ _id: website }))?.cursor ?? null
  }

  async saveCursor(website: string, cursor: string): Promise<void> {
    await this.syncState.updateOne(
      { _id: website },
      { $set: { cursor, syncedAt: Date.now() } },
      { upsert: true }
    )
  }

  // ------------------------------------------------------------------ writes

  /** Sets a status here, marked as waiting to be sent. False when not held. */
  async setStatus(
    kind: InboxKind,
    website: string,
    id: string,
    status: MessageStatus | EnquiryStatus
  ): Promise<boolean> {
    const result = await this.collection(kind).updateOne(
      { _id: id, website },
      { $set: { status, pending: true } }
    )
    return result.matchedCount > 0
  }

  /**
   * Marks a status as taken by the website.
   *
   * Only while it is still the status that was sent: one changed again while
   * the first was in flight stays pending, so the second goes too.
   */
  async settle(kind: InboxKind, id: string, status: MessageStatus | EnquiryStatus): Promise<void> {
    await this.collection(kind).updateOne({ _id: id, status }, { $set: { pending: false } })
  }

  async setNote(kind: InboxKind, website: string, id: string, note: string): Promise<boolean> {
    const result = await this.collection(kind).updateOne({ _id: id, website }, { $set: { note } })
    return result.matchedCount > 0
  }

  async remove(kind: InboxKind, id: string): Promise<void> {
    await this.collection(kind).deleteOne({ _id: id })
  }

  // ----------------------------------------------------------------- private

  /**
   * Upserts a page, and returns the ids that were inserted.
   *
   * The website's fields are set and nothing else: the note is this
   * machine's and is never touched by a check-in. Neither is a status still
   * waiting to be sent, because the operator set it after whatever the
   * website is now reporting.
   */
  private async apply<T extends MessageDocument | EnquiryDocument>(
    collection: Collection<T>,
    website: string,
    records: readonly { id: string; status: string; fields: Record<string, unknown> }[]
  ): Promise<string[]> {
    if (!records.length) return []

    const held = await collection
      .find({ _id: { $in: records.map((record) => record.id) }, pending: true } as never, {
        projection: { _id: 1 }
      })
      .toArray()
    const waiting = new Set(held.map((document) => document._id as string))

    const operations = records.map((record) => ({
      updateOne: {
        filter: { _id: record.id },
        update: {
          $set: {
            ...record.fields,
            website,
            ...(waiting.has(record.id) ? {} : { status: record.status, pending: false })
          },
          $setOnInsert: { note: '' }
        },
        upsert: true
      }
    })) as unknown as AnyBulkWriteOperation<T>[]

    const result = await collection.bulkWrite(operations, { ordered: false })
    return Object.values(result.upsertedIds).map((id) => String(id))
  }

  /** The copies just inserted, read back. A page holds at most a few. */
  private async found<T>(
    ids: readonly string[],
    read: (id: string) => Promise<T | null>
  ): Promise<T[]> {
    const records: T[] = []
    for (const id of ids) {
      const record = await read(id)
      if (record) records.push(record)
    }
    return records
  }
}

function pickText<K extends string>(
  fields: readonly K[],
  record: Record<K, string>
): Record<K, string> {
  return Object.fromEntries(fields.map((field) => [field, record[field]])) as Record<K, string>
}

/**
 * A stored copy, or null when it cannot be read.
 *
 * One unreadable copy is left out of the list rather than failing it, the
 * rule every repository here follows. It can only come from a hand edit.
 */
function readMessage(document: MessageDocument): SiteMessage | null {
  const { _id, ...rest } = document
  const parsed = SiteMessageSchema.safeParse({ ...rest, id: _id })
  if (parsed.success) return parsed.data
  logger.warn(`Website message ${_id} is unreadable; leaving it out`)
  return null
}

function readEnquiry(document: EnquiryDocument): SiteEnquiry | null {
  const { _id, ...rest } = document
  const parsed = SiteEnquirySchema.safeParse({ ...rest, id: _id })
  if (parsed.success) return parsed.data
  logger.warn(`Website enquiry ${_id} is unreadable; leaving it out`)
  return null
}
