import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSystemStore } from '@renderer/app/store/system.store'

/**
 * Opens CONTACT or SERVICES when one of their notifications is clicked.
 *
 * The main process brings the console forward and asks for the department;
 * this is what goes there. Mounted beside the other cues for their reason:
 * the click can come while any page is showing.
 *
 * A page holding unsaved changes keeps the rail's rule. Its bar is nudged and
 * the console stays put, rather than a notification throwing away a half-made
 * edit; the department is one click away once the edit is filed or dropped.
 *
 * Renders nothing. It is a subscriber, not a component.
 */
export function InboxCues(): ReactNode {
  const navigate = useNavigate()

  useEffect(
    () =>
      window.candy.inbox.onOpen(({ path }) => {
        const { unsaved, nudgeUnsaved } = useSystemStore.getState()
        if (unsaved?.dirty) {
          nudgeUnsaved()
          return
        }
        navigate(path)
      }),
    [navigate]
  )

  return null
}
