import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { StripPopup, StripSettings } from '@shared/domain/strip'
import { getLogger } from '@main/core/logger'
import { registerEditing } from './editing'

const logger = getLogger('strip')

/** Space kept between the strip and the screen's edge. */
const MARGIN = 14
/** How close to an edge a drop snaps to it. */
const SNAP = 28
/** Between the strip and a popup beside it. */
const GAP = 8

/** What the strip needs from the rest of the application. */
export interface StripHost {
  /** Its position, kept in settings, so it survives a restart. */
  savePosition(position: { x: number; y: number }): void
}

/**
 * THE QUICK STRIP: a small window on top of everything, and the one popup
 * that opens beside it.
 *
 * Its own document (`renderer/strip.html`), like the vestibule's, so it never
 * loads the console. Sized by its content: the renderer measures itself and
 * asks for that size (`fit`), and the strip grows from whichever corner it is
 * nearest, so a strip in the bottom right grows up and to the left and never
 * off the screen.
 *
 * The popup is one window, made once and kept hidden, so opening it costs a
 * message rather than a page load. It shows what it is told (`strip:popup`),
 * measures itself the same way, and goes where there is room: above or below
 * the strip, else beside it.
 */
export class StripManager {
  private strip: BrowserWindow | null = null
  private popup: BrowserWindow | null = null
  private popupOpen = false
  /** The popup's measured size, which places it. */
  private popupSize = { width: 340, height: 300 }
  /** Set while a file dialog is up, so the popup doesn't close on losing focus to it. */
  private holdPopup = false
  private settled = false
  private saveTimer: NodeJS.Timeout | null = null
  private settings: StripSettings | null = null
  /** Set while the console is on screen: the strip stands aside for it. */
  private aside = false

  constructor(private readonly host: StripHost) {}

  /** Opens the strip, or shows it again. */
  async open(settings: StripSettings, uiScale = 1): Promise<void> {
    this.settings = settings
    if (this.strip && !this.strip.isDestroyed()) {
      if (!this.aside) this.strip.showInactive()
      return
    }
    const strip = this.makeWindow('strip', settings.onTop)
    this.strip = strip
    strip.on('moved', () => this.onMoved())
    strip.on('closed', () => {
      this.strip = null
      this.settled = false
    })
    await this.load(strip, 'strip', uiScale)

    const popup = this.makeWindow('popup', true)
    this.popup = popup
    popup.on('blur', () => {
      if (!this.holdPopup) this.closePopup()
    })
    popup.on('closed', () => {
      this.popup = null
      this.popupOpen = false
    })
    await this.load(popup, 'popup', uiScale)
    logger.info('Quick strip opened')
  }

  isOpen(): boolean {
    return (
      this.strip !== null && !this.strip.isDestroyed() && (this.strip.isVisible() || this.aside)
    )
  }

  /**
   * The console came on screen (true) or went (false). The strip is for when
   * the console isn't up, so it steps aside while it is, popup and all, and
   * comes back as it was when the console is closed, retired or minimised.
   */
  standAside(aside: boolean): void {
    this.aside = aside
    const strip = this.strip
    if (!strip || strip.isDestroyed()) return
    if (aside) {
      this.closePopup()
      strip.hide()
    } else if (this.settled && this.settings?.enabled !== false) {
      strip.showInactive()
    }
  }

  /** Follows REGULATION: shown or hidden, on top or not. */
  apply(settings: StripSettings): void {
    this.settings = settings
    const strip = this.strip
    if (!strip || strip.isDestroyed()) return
    strip.setAlwaysOnTop(settings.onTop, 'floating')
    if (!settings.enabled) this.hide()
  }

  hide(): void {
    this.closePopup()
    this.strip?.hide()
  }

  /** The window that sent a message, if it is the strip's. */
  owns(window: BrowserWindow | null): 'strip' | 'popup' | null {
    if (!window) return null
    if (window === this.strip) return 'strip'
    if (window === this.popup) return 'popup'
    return null
  }

  /** The renderer's measured size, for the window that sent it. */
  fit(window: BrowserWindow, width: number, height: number): void {
    const size = { width: Math.ceil(width), height: Math.ceil(height) }
    if (window === this.strip) this.fitStrip(size)
    else if (window === this.popup) this.fitPopup(size)
  }

  openPopup(popup: StripPopup): void {
    const target = this.popup
    if (!target || target.isDestroyed() || !this.strip) return
    this.popupOpen = true
    // Shown once it has measured itself and been placed; see fitPopup.
    target.webContents.send('strip:popup', popup)
  }

  closePopup(): void {
    this.popupOpen = false
    const popup = this.popup
    if (popup && !popup.isDestroyed() && popup.isVisible()) popup.hide()
  }

  /** Runs a file dialog without the popup closing behind it. */
  async holding<T>(work: () => Promise<T>): Promise<T> {
    this.holdPopup = true
    try {
      return await work()
    } finally {
      this.holdPopup = false
      this.popup?.focus()
    }
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    for (const window of [this.popup, this.strip]) {
      if (window && !window.isDestroyed()) window.destroy()
    }
    this.popup = null
    this.strip = null
  }

  // ---------------------------------------------------------------- private

