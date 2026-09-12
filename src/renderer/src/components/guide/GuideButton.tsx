import { useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { getGuide, type GuideId } from '@renderer/features/catechism/content'
import { GuideCarousel } from './GuideCarousel'
import styles from './GuideButton.module.scss'

export interface GuideButtonProps {
  /** The department whose guide this opens. Also names the Markdown file. */
  guideId: GuideId
  /** Set above the title in the sheet. The department's own label. */
  eyebrow: string
  /** CATECHISM chapter the sheet's footer offers. Defaults to the guide's id. */
  chapter?: string
}

/**
 * `QUICK GUIDE`, for a department's masthead.
 *
 * Renders nothing at all when the guide has not been written, rather than
 * offering a button that opens an empty sheet. That makes the affordance safe
 * to add to every page's header up front: a page gets the button the moment
 * somebody writes `guides/<id>.md`, and never before.
 */
export function GuideButton({ guideId, eyebrow, chapter }: GuideButtonProps): ReactNode {
  const [open, setOpen] = useState(false)
  const guide = getGuide(guideId)

  if (!guide) return null

  return (
    <>
      <button type="button" className={styles.button} onClick={() => setOpen(true)}>
        <span className={styles.mark} aria-hidden="true" />
        Quick guide
      </button>

      <AnimatePresence>
        {open ? (
          <GuideCarousel
            guide={guide}
            eyebrow={eyebrow}
            chapter={chapter ?? guideId}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
