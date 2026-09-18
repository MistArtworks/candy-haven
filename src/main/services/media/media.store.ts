import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ManagedImage } from '@shared/domain/artists'

const logger = getLogger('media')

/**
 * The archive's own copies of the operator's pictures.
 *
 * Artist photographs, cover art and canvases are **copied in**, never
 * referenced where they were found. The same call `ReleasesService` used to
 * make for its deliverables, and for the same reason: a path into somebody's
 * Downloads folder is a picture that disappears the first time they tidy up,
 * and a discography that loses its covers is not a record of anything.
 *
 * Laid out under the wrapper beside `Projects` and `Release Mastered Tracks`:
 *
 * ```
 * Candy Haven\Media\
 *   artists\   <artistId>.<ext>
 *   releases\  <releaseId>-artwork.<ext>
 *              <releaseId>-canvas.<ext>
 * ```
 *
 * Named by the **record's** id rather than by the source filename, which is
 * what makes replacing a picture a single overwrite with nothing to clean up
 * and no way for two records to collide. The extension is kept so the file is
 * still openable by hand in Explorer.
 */
export const MEDIA_DIRECTORY_NAME = 'Media'

export type MediaBucket = 'artists' | 'releases'

export interface MediaRequest {
  /** Absolute path to the wrapper — `<filing root>\Candy Haven`. */
  wrapperPath: string
  bucket: MediaBucket
  /** The record's id, and the stem of the file written. */
  key: string
  /** The file the operator chose. */
  sourcePath: string
  /** Extensions this call will accept, without dots. */
  allowed: readonly string[]
  maxBytes: number
}

/**
 * Copies one file in and returns the record to store against it.
 *
 * Refuses rather than converts: an operator who picked a `.tiff` for a cover
 * has picked the wrong file, and silently transcoding it would leave them with
 * artwork they never approved on a release they thought they had checked.
 */
export async function storeMedia(request: MediaRequest): Promise<ManagedImage> {
  const extension = extname(request.sourcePath).slice(1).toLowerCase()

  if (!request.allowed.includes(extension)) {
    throw new AppError(
      `${extension ? `.${extension}` : 'That file'} is not a format this can use.`,
      {
        code: ErrorCode.Validation,
        hint: `Accepted: ${request.allowed.map((value) => `.${value}`).join(', ')}`,
        recoverable: false
      }
    )
  }

  const info = await stat(request.sourcePath).catch(() => null)
  if (!info?.isFile()) {
    throw new AppError('That file is no longer where it was.', {
      code: ErrorCode.NotFound,
      recoverable: false
    })
  }

  if (info.size > request.maxBytes) {
    throw new AppError('That file is too large.', {
      code: ErrorCode.Validation,
      hint: `The ceiling is ${Math.round(request.maxBytes / 1024 / 1024)} MB; this is ${Math.round(
        info.size / 1024 / 1024
      )} MB.`,
      recoverable: false
    })
  }

  const directory = join(request.wrapperPath, MEDIA_DIRECTORY_NAME, request.bucket)
  await mkdir(directory, { recursive: true })

  const destination = join(directory, `${request.key}.${extension}`)

  /*
   * Any previous copy is removed first, whatever *its* extension was.
   *
   * Overwriting alone is not enough: replacing a `.png` cover with a `.jpg`
   * would write the new file and leave the old one beside it, and the next
   * person to look in the folder would find two covers for one release with
   * no way to tell which the record means.
   */
  await clearMedia(request.wrapperPath, request.bucket, request.key)

  await copyFile(request.sourcePath, destination)
  logger.info(`Stored ${request.bucket} media for ${request.key}`)

  return { sourcePath: request.sourcePath, copiedPath: destination, copiedAt: Date.now() }
}

/**
 * Removes every copy held for a key, whatever extension it was written under.
 *
 * Best-effort by design. A picture that cannot be deleted must not stop an
 * artist being removed from the roster — the record is the thing being
 * deleted, and a stranded file in `Media\` is untidy rather than wrong.
 */
export async function clearMedia(
  wrapperPath: string,
  bucket: MediaBucket,
  key: string,
  extensions: readonly string[] = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'avif',
    'gif',
    'mp4',
    'mov',
    'webm'
  ]
): Promise<void> {
  const directory = join(wrapperPath, MEDIA_DIRECTORY_NAME, bucket)

  await Promise.all(
    extensions.map((extension) =>
      rm(join(directory, `${key}.${extension}`), { force: true }).catch((cause) => {
        logger.warn(`Could not remove ${bucket} media ${key}.${extension}`, cause)
      })
    )
  )
}

/** The empty record, for a field that has never been set or has been cleared. */
export function noMedia(): ManagedImage {
  return { sourcePath: null, copiedPath: null, copiedAt: null }
}
