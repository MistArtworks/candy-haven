import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID } from '@shared/constants'
import { initializeLogging, getLogger } from './core/logger'
import { BootSequence } from './app/boot-sequence'
import { WindowManager } from './app/window-manager'
import { TrayController } from './app/tray'
import { PopoutManager } from './app/popout'
import { VestibuleManager } from './app/vestibule'
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
  const vestibule = new VestibuleManager()
  const boot = new BootSequence(services)
  const router = new IpcRouter()

  let shuttingDown = false

  /**
   * Suppresses the next `window-all-closed` quit, exactly once.
   *
   * The vestibule retires to the tray after handing a new set to Ableton, and
   * at that moment it is the only window there is — so closing it takes the
   * count to zero and the session would end with the archive still warming up
   * behind it. Consumed on the first `window-all-closed` rather than left
   * standing, so the console closing later still quits the way it always has.
   */
  let retiringToTray = false

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

  /**
   * What "the operator asked for this application" means, wherever they asked.
   *
   * While the vestibule is up it is the front door, and both the tray and the
   * single-instance guard must land on it rather than build the console behind
   * it — `windows.reveal()` creates the console when none exists, which would
   * leave two front doors open and the vestibule's choice already made.
   */
  const reveal = (): void => {
    if (vestibule.isOpen()) {
      vestibule.focus()
      return
    }
    void windows.reveal()
  }

  const tray = new TrayController({
    reveal,
    checkForUpdates: () => {
      // Fire and forget: the result belongs in REGULATION, and a tray menu is
      // not a place that can report one.
      void services.updates.check().catch((error) => {
        logger.warn('Update check from the tray failed', error)
      })
      reveal()
    },
    quit: () => {
      logger.info('Quit requested from the tray')
      app.quit()
    }
  })

  // A second launch reveals the console rather than merely focusing it: when
  // the app is resident in the tray, "already running" is exactly the state the
  // operator is trying to get out of by launching it again.
  app.on('second-instance', reveal)

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

  /**
   * Leaves the application resident with no window on screen.
   *
   * Where the vestibule goes once it has handed a new set to Ableton: the
   * archive stays connected and the overlay server stays up, so the next thing
   * asked of the console costs nothing, and the operator is left looking at
   * Ableton rather than at us.
   *
   * Guarded on the tray existing, for the same reason `setCloseIntercept` is.
   * With no icon to click, "resident with no window" is an application the
   * operator cannot reach and cannot quit, which is worse than simply ending
   * the session.
   */
  const retireToTray = (): void => {
    if (!tray.isActive) {
      logger.warn('No tray to retire to; ending the session instead')
      app.quit()
      return
    }

    retiringToTray = true
    tray.setWindowVisible(false)
    vestibule.close()
    logger.info('Retired to the tray')
  }

  registerIpcHandlers({
    router,
    services,
    boot,
    windows,
    popouts,
    vestibule,
    retireToTray,
    onBootEntered: () => {
      logger.info('Operator entered the console')
      scanOnLaunch()
    }
  })
  registerEventBridges({ router, services, boot, windows })

  /*
   * The vestibule opens ahead of the console, and instead of it.
   *
   * Settings are loaded here rather than waited for, because the decision is
   * needed before the first window and `configuration` is the second boot
   * stage. `load()` re-reads the same file when that stage runs, so the boot
   * readout stays honest and nothing is skipped — this costs one early read.
   *
   * A sign-in launch never sees it. The point of `startMinimised` is that the
   * archive and the overlay server come up without a window in the operator's
   * face, and a launcher asking them to choose something every morning is the
   * exact opposite of that.
   */
  const { system } = await services.settings.load()
  const openVestibule = system.showVestibule && !hiddenLaunch

  if (openVestibule) {
    await vestibule.open()
  } else {
    await windows.create({ hidden: hiddenLaunch })
  }

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
     * The console retiring to the tray does not reach here — a hidden window is
     * still a window — so this stays the honest response to Alt+F4 and to the
     * taskbar's Close. The tray's own Quit goes through `app.quit()` and lands
     * on `before-quit` below, which is the one shutdown path either way.
     *
     * The vestibule is the exception, and the reason for the flag: it is
     * *destroyed* rather than hidden when it retires, because a hidden launcher
     * is a window that can never be shown again and would keep this from ever
     * firing for the console.
     */
    if (retiringToTray) {
      retiringToTray = false
      return
    }

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
        vestibule.dispose()
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
