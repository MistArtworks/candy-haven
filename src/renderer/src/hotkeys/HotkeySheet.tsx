import { useMemo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Portal } from '@renderer/components/primitives/Portal'
import { chordKeys, type Hotkey } from './registry'
import styles from './HotkeySheet.module.scss'

export interface HotkeySheetProps {
  hotkeys: readonly Hotkey[]
  onClose: () => void
}

/**
 * Every shortcut currently live, grouped by where it applies.
 *
 * Built from the registry rather than written by hand, so it cannot describe a
 * binding that no longer exists or omit one that was added — the usual fate of
 * a keyboard reference kept in a document. It also means the list is honest
 * about *scope*: shortcuts belonging to a page appear only while that page is
 * open, which is exactly when they would work.
 *
 * Reached by a chord that is deliberately not advertised anywhere in the
 * interface.
 */
export function HotkeySheet({ hotkeys, onClose }: HotkeySheetProps): ReactNode {
  const groups = useMemo(() => {
    const byGroup = new Map<string, Hotkey[]>()

    for (const hotkey of hotkeys) {
      const existing = byGroup.get(hotkey.group)
      if (existing) existing.push(hotkey)
      else byGroup.set(hotkey.group, [hotkey])
    }

    /*
     * Global last.
     *
     * The bindings for wherever the operator is standing are the ones they
     * opened this for; the navigation chords are the same on every page and
     * become furniture after a day.
     */
    return [...byGroup.entries()].sort(([a], [b]) => {
      if (a === 'Global') return 1
      if (b === 'Global') return -1
      return a.localeCompare(b)
    })
  }, [hotkeys])

  return (
    <Portal>
      <motion.div
        className={styles.layer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={onClose}
      >
        <motion.section
          className={styles.sheet}
          initial={{ opacity: 0, y: 10, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          // The backdrop closes; the sheet itself should not.
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.head}>
            <span className={styles.title}>Keyboard</span>
            <span className={styles.dismiss}>Esc</span>
          </header>

          <div className={styles.groups}>
            {groups.map(([group, bindings]) => (
              <section key={group} className={styles.group}>
                <h3 className={styles.groupTitle}>{group}</h3>

                <dl className={styles.list}>
                  {bindings.map((binding) => (
                    <div
                      key={`${binding.group}-${binding.chord}-${binding.label}`}
                      className={styles.row}
                      data-disabled={binding.disabled || undefined}
                    >
                      <dt className={styles.keys}>
                        {chordKeys(binding.chord).map((key) => (
                          <kbd key={key} className={styles.key}>
                            {key}
                          </kbd>
                        ))}
                      </dt>
                      <dd className={styles.label}>{binding.label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}

            {groups.length === 0 ? (
              <p className={styles.empty}>Nothing bound on this page.</p>
            ) : null}
          </div>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
