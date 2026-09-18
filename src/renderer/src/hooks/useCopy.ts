import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a control reads `Copied` before returning to its own label. */
const RESET_MS = 1600

export interface Copier {
  /** Key of the thing most recently copied, or null. */
  copied: string | null
  /** Key of the thing whose copy was refused, or null. */
  failed: string | null
  copy(key: string, text: string): void
}

/**
 * Copy to the clipboard, with a keyed acknowledgement.
 *
 * Every overlay page had hand-rolled this, eight times, in two shapes — a
 * boolean for single-address pages and a keyed string for the two that serve
 * several. They agreed on the 1600ms reset by coincidence rather than by
 * anything shared, and none of them handled a rejected write: each one is a
 * bare `.then()`, so a clipboard the OS refuses reads as a button that does
 * nothing at all.
 *
 * The keyed form subsumes the boolean one — a page with one address passes one
 * key — so this is the only shape, and the guarded reset (only clear if this
 * key is still the current one) means copying a second address before the
 * first has faded does not blank the acknowledgement early.
 *
 * The timer is cleared on unmount. Navigating away inside the reset window
 * would otherwise set state on a component that has gone.
 */
export function useCopy(): Copier {
  const [copied, setCopied] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const handle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (handle.current) clearTimeout(handle.current)
    },
    []
  )

  const copy = useCallback((key: string, text: string): void => {
    if (handle.current) clearTimeout(handle.current)

    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setFailed(null)
        setCopied(key)
      })
      .catch(() => {
        setCopied(null)
        setFailed(key)
      })
      .finally(() => {
        handle.current = setTimeout(() => {
          setCopied((current) => (current === key ? null : current))
          setFailed((current) => (current === key ? null : current))
        }, RESET_MS)
      })
  }, [])

  return { copied, failed, copy }
}
