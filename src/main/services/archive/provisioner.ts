import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ProvisionProgress } from '@shared/domain/archive'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import { resolveMongoRelease, shouldExtractEntry } from './mongo-release'
import { extractZip } from './zip'

const logger = getLogger('archive:provisioner')

export type ProvisionReporter = (progress: ProvisionProgress) => void

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash, { signal })
  return hash.digest('hex')
}

/**
 * Downloads the pinned MongoDB archive to `targetPath`.
 *
 * The request uses a Range header when a partial file is already present, so an
 * interrupted provision resumes instead of restarting an 800 MB transfer. If
 * the server ignores the range (returns 200 rather than 206) the file is
 * truncated and written from the start.
 */
async function download(
  url: string,
  targetPath: string,
  report: ProvisionReporter,
  signal?: AbortSignal
): Promise<void> {
  const existing = await fileSize(targetPath)
  const headers: Record<string, string> = {}
  if (existing > 0) headers.Range = `bytes=${existing}-`

  const response = await fetch(url, { headers, signal, redirect: 'follow' })

  if (!response.ok && response.status !== 206) {
    throw new AppError(`Archive download failed with HTTP ${response.status}.`, {
      code: ErrorCode.ArchiveProvisionFailed,
      hint: 'Check the network connection, then retry provisioning.',
      recoverable: true
    })
  }
  if (!response.body) {
    throw new AppError('Archive download returned an empty response.', {
      code: ErrorCode.ArchiveProvisionFailed,
      recoverable: true
    })
  }

  const resuming = response.status === 206
  const startingBytes = resuming ? existing : 0
  const declared = Number(response.headers.get('content-length') ?? 0)
  const totalBytes = declared > 0 ? declared + startingBytes : 0

  if (existing > 0 && !resuming) {
    logger.warn('Server ignored range request; restarting download from zero')
  }

  let received = startingBytes
  report({
    phase: 'download',
    receivedBytes: received,
    totalBytes,
    ratio: totalBytes > 0 ? received / totalBytes : -1,
    message: resuming ? 'Resuming archive transfer' : 'Retrieving archive runtime'
  })

  // Throttle progress events so the renderer is not flooded during a large transfer.
  let lastReport = Date.now()
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastReport >= 120) {
      lastReport = now
      report({
        phase: 'download',
        receivedBytes: received,
        totalBytes,
        ratio: totalBytes > 0 ? Math.min(received / totalBytes, 1) : -1,
        message: 'Retrieving archive runtime'
      })
    }
  })

  await pipeline(source, createWriteStream(targetPath, { flags: resuming ? 'a' : 'w' }), { signal })
}

/**
 * Ensures a usable `mongod` exists under userData, downloading and unpacking the
 * pinned MongoDB release when necessary.
 *
 * This is the runtime fallback for the NSIS installer's own download step: if
 * the installer could not fetch MongoDB (offline install, blocked network,
 * cancelled), the app can still provision itself on first launch.
 *
 * @returns absolute path to the extracted `mongod.exe`
 */
export async function provisionArchiveRuntime(
  report: ProvisionReporter,
  signal?: AbortSignal
): Promise<string> {
  const paths = getPaths()
  const release = resolveMongoRelease()
  const workDir = join(paths.runtimeRoot, 'download')
  const archivePath = join(workDir, `mongodb-${release.version}.zip`)
  const targetDir = paths.runtimeMongo

  await mkdir(workDir, { recursive: true })
  await mkdir(targetDir, { recursive: true })

  logger.info(`Provisioning MongoDB ${release.version} from ${release.url}`)

  try {
    await download(release.url, archivePath, report, signal)

    if (release.sha256) {
      report({
        phase: 'verify',
        receivedBytes: 0,
        totalBytes: 0,
        ratio: -1,
        message: 'Verifying archive integrity'
      })

      const digest = await sha256File(archivePath, signal)
      if (digest.toLowerCase() !== release.sha256.toLowerCase()) {
        // A corrupt or tampered download must never be executed.
        await rm(archivePath, { force: true })
        throw new AppError('Archive integrity check failed.', {
          code: ErrorCode.ArchiveProvisionFailed,
          hint: 'The download was corrupt and has been discarded. Retry provisioning.',
          recoverable: true
        })
      }
      logger.info('Archive digest verified')
    }

    report({
      phase: 'extract',
      receivedBytes: 0,
      totalBytes: 0,
      ratio: -1,
      message: 'Unpacking archive runtime'
    })

    const result = await extractZip({
      archivePath,
      destination: targetDir,
      // MongoDB archives nest everything under one versioned directory.
      stripComponents: 1,
      filter: shouldExtractEntry,
      signal,
      onProgress: (entries, bytes) => {
        report({
          phase: 'extract',
          receivedBytes: bytes,
          totalBytes: 0,
          ratio: -1,
          message: `Unpacking archive runtime (${entries} files)`
        })
      }
    })

    logger.info(`Extracted ${result.entries} files (${result.bytes} bytes) to ${targetDir}`)

    const executablePath = join(targetDir, 'bin', 'mongod.exe')
    if ((await fileSize(executablePath)) === 0) {
      throw new AppError('Archive runtime did not contain mongod.exe.', {
        code: ErrorCode.ArchiveProvisionFailed,
        hint: 'The pinned MongoDB release may have changed layout.',
        recoverable: false
      })
    }

    // The compressed archive is no longer needed once extraction succeeds.
    await rm(workDir, { recursive: true, force: true })

    report({
      phase: 'done',
      receivedBytes: 0,
      totalBytes: 0,
      ratio: 1,
      message: 'Archive runtime ready'
    })

    return executablePath
  } catch (error) {
    if (signal?.aborted) throw error
    throw AppError.from(error, {
      code: ErrorCode.ArchiveProvisionFailed,
      hint: 'Provisioning could not complete. Check the network and retry.',
      recoverable: true
    })
  }
}
