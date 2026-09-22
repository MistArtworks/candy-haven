import type { CSSProperties, ReactNode } from 'react'
import { Toaster as Sonner } from 'sonner'
import styles from './Toaster.module.scss'

/**
 * The console's notice stack.
 *
 * Mounted once, by `ConsoleLayout`, as a sibling of the page wrapper — never
 * from inside a page. The page wrapper carries a transform while it animates,
 * which makes it the containing block for every `position: fixed` descendant,
 * and a toaster rendered underneath it would anchor to the page instead of the
 * window. That is the same trap `Portal` exists for and `UnsavedBar` sidesteps
 * by being a sibling; this takes the sibling route for the same reason.
 *
 * It is deliberately absent from the other renderer documents. The vestibule
 * and the auditorium popout are their own roots, and the vestibule's whole
 * argument is being on screen before the console's bundle is — its one failure
 * path already reports next to the form that caused it.
 *
 * `unstyled` drops sonner's theme entirely; `Toaster.module.scss` draws the
 * rest. See `notify.ts` for the three tones and why a refusal never times out.
 */
export function Toaster(): ReactNode {
  return (
    <Sonner
      position="bottom-right"
      // One at a time is too few — filing a bulk move reports twice — and the
      // stack is over the page it is reporting on, so it does not get to grow.
      visibleToasts={4}
      // Hovering lifts the stack apart. A refusal waits to be dismissed, so
      // more than one can genuinely be up at once and has to be readable.
      expand={false}
      gap={8}
      // Sonner measures the stack from this, so it has to agree with the width
      // the stylesheet sets rather than being left at sonner's own 356px.
      style={{ '--width': '380px' } as CSSProperties}
      className={styles.toaster}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          content: styles.body,
          title: styles.title,
          description: styles.detail,
          actionButton: styles.action,
          closeButton: styles.close
        }
      }}
    />
  )
}
