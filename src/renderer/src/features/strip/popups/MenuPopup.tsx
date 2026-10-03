import type { ReactNode } from 'react'
import styles from '../Strip.module.scss'

/** The strip's menu: the console, the vestibule, its settings, hiding, quitting. */
export function MenuPopup({ onClose }: { onClose: () => void }): ReactNode {
  const go = (work: () => Promise<void>): void => {
    void work()
    onClose()
  }
  return (
    <div className={styles.menuPopup}>
      <div className={styles.menu}>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() =>
            go(() => window.candy.strip.openTarget({ kind: 'action', action: 'console' }))
          }
        >
          Open the console
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() =>
            go(() => window.candy.strip.openTarget({ kind: 'action', action: 'vestibule' }))
          }
        >
          Open the vestibule
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() =>
            go(() =>
              window.candy.strip.openTarget({ kind: 'page', route: '/regulation?section=strip' })
            )
          }
        >
          Strip settings
        </button>
        <span className={styles.menuRule} />
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => go(() => window.candy.strip.hide())}
        >
          Hide the strip
        </button>
        <button
          type="button"
          className={styles.menuItem}
          data-danger
          onClick={() => go(() => window.candy.strip.quit())}
        >
          Quit Candy Haven
        </button>
      </div>
    </div>
  )
}
