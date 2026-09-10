import { Menu, Tray, nativeImage } from 'electron'
import { APP_NAME, APP_SUBTITLE } from '@shared/constants'
import type { ArchiveState } from '@shared/domain/archive'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'

const logger = getLogger('tray')

export interface TrayActions {
  /** Bring the console to the front, creating or unhiding the window as needed. */
  reveal: () => void
  /** Ask for an update check; the result surfaces in the console, not here. */
  checkForUpdates: () => void
  /** End the session, running the full shutdown. */
  quit: () => void
}

/**
 * The system tray presence.
 *
 * The console is a resident of the machine rather than a window that happens to
 * be open: the archive daemon, the overlay server and the chat ingest all keep
 * running while nobody is looking at the UI, and OBS reads from the overlay
 * server whether or not this window is on screen. The tray is what makes that
 * legible — without it, an app that carries on after its window closes is
 * indistinguishable from one that failed to quit.
 *
 * The menu is deliberately short. Everything the console can do belongs in the
 * console; what belongs here is getting to it, knowing the archive is up, and
 * leaving. The archive line is a disabled item rather than a tooltip because a
 * tooltip is not a place anybody looks when something is wrong.
 */
export class TrayController {
  private tray: Tray | null = null
  private archiveState: ArchiveState = 'offline'
  private windowVisible = true

  constructor(private readonly actions: TrayActions) {}

  create(): void {
    if (this.tray) return

    const image = nativeImage.createFromPath(getPaths().appIcon)
    if (image.isEmpty()) {
      // Not fatal, and not silent: without a tray the close button must not
      // hide the window, so the caller needs to know this failed.
      logger.error(`Tray icon could not be read from ${getPaths().appIcon}`)
      return
    }

    /*
     * Resized here rather than shipped at tray size.
     *
     * The source is the 512px application mark, which is also the installer's
     * and the window's — one piece of artwork, scaled at each use, so there is
     * no second file to keep in step. 32px is the tray slot at 200% scaling and
     * downscales cleanly to the 16px slot at 100%; going the other way, from a
     * 16px source, does not.
     */
    this.tray = new Tray(image.resize({ width: 32, height: 32, quality: 'best' }))
    this.tray.setToolTip(`${APP_NAME} — ${APP_SUBTITLE}`)

    // Windows raises `click` for a single left click; the double-click is bound
    // as well because both are habits and neither should do nothing.
    this.tray.on('click', () => this.actions.reveal())
    this.tray.on('double-click', () => this.actions.reveal())

    this.render()
    logger.info('Tray created')
  }

  get isActive(): boolean {
    return this.tray !== null
  }

  /** Keeps the archive readout current; the menu is rebuilt only when it moves. */
  setArchiveState(state: ArchiveState): void {
    if (this.archiveState === state) return
    this.archiveState = state
    this.render()
  }

  /**
   * Whether the window is on screen, which decides whether the first item reads
   * "Open Console" or "Hide Console".
   */
  setWindowVisible(visible: boolean): void {
    if (this.windowVisible === visible) return
    this.windowVisible = visible
    this.render()
  }

  private render(): void {
    if (!this.tray) return

    const menu = Menu.buildFromTemplate([
      {
        // The heading is the application, as in the reference this was modelled
        // on: the operator right-clicks a small mark and the first thing the
        // menu does is say what it belongs to.
        label: APP_NAME,
        enabled: false
      },
      { type: 'separator' },
      {
        label: this.windowVisible ? 'Show Console' : 'Open Console',
        click: () => this.actions.reveal()
      },
      { type: 'separator' },
      {
        label: `ARCHIVE — ${this.archiveState.toUpperCase()}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Check for Updates…',
        click: () => this.actions.checkForUpdates()
      },
      { type: 'separator' },
      {
        label: `Quit ${APP_NAME}`,
        click: () => this.actions.quit()
      }
    ])

    this.tray.setContextMenu(menu)
  }

  /** Shows a balloon the first time the window retires to the tray. */
  notifyRetired(): void {
    if (!this.tray) return

    try {
      this.tray.displayBalloon({
        icon: nativeImage.createFromPath(getPaths().appIcon),
        title: `${APP_NAME} is still running`,
        content:
          'The console has retired to the tray. Overlays, the archive and chat keep running. Quit from this icon to end the session.'
      })
    } catch (error) {
      // Balloons are disabled by policy on some machines. Nothing depends on it.
      logger.warn('Could not show the tray balloon', error)
    }
  }

  dispose(): void {
    if (!this.tray) return
    this.tray.destroy()
    this.tray = null
  }
}
