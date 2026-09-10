import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ReleaseArrival } from '@shared/domain/update'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import styles from './ReleaseNotice.module.scss'

/**
 * What changed, once, after an update has landed.
 *
 * Mounted in the console shell rather than on a page, because an update is not
 * a property of wherever the operator happened to be when they launched.
 *
 * A layer rather than a banner. A build that removes a department and rebuilds
 * another is not something to notice in passing, and there is exactly one
 * moment it can be said — dismissing it is what marks the version read, so a
 * banner scrolled past would have spent the only chance.
 */
export function ReleaseNotice(): ReactNode {
  const [arrival, setArrival] = useState<ReleaseArrival | null>(null)

  useEffect(() => {
    let alive = true
    void window.candy.release.arrival().then((next) => {
      if (alive) setArrival(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const dismiss = (): void => {
    setArrival(null)
    // Not awaited: the notice should close on the click, and a failed write
    // costs one repeat next launch rather than a stuck dialog.
    void window.candy.release.acknowledge()
  }

  // Escape closes, as it does for every other layer in the shell.
  useEffect(() => {
    if (!arrival) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [arrival])

  return (
    <AnimatePresence>
      {arrival ? (
        <Portal>
          <motion.div
            className={styles.layer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="What changed"
          >
            <motion.section
              className={styles.sheet}
              initial={{ opacity: 0, y: 18, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.997 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className={styles.head}>
                <span className={styles.index}>UPDATED</span>
                <h2 className={styles.title}>Version {arrival.version}</h2>
                {arrival.previous ? (
                  <span className={styles.from}>from {arrival.previous}</span>
                ) : null}
              </header>

              <div className={styles.body}>
                {arrival.notes ? (
                  <Notes source={arrival.notes} />
                ) : (
                  <p className={styles.empty}>
                    The notes for this version could not be reached. They are on the release page if
                    the machine comes back online.
                  </p>
                )}
              </div>

              <footer className={styles.foot}>
                <Button variant="primary" onClick={dismiss}>
                  Understood
                </Button>
              </footer>
            </motion.section>
          </motion.div>
        </Portal>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * Release notes, rendered without a Markdown library.
 *
 * Only three shapes are recognised — a `##` heading, a `-` bullet, and a
 * paragraph — because those are the only three the release notes are written
 * in, and pulling in a Markdown parser and its sanitiser to render a changelog
 * this application also authors would be a dependency for nothing.
 *
 * Anything unrecognised falls through as a paragraph rather than being dropped,
 * so a note written in some other shape is still legible.
 */
function Notes({ source }: { source: string }): ReactNode {
  const lines = source.replace(/\r\n/g, '\n').split('\n')

  return (
    <div className={styles.notes}>
      {lines.map((raw, index) => {
        const line = raw.trim()
        // A blank line is the space between paragraphs, which the gap provides.
        if (!line) return null

        const key = `${index}-${line.slice(0, 24)}`

        if (line.startsWith('#')) {
          return (
            <h3 key={key} className={styles.heading}>
              {line.replace(/^#+\s*/, '')}
            </h3>
          )
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <p key={key} className={styles.bullet}>
              {line.slice(2)}
            </p>
          )
        }

        return (
          <p key={key} className={styles.paragraph}>
            {line}
          </p>
        )
      })}
    </div>
  )
}
