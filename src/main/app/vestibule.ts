import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { getLogger } from '@main/core/logger'
import { registerEditing } from './editing'

const logger = getLogger('vestibule')

/**
 * Fixed, because the composition is fixed.
 *
 * Two tiles or one form, and neither gains anything from being dragged wider.
 * Deliberately not `MIN_WINDOW_*` from shared/constants — those are the
 * console's floor (1120x720) and describe a workstation, not a doorway.
 */
const WIDTH = 880
const HEIGHT = 560

/**
 * THE VESTIBULE — the room before the department.
 *
 * Opens ahead of the console and asks one question: a new project, or the
 * console proper. Most launches are the former, and the console is a
 * ten-department operator station standing between the operator and a set they
 * could have started in four fields.
 *
 * It is **not** a popout. A popout is a second view of a department and loads
 * the console bundle to get one; this window exists precisely because the
 * console has not loaded yet, so it has its own document
 * (`renderer/vestibule.html`) and imports none of the router's feature pages.
 * What it does share is the preload, so everything on `window.candy` is
 * available and there is no second IPC surface to keep in step.
 *
 * Note that boot is unaffected by any of this. The sequence is driven by the
 * main process and runs behind whichever window is on screen, so the archive
 * warms while the operator reads the two tiles — which is the only reason
 * creating a project from here can be immediate.
 */
export class VestibuleManager {
  private window: BrowserWindow | null = null

  /** Opens the vestibule, or focuses the one already open. */
  async open(): Promise<BrowserWindow> {
    const existing = this.window
    if (existing && !existing.isDestroyed()) {
      this.focus()
      return existing
    }

    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      center: true,
      show: false,
      frame: false,
      // The composition is drawn to this size; letting it be stretched would
      // only ever make the plexus sparse and the tiles lopsided.
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      // Matches the renderer's obsidian base so the first paint never flashes.
      backgroundColor: '#0A0A0B',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false
      }
    })

    this.window = window

    // Frameless, so there is no menu bar carrying the clipboard accelerators —
    // without this the project name field cannot be pasted into.
    registerEditing(window.webContents)

    window.on('ready-to-show', () => window.show())
    window.on('closed', () => {
      this.window = null
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    await this.load(window)
    logger.info('Vestibule opened')
    return window
  }

  private async load(window: BrowserWindow): Promise<void> {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // Its own document, so the dev-server URL needs the path appended rather
      // than a query parameter added.
      await window.loadURL(new URL('/vestibule.html', process.env['ELECTRON_RENDERER_URL']).href)
    } else {
      await window.loadFile(join(__dirname, '../renderer/vestibule.html'))
    }
  }

  isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  focus(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  /**
   * Closes the vestibule once its business is done.
   *
   * Only ever called *after* the window taking over has been created. Closing
   * it while it is the last window standing takes the count to zero, and
   * `window-all-closed` quits the application — which is the right answer to
   * the operator pressing this window's own close button, and quite the wrong
   * one to them asking for the console.
   */
  close(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    this.window = null
    window.destroy()
  }

  dispose(): void {
    this.close()
  }
}
