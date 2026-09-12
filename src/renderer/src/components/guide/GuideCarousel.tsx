import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { Markdown } from '@renderer/components/markdown/Markdown'
import { EASE_OUT_EXPO, DURATION, slideVariants } from '@renderer/motion/transitions'
import type { Guide } from '@renderer/features/catechism/content'
import styles from './GuideCarousel.module.scss'

export interface GuideCarouselProps {
  guide: Guide
  /** Set above the title — `ORIENTATION`, or the department's own label. */
  eyebrow: string
  /** CATECHISM chapter the footer offers, when one covers this material. */
  chapter?: string
  onClose: () => void
}

/**
 * The quick guide, as slides.
 *
 * Portalled, and that is load-bearing rather than tidiness: `ConsoleLayout`
 * animates each page with a transform and a filter, and Motion leaves both as
 * inline styles once the animation settles. Either makes the page the
 * containing block for every fixed-position descendant, so a layer rendered
 * inside a department would resolve `inset: 0` against the page — landing
 * scrolled with the content and clipped to its width. See `Portal`.
 *
 * One slide at a time and no scroll. A slide that needs scrolling is a chapter,
 * and chapters live in the CATECHISM; the footer goes there in one click, which
 * is the pressure valve that keeps these short.
 */
export function GuideCarousel({ guide, eyebrow, chapter, onClose }: GuideCarouselProps): ReactNode {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  // Which way the last move went, so the incoming slide enters from the side
  // it came from rather than always from the right.
  const [direction, setDirection] = useState(1)

  const count = guide.slides.length
  const slide = guide.slides[index]
  const last = index === count - 1

  const go = useCallback(
    (next: number) => {
      // Clamped rather than wrapped. A tour that loops from the last slide back
      // to the first gives no sense of having finished it.
      const target = Math.max(0, Math.min(count - 1, next))
      if (target === index) return
      setDirection(target > index ? 1 : -1)
      setIndex(target)
    },
    [count, index]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowRight') go(index + 1)
      if (event.key === 'ArrowLeft') go(index - 1)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, index, onClose])

  const openChapter = (): void => {
    onClose()
    navigate(chapter ? `/catechism?chapter=${chapter}` : '/catechism')
  }

  return (
    <Portal>
      <motion.div
        className={styles.layer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.base }}
        role="dialog"
        aria-modal="true"
        aria-label={`${eyebrow} — quick guide`}
      >
        <motion.section
          className={styles.sheet}
          initial={{ opacity: 0, y: 18, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.997 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <header className={styles.head}>
            <div className={styles.identity}>
              <span className={styles.eyebrow}>{eyebrow}</span>
              <h2 className={styles.title}>{slide?.title ?? guide.title}</h2>
            </div>
            <span className={styles.count}>
              {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
          </header>

          <span className={styles.rule} aria-hidden="true" />

          <div className={styles.body}>
            {/*
              `mode="wait"` for the same reason the page transition uses it:
              overlapping an outgoing and an incoming slide across the full
              width of the sheet reads as a smear rather than a handover.
            */}
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={index}
                className={styles.slide}
                custom={direction}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {slide ? <Markdown blocks={slide.blocks} headings={false} /> : null}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className={styles.foot}>
            <div className={styles.dots}>
              {guide.slides.map((entry, dot) => (
                <button
                  key={entry.title}
                  type="button"
                  className={dot === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                  onClick={() => go(dot)}
                  aria-label={entry.title}
                  aria-current={dot === index}
                />
              ))}
            </div>

            <div className={styles.actions}>
              <Button size="sm" variant="ghost" onClick={openChapter}>
                Full documentation
              </Button>

              {index > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => go(index - 1)}>
                  Back
                </Button>
              ) : null}

              {last ? (
                <Button size="sm" variant="primary" onClick={onClose}>
                  Understood
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => go(index + 1)}>
                  Next
                </Button>
              )}
            </div>
          </footer>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
