/*
 * What's typed in LORE and not saved yet, kept in this window's storage
 * (on disk, in the console's profile) until it's saved or discarded, so a
 * crash, a closed window or a refused save never takes a paragraph or a
 * planet with it. One entry per chapter or planet; the editors read it
 * back when they open and say it was restored.
 *
 * Storage can be full or refused; then the page still holds the edits, and
 * nothing here throws.
 */

const PREFIX = 'candy-haven:'

export function readBackup(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

export function writeBackup(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Full or refused: the page still holds the edits.
  }
}

export function clearBackup(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // Nothing to clear.
  }
}
