import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * How long typing has to stop before the value is committed.
 *
 * Long enough that a burst of typing is one write rather than thirty, short
 * enough that the broadcast reaches the browser source while the operator is
 * still looking at the console.
 */
const SETTLE_MS = 250

/**
 * A text field bound to state that is pushed back from the main process.
 *
 * **This exists because of a real bug, and the shape of it is worth keeping in
 * mind.** The overlay config fields were controlled directly by the pushed
 * state: `value={state.config.title}` with an `onChange` that fired an IPC
 * write. Every keystroke then went main-process, service, broadcast, back — and
 * for the whole of that round trip the `value` prop still held the *previous*
 * text. React writes that back into the DOM node, so any character typed during
 * the trip was erased. Typing slowly looked fine; typing at speed dropped
 * letters, which is exactly what was reported.
 *
 * The fix is ownership. While an edit is outstanding the field owns its value
 * and the pushed state is ignored; once the write has gone and the echo has
 * come back, the pushed state owns it again. Adopting the remote value only
 * when nothing local is outstanding is the whole of it.
 *
 * Debouncing is a consequence rather than the point: it takes a burst of typing
 * down to one write, which is worth having on a channel that also broadcasts to
 * every browser source, but it would not on its own fix the dropped keystrokes.
 *
 * A pending edit is flushed on unmount, so navigating away immediately after
 * typing still saves what was typed.
 */
export function useEchoedText(
  remote: string,
  commit: (value: string) => void,
  delayMs: number = SETTLE_MS
): [string, (value: string) => void] {
  const [local, setLocal] = useState(remote)

  /** True from the first keystroke until the write has been sent. */
  const outstanding = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)

  // `commit` is an inline arrow at every call site, so it is a different
  // function each render. Held in a ref rather than in a dependency list, which
  // would rebuild the handler — and restart nothing, but churn for no reason.
  const latest = useRef(commit)
  useEffect(() => {
    latest.current = commit
  })

  useEffect(() => {
    // The line the bug turned on: while an edit is outstanding the pushed value
    // is stale by definition, and adopting it would undo what was just typed.
    if (outstanding.current) return
    setLocal(remote)
  }, [remote])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      // Flushed rather than dropped. The component is going away, but the
      // write is an IPC call and does not need it to still be here.
      if (pending.current !== null) latest.current(pending.current)
    },
    []
  )

  const change = useCallback(
    (value: string) => {
      outstanding.current = true
      pending.current = value
      setLocal(value)

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        pending.current = null
        // Cleared *before* the write, so the echo that follows is adopted
        // rather than skipped as though it were still stale.
        outstanding.current = false
        latest.current(value)
      }, delayMs)
    },
    [delayMs]
  )

  return [local, change]
}
