import { getLogger } from '@main/core/logger'

const logger = getLogger('dispatch:rtdb')

export interface RtdbEvent {
  /** `put` replaces the value at `path`; `patch` merges into it. */
  kind: 'put' | 'patch'
  /** Relative to the streamed location. `/` means the whole thing. */
  path: string
  data: unknown
}

export interface RtdbStreamHandlers {
  onEvent: (event: RtdbEvent) => void
  onOpen: () => void
  onError: (error: Error) => void
}

/**
 * The Realtime Database, over its REST interface.
 *
 * No Firebase SDK. The board needs four verbs and a change stream, all of which
 * REST gives directly, against a dependency that would otherwise add a megabyte
 * of client to the main process for a two-person suggestion list. It also keeps
 * the network in the main process, where the rest of this application's I/O
 * lives, rather than punching a hole in the renderer's content-security policy
 * — that policy is `connect-src 'self'` and it is worth keeping.
 *
 * Everything here assumes the database's rules permit unauthenticated access,
 * which is what Firebase's *test mode* grants. Test mode expires: when it does,
 * writes start failing with 401 and the console will say so rather than
 * silently dropping them. Locking it down properly means either signing in or
 * writing rules that admit these two, and both are a later decision.
 */
export class RtdbClient {
  constructor(private readonly databaseUrl: string) {}

  private url(path: string, query = ''): string {
    const base = this.databaseUrl.replace(/\/+$/, '')
    const clean = path.replace(/^\/+/, '')
    return `${base}/${clean}.json${query}`
  }

  /** The whole subtree at `path`, or null when there is nothing there. */
  async get<T>(path: string): Promise<T | null> {
    const response = await fetch(this.url(path))
    if (!response.ok) throw await failure(response, 'read')

    return (await response.json()) as T | null
  }

  /** Replaces the value at `path`. */
  async put(path: string, value: unknown): Promise<void> {
    const response = await fetch(this.url(path), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value)
    })
    if (!response.ok) throw await failure(response, 'write')
  }

  /** Merges the given keys into the value at `path`, leaving the rest alone. */
  async patch(path: string, value: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.url(path), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value)
    })
    if (!response.ok) throw await failure(response, 'write')
  }

  async remove(path: string): Promise<void> {
    const response = await fetch(this.url(path), { method: 'DELETE' })
    if (!response.ok) throw await failure(response, 'delete')
  }

  /**
   * Watches `path` and reports every change.
   *
   * The REST interface serves server-sent events when asked for them, which is
   * the whole reason this can be done without the SDK: the first frame is a
   * `put` carrying the entire subtree, and every frame after it is the delta.
   *
   * Parsed by hand rather than with an `EventSource`, which does not exist in
   * Node — and would not be wanted here anyway, because its automatic
   * reconnection is not observable and this needs to report going offline.
   *
   * Returns a function that stops the stream. Reconnection is the caller's, for
   * the same reason: it is the caller that knows whether anyone is watching.
   */
  stream(path: string, handlers: RtdbStreamHandlers): () => void {
    const controller = new AbortController()
    let stopped = false

    const run = async (): Promise<void> => {
      const response = await fetch(this.url(path), {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal
      })

      if (!response.ok) throw await failure(response, 'stream')
      if (!response.body) throw new Error('The change stream returned no body.')

      handlers.onOpen()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        /*
         * Events are separated by a blank line and may span several chunks.
         *
         * The remainder is deliberately kept in `buffer` rather than parsed
         * optimistically: a large first frame arrives in pieces, and treating a
         * partial one as complete would hand the service a truncated board.
         */
        let split = buffer.indexOf('\n\n')
        while (split !== -1) {
          const chunk = buffer.slice(0, split)
          buffer = buffer.slice(split + 2)
          emit(chunk, handlers.onEvent)
          split = buffer.indexOf('\n\n')
        }
      }
    }

    void run().catch((cause: unknown) => {
      // An abort is this object being closed, not a failure.
      if (stopped || controller.signal.aborted) return
      handlers.onError(cause instanceof Error ? cause : new Error(String(cause)))
    })

    return () => {
      stopped = true
      controller.abort()
    }
  }
}

/**
 * One server-sent event, if it is one worth passing on.
 *
 * Firebase sends `keep-alive`, `auth_revoked` and `cancel` alongside the two
 * that carry data. Only `put` and `patch` are forwarded; a keep-alive that
 * reached the service would look like an empty board.
 */
function emit(chunk: string, onEvent: (event: RtdbEvent) => void): void {
  let name = ''
  const dataLines: string[] = []

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }

  if (name !== 'put' && name !== 'patch') return

  try {
    const payload = JSON.parse(dataLines.join('\n')) as { path?: string; data?: unknown }
    onEvent({ kind: name, path: payload.path ?? '/', data: payload.data ?? null })
  } catch (cause) {
    // One unreadable frame must not end the stream: the next one is very likely
    // sound, and dropping the connection would take the board offline for it.
    logger.warn('Skipping an unreadable change frame', cause)
  }
}

/** A failed request, as an error that says what was being attempted. */
async function failure(response: Response, verb: string): Promise<Error> {
  const body = await response.text().catch(() => '')
  const detail = body.slice(0, 200).trim()

  if (response.status === 401 || response.status === 403) {
    return new Error(
      `The database refused the ${verb} (${response.status}). Its rules may have expired — ` +
        'a Firebase database created in test mode stops allowing access after thirty days.'
    )
  }

  return new Error(
    `The database refused the ${verb} (${response.status})${detail ? `: ${detail}` : ''}`
  )
}
