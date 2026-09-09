import { app, dialog, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { APP_NAME } from '@shared/constants'
import type { RuntimeInfo } from '@shared/domain/system'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogFilePath, getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import type { ServiceContainer } from '@main/services/container'
import type { BootSequence } from '@main/app/boot-sequence'
import type { WindowManager } from '@main/app/window-manager'
import type { IpcRouter } from './router'

const logger = getLogger('ipc:handlers')

/** Only these schemes may be handed to the OS from renderer input. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

export interface HandlerDependencies {
  router: IpcRouter
  services: ServiceContainer
  boot: BootSequence
  windows: WindowManager
  /** Called when the renderer reports the boot cinematic has finished. */
  onBootEntered: () => void
}

export function registerIpcHandlers(deps: HandlerDependencies): void {
  const { router, services, boot, windows, onBootEntered } = deps
  const { settings, archive, updates } = services

  // ------------------------------------------------------------------ runtime

  router.handle('runtime:info', (): RuntimeInfo => {
    const paths = getPaths()
    return {
      appName: APP_NAME,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      isPackaged: app.isPackaged,
      isDevelopment: is.dev,
      paths: {
        userData: paths.userData,
        logs: getLogFilePath(),
        archiveData: paths.archiveData,
        resources: paths.resources
      }
    }
  })

  // ------------------------------------------------------------------- window

  router.handle('window:minimize', () => {
    windows.minimize()
  })
  router.handle('window:toggle-maximize', () => windows.toggleMaximize())
  router.handle('window:close', () => {
    windows.close()
  })
  router.handle('window:state', () => windows.getState())

  // --------------------------------------------------------------------- boot

  router.handle('boot:snapshot', () => boot.current)
  router.handle('boot:retry', () => boot.retry())
  router.handle('boot:enter', () => {
    onBootEntered()
  })

  // ------------------------------------------------------------------ archive

  router.handle('archive:status', () => archive.status)

  router.handle('archive:provision', async () => {
    await archive.provision()
    return archive.status
  })

  router.handle('archive:restart', async () => {
    const config = settings.snapshot.archive
    return archive.restart(config.port, config.executablePath)
  })

  // ----------------------------------------------------------------- settings

  router.handle('settings:get', () => settings.snapshot)

  router.handle('settings:update', async (patch) => {
    const next = await settings.update(patch)
    // A changed client id invalidates any existing link, so the service has to
    // hear about it now rather than at next launch.
    if (patch.integrations?.spotifyClientId !== undefined) {
      await services.nowPlaying.setClientId(next.integrations.spotifyClientId)
    }
    // Update preferences take effect immediately rather than at next launch.
    if (patch.updates) {
      updates.configure({ channel: next.updates.channel, autoDownload: next.updates.autoDownload })
    }
    return next
  })

  router.handle('settings:reset', () => settings.reset())

  // ------------------------------------------------------------------ updates

  router.handle('update:status', () => updates.status)
  router.handle('update:check', () => updates.check())
  router.handle('update:download', () => updates.download())
  router.handle('update:install', () => {
    updates.install()
  })

  // ---------------------------------------------------------------- telemetry

  router.handle('telemetry:subscribe', () => services.telemetry.subscribe())
  router.handle('telemetry:unsubscribe', () => {
    services.telemetry.unsubscribe()
  })

  // ----------------------------------------------------------------- projects

  router.handle('projects:registry', (query) => services.projects.getRegistry(query ?? {}))
  router.handle('projects:get', ({ id }) => services.projects.get(id))
  router.handle('projects:patch', ({ id, patch }) => services.projects.patchProject(id, patch))

  // Roots come from settings rather than the renderer so a compromised renderer
  // cannot direct a recursive walk at an arbitrary directory.
  router.handle('projects:scan', (input) =>
    services.projects.runScan(
      settings.snapshot.workspace.abletonProjectRoots,
      input?.force ?? false
    )
  )
  router.handle('projects:scan-cancel', () => services.projects.cancelScan())
  router.handle('projects:scan-state', () => services.projects.scan)

  router.handle('projects:note-add', ({ id, draft }) => services.projects.addNote(id, draft))
  router.handle('projects:note-update', ({ id, noteId, draft }) =>
    services.projects.updateNote(id, noteId, draft)
  )
  router.handle('projects:note-delete', ({ id, noteId }) =>
    services.projects.deleteNote(id, noteId)
  )

  router.handle('projects:marketing-add', ({ id, kind }) =>
    services.projects.addMarketingAsset(id, kind)
  )
  router.handle('projects:marketing-upsert', ({ id, asset }) =>
    services.projects.upsertMarketingAsset(id, asset)
  )
  router.handle('projects:marketing-remove', ({ id, assetId }) =>
    services.projects.removeMarketingAsset(id, assetId)
  )

  router.handle('projects:forget', ({ id }) => services.projects.forget(id))
  router.handle('projects:unlinked', (input) => services.projects.listUnlinked(input?.limit))
  router.handle('projects:thumbnail', ({ path, width }) =>
    services.projects.thumbnail(path, width ?? 480)
  )

  // ------------------------------------------------------------- transmissions

  router.handle('transmissions:schedule', () => services.transmissions.schedule())
  router.handle('transmissions:task-add', (draft) => services.transmissions.addTask(draft))
  router.handle('transmissions:task-update', ({ id, patch }) =>
    services.transmissions.updateTask(id, patch)
  )
  router.handle('transmissions:task-remove', ({ id }) => services.transmissions.removeTask(id))

  // --------------------------------------------------------------------- rite

  router.handle('rite:state', () => services.rite.current)
  router.handle('rite:petition-add', (draft) => services.rite.addPetition(draft))
  router.handle('rite:petition-remove', ({ id }) => services.rite.removePetition(id))
  router.handle('rite:petition-weight', ({ id, weight }) =>
    services.rite.setPetitionWeight(id, weight)
  )
  router.handle('rite:petitions-clear', () => services.rite.clearPetitions())
  router.handle('rite:config', (patch) => services.rite.updateConfig(patch))
  router.handle('rite:spin', () => services.rite.spin())
  router.handle('rite:reset', () => services.rite.reset())
  router.handle('rite:history-clear', () => services.rite.clearHistory())

  // ----------------------------------------------------------------- concord

  router.handle('concord:state', () => services.concord.current)
  router.handle('concord:option-add', (draft) => services.concord.addOption(draft))
  router.handle('concord:option-remove', ({ id }) => services.concord.removeOption(id))
  router.handle('concord:ballot', ({ labels }) => services.concord.setBallot(labels))
  router.handle('concord:ballot-clear', () => services.concord.clearBallot())
  router.handle('concord:config', (patch) => services.concord.updateConfig(patch))
  router.handle('concord:open', () => services.concord.open())
  router.handle('concord:close', () => services.concord.close())
  router.handle('concord:reset', () => services.concord.reset())
  router.handle('concord:history-clear', () => services.concord.clearHistory())

  /*
   * Synthetic votes. The service refuses unless test mode is on.
   *
   * Declared in the contract like every other channel rather than omitted from
   * packaged builds, so a rejection arrives as a structured error the console can
   * explain instead of an unknown-channel failure that would look like a bug in
   * the bridge.
   */
  router.handle('concord:simulate', ({ count, changeVotes }) =>
    services.concord.simulate(count, { changeVotes })
  )

  // -------------------------------------------------------------------- chat

  router.handle('chat:status', () => services.chat.status)
  router.handle('chat:reconnect', () => services.chat.reconnect())

  // -------------------------------------------------------------------- timers

  router.handle('timer:all', () => services.timers.all)
  router.handle('timer:start', ({ id }) => services.timers.start(id))
  router.handle('timer:pause', ({ id }) => services.timers.pause(id))
  router.handle('timer:toggle', ({ id }) => services.timers.toggle(id))
  router.handle('timer:reset', ({ id }) => services.timers.reset(id))
  router.handle('timer:restart', ({ id }) => services.timers.restart(id))
  router.handle('timer:extend', ({ id, deltaMs }) => services.timers.extend(id, deltaMs))
  router.handle('timer:config', ({ id, patch }) => services.timers.configure(id, patch))

  // -------------------------------------------------------------- now playing

  router.handle('nowplaying:subscribe', () => services.nowPlaying.subscribe())
  router.handle('nowplaying:unsubscribe', () => {
    services.nowPlaying.unsubscribe()
  })
  router.handle('nowplaying:state', () => services.nowPlaying.current)
  router.handle('nowplaying:config', (patch) => services.nowPlaying.configure(patch))
  router.handle('nowplaying:link', () => services.nowPlaying.link())
  router.handle('nowplaying:unlink', () => services.nowPlaying.unlink())
  router.handle('nowplaying:setup', () => services.nowPlaying.setup)

  router.handle('overlay:info', () => services.overlayServer.info)
  // The port comes from settings rather than the renderer, for the same reason
  // the scan roots do: a compromised renderer should not choose what we bind.
  router.handle('overlay:restart', async () => {
    await services.overlayServer.stop()
    return services.overlayServer.start(settings.snapshot.workspace.overlayPort)
  })

  // -------------------------------------------------------------------- shell

  router.handle('shell:open-external', async ({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AppError('That link is not a valid URL.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      // Prevents a compromised renderer from launching arbitrary handlers.
      logger.warn(`Blocked external open for disallowed protocol: ${parsed.protocol}`)
      throw new AppError('That link type cannot be opened.', {
        code: ErrorCode.PermissionDenied,
        recoverable: false
      })
    }

    await shell.openExternal(parsed.toString())
  })

  router.handle('shell:reveal', async ({ path }) => {
    await shell.openPath(path)
  })

  router.handle('dialog:select-directory', async (input) => {
    const window = windows.mainWindow
    const options = {
      title: input?.title ?? 'Select a directory',
      properties: ['openDirectory', 'createDirectory'] as const
    }

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  router.handle('dialog:select-file', async (input) => {
    const window = windows.mainWindow
    const options = {
      title: input?.title ?? 'Select a file',
      properties: ['openFile'] as const,
      filters: input?.filters ?? []
    }

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  logger.info('IPC handlers registered')
}

/** Bridges main-process service events onto the renderer event channels. */
export function registerEventBridges(deps: {
  router: IpcRouter
  services: ServiceContainer
  boot: BootSequence
  windows: WindowManager
}): void {
  const { router, services, boot, windows } = deps

  boot.on('progress', (snapshot) => router.broadcast('boot:progress', snapshot))
  services.archive.on('status', (status) => router.broadcast('archive:status', status))
  services.updates.on('status', (status) => router.broadcast('update:status', status))
  services.telemetry.on('sample', (state) => router.broadcast('telemetry:sample', state))
  services.projects.on('scan', (state) => router.broadcast('projects:scan', state))
  services.rite.on('state', (state) => router.broadcast('rite:state', state))
  services.concord.on('state', (state) => router.broadcast('concord:state', state))
  services.chat.on('status', (status) => router.broadcast('chat:status', status))
  services.timers.on('state', (state) => router.broadcast('timer:state', state))
  services.nowPlaying.on('state', (state) => router.broadcast('nowplaying:state', state))
  services.overlayServer.on('info', (info) => router.broadcast('overlay:info', info))
  windows.subscribe((state) => router.broadcast('window:state', state))
}
