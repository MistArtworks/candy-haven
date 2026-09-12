import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Markdown } from '@renderer/components/markdown/Markdown'
import { outline } from '@renderer/lib/markdown'
import { gridVariants } from '@renderer/motion/transitions'
import { CHAPTERS, chapterBlocks, getChapter } from './content'
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
            {/*
              The one place the orientation tour can be put back. It is not a
              setting — it changes nothing about how the console runs — so it
              belongs with the documentation rather than in REGULATION.
            */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void window.candy.guide.reset()}
              title="The orientation tour will open again on the next launch"
            >
              Replay orientation
            </Button>
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
            {sections.length > 1 ? (
              <nav className={styles.outline} aria-label="On this page">
                {sections.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.outlineItem}
                    onClick={() => jump(entry.id)}
                  >
                    {entry.text}
                  </button>
                ))}
              </nav>
            ) : null}

            {blocks ? (
              <Markdown blocks={blocks} className={styles.prose} />
            ) : (
              <p className={styles.unwritten}>
                This chapter has not been written yet. It will appear here once{' '}
                <code>content/docs/{chapter.id}.md</code> exists.
              </p>
            )}
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
