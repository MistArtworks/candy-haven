import { useState, type ReactNode } from 'react'
import { useOutlet } from 'react-router-dom'
import { useIsPresent } from 'motion/react'

/**
 * The routed page, held still while it leaves.
 *
 * `<Outlet />` resolves its child from router context, and that context has
 * already advanced to the new route by the time the old page starts animating
 * out. Under `AnimatePresence mode="wait"` the departing wrapper stays mounted
 * for the whole exit — so it would re-render with the *incoming* department
 * inside it, at full opacity, for as long as the exit ran.
 *
 * The symptom is seeing the page you are going to before the transition to it
 * has happened. It is not a timing problem and no amount of easing hides it;
 * the wrong component is mounted.
 *
 * So the rendered child is kept in state and only refreshed while this instance
 * is the live one. `useIsPresent` is false from the first render of the exit,
 * which is the same render in which the outlet advances — so the update is
 * skipped and the departing copy keeps drawing the department it belongs to.
 *
 * Updating *while present* rather than capturing once on mount is the part that
 * is easy to get wrong. The animated wrapper is keyed by department, and a
 * department can change its page without changing key — every OBSERVATORY
 * overlay is a sub-route of one section. Capturing on mount would freeze those
 * permanently; this only freezes on the way out.
 */
export function PageOutlet(): ReactNode {
  const outlet = useOutlet()
  const isPresent = useIsPresent()

  const [shown, setShown] = useState(outlet)

  if (isPresent && shown !== outlet) {
    setShown(outlet)
  }

  return shown
}
