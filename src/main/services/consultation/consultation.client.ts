import { z } from 'zod'
import { ChainSchema, NoteSchema } from '@shared/consult/engine'
import { SiteError, callWebsite, jsonBody, readJson } from '@main/services/website/website.http'

/**
 * The website's consultation API, as this console calls it.
 *
 * Every shared track, open or not; opening a link for a track just
 * uploaded; moving when one closes, or recording that its track was
 * deleted; closing one now; forgetting one; and the feedback sent since a
 * moment. How a call is made, signed in, and what its failures mean, is the
 * inbox's and LORE's: see website/website.http.ts.
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
    .object({ path: text, bytes: z.number().catch(0), contentType: text })
    .catch({ path: '', bytes: 0, contentType: '' }),
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

const ListSchema = z.object({ consultations: z.array(z.unknown()).default([]) })

const FeedbackPageSchema = z.object({
  feedback: z.array(z.unknown()).default([]),
  cursor: z.string(),
  more: z.boolean().default(false)
})

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

  /** Every shared track, newest first, with the ones it could not read counted. */
  async list(): Promise<{ consultations: RemoteConsultation[]; unreadable: number }> {
    const response = await this.call('/api/haven/consultations', { method: 'GET' })
    const page = ListSchema.safeParse(await readJson(response))
    if (!page.success) throw unknownShape()

    let unreadable = 0
    const consultations = page.data.consultations.flatMap((value) => {
      const parsed = RemoteConsultationSchema.safeParse(value)
      if (parsed.success) return [parsed.data]
      unreadable += 1
      return []
    })
    return { consultations, unreadable }
  }

  /** Opens a link for a track already in the bucket. */
  async open(body: OpenLink): Promise<RemoteConsultation> {
    const response = await this.call('/api/haven/consultations', jsonBody('POST', body))
    return readConsultation(await readJson(response))
  }

  /** Moves when an open link closes, or records when its track was deleted. */
  async change(
    id: string,
    change: { expiresAt?: string; audioDeletedAt?: string }
  ): Promise<RemoteConsultation> {
    const response = await this.call(
      `/api/haven/consultations/${encodeURIComponent(id)}`,
      jsonBody('PATCH', change)
    )
    return readConsultation(await readJson(response))
  }

  /** Closes a link now. Its page stops answering and its feedback is deleted. */
  async end(id: string): Promise<RemoteConsultation> {
    const response = await this.call(`/api/haven/consultations/${encodeURIComponent(id)}/end`, {
      method: 'POST'
    })
    return readConsultation(await readJson(response))
  }

  /** Forgets one altogether. Already gone counts as done. */
  async remove(id: string): Promise<void> {
    try {
      await this.call(`/api/haven/consultations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (error) {
      if (error instanceof SiteError && error.kind === 'missing') return
      throw error
    }
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

function readConsultation(body: unknown): RemoteConsultation {
  const parsed = RemoteConsultationSchema.safeParse(body)
  if (!parsed.success) throw unknownShape()
  return parsed.data
}

function unknownShape(): SiteError {
  return new SiteError('failed', 'The website answered in a shape this console does not know.')
}
