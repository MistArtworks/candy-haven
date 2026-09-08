import { BrowserWindow, screen, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  TITLEBAR_HEIGHT
} from '@shared/constants'
import type { WindowState } from '@shared/domain/system'
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

  get mainWindow(): BrowserWindow | null {
    return this.window
  }

  subscribe(listener: (state: WindowState) => void): void {
    this.onStateChange = listener
  }

  async create(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return this.window

    const persisted = await readPersistedState()

    const window = new BrowserWindow({
      width: persisted.width,
      height: persisted.height,
      x: persisted.x,
      y: persisted.y,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      frame: false,
      // Matches the renderer's obsidian base so a resize never flashes white.
      backgroundColor: '#0A0A0B',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0A0A0B',
        symbolColor: '#B69E7C',
        height: TITLEBAR_HEIGHT
      },
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

    if (persisted.isMaximized) window.maximize()

    window.on('ready-to-show', () => {
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
  }
}
