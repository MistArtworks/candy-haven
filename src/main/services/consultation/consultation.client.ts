import { z } from 'zod'
import { ChainSchema, NoteSchema } from '@shared/consult/engine'
import { SiteError, callWebsite, jsonBody, readJson } from '@main/services/website/website.http'

/**
 * The website's consultation API, as this console calls it.
 *
 * Every shared track, open or not, with the room left in the store; the
 * pass to upload one; opening its link; moving when one closes; closing
 * one now; forgetting one; asking the website to delete what should be
 * gone; and the feedback sent since a moment. The website keeps the tracks
 * in its Vercel Blob store and does every deletion itself. How a call is
 * made, signed in, and what its failures mean, is the inbox's and LORE's:
 * see website/website.http.ts.
 */

export { SiteError } from '@main/services/website/website.http'

const text = z.string().catch('')
/** An instant as the website writes it, or null. */
const instant = z.string().nullable().catch(null)

/**
 * A shared track, as the website sends it. Defaults throughout, for the
 * inbox's reason: the website may change before this build does.
 */
const RemoteConsultationSchema = z.object({
  id: z.string(),
  title: text,
  message: text,
  durationMs: z.number().catch(0),
  bpm: z.number().nullable().catch(null),
  audio: z
    .object({ path: text, url: text, bytes: z.number().catch(0), contentType: text })
    .catch({ path: '', url: '', bytes: 0, contentType: '' }),
  createdAt: z.string(),
  /** The account that shared it, by UID. */
  createdBy: text,
  expiresAt: z.string(),
  endedAt: instant,
  audioDeletedAt: instant,
  link: instant,
  waveform: instant,
  feedbackCount: z.number().int().min(0).catch(0)
})
export type RemoteConsultation = z.infer<typeof RemoteConsultationSchema>

/** How full the website's store is, by its own count. Null when it didn't say. */
const RemoteStorageSchema = z
  .object({
    configured: z.boolean(),
    usedBytes: z.number().min(0),
    limitBytes: z.number().positive()
  })
  .nullable()
  .catch(null)
export type RemoteStorage = z.infer<typeof RemoteStorageSchema>

/**
 * One producer's feedback, as the website sends it.
 *
 * Checked by the schema the website checked it with, and no defaults: a
 * note this build only half-read would be played back wrong, so one it
 * can't read is left out whole, and counted.
 */
const RemoteFeedbackSchema = z.object({
  id: z.string(),
  consultationId: z.string(),
  name: z.string(),
  notes: z.array(NoteSchema),
  chain: ChainSchema.nullable(),
  submittedAt: z.string()
})
export type RemoteFeedback = z.infer<typeof RemoteFeedbackSchema>

const ListSchema = z.object({
  consultations: z.array(z.unknown()).default([]),
  storage: RemoteStorageSchema.default(null)
})

const PassSchema = z.object({ pathname: z.string().min(1), token: z.string().min(1) })

const FeedbackPageSchema = z.object({
  feedback: z.array(z.unknown()).default([]),
  cursor: z.string(),
  more: z.boolean().default(false)
})

/** Every shared track, and the room left, as one listing answers. */
export interface ListPage {
  consultations: RemoteConsultation[]
  storage: RemoteStorage
  /** How many could not be read and were left out. */
  unreadable: number
}

export interface FeedbackPage {
  feedback: RemoteFeedback[]
  /** Where to ask from next time. Opaque; it is handed straight back. */
  cursor: string
  more: boolean
  /** How many could not be read and were left out. */
  unreadable: number
}

/** What opening a link sends: the track as uploaded, and how the page shows it. */
export interface OpenLink {
  title: string
  message: string
  durationMs: number
  bpm: number | null
  days: number
  audio: { path: string; url: string; bytes: number; contentType: string }
  waveform: string
}

export class ConsultationClient {
  constructor(
    /** The website's origin, `https://candy-heist.vercel.app`. */
    private readonly origin: string,
    private readonly token: () => Promise<string | null>
  ) {}

