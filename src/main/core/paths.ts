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
  /** Built renderer output, served to OBS browser sources by the overlay server. */
  overlayRoot: string
  resources: string
  /**
   * The application mark, for the tray.
   *
   * Resolved against the app path rather than `resources`, which in a packaged
   * build points at the installation's own resources directory — where `icon.png`
   * is not, because it ships inside the asar. `getAppPath()` is the project root
   * in development and the asar in a build, and the file is at the same place
   * relative to both.
   */
  appIcon: string
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
    // The overlay is a second Vite entry built alongside the console, so it
    // ships inside the app bundle rather than under resources.
    overlayRoot: join(app.getAppPath(), 'out', 'renderer'),
    resources,
    appIcon: join(app.getAppPath(), 'resources', 'icon.png')
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
