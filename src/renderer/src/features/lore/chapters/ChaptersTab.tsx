import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  chapterPlanet,
  chapterViews,
  displayOrder,
  orderDiffers,
  withSiteOrder,
  type ChapterPlanet,
  type LoreChapterView,
  type LoreState
} from '@shared/domain/lore'
import {
  CHAPTER_LAYOUTS,
  DEFAULT_PLANET_ID,
  LORE_LIMITS,
  type ChapterLayout
} from '@shared/domain/lore.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Panel } from '@renderer/components/primitives/Panel'
import type { LoreActions } from '@renderer/hooks/useLore'
import { gridVariants } from '@renderer/motion/transitions'
import { Segmented } from '../components/Controls'
import { readBackup, writeBackup } from '../lib/backup'
import { ChapterCards } from './ChapterCards'
import { ChapterList } from './ChapterList'
import { ChapterOrbit } from './ChapterOrbit'
import styles from '../Lore.module.scss'

const LAYOUT_KEY = 'lore-chapters-layout'

const LAYOUTS: ReadonlyArray<{ value: ChapterLayout; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'cards', label: 'Cards' },
  { value: 'orbit', label: 'Orbit' }
]

/** The layout last chosen, kept in this window's storage: a habit, not part of the lore. */
function useLayout(): [ChapterLayout, (layout: ChapterLayout) => void] {
  const [layout, setLayout] = useState<ChapterLayout>(() => {
    const kept = readBackup(LAYOUT_KEY)
    return CHAPTER_LAYOUTS.find((option) => option === kept) ?? 'list'
  })
  const choose = (next: ChapterLayout): void => {
    setLayout(next)
    writeBackup(LAYOUT_KEY, next)
  }
  return [layout, choose]
}

/**
 * CHAPTERS: every chapter, in its order here, with where each stands
 * against the website and the planet it's read beside.
 *
 * Three ways to look at them. LIST is where they're ordered, by dragging
 * or with the arrows. CARDS gives each its planet at a size worth seeing.
 * ORBIT sets them round a ring the way the website's lore page does, the
 * one in hand drawn large in the middle. Opening a chapter writes it, in
 * WRITE, whichever is showing.
 */
export function ChaptersTab({
  state,
  selectedId,
  onOpen,
  onOpenPlanet,
  actions
}: {
  state: LoreState
  selectedId: string | null
  /** Opens a chapter in WRITE. */
  onOpen: (id: string) => void
  /** Opens a planet in PLANETS. */
  onOpenPlanet: (id: string) => void
  actions: LoreActions
}): ReactNode {
  const views = useMemo(() => chapterViews(state), [state])
  const planets = useMemo(() => {
    const byId = new Map<string, ChapterPlanet>()
    for (const view of views) byId.set(view.id, chapterPlanet(state, view))
    return byId
  }, [state, views])
  const planetOf = (view: LoreChapterView): ChapterPlanet =>
    planets.get(view.id) ?? chapterPlanet(state, view)
  const site = state.site
  const [layout, setLayout] = useLayout()

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const create = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed) return
    const created = await actions.createChapter({
      title: trimmed,
      line: '',
      planetId: DEFAULT_PLANET_ID,
      body: ''
    })
    if (!created) return
    setTitle('')
    setAdding(false)
    if (created.id) onOpen(created.id)
  }

  const published = views.filter((view) => view.published).length
  const busy = actions.pending === 'reorder'

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel label="Chapters" index="01" className={styles.fullPanel}>
        <div className={styles.listHead}>
          <span className={styles.count}>
            {views.length} chapter{views.length === 1 ? '' : 's'} · {published} published
          </span>
          <span className={styles.spacer} />
          {views.length ? (
            <Segmented
              label="Show the chapters as"
              hideLabel
              value={layout}
              options={LAYOUTS}
              onChange={setLayout}
            />
          ) : null}
          <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={adding}>
            New chapter
          </Button>
        </div>

        {orderDiffers(state) ? (
          <div className={styles.orderNote}>
            <span>The website shows the published chapters in another order.</span>
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                if (site) void actions.reorder(withSiteOrder(displayOrder(state), site))
              }}
              disabled={busy}
            >
              Use the website&apos;s
            </button>
            <Button
              size="sm"
              busy={actions.pending === 'publish-order'}
              onClick={() => void actions.publishOrder()}
            >
              Publish order
            </Button>
          </div>
        ) : null}

        {adding ? (
          <div className={styles.newRow}>
            <TextInput
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder="The chapter's title"
              maxLength={LORE_LIMITS.title}
              onEnter={() => void create()}
              className={styles.newRowField}
            />
            <Button
              size="sm"
              variant="primary"
              busy={actions.pending === 'create-chapter'}
              disabled={!title.trim()}
              onClick={() => void create()}
            >
              Create
            </Button>
            <Button size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        ) : null}

        {views.length === 0 ? (
          <p className={styles.empty}>
            No chapters yet. A new chapter is a draft on this PC; nothing reaches the website until
            it is published.
          </p>
        ) : layout === 'cards' ? (
          <ChapterCards views={views} planetOf={planetOf} selectedId={selectedId} onOpen={onOpen} />
        ) : layout === 'orbit' ? (
          <ChapterOrbit
            views={views}
            planetOf={planetOf}
            selectedId={selectedId}
            onOpen={onOpen}
            onOpenPlanet={onOpenPlanet}
          />
        ) : (
          <ChapterList
            views={views}
            planetOf={planetOf}
            selectedId={selectedId}
            onSelect={onOpen}
            actions={actions}
          />
        )}
      </Panel>
    </motion.div>
  )
}
