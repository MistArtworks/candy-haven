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
 *
 * The status and the note are kept here and nowhere else. They are the
 * operator's own tracking; the website holds only what the visitor sent.
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

  // -------------------------------------------------------------- check-ins

  /** Lays a page of the website's messages over the copy. */
  async applyMessages(website: string, remote: readonly RemoteMessage[]): Promise<void> {
    await this.apply(
      this.messages,
      website,
      remote.map((record) => ({
        id: record.id,
        fields: {
          ref: record.ref,
          createdAt: time(record.createdAt),
          ...pickText(MESSAGE_TEXT, record)
        }
      }))
    )
  }

  async applyEnquiries(website: string, remote: readonly RemoteEnquiry[]): Promise<void> {
    await this.apply(
      this.enquiries,
      website,
      remote.map((record) => ({
        id: record.id,
        fields: {
          ref: record.ref,
          createdAt: time(record.createdAt),
          ...pickText(ENQUIRY_TEXT, record)
        }
      }))
    )
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

  /** Sets where one stands. This machine's alone. False when not held. */
  async setStatus(
    kind: InboxKind,
    website: string,
    id: string,
    status: MessageStatus | EnquiryStatus
  ): Promise<boolean> {
    const result = await this.collection(kind).updateOne({ _id: id, website }, { $set: { status } })
    return result.matchedCount > 0
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
   * Upserts a page.
   *
   * The website's fields are set and nothing else. The status and the note
   * are the operator's: a copy starts new with an empty note, and no later
   * check-in touches either.
   */
  private async apply<T extends MessageDocument | EnquiryDocument>(
    collection: Collection<T>,
    website: string,
    records: readonly { id: string; fields: Record<string, unknown> }[]
  ): Promise<void> {
    if (!records.length) return

    const operations = records.map((record) => ({
      updateOne: {
        filter: { _id: record.id },
        update: {
          $set: { ...record.fields, website },
          $setOnInsert: { status: 'new', note: '' }
        },
        upsert: true
      }
    })) as unknown as AnyBulkWriteOperation<T>[]

    await collection.bulkWrite(operations, { ordered: false })
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
