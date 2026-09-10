import { BrowserWindow, screen, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH
} from '@shared/constants'
import type { WindowState } from '@shared/domain/system'
import { registerEditing } from './editing'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'

const logger = getLogger('window')

const PersistedWindowStateSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(MIN_WINDOW_WIDTH),
  height: z.number().min(MIN_WINDOW_HEIGHT),
  isMaximized: z.boolean()
})
type PersistedWindowState = z.infer<typeof PersistedWindowStateSchema>

const DEFAULT_STATE: PersistedWindowState = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  isMaximized: false
}

/** Discards saved geometry that no longer lands on a connected display. */
function isVisibleOnSomeDisplay(state: PersistedWindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true

  return screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.workArea
    // Require the title bar to be reachable, not merely any pixel to intersect.
    return (
      state.x! + state.width > x &&
      state.x! < x + width &&
      state.y! >= y - 8 &&
      state.y! < y + height
    )
  })
}

async function readPersistedState(): Promise<PersistedWindowState> {
  try {
    const raw = await readFile(getPaths().windowStateFile, 'utf8')
    const parsed = PersistedWindowStateSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return DEFAULT_STATE
    return isVisibleOnSomeDisplay(parsed.data) ? parsed.data : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

/**
 * Creates and owns the application window.
 *
 * The window is frameless: chrome is drawn by the renderer so the shell matches
 * the product's visual language. It is created hidden and revealed only once the
 * renderer signals it has painted, which avoids a white flash before the boot
 * screen appears.
 */
export class WindowManager {
  private window: BrowserWindow | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private onStateChange: ((state: WindowState) => void) | null = null
  private onVisibilityChange: ((visible: boolean) => void) | null = null
  /**
   * Suppresses the reveal on `ready-to-show` for this launch only.
   *
   * Set when the login item started the process. The window is still created
   * and still loads — boot has to run, because the whole reason to start at
   * sign-in is that the archive and the overlay server are up before they are
   * wanted — it simply never comes to the front.
   */
  private startHidden = false
  /**
   * Decides what the console's own close button means. Returns true to retire
   * to the tray instead of ending the session; see `requestClose`.
   */
  private closeIntercept: (() => boolean) | null = null

  get mainWindow(): BrowserWindow | null {
    return this.window
  }

  subscribe(listener: (state: WindowState) => void): void {
    this.onStateChange = listener
  }

  /** Notified whenever the window is shown or hidden, for the tray's menu. */
  subscribeVisibility(listener: (visible: boolean) => void): void {
    this.onVisibilityChange = listener
  }

  /**
   * Installs the close policy.
   *
   * A predicate rather than a boolean because the setting can change while the
   * app is running, and a value captured at startup would leave the close
   * button doing whatever it was told once.
   */
  setCloseIntercept(intercept: () => boolean): void {
    this.closeIntercept = intercept
  }

  async create(options: { hidden?: boolean } = {}): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return this.window

    this.startHidden = options.hidden ?? false

    const persisted = await readPersistedState()

    const window = new BrowserWindow({
      width: persisted.width,
      height: persisted.height,
      x: persisted.x,
      y: persisted.y,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      /*
       * Frameless, with no native caption buttons at all.
       *
       * There is deliberately no `titleBarOverlay` here. It used to be set
       * alongside `frame: false`, which is a contradiction Electron resolves in
       * the overlay's favour: Windows drew its own minimize / maximize / close
       * on top of the page while `TitleBar` drew ours underneath. At 100% the
       * two sets landed on each other and read as one, so it went unnoticed —
       * until interface scale arrived and pulled them apart, because the page
       * zooms and the native overlay is fixed in physical pixels.
       *
       * The custom bar owns all three actions over IPC and the drag region, so
       * the overlay was never doing anything but duplicating it.
       */
      frame: false,
      // Matches the renderer's obsidian base so a resize never flashes white.
      backgroundColor: '#0A0A0B',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        // Keep the renderer locked down: no Node integration, isolated context.
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false
      }
    })

    this.window = window

    // The window is frameless, so it has no menu bar to carry the clipboard
    // accelerators. Without this, no text field in the app can be pasted into.
    registerEditing(window.webContents)

    if (persisted.isMaximized) window.maximize()

    window.on('ready-to-show', () => {
      if (this.startHidden) {
        // Consumed here, not on the next launch: once the operator opens the
        // console from the tray, a later reload must show it normally.
        this.startHidden = false
        logger.info('Renderer ready; holding in the tray (started at sign-in)')
        this.emitVisibility(false)
        return
      }

      logger.info('Renderer ready to show')
      window.show()
      // Only when the Vite dev server is actually driving the renderer.
      // `is.dev` is merely "not packaged", which is also true for
      // `electron-vite preview` — where an auto-opened inspector is noise.
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        window.webContents.openDevTools({ mode: 'detach' })
      }
    })

    // External links open in the user's browser, never inside the app shell.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    // Block in-app navigation away from the application origin.
    window.webContents.on('will-navigate', (event, url) => {
      const target = new URL(url)
      const isDevServer = is.dev && target.origin === process.env['ELECTRON_RENDERER_URL']
      if (!isDevServer && target.protocol !== 'file:') {
        event.preventDefault()
        void shell.openExternal(url)
      }
    })

    // These events all carry the same (no-argument) listener signature, but
    // BrowserWindow.on is declared as a union of overloads that TypeScript will
    // not unify across a loop — hence the single narrowing cast.
    const stateEvents = [
      'maximize',
      'unmaximize',
      'enter-full-screen',
      'leave-full-screen',
      'focus',
      'blur'
    ] as const
    for (const event of stateEvents) {
      window.on(event as 'maximize', () => this.emitState())
    }

    window.on('show', () => this.emitVisibility(true))
    window.on('hide', () => this.emitVisibility(false))

    window.on('resize', () => this.scheduleSave())
    window.on('move', () => this.scheduleSave())
    window.on('closed', () => {
      this.window = null
    })

    await this.load(window)
    return window
  }

  private async load(window: BrowserWindow): Promise<void> {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      await window.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  getState(): WindowState {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return { isMaximized: false, isFullScreen: false, isFocused: false }
    }
    return {
      isMaximized: window.isMaximized(),
      isFullScreen: window.isFullScreen(),
      isFocused: window.isFocused()
    }
  }

  minimize(): void {
    this.window?.minimize()
  }

  toggleMaximize(): WindowState {
    const window = this.window
    if (window && !window.isDestroyed()) {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    return this.getState()
  }

  close(): void {
    this.window?.close()
  }

  /**
   * What the console's own close button does.
   *
   * Distinct from `close`, and the distinction is the whole design. Alt+F4 and
   * the taskbar's Close reach the window directly and end the session, because
   * that is what the operating system means by closing a window and an
   * application that quietly refuses it is one the operator cannot get rid of.
   * The button this app draws in its own title bar is ours to define, and it
   * retires to the tray — which is what keeps the overlay server serving OBS
   * while the console is out of the way.
   */
  requestClose(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return

    if (this.closeIntercept?.() === true) {
      this.hide()
      return
    }

    window.close()
  }

  hide(): void {
    const window = this.window
    if (!window || window.isDestroyed() || !window.isVisible()) return
    window.hide()
  }

  isVisible(): boolean {
    const window = this.window
    return window !== null && !window.isDestroyed() && window.isVisible()
  }

  /**
   * Brings the console to the front from wherever it was — hidden in the tray,
   * minimised, or merely behind something. The tray and the single-instance
   * guard both land here, since "the operator asked for the console" has one
   * meaning however they asked.
   */
  async reveal(): Promise<void> {
    // A second launch after the window was genuinely closed has nothing to
    // restore, so the console is rebuilt rather than the request ignored.
    if (!this.window || this.window.isDestroyed()) {
      await this.create()
      return
    }

    const window = this.window
    this.startHidden = false
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  /** Brings an existing window forward — used by the single-instance guard. */
  focus(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.focus()
  }

  private emitState(): void {
    this.onStateChange?.(this.getState())
  }

  private emitVisibility(visible: boolean): void {
    this.onVisibilityChange?.(visible)
  }

  /** Debounced so a drag or resize writes once, not on every frame. */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.persistState(), 400)
  }

  async persistState(): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed()) return

    // Persist the restored bounds so un-maximising returns to the right size.
    const bounds =
      window.isMaximized() || window.isFullScreen() ? window.getNormalBounds() : window.getBounds()

    const state: PersistedWindowState = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, MIN_WINDOW_WIDTH),
      height: Math.max(bounds.height, MIN_WINDOW_HEIGHT),
      isMaximized: window.isMaximized()
    }

    try {
      await writeFile(getPaths().windowStateFile, JSON.stringify(state, null, 2), 'utf8')
    } catch (error) {
      logger.warn('Could not persist window state', error)
    }
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.onStateChange = null
    this.onVisibilityChange = null
    this.closeIntercept = null
  }
}
