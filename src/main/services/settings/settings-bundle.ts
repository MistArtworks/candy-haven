import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import yauzl from 'yauzl'
import { ZipFile } from 'yazl'
import {
  BUNDLE_ENTRIES,
  SETTINGS_BUNDLE_FORMAT,
  SETTINGS_BUNDLE_KIND,
  SettingsBundleManifestSchema,
  type SettingsBundleManifest
} from '@shared/domain/settings-bundle'
import { AppError, ErrorCode } from '@main/core/errors'

/**
 * Reading and writing the settings archive.
 *
 * Kept apart from `SettingsService` because it is file-format work and that
 * service is about one document's lifecycle. The service decides *what* goes
 * in; this decides how it is laid down and picked back up.
 */

/** A file destined for the archive. Absent sources are simply not passed. */
export interface BundleSource {
  entry: string
  contents: Buffer
}

/**
 * Writes the archive.
 *
 * Everything is buffered before the zip is opened, which is deliberate: these
 * are three files totalling a few kilobytes, and holding them in memory means a
 * read that fails — a missing token, a board never configured — is discovered
 * before anything has been written. A half-written bundle that looks complete
 * is worse than no bundle.
 */
export async function writeBundle(
  path: string,
  manifest: SettingsBundleManifest,
  sources: readonly BundleSource[]
): Promise<string[]> {
  const zip = new ZipFile()

  zip.addBuffer(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    BUNDLE_ENTRIES.manifest
  )
  for (const source of sources) zip.addBuffer(source.contents, source.entry)
  zip.end()

  const out = createWriteStream(path)
  zip.outputStream.pipe(out)

  try {
    // `close` rather than `finish`: the stream is done when the file descriptor
    // is, and returning earlier would let a caller open a file still being
    // flushed.
    await once(out, 'close')
  } catch (cause) {
    throw new AppError('The settings file could not be written.', {
      code: ErrorCode.Unknown,
      hint: cause instanceof Error ? cause.message : String(cause)
    })
  }

  return [BUNDLE_ENTRIES.manifest, ...sources.map((source) => source.entry)]
}

/** Every entry in the archive, by name. Entries are small and few. */
export function readBundle(path: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, archive) => {
      if (error || !archive) {
        reject(
          new AppError('That file could not be opened as a settings export.', {
            code: ErrorCode.Validation,
            hint: 'It should be the .zip written by REGULATION → Export settings.'
          })
        )
        return
      }

      const found = new Map<string, Buffer>()
      const names = new Set<string>(Object.values(BUNDLE_ENTRIES))

      archive.on('entry', (entry: yauzl.Entry) => {
        // Only the names this format defines are read, so a zip carrying
        // anything else contributes nothing — including a crafted one with a
        // traversing path, which is never used as a path here regardless.
        if (!names.has(entry.fileName)) {
          archive.readEntry()
          return
        }

        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(
              new AppError(`Could not read ${entry.fileName} from the export.`, {
                code: ErrorCode.Validation
              })
            )
            return
          }

          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            found.set(entry.fileName, Buffer.concat(chunks))
            archive.readEntry()
          })
          stream.on('error', reject)
        })
      })

      archive.on('end', () => resolve(found))
      archive.on('error', reject)
      archive.readEntry()
    })
  })
}

/**
 * The manifest, validated.
 *
 * Checked before anything is written back, and checked on three things: that
 * the archive has a manifest at all, that it claims to be ours, and that its
 * format is one this build understands. A bundle from a *newer* build is
 * refused rather than half-read — it may hold entries this version would
 * silently drop, and an import that quietly restores two of three files is the
 * kind of failure nobody notices until they need the third.
 */
export function parseManifest(entries: Map<string, Buffer>): SettingsBundleManifest {
  const raw = entries.get(BUNDLE_ENTRIES.manifest)
  if (!raw) {
    throw new AppError('That zip is not a Candy Haven settings export.', {
      code: ErrorCode.Validation,
      hint: 'It has no manifest. Export one from REGULATION → Export settings.'
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new AppError('The export is damaged: its manifest is not readable.', {
      code: ErrorCode.Validation
    })
  }

  const manifest = SettingsBundleManifestSchema.safeParse(parsed)
  if (!manifest.success) {
    throw new AppError('That zip is not a Candy Haven settings export.', {
      code: ErrorCode.Validation,
      hint: `Expected ${SETTINGS_BUNDLE_KIND}.`
    })
  }

  if (manifest.data.format > SETTINGS_BUNDLE_FORMAT) {
    throw new AppError('That export was written by a newer version of Candy Haven.', {
      code: ErrorCode.Validation,
      hint: `It is format ${manifest.data.format}; this build reads ${SETTINGS_BUNDLE_FORMAT}. Update and try again.`
    })
  }

  return manifest.data
}

/** Reads a file for the archive, or null when it is not there to read. */
export async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}
