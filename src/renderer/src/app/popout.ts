/**
 * Detached-window mode, read from the document's own query string.
 *
 * Read from `location.search` rather than from the router, and that is the
 * whole point: the console routes with `HashRouter`, so anything after the `#`
 * is the router's and is not readable until React has mounted. This flag has to
 * be known before that — it decides whether the boot sequence runs at all —
 * so it travels in the search string, where the first module to ask can see it.
 *
 * See main/app/popout.ts for the other end.
 */

export type PopoutMode = 'auditorium'

export interface PopoutIntent {
  mode: PopoutMode
  /** A file to start on, handed over by the window that opened this one. */
  file: string | null
}

/** The popout this window was opened as, or null for the console proper. */
export function readPopoutIntent(): PopoutIntent | null {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('popout')
  if (mode !== 'auditorium') return null

  return { mode, file: params.get('file') }
}
