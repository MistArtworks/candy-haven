import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ArchiveBinaryInfo, ArchiveBinarySource } from '@shared/domain/archive'
import { getPaths } from '@main/core/paths'
import { getLogger } from '@main/core/logger'

const execFileAsync = promisify(execFile)
const logger = getLogger('archive:locator')

const MONGOD_EXE = 'mongod.exe'

interface Candidate {
  path: string
  source: ArchiveBinarySource
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Enumerates `C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe`, newest first. */
async function systemInstallCandidates(): Promise<Candidate[]> {
  const roots = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'MongoDB', 'Server'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'MongoDB', 'Server')
  ]

  const found: Candidate[] = []

  for (const root of roots) {
    try {
      const versions = await readdir(root, { withFileTypes: true })
      const sorted = versions
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        // Newest version directory first.
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      for (const version of sorted) {
        found.push({ path: join(root, version, 'bin', MONGOD_EXE), source: 'system' })
      }
    } catch {
      // Root does not exist — expected on most machines.
    }
  }

  return found
}

/** Resolves `mongod` from PATH via `where.exe`. */
async function pathCandidate(): Promise<Candidate | null> {
  try {
    const { stdout } = await execFileAsync('where.exe', ['mongod'], { timeout: 5_000 })
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    return first ? { path: first, source: 'path' } : null
  } catch {
    return null
  }
}

/** Reads the daemon version, e.g. "db version v8.0.29" -> "8.0.29". */
export async function readBinaryVersion(executablePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(executablePath, ['--version'], { timeout: 10_000 })
    const match = stdout.match(/db version v?([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i)
    return match?.[1] ?? null
  } catch (error) {
    logger.warn(`Could not read version from ${executablePath}`, error)
    return null
  }
}

/**
 * Finds a usable `mongod`, preferring locations the app controls.
 *
 * Order: operator-configured -> installer-provided -> app-provisioned ->
 * system install -> PATH. Returns null when nothing is available, which drives
 * the provisioning stage of the boot sequence.
 */
export async function locateArchiveBinary(
  configuredPath: string | null
): Promise<ArchiveBinaryInfo | null> {
  const paths = getPaths()

  const candidates: Candidate[] = []
  if (configuredPath) candidates.push({ path: configuredPath, source: 'configured' })
  candidates.push({ path: join(paths.installedMongo, 'bin', MONGOD_EXE), source: 'installer' })
  candidates.push({ path: join(paths.runtimeMongo, 'bin', MONGOD_EXE), source: 'user-data' })
  candidates.push(...(await systemInstallCandidates()))

  const fromPath = await pathCandidate()
  if (fromPath) candidates.push(fromPath)

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate.path))) continue
    const version = await readBinaryVersion(candidate.path)
    logger.info(
      `Archive binary resolved (${candidate.source}): ${candidate.path} v${version ?? '?'}`
    )
    return { executablePath: candidate.path, source: candidate.source, version }
  }

  logger.warn('No archive binary found in any known location')
  return null
}
