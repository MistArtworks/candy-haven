import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID } from '@shared/constants'
import { initializeLogging, getLogger } from './core/logger'
import { BootSequence } from './app/boot-sequence'
import { WindowManager } from './app/window-manager'
import { TrayController } from './app/tray'
import { PopoutManager } from './app/popout'
import { applyLaunchAtStartup, launchedHidden } from './app/startup'
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
  const popouts = new PopoutManager()
  const boot = new BootSequence(services)
  const router = new IpcRouter()

  let shuttingDown = false

  /*
   * Whether this launch came from the login item.
   *
   * Read once, here, rather than each time it is wanted: the window is created
   * hidden on the strength of it, and by the time boot finishes the answer must
   * not have changed. Everything else about the launch is identical — boot runs
   * in full, because starting at sign-in exists precisely so the archive and
   * the overlay server are up before anybody asks for them.
   */
  const hiddenLaunch = launchedHidden()

  const tray = new TrayController({
    reveal: () => void windows.reveal(),
    checkForUpdates: () => {
      // Fire and forget: the result belongs in REGULATION, and a tray menu is
      // not a place that can report one.
      void services.updates.check().catch((error) => {
        logger.warn('Update check from the tray failed', error)
      })
      void windows.reveal()
    },
    quit: () => {
      logger.info('Quit requested from the tray')
      app.quit()
    }
  })

  // A second launch reveals the console rather than merely focusing it: when
  // the app is resident in the tray, "already running" is exactly the state the
  // operator is trying to get out of by launching it again.
  app.on('second-instance', () => void windows.reveal())

  await app.whenReady()

  electronApp.setAppUserModelId(APP_ID)

  tray.create()
  services.archive.on('status', (status) => tray.setArchiveState(status.state))
  windows.subscribeVisibility((visible) => tray.setWindowVisible(visible))

  /*
   * The close button retires to the tray; Alt+F4 does not.
   *
   * Guarded on the tray actually existing. If the icon could not be created —
   * a missing mark, a shell that refuses the request — hiding the window would
   * leave the operator with a running application and nothing to click, which
   * is a far worse failure than a close button that closes.
   */
  let retireNoticeShown = false
  windows.setCloseIntercept(() => {
    if (!tray.isActive) return false
    if (!services.settings.snapshot.system.closeToTray) return false

    if (!retireNoticeShown) {
      retireNoticeShown = true
      // Deferred a frame so the balloon does not race the window disappearing
      // out from under it, which on Windows drops the notification entirely.
      setTimeout(() => tray.notifyRetired(), 150)
    }
    return true
  })

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

    const roots = services.settings.scanRoots
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
    popouts,
    onBootEntered: () => {
      logger.info('Operator entered the console')
      scanOnLaunch()
    }
  })
  registerEventBridges({ router, services, boot, windows })

  await windows.create({ hidden: hiddenLaunch })

  // The boot sequence runs alongside window creation: the renderer paints the
  // boot screen immediately and subscribes to progress already in flight.
  void boot.run().then((snapshot) => {
    if (snapshot.phase === 'failed') {
      logger.error(`Boot failed at "${snapshot.activeStageId}": ${snapshot.failure?.message}`)
    }

    // Reconciled after boot rather than on every change alone, so a login item
    // removed behind the app's back is put back. Settings are loaded by the
    // first boot stage, so this is the earliest point the answer is known.
    const system = services.settings.snapshot.system
    applyLaunchAtStartup(system.launchAtStartup, system.startMinimised)
    tray.setArchiveState(services.archive.status.state)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void windows.create()
  })

  app.on('window-all-closed', () => {
    /*
     * Windows-only target: with the window genuinely gone, the session ends.
     *
     * Retiring to the tray does not reach here — a hidden window is still a
     * window — so this stays the honest response to Alt+F4 and to the taskbar's
     * Close. The tray's own Quit goes through `app.quit()` and lands on
     * `before-quit` below, which is the one shutdown path either way.
     */
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
        popouts.dispose()
        tray.dispose()
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
