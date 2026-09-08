import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useSystemStore, selectUnsaved } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import styles from './UnsavedBar.module.scss'

/**
 * Unsaved-changes bar.
 *
 * Console chrome, like the titlebar and the rail: it is rendered by the layout
 * and reads whichever page has registered unsaved changes. It has to live
 * outside the animated page wrapper — that element carries a transform and
 * `will-change`, either of which makes it the containing block for positioned
 * descendants, so a bar rendered inside it lands relative to the page rather
 * than at the bottom of the app.
 *
 * It rises from the bottom while anything is unsaved and holds the only route
 * to persistence, so a half-typed value is never written and a change can
 * always be abandoned.
 *
 * It also refuses to be ignored: attempting to leave the page nudges the bar
 * instead of navigating, and it shakes. A modal would be the conventional
 * answer and the wrong one — it would interrupt to say something the bar is
 * already saying, about a control the operator can see.
 */
export function UnsavedBar(): ReactNode {
  const unsaved = useSystemStore(selectUnsaved)
  const nudge = useSystemStore((state) => state.unsavedNudge)
  const controls = useAnimationControls()

  // The counter is already non-zero when this mounts, so the first value seen
  // is a baseline rather than a request to shake.
  const seen = useRef(nudge)

  useEffect(() => {
    if (nudge === seen.current) return
    seen.current = nudge

    // Short, sharp and decaying — a control being knocked, not a wobble.
    void controls.start({
      x: [0, -9, 7, -5, 3, 0],
      transition: { duration: 0.42, ease: 'easeInOut' }
    })
  }, [nudge, controls])

  const dirty = unsaved?.dirty ?? false

  return (
    <AnimatePresence>
      {dirty && unsaved ? (
        <motion.div
          className={styles.wrapper}
          initial={{ y: 28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
        >
          <motion.div className={styles.bar} animate={controls}>
            <span className={styles.mark} aria-hidden="true" />

            <div className={styles.copy}>
              <span className={styles.title}>
                {unsaved.error ? 'Could not file changes' : `Unsaved ${unsaved.subject}`}
              </span>
              <span className={styles.detail}>
                {unsaved.error ?? 'Nothing is written until you file it.'}
              </span>
            </div>

            <div className={styles.actions}>
              <Button variant="ghost" size="sm" disabled={unsaved.saving} onClick={unsaved.discard}>
                Discard
              </Button>
              <Button variant="primary" size="sm" busy={unsaved.saving} onClick={unsaved.save}>
                File changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
