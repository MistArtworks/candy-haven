import { Menu, type WebContents } from 'electron'
import { getLogger } from '@main/core/logger'

const logger = getLogger('editing')

/**
 * Clipboard and editing affordances for the frameless window.
 *
 * ### Why this has to exist
 *
 * On Windows, the accelerators for Ctrl+C / X / V / A / Z come from the
 * application menu's roles — and an application menu is rendered as the
 * window's top menu bar. This window is `frame: false`, so it has no menu bar,
 * so those accelerators are never registered, so **every text field in the app
 * silently has no clipboard support.** Nothing about the input is broken; there
 * was simply no path from the keystroke to the editing command.
 *
 * Mounting a hidden menu does not help: a frameless window has no bar to host
 * one. The input is intercepted before the renderer sees it and dispatched to
 * the privileged `webContents` editing commands instead, which need no menu.
 *
 * A context menu is registered alongside it, because right-click is the other
 * thing an operator reaches for when a paste does not work — and a popup menu
 * is not a menu bar, so its roles work here perfectly well.
 */

/**
 * Maps clipboard keystrokes onto editing commands.
 *
 * `preventDefault` is required rather than optional: without it, anything
 * Chromium would have handled natively runs in addition to the command
 * dispatched here, and a paste lands twice.
 */
export function registerEditingAccelerators(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    // Alt is excluded so this never swallows a genuine Alt+key combination.
    const modifier = process.platform === 'darwin' ? input.meta : input.control
    if (!modifier || input.alt) return

    switch (input.key.toLowerCase()) {
      case 'c':
        contents.copy()
        break
      case 'x':
        contents.cut()
        break
      case 'v':
        // Shift+V pastes without carrying formatting, which is what an operator
        // pasting a client id out of a browser actually wants either way.
        if (input.shift) contents.pasteAndMatchStyle()
        else contents.paste()
        break
      case 'a':
        contents.selectAll()
        break
      case 'z':
        if (input.shift) contents.redo()
        else contents.undo()
        break
      case 'y':
        contents.redo()
        break
      default:
        return
    }

    event.preventDefault()
  })
}

/**
 * Right-click menu for text fields and selected text.
 *
 * Deliberately minimal — clipboard actions only, and only the ones that apply.
 * A desktop app that offers "Inspect Element" to its operator is showing them
 * its underwear; the console's diagnostics live in REGULATION instead.
 */
export function registerContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params
    const hasSelection = selectionText.trim().length > 0

    // Nothing worth offering on a bare panel, so no empty menu appears.
    if (!isEditable && !hasSelection) return

    const template: Electron.MenuItemConstructorOptions[] = []

    if (isEditable) {
      template.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' }
      )
    }

    template.push({ role: 'cut', enabled: isEditable && editFlags.canCut })
    template.push({ role: 'copy', enabled: editFlags.canCopy })

    if (isEditable) {
      template.push({ role: 'paste', enabled: editFlags.canPaste })
      template.push({ type: 'separator' })
      template.push({ role: 'selectAll', enabled: editFlags.canSelectAll })
    }

    Menu.buildFromTemplate(template).popup()
  })
}

/** Installs both, for a window's contents. */
export function registerEditing(contents: WebContents): void {
  registerEditingAccelerators(contents)
  registerContextMenu(contents)
  logger.info('Editing accelerators and context menu registered')
}
