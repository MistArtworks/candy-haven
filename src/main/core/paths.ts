import { app } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { is } from '@electron-toolkit/utils'

/**
 * Single source of truth for every filesystem location the app owns.
 *
 * Layout under userData:
 *   settings.json          operator settings
 *   window-state.json      window geometry
 *   archive/data/          MongoDB dbpath
 *   archive/log/           mongod log output
 *   runtime/mongodb/       app-provisioned mongod (fallback when the installer
 *                          could not fetch it)
 */
export interface AppPaths {
  userData: string
  logs: string
  settingsFile: string
  windowStateFile: string
  archiveRoot: string
  archiveData: string
  archiveLogs: string
  archiveLogFile: string
  runtimeRoot: string
  /** App-provisioned MongoDB root (userData). */
  runtimeMongo: string
  /** MongoDB root written by the NSIS installer, alongside app resources. */
  installedMongo: string
  resources: string
}

let cached: AppPaths | null = null

export function getPaths(): AppPaths {
  if (cached) return cached

  const userData = app.getPath('userData')
  const archiveRoot = join(userData, 'archive')
  const runtimeRoot = join(userData, 'runtime')

  // In development `process.resourcesPath` points into the Electron dist
  // folder, so fall back to the project's own resources directory.
  const resources = is.dev ? join(app.getAppPath(), 'resources') : process.resourcesPath

  cached = {
    userData,
    logs: app.getPath('logs'),
    settingsFile: join(userData, 'settings.json'),
    windowStateFile: join(userData, 'window-state.json'),
    archiveRoot,
    archiveData: join(archiveRoot, 'data'),
    archiveLogs: join(archiveRoot, 'log'),
    archiveLogFile: join(archiveRoot, 'log', 'archive.log'),
    runtimeRoot,
    runtimeMongo: join(runtimeRoot, 'mongodb'),
    installedMongo: join(resources, 'mongodb'),
    resources
  }

  return cached
}

/** Creates the directories the app expects to exist before services start. */
export async function ensureAppDirectories(): Promise<void> {
  const paths = getPaths()
  await Promise.all(
    [paths.archiveData, paths.archiveLogs, paths.runtimeRoot].map((dir) =>
      mkdir(dir, { recursive: true })
    )
  )
}
