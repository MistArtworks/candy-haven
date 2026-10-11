import { open, type FileHandle } from 'node:fs/promises'
import { delay } from '@main/core/async'

/**
 * Firebase Storage, as CONSULTATION uses it: a track up, a track down, and
 * deleting it when its link closes.
 *
 * Over REST, the way Firebase's own web SDK talks to it, rather than through
 * the SDK: main already holds the sign-in (DISPATCH's ID token), and the
 * four calls needed are small enough to make by hand. The SDK's source is
 * the specification followed here (`packages/storage/src/implementation/
 * requests.ts` in firebase-js-sdk): the same addresses, the same headers,
 * and the same resumable upload, which sends a file in pieces so a 200 MB
 * track on a slow connection shows how far it has got, and a dropped piece
 * is sent again rather than the whole file.
 *
 * The bucket's rules decide who may do any of it (storage.rules): the two
 * accounts only, audio only, under `consultation/` only, 200 MB at most.
 */

const ORIGIN = 'https://firebasestorage.googleapis.com'

/** Every piece but the last must be a multiple of this many bytes. */
const QUANTUM = 256 * 1024
const FIRST_PIECE = 4 * QUANTUM
const LARGEST_PIECE = 32 * QUANTUM
/**
 * How long a piece should take to send. Each piece is sized from how fast
 * the last one went, so the bar moves about this often on any connection.
 */
const PIECE_SECONDS = 2
/** Pieces in a row that may fail before the upload gives up. */
const ATTEMPTS = 4
const RETRY_MS = 1_000

const CALL_TIMEOUT_MS = 30_000
const PIECE_TIMEOUT_MS = 120_000
/** A whole track coming down, 200 MB at most. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000

/**
 * How long a producer's browser may keep the track. A second listen within
 * the day comes from their own cache rather than from the bucket, whose free
 * downloads are a gigabyte a day on an older project.
 */
const CACHE_CONTROL = 'private, max-age=86400'

/**
 * Why a call to Firebase Storage failed, in the terms the page states it in.
 * `unreachable` and `busy` are worth trying again; the rest are not.
 */
export type StorageFailureKind =
  | 'unreachable'
  | 'busy'
  /** The sign-in was refused. */
  | 'refused'
  /** The rules refused this account, or this file. */
  | 'forbidden'
  /** No such file, or (for an upload) no such bucket. */
  | 'missing'
  /** The project is not on the Blaze plan, which Storage needs. */
  | 'billing'
  | 'cancelled'
  | 'failed'

