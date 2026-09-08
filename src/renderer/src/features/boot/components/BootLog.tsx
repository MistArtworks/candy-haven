import { useEffect, useRef, type ReactNode } from 'react'
import type { BootLogEntry } from '@shared/domain/boot'
import { formatLogTime } from '@renderer/lib/format'
import styles from './BootLog.module.scss'

/** Tail length. The full history is retained in the snapshot; this is a view. */
const VISIBLE_LINES = 7

/**
 * Rolling boot log.
 *
 * Shows only the most recent lines so the composition stays quiet — the boot
 * screen is a monument, not a terminal. The complete log is preserved in the
 * snapshot and written to the app log file regardless of what is displayed.
 */
export function BootLog({ entries }: { entries: BootLogEntry[] }): ReactNode {
  const listRef = useRef<HTMLUListElement>(null)
  const visible = entries.slice(-VISIBLE_LINES)

  // Keep the newest line in view without hijacking focus.
  useEffect(() => {
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [entries.length])

  return (
    <ul
      className={styles.log}
      ref={listRef}
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Boot log"
    >
      {visible.map((entry, index) => (
        <li
          key={entry.id}
          className={`${styles.line} ${styles[entry.level]}`}
          // Older lines fade toward the top of the stack, so attention lands
          // on the newest without the list needing a hard edge.
          style={{ opacity: 0.3 + (0.7 * (index + 1)) / visible.length }}
        >
          <span className={styles.time}>{formatLogTime(entry.timestamp)}</span>
          <span className={styles.message}>{entry.message}</span>
        </li>
      ))}
    </ul>
  )
}
