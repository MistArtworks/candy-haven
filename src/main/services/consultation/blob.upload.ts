import { openAsBlob } from 'node:fs'
import {
  BlobAccessError,
  BlobClientTokenExpiredError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobPathnameMismatchError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  put
} from '@vercel/blob'

/**
 * Sends a shared track to the website's Vercel Blob store, with the pass
 * the website gave for it (`POST /api/haven/consultations/upload`).
 *
 * Vercel's own SDK does the sending: in pieces, several at once, retrying a
 * piece that fails, and reporting how far it has got. The file is handed
 * over as a file-backed Blob, so it is read a piece at a time, never whole.
 *
 * The pass is good for one name and one type, for an hour. It names the
 * size too, but Vercel doesn't hold a file sent in pieces to it, so the
 * website measures the track before it opens the link. The pass is the
 * only thing this console ever holds that can write to the store, and
 * nothing it holds can delete from it: the website does every deletion.
 */

/** Why an upload failed, in the terms the share dialog states it in. */
export type UploadFailureKind =
  | 'cancelled'
  /** Vercel has paused the store: a month's free allowance is used up. */
  | 'paused'
  /** The pass was refused, or ran out before the upload finished. */
  | 'refused'
  | 'unreachable'
  | 'failed'

export class UploadError extends Error {
  constructor(
    readonly kind: UploadFailureKind,
    message: string
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/** What the website hands over for one upload. */
export interface UploadPass {
  /** Where the track goes in the store: `consultation/<uuid>.wav`. */
  pathname: string
  /** The client token that lets exactly that file in. */
  token: string
}

/** The track as the store has it. */
export interface UploadedTrack {
  pathname: string
  /** Its public address, which the page plays and the website deletes by. */
  url: string
}

export interface UploadOptions {
  signal: AbortSignal
  /** Bytes sent so far, of the whole. */
  onProgress: (sent: number, total: number) => void
}

/**
 * Tries the SDK gives a request that fails on the network. Its own default
 * is ten, waiting twice as long before each (1 s, 2 s, … 512 s): seventeen
 * minutes before a dropped connection reads as one, with Cancel only taking
 * hold at the next try. Three is seven seconds. The SDK reads the setting
 * from the environment on every request; one set elsewhere wins.
 */
const RETRIES = '3'

export async function uploadTrack(
  file: string,
  pass: UploadPass,
  contentType: string,
  { signal, onProgress }: UploadOptions
): Promise<UploadedTrack> {
  process.env.VERCEL_BLOB_RETRIES ??= RETRIES
  const body = await openAsBlob(file, { type: contentType })
  try {
    const stored = await put(pass.pathname, body, {
      access: 'public',
      token: pass.token,
      contentType,
      multipart: true,
      abortSignal: signal,
      onUploadProgress: ({ loaded, total }) => onProgress(loaded, total)
    })
    return { pathname: stored.pathname, url: stored.url }
  } catch (error) {
    throw failure(error, signal)
  }
}

/** How the SDK's own error messages begin. */
const SDK_PREFIX = 'Vercel Blob: '

function failure(error: unknown, signal: AbortSignal): UploadError {
  if (signal.aborted || error instanceof BlobRequestAbortedError) {
    return new UploadError('cancelled', 'The upload was cancelled.')
  }
  if (error instanceof BlobStoreSuspendedError) {
    return new UploadError(
      'paused',
      'Vercel has paused the tracks: this month’s free allowance is used up.'
    )
  }
  if (error instanceof BlobClientTokenExpiredError) {
    return new UploadError('refused', 'The upload took longer than its hour.')
  }
  if (error instanceof BlobStoreNotFoundError) {
    return new UploadError('refused', 'The website’s Blob store is not there any more.')
  }
  if (
    error instanceof BlobAccessError ||
    error instanceof BlobPathnameMismatchError ||
    error instanceof BlobContentTypeNotAllowedError ||
    error instanceof BlobFileTooLargeError
  ) {
    return new UploadError('refused', 'Vercel Blob refused the upload’s pass.')
  }
  // The SDK gives a dropped connection as the service being unavailable.
  if (error instanceof BlobServiceNotAvailable || error instanceof BlobServiceRateLimited) {
    return new UploadError('unreachable', 'Vercel Blob can’t be reached, or is too busy right now.')
  }
  if (error instanceof TypeError) {
    return new UploadError('unreachable', 'Could not reach Vercel Blob.')
  }
  if (!(error instanceof Error)) return new UploadError('failed', 'The upload failed.')
  const message = error.message.startsWith(SDK_PREFIX) ? error.message : SDK_PREFIX + error.message
  return new UploadError('failed', message)
}
