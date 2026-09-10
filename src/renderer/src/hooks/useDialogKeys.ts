import { useEffect, useRef } from 'react'

export interface DialogKeys {
  /** Runs on Enter, but only while `canCommit`. */
  onCommit: () => void
  onCancel: () => void
  canCommit: boolean
}

/**
 * Enter commits, Escape cancels.
 *
 * Bound on the document rather than on the dialog, because the dialog may not
 * hold focus when the operator reaches for a key, and a dialog whose only route
 * out is the mouse gets in the way of typing a name and moving on.
 *
 * Two things are excluded from Enter: a `<textarea>`, where Enter is a newline
 * rather than a decision, and anything carrying `data-enter="own"`, which is how
 * a control claims the key for itself — the hex field in the swatch picker does,
 * so that typing a colour and pressing Enter applies the colour instead of
 * creating the folder.
 *
 * Written as a hook because there were four copies of it, and one of them had
 * already drifted: three read `canSubmit` and `submit` from bindings declared
 * *below* the effect, which is a temporal-dead-zone error that only stayed
 * quiet because the closure did not run until a keystroke arrived.
 *
 * The handler is bound once for the dialog's life and reads its inputs through
 * a ref, so a dialog that re-renders on every keystroke — which is every dialog
 * here, they are all controlled — is not adding and removing a document
 * listener each time.
 */
export function useDialogKeys(keys: DialogKeys): void {
  const latest = useRef(keys)

  // Written in an effect, not during render: a ref mutated while rendering is
  // torn by a concurrent render that is later discarded.
  useEffect(() => {
    latest.current = keys
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        latest.current.onCancel()
        return
      }

      if (event.key !== 'Enter') return

      const target = event.target as HTMLElement | null
      if (target?.tagName === 'TEXTAREA' || target?.dataset.enter === 'own') return

      event.preventDefault()
      if (latest.current.canCommit) latest.current.onCommit()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
