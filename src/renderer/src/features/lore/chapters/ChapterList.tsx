import type { ReactNode } from 'react'
import type { ChapterPlanet, LoreChapterView } from '@shared/domain/lore'
import { PlanetSvg } from '@shared/planets/react'
import type { LoreActions } from '@renderer/hooks/useLore'
import { shift, toRoman, useDragOrder } from '../lib/order'
import { lineOf, statusWord, titleOf, whereOf } from './chapterText'
import styles from '../Lore.module.scss'

/**
 * LIST: the chapters in their order here, each beside its planet.
 *
 * The one layout that orders them: dragged by their grip, or moved a place
 * with the arrows. Moving is kept here; the website keeps its order until
 * "Publish order", and a fetch that finds the other person published a new
 * one brings it here unless a move here is waiting.
 */
export function ChapterList({
  views,
  planetOf,
  selectedId,
  onSelect,
  actions
}: {
  /** In their order here. */
  views: readonly LoreChapterView[]
  planetOf: (view: LoreChapterView) => ChapterPlanet
  selectedId: string | null
  onSelect: (id: string) => void
  actions: LoreActions
}): ReactNode {
  const ids = views.map((view) => view.id)
  const busy = actions.pending === 'reorder'
  const move = (next: string[]): void => {
    if (!busy) void actions.reorder(next)
  }
  const drag = useDragOrder(ids, move)

  return (
    <ol className={styles.chapters}>
      {views.map((view, i) => {
        const title = titleOf(view)
        const line = lineOf(view)
        const planet = planetOf(view)
        return (
          <li
            key={view.id}
            className={styles.chapter}
            data-selected={view.id === selectedId || undefined}
            tabIndex={0}
            aria-current={view.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(view.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(view.id)
              }
            }}
            {...drag(view.id)}
          >
            <span className={styles.grip} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className={styles.numeral}>{toRoman(i + 1)}</span>
            <PlanetSvg className={styles.rowPlanet} spec={planet.spec} still />
            <span className={styles.chapterText}>
              <span className={styles.chapterTitle}>{title}</span>
              <span className={styles.chapterMeta}>
                {line || 'No line yet'} · {whereOf(view)} · {planet.name}
              </span>
            </span>
            <span className={styles.chapterSide}>
              <span className={styles.status} data-status={view.status}>
                {statusWord(view)}
              </span>
              <button
                type="button"
                className={styles.writeButton}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(view.id)
                }}
              >
                Write
              </button>
              <span className={styles.move}>
                <button
                  type="button"
                  className={styles.moveButton}
                  aria-label={`Move ${title} up`}
                  disabled={i === 0 || busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    move(shift(ids, view.id, -1))
                  }}
                >
                  <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
                    <path d="M1 5 5 1l4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.moveButton}
                  aria-label={`Move ${title} down`}
                  disabled={i === views.length - 1 || busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    move(shift(ids, view.id, 1))
                  }}
                >
                  <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
                    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
