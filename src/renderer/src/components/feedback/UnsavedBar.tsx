import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import styles from './UnsavedBar.module.scss'

export interface UnsavedBarProps {
  dirty: boolean
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
  /** What is unsaved, e.g. `operator settings`. */
  subject?: string
}

/**
 * Unsaved-changes bar.
 *
 * Rises from the bottom of the page while anything is unsaved and holds the
 * only route to persistence, so a half-typed value is never written and a
 * change can always be abandoned.
 *
 * It also refuses to be ignored: when the operator tries to leave the page with
 * changes outstanding, the rail nudges this bar instead of navigating, and the
 * bar shakes. A modal would be the conventional answer and the wrong one here —
 * it would interrupt to say something the bar is already saying, and the
 * operator would have to read a dialog to be told about a control they can see.
 */
export function UnsavedBar({
  dirty,
  saving,
  error,
  onSave,
  onDiscard,
  subject = 'changes'
}: UnsavedBarProps): ReactNode {
  const nudge = useSystemStore((state) => state.unsavedNudge)
  const controls = useAnimationControls()
  // The nudge counter is already non-zero when the bar mounts, so the first
  // value seen is a baseline rather than a request to shake.
  const seen = useRef(nudge)

  useEffect(() => {
    if (nudge === seen.current) return
    seen.current = nudge

    // Short, sharp, and decaying — a control being knocked, not a wobble.
    void controls.start({
      x: [0, -9, 7, -5, 3, 0],
      transition: { duration: 0.42, ease: 'easeInOut' }
    })
  }, [nudge, controls])

  return (
    <AnimatePresence>
      {dirty ? (
        <motion.div
          className={styles.wrapper}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
        >
          <motion.div className={styles.bar} animate={controls}>
            <span className={styles.mark} aria-hidden="true" />

            <div className={styles.copy}>
              <span className={styles.title}>
                {error ? 'Could not save' : `Unsaved ${subject}`}
              </span>
              <span className={styles.detail}>
                {error ?? 'Nothing is written until you file it.'}
              </span>
            </div>

            <div className={styles.actions}>
              <Button variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>
                Discard
              </Button>
              <Button variant="primary" size="sm" busy={saving} onClick={onSave}>
                File changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
