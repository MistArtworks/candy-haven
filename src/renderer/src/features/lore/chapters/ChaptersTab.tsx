import { useMemo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  chapterViews,
  displayOrder,
  orderDiffers,
  withSiteOrder,
  type LoreState
} from '@shared/domain/lore'
import { Panel } from '@renderer/components/primitives/Panel'
import type { LoreActions } from '@renderer/hooks/useLore'
import { gridVariants } from '@renderer/motion/transitions'
import { ChapterList } from './ChapterList'
import styles from '../Lore.module.scss'

/**
 * CHAPTERS: every chapter, in its order here, with where each stands
 * against the website. Opening one writes it, in WRITE.
 */
export function ChaptersTab({
  state,
  selectedId,
  onOpen,
  actions
}: {
  state: LoreState
  selectedId: string | null
  /** Opens a chapter in WRITE. */
  onOpen: (id: string) => void
  actions: LoreActions
}): ReactNode {
  const views = useMemo(() => chapterViews(state), [state])
  const site = state.site

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel label="Chapters" index="01" className={styles.fullPanel}>
        <ChapterList
          views={views}
          selectedId={selectedId}
          onSelect={onOpen}
          actions={actions}
          orderDiffers={orderDiffers(state)}
          onTakeSiteOrder={() => {
            if (site) void actions.reorder(withSiteOrder(displayOrder(state), site))
          }}
        />
      </Panel>
    </motion.div>
  )
}
