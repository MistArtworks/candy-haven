import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import type { Orientation } from '@shared/domain/guide'
import { getGuide } from '@renderer/features/catechism/content'
import { GuideCarousel } from './GuideCarousel'

/**
 * Opens the orientation tour, once.
 *
 * Mounted in the console shell rather than on a page, for the same reason
 * `ReleaseNotice` is: a first launch is not a property of whichever department
 * the router happened to land on. Renders nothing until the main process says
 * there is a tour to show.
 *
 * Closing it is what acknowledges it — by the button, by Escape, or by the
 * backdrop. There is no separate "don't show again", because an orientation
 * tour that has been read *is* the thing not to show again, and a checkbox
 * would only offer the operator a way to get it wrong.
 */
export function OrientationGate(): ReactNode {
  const [orientation, setOrientation] = useState<Orientation | null>(null)

  const guide = getGuide('orientation')

  useEffect(() => {
    let alive = true

    void window.candy.guide.orientation().then((next) => {
      if (!alive || !next) return

      /*
       * A missing tour is acknowledged rather than merely skipped.
       *
       * If `guides/orientation.md` is absent or empty there is nothing to show,
       * and leaving the revision unacknowledged would mean asking again on
       * every launch forever. Recording it settles the question.
       *
       * Resolved here rather than in a second effect watching the fetched
       * state: `getGuide` reads a module-level map built at import, so it is
       * available synchronously and the branch costs nothing — whereas an
       * effect that reacted to the answer would be a setState cascading off
       * another setState for a case that resolves before either.
       */
      if (!getGuide('orientation')) {
        void window.candy.guide.acknowledge()
        return
      }

      setOrientation(next)
    })

    return () => {
      alive = false
    }
  }, [])

  const dismiss = (): void => {
    setOrientation(null)
    // Not awaited: the sheet should close on the click, and a failed write
    // costs one repeat next launch rather than a stuck dialog.
    void window.candy.guide.acknowledge()
  }

  return (
    <AnimatePresence>
      {orientation && guide ? (
        <GuideCarousel
          guide={guide}
          // A revised tour is not a welcome. Same eight slides either way, but
          // an operator who has used this for a year should be told which it is.
          eyebrow={orientation.firstRun ? 'ORIENTATION' : 'ORIENTATION — REVISED'}
          chapter="overview"
          onClose={dismiss}
        />
      ) : null}
    </AnimatePresence>
  )
}
