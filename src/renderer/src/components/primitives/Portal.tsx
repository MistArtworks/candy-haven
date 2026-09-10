import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export interface PortalProps {
  children: ReactNode
}

/**
 * Renders its children into `document.body`, outside the page tree.
 *
 * This exists for one specific reason, and it is worth stating plainly because
 * the failure it prevents looks like a CSS bug and is not.
 *
 * `ConsoleLayout` animates each page with `pageVariants`, which moves `y`,
 * `scale` and `filter`. Motion leaves those as inline styles once the animation
 * settles — `transform: translateY(0px) scale(1)`, `filter: blur(0px)` — and a
 * transform *or* a filter on an element makes it the **containing block for
 * every `position: fixed` descendant**. So an overlay inside a page resolves
 * `inset: 0` against the page rather than the viewport: it lands scrolled with
 * the content, offset by the page's own origin, and clipped to its width.
 *
 * `UnsavedBar` avoids this by being a sibling of the page wrapper, which the
 * layout can arrange because the layout owns it. Anything rendered *by* a page
 * — a dossier, a dialog, a right-click menu — has no such option, and a portal
 * is the only way out of the subtree.
 *
 * The context menu is the clearest case: it positions itself at the pointer's
 * `clientX`/`clientY`, which are viewport coordinates. Trapped in a transformed
 * ancestor it opens visibly away from the cursor.
 *
 * Portalling does not break `AnimatePresence`. The component stays in the React
 * tree, so exit animations still run; only the DOM node moves.
 */
export function Portal({ children }: PortalProps): ReactNode {
  /*
   * No SSR guard and no ref-held container element.
   *
   * This is Electron with a single, always-present document, so `document.body`
   * is available on the first render — mounting into a div created in an effect
   * would cost an extra frame during which a modal is in the tree but not on
   * screen, which reads as a flicker on every open.
   */
  return createPortal(children, document.body)
}
