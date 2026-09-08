import { app } from 'electron'
import electronUpdater, { type UpdateInfo } from 'electron-updater'
import type { UpdateChannel } from '@shared/domain/settings'
import type { UpdateStatus } from '@shared/domain/update'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'

const logger = getLogger('updates')

// electron-updater ships as CommonJS; destructure rather than named-importing.
const { autoUpdater } = electronUpdater

interface UpdateEvents {
  status: UpdateStatus
}

function notesToText(notes: UpdateInfo['releaseNotes']): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  return notes
    .map((entry) => entry.note ?? '')
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Wraps electron-updater behind the app's own status model.
 *
 * Auto-update only functions in a packaged build served by a real update feed,
 * so in development the service reports `unsupported` rather than throwing —
 * the Regulation UI can then explain why the controls are inert.
 */
export class UpdateService extends TypedEmitter<UpdateEvents> {
  private state: UpdateStatus = {
    state: 'idle',
    version: null,
    currentVersion: app.getVersion(),
    progress: null,
    bytesPerSecond: null,
    releaseNotes: null,
    releaseDate: null,
    message: null,
    checkedAt: null
  }

  private readonly supported: boolean

  constructor() {
    super()
    // `FORCE_DEV_UPDATE_CONFIG` lets the update flow be exercised locally
    // against dev-app-update.yml without packaging the app.
    this.supported = app.isPackaged || process.env.FORCE_DEV_UPDATE_CONFIG === '1'

    if (!this.supported) {
      this.state = {
        ...this.state,
        state: 'unsupported',
        message: 'Updates are only available in an installed build.'
      }
      return
    }

    autoUpdater.logger = logger as unknown as typeof autoUpdater.logger
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true

    this.wireEvents()
  }

  get status(): UpdateStatus {
    return this.state
  }

  configure(options: { channel: UpdateChannel; autoDownload: boolean }): void {
    if (!this.supported) return
    autoUpdater.channel = options.channel
    autoUpdater.autoDownload = options.autoDownload
    logger.info(`Update channel set to ${options.channel} (autoDownload=${options.autoDownload})`)
  }

  async check(): Promise<UpdateStatus> {
    if (!this.supported) return this.state

    this.patch({ state: 'checking', message: 'Contacting the update feed', progress: null })

    try {
      const result = await autoUpdater.checkForUpdates()
      this.patch({ checkedAt: Date.now() })

      // A null result means the feed is configured but returned nothing usable.
      if (!result) {
        this.patch({ state: 'not-available', message: 'No update information available.' })
      }
      return this.state
    } catch (error) {
      logger.error('Update check failed', error)
      this.patch({
        state: 'error',
        message: error instanceof Error ? error.message : 'Update check failed.',
        checkedAt: Date.now()
      })
      return this.state
    }
  }

  async download(): Promise<UpdateStatus> {
    if (!this.supported) return this.state

    if (this.state.state !== 'available' && this.state.state !== 'error') {
      throw new AppError('There is no update ready to download.', {
        code: ErrorCode.UpdateFailed,
        hint: 'Check for updates first.',
        recoverable: true
      })
    }

    this.patch({ state: 'downloading', progress: 0, message: 'Downloading update' })

    try {
      await autoUpdater.downloadUpdate()
      return this.state
    } catch (error) {
      logger.error('Update download failed', error)
      this.patch({
        state: 'error',
        message: error instanceof Error ? error.message : 'Update download failed.'
      })
      return this.state
    }
  }

  /**
   * Restarts into the installer. Callers must have completed shutdown work
   * first — this does not return.
   */
  install(): void {
    if (!this.supported) {
      throw new AppError('Updates are only available in an installed build.', {
        code: ErrorCode.UpdateUnsupported,
        recoverable: false
      })
    }
    if (this.state.state !== 'downloaded') {
      throw new AppError('No downloaded update is ready to install.', {
        code: ErrorCode.UpdateFailed,
        hint: 'Download the update first.',
        recoverable: true
      })
    }

    logger.info('Quitting to install update')
    autoUpdater.quitAndInstall(false, true)
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.patch({ state: 'checking', message: 'Contacting the update feed' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      logger.info(`Update available: ${info.version}`)
      this.patch({
        state: 'available',
        version: info.version,
        releaseNotes: notesToText(info.releaseNotes),
        releaseDate: info.releaseDate ?? null,
        message: `Version ${info.version} is available.`
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.patch({
        state: 'not-available',
        version: null,
        message: 'Candy Haven is up to date.'
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.patch({
        state: 'downloading',
        progress: Math.min(Math.max(progress.percent / 100, 0), 1),
        bytesPerSecond: progress.bytesPerSecond,
        message: 'Downloading update'
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      logger.info(`Update downloaded: ${info.version}`)
      this.patch({
        state: 'downloaded',
        version: info.version,
        progress: 1,
        message: `Version ${info.version} is ready to install.`
      })
    })

    autoUpdater.on('error', (error) => {
      logger.error('Updater error', error)
      this.patch({ state: 'error', message: error?.message ?? 'Updater error.' })
    })
  }

  private patch(partial: Partial<UpdateStatus>): void {
    this.state = { ...this.state, ...partial }
    this.emit('status', this.state)
  }
}
