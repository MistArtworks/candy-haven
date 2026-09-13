import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { useRuntimeInfo } from '@renderer/hooks/useRuntimeInfo'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Markdown } from '@renderer/components/markdown/Markdown'
import { outline } from '@renderer/lib/markdown'
import { gridVariants } from '@renderer/motion/transitions'
import { GuideCarousel } from '@renderer/components/guide/GuideCarousel'
import { CHAPTERS, chapterBlocks, getChapter, getGuide } from './content'
import styles from './CatechismPage.module.scss'

/**
 * CATECHISM — the reference.
 *
 * The chapter lives in the URL, as REGULATION's category does, so the quick
 * guides can link straight at the material they summarise and the back gesture
 * walks the chapters rather than leaving the department.
 *
 * Nothing on this page is written in this file. Every chapter is a Markdown
 * document under `content/docs/`, compiled in by Vite and parsed by the reduced
 * Markdown in `lib/markdown.ts` — so correcting the documentation is editing
 * prose, which is the only way documentation ever actually stays correct.
 */
export function CatechismPage(): ReactNode {
  const section = getSection('catechism')
  const [searchParams, setSearchParams] = useSearchParams()
  const bodyRef = useRef<HTMLDivElement>(null)

  const requested = searchParams.get('chapter')
  // An unknown chapter falls back to the first rather than rendering nothing:
  // a stale link or a renamed file should land somewhere readable.
  const chapter = getChapter(requested ?? '') ?? CHAPTERS[0]

  const blocks = useMemo(() => chapterBlocks(chapter.id), [chapter.id])
  const sections = useMemo(() => (blocks ? outline(blocks) : []), [blocks])

  /*
   * Which section the reader is in, for the rail's mark.
   *
   * An observer rather than a scroll handler: the body fires scroll events far
   * faster than this needs answering, and each one would mean measuring every
   * heading. The observer reports only the headings that actually crossed.
   *
   * The bottom margin is the load-bearing part. Pulling it in to 65% means a
   * heading counts as current from the moment it reaches the upper third of the
   * panel rather than when it touches the bottom edge — without it every
   * heading below the fold is "intersecting" at once and the last one wins,
   * so the mark sits at the end of the chapter the whole way down.
   */
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const root = bodyRef.current
    if (!root || sections.length === 0) return

    const headings = sections
      .map((entry) => root.querySelector(`#${CSS.escape(entry.id)}`))
      .filter((node): node is Element => node !== null)

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]) setActive(visible[0].target.id)
      },
      { root, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    )

    for (const heading of headings) observer.observe(heading)
    return () => observer.disconnect()
  }, [sections])

  /*
   * Scrolled to rather than linked to.
   *
   * This application routes with `HashRouter`, so the fragment is the route —
   * an `href="#the-lenses"` would not move the page, it would navigate to a
   * chapter of that name and lose the one being read. The heading ids are still
   * real, so this finds the element and scrolls the body to it.
   */
  const jump = useCallback((id: string) => {
    bodyRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }, [])

  /*
   * Replaying the tour, and meaning it.
   *
   * This used to call `reset` and nothing else: the record was cleared, nothing
   * happened on screen, and the tour appeared on the *next* launch. Correct, and
   * indistinguishable from a button that does not work — there is no way to tell
   * a silent success from a no-op until you relaunch.
   *
   * So it does both halves now. The sheet opens immediately, and the
   * acknowledgement stays cleared, so the real gate in `OrientationGate` shows
   * it again on the next start exactly as it would on a first install. That is
   * the difference between re-reading the tour and rehearsing a first run, and
   * this button is the one worth spending on the second.
   *
   * Closing the sheet here deliberately does *not* acknowledge. Acknowledging
   * is what the first-run gate does when the operator dismisses it there, and
   * doing it here as well would cancel the very thing that was just set up.
   */
  const [tour, setTour] = useState(false)
  const orientation = getGuide('orientation')

  /*
   * Development only, and drawn nowhere else.
   *
   * Rehearsing a first launch is a thing whoever is *building* the tour needs
   * to do repeatedly and an operator needs once, never. Shipping the control
   * would put a button in the manual whose whole purpose is to undo a piece of
   * state the application is otherwise careful to record — and an operator who
   * pressed it would be greeted by an introduction on their next start with no
   * obvious way to say they had already read it.
   */
  const { data: runtime } = useRuntimeInfo()
  const rehearsable = runtime?.isDevelopment === true

  const replayOrientation = useCallback(() => {
    void window.candy.guide.reset()
    setTour(true)
  }, [])

  const select = useCallback(
    (id: string) => {
      // Replaced rather than pushed: walking the rail should not build a
      // history stack the operator has to click back out of one chapter at a
      // time. Arriving *from* a quick guide is a push, and stays one.
      setSearchParams({ chapter: id }, { replace: true })
      bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    },
    [setSearchParams]
  )

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <div className={styles.headerActions}>
            {rehearsable ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={replayOrientation}
                title="Development only. Opens the tour now, and again on the next launch — as a first run would"
              >
                Rehearse first run
              </Button>
            ) : null}
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Chapters" index="00" className={styles.rail} flush>
          <nav className={styles.nav} aria-label="Chapters">
            {CHAPTERS.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={styles.navItem}
                data-active={entry.id === chapter.id || undefined}
                aria-current={entry.id === chapter.id ? 'page' : undefined}
                onClick={() => select(entry.id)}
              >
                <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.navBody}>
                  <span className={styles.navLabel}>{entry.label}</span>
                  <span className={styles.navPurpose}>{entry.purpose}</span>
                </span>
              </button>
            ))}
          </nav>
        </Panel>

        <Panel
          label={chapter.label}
          index={String(CHAPTERS.indexOf(chapter) + 1).padStart(2, '0')}
          aside={
            chapter.section ? (
              <Link className={styles.jump} to={getSection(chapter.section).path}>
                Open department
              </Link>
            ) : null
          }
          className={styles.content}
        >
          <div ref={bodyRef} className={styles.body}>
            <div className={styles.bodyInner}>
              {blocks ? (
                <Markdown blocks={blocks} className={styles.prose} />
              ) : (
                <p className={styles.unwritten}>
                  This chapter has not been written yet. It will appear here once{' '}
                  <code>content/docs/{chapter.id}.md</code> exists.
                </p>
              )}

              {/*
                The chapter's own sections, as a rail down the right.

                It was a strip of links across the top, which on a long chapter
                wrapped to three rows of small uppercase text and read as a
                masthead of its own — the reader met a wall of labels before
                the first sentence.

                Held at the measure's edge instead, collapsed to one rule per
                section. The rules alone say how long the chapter is and where
                you are in it, which is most of what a contents rail is for,
                and the labels resolve on hover for the rest.
              */}
              {sections.length > 1 ? (
                <nav className={styles.outline} aria-label="On this page">
                  <div className={styles.outlineInner}>
                    {sections.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={styles.outlineItem}
                        data-active={entry.id === active || undefined}
                        aria-current={entry.id === active ? 'location' : undefined}
                        onClick={() => jump(entry.id)}
                      >
                        <span className={styles.outlineLabel}>{entry.text}</span>
                        <span className={styles.outlineMark} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </nav>
              ) : null}
            </div>
          </div>
        </Panel>
      </motion.div>

      {/*
        The tour, replayed. Mounted here rather than in the shell because this
        is the one page that offers it deliberately — `OrientationGate` owns the
        automatic showing, and two components racing to open the same sheet
        would be worse than one of each.
      */}
      <AnimatePresence>
        {tour && orientation ? (
          <GuideCarousel
            guide={orientation}
            eyebrow="ORIENTATION"
            chapter="overview"
            onClose={() => setTour(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
