import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { describeNotice } from '@shared/domain/dispatch.unread'
import { getSection } from '@shared/domain/navigation'
import { notify } from '@renderer/components/feedback/notify'
import { useSystemStore } from '@renderer/app/store/system.store'

/**
 * DISPATCH's notices in the console: what the other person just did on the
 * board (filed an item, commented, changed a status), with **Open**.
 *
 * The main process works out what changed and sends it here as it arrives,
 * and raises a Windows notification as well when the console isn't in front
 * (`main/app/board-notices.ts`). REGULATION's switch, under BOARD, silences
 * both; the rail's count and the board's marks show either way.
 *
 * Nothing is shown while DISPATCH itself is the page: the board marks what
 * arrived as it lands, and a notice on top of it would say it twice. **Open**
 * keeps the rail's rule about unsaved changes, as InboxCues does.
 *
 * Renders nothing. It is a subscriber, not a component.
 */
export function DispatchCues(): ReactNode {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const here = useRef(pathname)
  const board = getSection('dispatch').path

  useEffect(() => {
    here.current = pathname
  }, [pathname])

  useEffect(
    () =>
      window.candy.dispatch.onNotice((notice) => {
        if (here.current.startsWith(board)) return

        for (const line of describeNotice(notice)) {
          notify.report(line.label, {
            detail: line.detail,
            action: {
              label: 'Open',
              onClick: () => {
                const { unsaved, nudgeUnsaved } = useSystemStore.getState()
                if (unsaved?.dirty) {
                  nudgeUnsaved()
                  return
                }
                navigate(line.itemId ? `${board}?item=${line.itemId}` : board)
              }
            }
          })
        }
      }),
    [navigate, board]
  )

  return null
}
