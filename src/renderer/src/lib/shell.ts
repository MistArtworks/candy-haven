import { notify } from '@renderer/components/feedback/notify'

/**
 * Leaving the console — Explorer, the browser, whatever owns a file type.
 *
 * These are the calls nothing was ever waiting on, so every one of the three
 * dozen call sites in this application was written as a bare
 * `void window.candy.shell.reveal(path)`. That is right about the control flow
 * and wrong about the failure: a reveal names a path the register is holding,
 * and the most ordinary reason for it to fail is that the folder has been
 * moved or deleted outside Candy Haven — which is exactly the case the
 * operator most needs to hear about, and the case where nothing happened at
 * all when they pressed it.
 *
 * Same signature as before, still fire-and-forget, still returning nothing.
 * The only difference is that a refusal now says so.
 */

/** Shows a file or folder in Explorer, selected. */
export function reveal(path: string): void {
  void window.candy.shell.reveal(path).catch((cause: unknown) => {
    notify.refuse(cause, { label: 'Could not show that in Explorer' })
  })
}

/** Opens a file with whatever the OS has registered for its extension. */
export function openPath(path: string): void {
  void window.candy.shell.openPath(path).catch((cause: unknown) => {
    notify.refuse(cause, { label: 'Could not open that' })
  })
}

/**
 * Hands a URL to the operator's browser.
 *
 * Main enforces an allowlist of `https:`/`http:`/`mailto:`, so this refuses
 * rather than silently doing nothing when a stored link is malformed — which
 * is reachable: DISTRIBUTION and an artist's links both hold addresses typed
 * by hand.
 */
export function openExternal(url: string): void {
  void window.candy.shell.openExternal(url).catch((cause: unknown) => {
    notify.refuse(cause, { label: 'Could not open that link' })
  })
}