  private makeWindow(role: 'strip' | 'popup', onTop: boolean): BrowserWindow {
    const window = new BrowserWindow({
      width: role === 'strip' ? 360 : 340,
      height: role === 'strip' ? 200 : 300,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: onTop,
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
    // Above other always-on-top windows' ordinary level, as a floating panel.
    if (onTop) window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true)
    // Frameless, so the clipboard accelerators come from here, as in the vestibule.
    registerEditing(window.webContents)
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    return window
  }

  private async load(window: BrowserWindow, role: 'strip' | 'popup', scale: number): Promise<void> {
    const query = { role, scale: scale.toFixed(4) }
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL('/strip.html', process.env['ELECTRON_RENDERER_URL'])
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
      await window.loadURL(url.href)
    } else {
      await window.loadFile(join(__dirname, '../renderer/strip.html'), { query })
    }
  }

  /**
   * The strip at its new size. The first time, at the saved spot (or the
   * bottom right); after that, grown from the corner it is nearest, so it
   * stays on the screen and where it was left.
   */
  private fitStrip(size: { width: number; height: number }): void {
    const strip = this.strip
    if (!strip || strip.isDestroyed()) return
    let bounds: Rectangle
    if (!this.settled) {
      bounds = this.startingBounds(size)
      this.settled = true
    } else {
      const current = strip.getBounds()
      const area = screen.getDisplayMatching(current).workArea
      const right = current.x + current.width > area.x + area.width / 2
      const bottom = current.y + current.height > area.y + area.height / 2
      bounds = {
        x: right ? current.x + current.width - size.width : current.x,
        y: bottom ? current.y + current.height - size.height : current.y,
        ...size
      }
      bounds = clampInto(bounds, area)
    }
    strip.setBounds(bounds)
    if (!strip.isVisible() && !this.aside && this.settings?.enabled !== false) strip.showInactive()
    if (this.popupOpen) this.placePopup()
  }

  /** Where it was left, if that is still on a screen; else the bottom right. */
  private startingBounds(size: { width: number; height: number }): Rectangle {
    const saved = this.settings?.position
    if (saved) {
      const display = screen.getAllDisplays().find((d) => contains(d.workArea, saved))
      if (display) return clampInto({ ...saved, ...size }, display.workArea)
    }
    const area = screen.getPrimaryDisplay().workArea
    return {
      x: area.x + area.width - size.width - MARGIN,
      y: area.y + area.height - size.height - MARGIN,
      ...size
    }
  }

  /** Dropped near an edge, it lines up with it; then where it is, is kept. */
  private onMoved(): void {
    const strip = this.strip
    if (!strip || strip.isDestroyed()) return
    const bounds = strip.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    let { x, y } = bounds
    if (Math.abs(x - area.x) < SNAP) x = area.x + MARGIN
    if (Math.abs(area.x + area.width - (x + bounds.width)) < SNAP)
      x = area.x + area.width - bounds.width - MARGIN
    if (Math.abs(y - area.y) < SNAP) y = area.y + MARGIN
    if (Math.abs(area.y + area.height - (y + bounds.height)) < SNAP)
      y = area.y + area.height - bounds.height - MARGIN
    if (x !== bounds.x || y !== bounds.y) strip.setPosition(x, y)
    if (this.popupOpen) this.placePopup()

    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.host.savePosition({ x, y }), 400)
  }

  private fitPopup(size: { width: number; height: number }): void {
    const popup = this.popup
    if (!popup || popup.isDestroyed() || !this.popupOpen) return
    // Placed and sized in one setBounds: setSize alone won't shrink a
    // window made unresizable, and a popup left at its largest would catch
    // clicks over the transparent part.
    this.popupSize = size
    this.placePopup()
    if (!popup.isVisible()) {
      popup.show()
      popup.focus()
    }
  }

  /** Above or below the strip, whichever has room, else beside it. */
  private placePopup(): void {
    const popup = this.popup
    const strip = this.strip
    if (!popup || !strip || popup.isDestroyed() || strip.isDestroyed()) return
    const s = strip.getBounds()
    const { width, height } = this.popupSize
    const area = screen.getDisplayMatching(s).workArea
    const onRight = s.x + s.width / 2 > area.x + area.width / 2
    const x = onRight ? s.x + s.width - width : s.x
    const above = s.y - height - GAP
    const below = s.y + s.height + GAP
    let bounds: Rectangle
    if (above >= area.y && s.y + s.height / 2 > area.y + area.height / 2) {
      bounds = { x, y: above, width, height }
    } else if (below + height <= area.y + area.height) {
      bounds = { x, y: below, width, height }
    } else if (above >= area.y) {
      bounds = { x, y: above, width, height }
    } else {
      // A tall vertical strip: beside it, on the side with room.
      const left = s.x - width - GAP
      bounds = {
        x: left >= area.x ? left : s.x + s.width + GAP,
        y: s.y + s.height - height,
        width,
        height
      }
    }
    popup.setBounds(clampInto(bounds, area))
  }
}

function contains(area: Rectangle, point: { x: number; y: number }): boolean {
  return (
    point.x >= area.x &&
    point.y >= area.y &&
    point.x < area.x + area.width &&
    point.y < area.y + area.height
  )
}

function clampInto(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height
  }
}