  /** Every shared track, newest first, and the room left in the store. */
  async list(): Promise<ListPage> {
    const response = await this.call('/api/haven/consultations', { method: 'GET' })
    return readList(await readJson(response))
  }

  /**
   * The pass to upload one track: where it goes in the store, and the
   * token that lets exactly it in for an hour. The website refuses it,
   * with a sentence, when there is no store or no room.
   */
  async prepareUpload(ask: {
    extension: string
    contentType: string
    bytes: number
  }): Promise<{ pathname: string; token: string }> {
    const response = await this.call('/api/haven/consultations/upload', jsonBody('POST', ask))
    const pass = PassSchema.safeParse(await readJson(response))
    if (!pass.success) throw unknownShape()
    return pass.data
  }

  /** Opens a link for a track already in the store. */
  async open(body: OpenLink): Promise<RemoteConsultation> {
    const response = await this.call('/api/haven/consultations', jsonBody('POST', body))
    return readConsultation(await readJson(response))
  }

  /** Deletes an upload whose link didn't open. */
  async discard(pathname: string): Promise<void> {
    await this.call('/api/haven/consultations/discard', jsonBody('POST', { pathname }))
  }

  /** Moves when an open link closes. */
  async change(id: string, change: { expiresAt: string }): Promise<RemoteConsultation> {
    const response = await this.call(
      `/api/haven/consultations/${encodeURIComponent(id)}`,
      jsonBody('PATCH', change)
    )
    return readConsultation(await readJson(response))
  }

  /** Closes a link now. Its page stops answering; its feedback and track are deleted. */
  async end(id: string): Promise<RemoteConsultation> {
    const response = await this.call(`/api/haven/consultations/${encodeURIComponent(id)}/end`, {
      method: 'POST'
    })
    return readConsultation(await readJson(response))
  }

  /** Forgets one altogether, its track included. Already gone counts as done. */
  async remove(id: string): Promise<void> {
    try {
      await this.call(`/api/haven/consultations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (error) {
      if (error instanceof SiteError && error.kind === 'missing') return
      throw error
    }
  }

  /** Asks the website to delete closed links' tracks now; answers with the list after. */
  async sweep(): Promise<ListPage> {
    const response = await this.call('/api/haven/consultations/sweep', { method: 'POST' })
    return readList(await readJson(response))
  }

  /** Feedback sent since `since`, or since the start, on links still open. */
  async feedback(since: string | null): Promise<FeedbackPage> {
    const query = since ? `?since=${encodeURIComponent(since)}` : ''
    const response = await this.call(`/api/haven/consultations/feedback${query}`, {
      method: 'GET'
    })
    const page = FeedbackPageSchema.safeParse(await readJson(response))
    if (!page.success) throw unknownShape()

    let unreadable = 0
    const feedback = page.data.feedback.flatMap((value) => {
      const parsed = RemoteFeedbackSchema.safeParse(value)
      if (parsed.success) return [parsed.data]
      unreadable += 1
      return []
    })
    return { feedback, cursor: page.data.cursor, more: page.data.more, unreadable }
  }

  // ----------------------------------------------------------------- private

  private call(path: string, init: RequestInit): Promise<Response> {
    return callWebsite(this.origin, this.token, path, init)
  }
}

function readList(body: unknown): ListPage {
  const page = ListSchema.safeParse(body)
  if (!page.success) throw unknownShape()

  let unreadable = 0
  const consultations = page.data.consultations.flatMap((value) => {
    const parsed = RemoteConsultationSchema.safeParse(value)
    if (parsed.success) return [parsed.data]
    unreadable += 1
    return []
  })
  return { consultations, storage: page.data.storage, unreadable }
}

function readConsultation(body: unknown): RemoteConsultation {
  const parsed = RemoteConsultationSchema.safeParse(body)
  if (!parsed.success) throw unknownShape()
  return parsed.data
}

function unknownShape(): SiteError {
  return new SiteError('failed', 'The website answered in a shape this console does not know.')
}
