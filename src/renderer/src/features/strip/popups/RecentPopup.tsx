import type { ReactNode } from 'react'
import { RECENT_MENU_SIZE, type RecentSet } from '@shared/domain/recent'
import { useNow } from '@renderer/hooks/useLeads'
import { useOpenRecentSet, useRecentSets } from '@renderer/hooks/useRecent'
import { RecentList } from '@renderer/features/archive/components/recent/RecentList'
import { useNotice } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * Recent projects, from the strip: the last twenty sets opened, like Live's
 * Open Recent Set, dropped down from its pin. Candy asked for it on the strip
 * too ("Recent projects option", on DISPATCH).
 *
 * The pointer resting on the pin drops it down, and it goes once the pointer
 * leaves (main/app/strip.ts watches for that); a press on the pin keeps it up
 * until Esc or a press elsewhere, as the strip's other popups do. A press on
 * a set opens it in Live; one in the register also offers its dossier.
 */
export function RecentPopup({ onClose }: { onClose: () => void }): ReactNode {
  const recent = useRecentSets()
  const openSet = useOpenRecentSet()
  const now = useNow(60_000)
  const [notice, say] = useNotice()

  const choose = (set: RecentSet): void => {
    openSet(set)
      .then(onClose)
      .catch((cause: Error) => say(cause.message))
  }

  const toConsole = (route: string): void => {
    window.candy.strip
      .openTarget({ kind: 'page', route })
      .then(onClose)
      .catch((cause: Error) => say(cause.message))
  }

  return (
    <div className={styles.recent}>
      <PopupHead title="Recent sets" onClose={onClose} />
      <div className={styles.recentScroll}>
        <RecentList
          sets={recent.data ?? []}
          loading={recent.isLoading}
          limit={RECENT_MENU_SIZE}
          now={now}
          onOpen={choose}
          onDossier={(id) => toConsole(`/archive?project=${id}`)}
        />
      </div>
      <button
        type="button"
        className={styles.recentAll}
        onClick={() => toConsole('/archive?lens=recent')}
      >
        All recent projects
      </button>
      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
    </div>
  )
}
