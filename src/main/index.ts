import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID } from '@shared/constants'
import { initializeLogging, getLogger } from './core/logger'
import { BootSequence } from './app/boot-sequence'
import { WindowManager } from './app/window-manager'
import { IpcRouter } from './ipc/router'
import { registerEventBridges, registerIpcHandlers } from './ipc/register-handlers'
import { createServiceContainer, disposeServiceContainer } from './services/container'

initializeLogging()
const logger = getLogger('main')

// A second launch should focus the existing window rather than start a rival
// process — two instances would contend for the same archive data directory.
if (!app.requestSingleInstanceLock()) {
  logger.info('Another instance is already running; exiting')
  app.quit()
} else {
  void start()
}

async function start(): Promise<void> {
  const services = createServiceContainer()
  const windows = new WindowManager()
  const boot = new BootSequence(services)
  const router = new IpcRouter()

  let shuttingDown = false

  app.on('second-instance', () => windows.focus())

  await app.whenReady()

  electronApp.setAppUserModelId(APP_ID)

  app.on('browser-window-created', (_, window) => {
    // F12 toggles devtools in development; reload shortcuts are ignored in production.
    optimizer.watchWindowShortcuts(window)
  })

  /**
   * Re-indexes the project registry once the console is open.
   *
   * Deferred to this point rather than run as a boot stage: the register is
   * already populated from the archive, so it renders immediately from what was
   * stored, and a re-index that found a large new library would otherwise hold
   * the boot screen open. Running it behind the revealed window means the
   * operator sees current data without ever waiting for it.
   *
   * The scan is incremental — see ProjectsService.runScan — so an untouched
   * library costs a directory walk and nothing more.
   */
  const scanOnLaunch = (): void => {
    if (!services.settings.snapshot.workspace.scanOnLaunch) return

    const roots = services.settings.snapshot.workspace.abletonProjectRoots
    if (roots.length === 0) return

    // Without a connected archive there is nowhere to file the results; boot
    // will have already reported why.
    if (!services.archive.isOnline()) {
      logger.warn('Skipped the launch scan: the archive is not connected')
      return
    }

    void services.projects.runScan(roots).catch((error) => {
      // A failed background scan must not surface as a dialog; the ARCHIVE
      // section carries the error in its own scan state.
      logger.error('Launch scan failed', error)
    })
  }

  registerIpcHandlers({
    router,
    services,
    boot,
    windows,
    onBootEntered: () => {
      logger.info('Operator entered the console')
      scanOnLaunch()
    }
  })
  registerEventBridges({ router, services, boot, windows })

  await windows.create()

  // The boot sequence runs alongside window creation: the renderer paints the
  // boot screen immediately and subscribes to progress already in flight.
  void boot.run().then((snapshot) => {
    if (snapshot.phase === 'failed') {
      logger.error(`Boot failed at "${snapshot.activeStageId}": ${snapshot.failure?.message}`)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void windows.create()
  })

  app.on('window-all-closed', () => {
    // Windows-only target: closing the window ends the session.
    app.quit()
  })

  /**
   * Shutdown must complete before the process exits, otherwise the embedded
   * daemon is orphaned. `before-quit` is intercepted once, the async teardown
   * runs, and quit is then re-issued.
   */
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    shuttingDown = true
    event.preventDefault()

    void (async () => {
      try {
        await windows.persistState()
        boot.dispose()
        router.dispose()
        windows.dispose()
        await disposeServiceContainer(services)
      } catch (error) {
        logger.error('Shutdown encountered an error', error)
      } finally {
        logger.info('Shutdown complete')
        app.exit(0)
      }
    })()
  })

  logger.info('Main process ready')
}
