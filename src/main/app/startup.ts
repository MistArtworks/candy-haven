import { app } from 'electron'
import { getLogger } from '@main/core/logger'

const logger = getLogger('startup')

/**
 * Marker appended to the login-item command line.
 *
 * The only reliable way to know, on Windows, that this launch came from signing
 * in rather than from the operator opening the app: Electron's
 * `wasOpenedAtLogin` is macOS-only, and the registry entry carries no other
 * signal. Because *we* write the login item, we can write the flag into it.
 */
export const HIDDEN_LAUNCH_FLAG = '--hidden'

/** Whether this process was started by the login item rather than by hand. */
export function launchedHidden(): boolean {
  return process.argv.includes(HIDDEN_LAUNCH_FLAG)
}

/**
 * Reconciles the OS login item with the operator's setting.
 *
 * Called at boot as well as on every change, so an entry removed behind the
 * app's back — by a system settings pane, a cleanup tool, or a reinstall that
 * moved the executable — is put back rather than left disagreeing with what
 * REGULATION says. The write is cheap and idempotent.
 *
 * Does nothing when unpackaged: `process.execPath` is Electron's own binary
 * during development, and registering *that* to run at sign-in would launch a
 * bare Electron against no application every morning. The setting is still
 * stored, so it takes effect in the installed build.
 */
export function applyLaunchAtStartup(enabled: boolean, startMinimised: boolean): void {
  if (!app.isPackaged) {
    logger.info(`Login item not written in development (would be ${enabled ? 'on' : 'off'})`)
    return
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // Written explicitly rather than left to default. electron-builder's NSIS
      // target installs to a stable path across updates, so the entry survives
      // an upgrade without being rewritten — but only if it names the launcher
      // rather than whatever `process.execPath` happened to be.
      path: process.execPath,
      args: startMinimised ? [HIDDEN_LAUNCH_FLAG] : []
    })

    logger.info(
      `Login item ${enabled ? 'registered' : 'removed'}` +
        (enabled && startMinimised ? ' (starts in the tray)' : '')
    )
  } catch (error) {
    // A failed registry write must not take the boot down with it; the console
    // is entirely usable without starting itself.
    logger.error('Could not write the login item', error)
  }
}

/** What the OS currently believes, for REGULATION to report against. */
export function loginItemRegistered(): boolean {
  if (!app.isPackaged) return false
  try {
    return app.getLoginItemSettings({ path: process.execPath }).openAtLogin
  } catch {
    return false
  }
}
