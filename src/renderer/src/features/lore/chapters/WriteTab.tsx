import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { chapterViews, type LoreChapterView, type LoreState } from '@shared/domain/lore'
import { WRITE_VIEWS, type WriteView } from '@shared/domain/lore.constants'
import { Button } from '@renderer/components/primitives/Button'
import { SelectInput } from '@renderer/components/primitives/Input'
import { Panel } from '@renderer/components/primitives/Panel'
import type { LoreActions } from '@renderer/hooks/useLore'
import { gridVariants } from '@renderer/motion/transitions'
import { readBackup, writeBackup } from '../lib/backup'
import { toRoman } from '../lib/order'
import { ChapterEditor } from './ChapterEditor'
import styles from '../Lore.module.scss'

const VIEW_KEY = 'lore-write-view'

/** The view last chosen, kept in this window's storage: a habit, not part of any chapter. */
function useWriteView(): [WriteView, (view: WriteView) => void] {
  const [view, setView] = useState<WriteView>(() => {
    const kept = readBackup(VIEW_KEY)
    return WRITE_VIEWS.find((option) => option === kept) ?? 'split'
  })
  const choose = (next: WriteView): void => {
    setView(next)
    writeBackup(VIEW_KEY, next)
  }
  return [view, choose]
}

const titleOf = (view: LoreChapterView): string =>
  view.draft?.title || view.published?.title || 'Untitled'

/**
 * WRITE: one chapter, given the whole page.
 *
 * Which chapter is chosen at the top, beside how to look at it: the text,
 * the text beside the preview, or the preview alone. Choosing another with
 * anything unsaved is stopped by the page (LorePage), as leaving the page
 * is by the rail.
 */
export function WriteTab({
  state,
  chapterId,
  onSelect,
  onShowChapters,
  actions
}: {
  state: LoreState
  chapterId: string | null
  onSelect: (id: string | null) => void
  onShowChapters: () => void
  actions: LoreActions
}): ReactNode {
  const views = useMemo(() => chapterViews(state), [state])
  const index = views.findIndex((view) => view.id === chapterId)
  const selected = index >= 0 ? views[index] : null
  const [mode, setMode] = useWriteView()
  const options = views.map((view, i) => ({
    value: view.id,
    label: `${toRoman(i + 1)} · ${titleOf(view)}`
  }))

  if (!selected) {
    return (
      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Nothing open" index="01" className={styles.fullPanel}>
          <div className={styles.writeEmpty}>
            <p className={styles.empty}>
              {views.length
                ? 'Choose the chapter to write.'
                : 'No chapters yet. Start one in CHAPTERS with New chapter.'}
            </p>
            {views.length ? (
              <SelectInput
                label="Chapter"
                value=""
                options={[{ value: '', label: 'Choose a chapter' }, ...options]}
                onChange={(id) => id && onSelect(id)}
                className={styles.chapterPicker}
              />
            ) : null}
            <div className={styles.actions}>
              <Button size="sm" onClick={onShowChapters}>
                Go to CHAPTERS
              </Button>
            </div>
          </div>
        </Panel>
      </motion.div>
    )
  }

  const numeral = toRoman(index + 1)
  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel label={`Chapter ${numeral}`} index="01" focal className={styles.fullPanel}>
        <ChapterEditor
          key={selected.id}
          view={selected}
          state={state}
          numeral={numeral}
          actions={actions}
          onDeleted={() => onSelect(null)}
          mode={mode}
          onMode={setMode}
          picker={
            <SelectInput
              label="Chapter"
              value={selected.id}
              options={options}
              onChange={(id) => onSelect(id)}
              className={styles.chapterPicker}
            />
          }
        />
      </Panel>
    </motion.div>
  )
}
