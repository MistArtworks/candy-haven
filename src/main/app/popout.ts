import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { getLogger } from '@main/core/logger'
import { registerEditing } from './editing'

const logger = getLogger('popout')

/**
 * Detached windows.
 *
 * One at a time per kind, and only the listening room so far. A popout is a
 * second view of a department rather than a second application: it loads the
 * same renderer bundle through the same preload, so everything on `window.candy`
 * is available to it and there is no second IPC surface to keep in step.
 *
 * The `popout` query parameter is read **before** the hash, deliberately. The
 * console routes with `HashRouter`, so anything after the `#` belongs to the
 * router and is not readable until React has mounted — but this flag has to be
 * known synchronously, at the top of `App`, to decide whether the boot
 * sequence runs at all. In the search string it is available on the first line
 * of the first module that asks.
 */
export class PopoutManager {
  private window: BrowserWindow | null = null

  /**
   * Opens the listening room in its own window, or focuses the one already open.
   *
   * The current file travels in the URL rather than through a state channel:
   * the popout is an independent player with its own transport and its own
   * audio graph, and pushing it a file to start on is the whole of what the two
   * windows need to say to each other.
   */
  openAuditorium(file: string | null, at: number | null = null, playing = false): void {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore()
      this.window.focus()
      return
    }

    const window = new BrowserWindow({
      width: 960,
      height: 460,
      minWidth: 520,
      minHeight: 300,
      show: false,
      frame: false,
      backgroundColor: '#0A0A0B',
      autoHideMenuBar: true,
      // A player is a thing you keep in a corner while working in something
      // else. That is most of the reason to detach it at all, so it starts
      // pinned and the window's own bar can unpin it.
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        /*
         * Required for the handover to actually resume.
         *
         * Chromium's autoplay policy counts gestures per document, and the
         * press that detached the player happened in a *different* window —
         * so without this the popout arrives loaded, seeked, and silently
         * paused, which reads as the handover having failed.
         */
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    this.window = window
    registerEditing(window.webContents)

    window.on('ready-to-show', () => window.show())
    window.on('closed', () => {
      this.window = null
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    const query: Record<string, string> = { popout: 'auditorium' }
    if (file) query.file = file
    // Only when there is something to resume, so the query string stays
    // readable and a fresh popout carries no stale position.
    if (file && at !== null && at > 0) query.at = String(at)
    if (file && playing) query.playing = '1'

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
      void window.loadURL(url.toString())
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), { query })
    }

    logger.info(
      `Auditorium popout opened${file ? ' with a file' : ''}${
        at !== null && at > 0 ? ` at ${at.toFixed(1)}s` : ''
      }`
    )
  }

  /** Whether the popout is currently pinned above other windows. */
  setAlwaysOnTop(pinned: boolean): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.setAlwaysOnTop(pinned)
  }

  isAlwaysOnTop(): boolean {
    if (!this.window || this.window.isDestroyed()) return false
    return this.window.isAlwaysOnTop()
  }

  dispose(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.destroy()
    this.window = null
  }
}
