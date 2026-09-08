import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import { AppError, ErrorCode } from '@main/core/errors'

export interface ExtractOptions {
  archivePath: string
  destination: string
  /** Return true to extract the entry, false to skip it. */
  filter: (entryPath: string) => boolean
  /**
   * Number of leading path segments to drop. MongoDB archives nest everything
   * under a single versioned directory, so this is normally 1.
   */
  stripComponents?: number
  onProgress?: (extractedEntries: number, extractedBytes: number) => void
  signal?: AbortSignal
}

export interface ExtractResult {
  entries: number
  bytes: number
}

/**
 * Rejects absolute paths, drive letters and `..` traversal so a hostile archive
 * cannot write outside `destination` (the class of bug behind the well-known
 * "zip slip" advisories).
 */
function safeJoin(destination: string, entryPath: string): string | null {
  const cleaned = entryPath.replace(/\\/g, '/')
  if (cleaned.startsWith('/') || /^[a-z]:/i.test(cleaned)) return null

  const target = normalize(join(destination, cleaned))
  const root = normalize(destination.endsWith(sep) ? destination : destination + sep)
  return target.startsWith(root) ? target : null
}

function stripPath(entryPath: string, stripComponents: number): string | null {
  if (stripComponents <= 0) return entryPath
  const parts = entryPath.replace(/\\/g, '/').split('/')
  if (parts.length <= stripComponents) return null
  return parts.slice(stripComponents).join('/')
}

/** Extracts selected members of a zip archive without unpacking the whole file. */
export function extractZip(options: ExtractOptions): Promise<ExtractResult> {
  const { archivePath, destination, filter, stripComponents = 0, onProgress, signal } = options

  return new Promise<ExtractResult>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(
          new AppError('Could not read the downloaded archive.', {
            code: ErrorCode.ArchiveProvisionFailed,
            hint: 'The download may be incomplete. Retry provisioning.',
            recoverable: true,
            cause: openError
          })
        )
        return
      }

      let entries = 0
      let bytes = 0
      let settled = false

      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        zipfile.close()
        reject(AppError.from(error, { code: ErrorCode.ArchiveProvisionFailed, recoverable: true }))
      }

      const onAbort = (): void => fail(new DOMException('Aborted', 'AbortError'))
      signal?.addEventListener('abort', onAbort, { once: true })

      zipfile.on('error', fail)

      zipfile.on('end', () => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve({ entries, bytes })
      })

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (settled) return

        const stripped = stripPath(entry.fileName, stripComponents)
        if (!stripped || !filter(entry.fileName)) {
          zipfile.readEntry()
          return
        }

        const target = safeJoin(destination, stripped)
        if (!target) {
          fail(new Error(`Refusing to extract unsafe archive path: ${entry.fileName}`))
          return
        }

        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            fail(streamError ?? new Error(`Unreadable archive entry: ${entry.fileName}`))
            return
          }

          void mkdir(dirname(target), { recursive: true })
            .then(() => pipeline(readStream, createWriteStream(target)))
            .then(() => {
              entries += 1
              bytes += entry.uncompressedSize
              onProgress?.(entries, bytes)
              zipfile.readEntry()
            })
            .catch(fail)
        })
      })

      zipfile.readEntry()
    })
  })
}