export class StorageError extends Error {
  constructor(
    readonly kind: StorageFailureKind,
    message: string,
    /** The HTTP status, when Storage answered at all. */
    readonly status: number | null = null
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/** A track kept in the bucket. */
export interface StoredTrack {
  path: string
  bytes: number
  contentType: string
  /** Where the page plays it from: its address with a download token, which needs no sign-in. */
  url: string
}

export interface UploadOptions {
  signal: AbortSignal
  /** Bytes the bucket holds so far. */
  onProgress: (sent: number) => void
}

export class StorageClient {
  constructor(
    /** `candy-haven.firebasestorage.app`, or an older `<project>.appspot.com`. */
    readonly bucket: string,
    private readonly token: () => Promise<string | null>
  ) {}

  /**
   * Sends a file to `path`, in pieces, and answers with where it can be
   * played from. The file is read a piece at a time, never whole.
   */
  async upload(
    file: string,
    path: string,
    contentType: string,
    size: number,
    { signal, onProgress }: UploadOptions
  ): Promise<StoredTrack> {
    const session = await this.start(path, contentType, size, signal)
    const handle = await open(file, 'r')

    try {
      let offset = 0
      let piece = FIRST_PIECE
      let failures = 0

      for (;;) {
        if (signal.aborted) throw cancelled()
        const length = Math.min(piece, size - offset)
        const last = offset + length === size
        const bytes = await readPiece(handle, offset, length)
        const started = performance.now()

        let response: Response
        try {
          response = await this.call(
            session,
            {
              method: 'POST',
              headers: {
                'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload',
                'X-Goog-Upload-Offset': String(offset)
              },
              body: bytes
            },
            signal,
            PIECE_TIMEOUT_MS
          )
        } catch (error) {
          failures += 1
          if (failures >= ATTEMPTS) throw error
          // The piece may have arrived and only its answer been lost, so the
          // bucket is asked where it has got to rather than assumed.
          const status = await this.resume(session, error, signal)
          if (status.final) {
            onProgress(size)
            return this.finish(path, size, contentType, null, signal)
          }
          offset = status.received
          piece = quantize(piece / 2)
          onProgress(offset)
          continue
        }

        failures = 0
        const state = response.headers.get('x-goog-upload-status')
        if (state === 'final') {
          onProgress(size)
          const metadata: unknown = await response.json().catch(() => null)
          return this.finish(path, size, contentType, metadata, signal)
        }
        if (state !== 'active') {
          throw new StorageError(
            'failed',
            'Firebase Storage answered the upload in a way this console does not know.'
          )
        }

        offset += length
        onProgress(offset)
        const seconds = Math.max(0.05, (performance.now() - started) / 1000)
        piece = quantize((length / seconds) * PIECE_SECONDS)
      }
    } finally {
      await handle.close()
    }
  }

  /** Deletes a track. One that has gone already counts as deleted. */
  async remove(path: string): Promise<void> {
    try {
      await this.call(this.objectUrl(path), { method: 'DELETE' }, undefined, CALL_TIMEOUT_MS)
    } catch (error) {
      if (error instanceof StorageError && error.kind === 'missing') return
      throw error
    }
  }

  /** A track's bytes, for playing it here when the file it was shared from has gone. */
  async download(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const response = await this.call(
      `${this.objectUrl(path)}?alt=media`,
      { method: 'GET' },
      undefined,
      DOWNLOAD_TIMEOUT_MS
    )
    return new Uint8Array(await response.arrayBuffer())
  }

  // ----------------------------------------------------------------- private

  private objectUrl(path: string): string {
    return `${ORIGIN}/v0/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(path)}`
  }

  /** Opens a resumable upload, and answers with the address its pieces go to. */
  private async start(
    path: string,
    contentType: string,
    size: number,
    signal: AbortSignal
  ): Promise<string> {
    const response = await this.call(
      `${ORIGIN}/v0/b/${encodeURIComponent(this.bucket)}/o?name=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(size),
          'X-Goog-Upload-Header-Content-Type': contentType,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({ name: path, contentType, cacheControl: CACHE_CONTROL })
      },
      signal,
      CALL_TIMEOUT_MS
    )

    const session = response.headers.get('x-goog-upload-url')
    if (response.headers.get('x-goog-upload-status') !== 'active' || !session) {
      throw new StorageError('failed', 'Firebase Storage did not open the upload.')
    }
    return session
  }

  /**
   * Where an interrupted upload has got to, asked again with a pause
   * between tries while the failure is one that passes. Throws the last
   * failure when it doesn't.
   */
  private async resume(
    session: string,
    failure: unknown,
    signal: AbortSignal
  ): Promise<{ received: number; final: boolean }> {
    let error = failure
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (
        !(error instanceof StorageError) ||
        (error.kind !== 'unreachable' && error.kind !== 'busy')
      ) {
        break
      }
      await pause(RETRY_MS * 2 ** attempt, signal)
      try {
        const response = await this.call(
          session,
          { method: 'POST', headers: { 'X-Goog-Upload-Command': 'query' } },
          signal,
          CALL_TIMEOUT_MS
        )
        const state = response.headers.get('x-goog-upload-status')
        const received = Number(response.headers.get('x-goog-upload-size-received'))
        if ((state !== 'active' && state !== 'final') || !Number.isFinite(received)) {
          throw new StorageError('failed', 'Firebase Storage lost track of the upload.')
        }
        return { received, final: state === 'final' }
      } catch (next) {
        error = next
      }
    }
    throw error
  }

  /**
   * The finished track's address. Storage gives an upload a download token
   * of its own, normally in the last piece's answer; when that answer was
   * lost, it is read from the file's metadata instead.
   */
  private async finish(
    path: string,
    bytes: number,
    contentType: string,
    metadata: unknown,
    signal: AbortSignal
  ): Promise<StoredTrack> {
    let token = downloadToken(metadata)
    if (!token) {
      const response = await this.call(
        this.objectUrl(path),
        { method: 'GET' },
        signal,
        CALL_TIMEOUT_MS
      )
      token = downloadToken(await response.json().catch(() => null))
    }
    if (!token) {
      throw new StorageError(
        'failed',
        'Firebase Storage kept the track but gave it no address to play it from.'
      )
    }
    return {
      path,
      bytes,
      contentType,
      url: `${this.objectUrl(path)}?alt=media&token=${encodeURIComponent(token)}`
    }
  }

  /** One call, signed in. Resolves when Storage said yes; throws a StorageError otherwise. */
  private async call(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    timeout: number
  ): Promise<Response> {
    const bearer = await this.token()
    if (!bearer) throw new StorageError('refused', 'Sign in to reach Firebase Storage.')

    const limit = AbortSignal.timeout(timeout)
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        // Firebase's own scheme, not a bearer token: what the SDK sends.
        headers: { ...init.headers, Authorization: `Firebase ${bearer}` },
        signal: signal ? AbortSignal.any([signal, limit]) : limit
      })
    } catch {
      if (signal?.aborted) throw cancelled()
      throw new StorageError('unreachable', 'Could not reach Firebase Storage.')
    }

    if (response.ok) return response
    const body: unknown = await response.json().catch(() => null)
    throw failure(response.status, body, this.bucket)
  }
}

/** A piece size Storage accepts: a whole number of quanta, within bounds. */
function quantize(bytes: number): number {
  const quanta = Math.floor(bytes / QUANTUM)
  return Math.min(Math.max(quanta, 1), LARGEST_PIECE / QUANTUM) * QUANTUM
}

async function readPiece(
  handle: FileHandle,
  offset: number,
  length: number
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(length)
  let filled = 0
  while (filled < length) {
    const { bytesRead } = await handle.read(bytes, filled, length - filled, offset + filled)
    if (bytesRead === 0) {
      throw new StorageError('failed', 'The file got shorter while it was uploading.')
    }
    filled += bytesRead
  }
  return bytes
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(ms, signal)
  } catch {
    throw cancelled()
  }
}

function cancelled(): StorageError {
  return new StorageError('cancelled', 'The upload was cancelled.')
}

/** The first download token in a file's metadata, or null. */
function downloadToken(metadata: unknown): string | null {
  const tokens = (metadata as { downloadTokens?: unknown } | null)?.downloadTokens
  if (typeof tokens !== 'string') return null
  return tokens.split(',')[0]?.trim() || null
}

function failure(status: number, body: unknown, bucket: string): StorageError {
  const said = (body as { error?: { message?: unknown } } | null)?.error?.message
  const message = typeof said === 'string' ? said : ''

  switch (status) {
    case 401:
      return new StorageError('refused', 'Firebase Storage did not accept the sign-in.', status)
    case 402:
      return new StorageError(
        'billing',
        'Firebase Storage needs the project on the Blaze plan.',
        status
      )
    case 403:
      return new StorageError(
        'forbidden',
        'Firebase Storage refused this account. Its rules may not be published yet.',
        status
      )
    case 404:
      return new StorageError('missing', message || 'Firebase Storage has no such file.', status)
    case 412:
      return new StorageError(
        'failed',
        `Firebase Storage is not set up to use the bucket ${bucket} yet.`,
        status
      )
    case 429:
      return new StorageError('busy', 'Firebase Storage is busy. Try again in a minute.', status)
    default:
      return new StorageError(
        status >= 500 ? 'unreachable' : 'failed',
        message ? `Firebase Storage: ${message}` : `Firebase Storage answered ${status}.`,
        status
      )
  }
}
