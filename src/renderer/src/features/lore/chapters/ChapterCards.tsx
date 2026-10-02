import type { ReactNode } from 'react'
import type { ChapterPlanet, LoreChapterView } from '@shared/domain/lore'
import { PlanetSvg } from '@shared/planets/react'
import { toRoman } from '../lib/order'
import { lineOf, statusWord, titleOf, whereOf } from './chapterText'
import styles from '../Lore.module.scss'

/**
 * CARDS: each chapter with its planet at a size worth looking at, in the
 * order here. A card opens its chapter in WRITE; ordering is LIST's.
 *
 * The planets are held still: a page of them all turning at once would be
 * noise, and ORBIT draws the one in hand moving.
 */
export function ChapterCards({
  views,
  planetOf,
  selectedId,
  onOpen
}: {
  views: readonly LoreChapterView[]
  planetOf: (view: LoreChapterView) => ChapterPlanet
  selectedId: string | null
  onOpen: (id: string) => void
}): ReactNode {
  return (
    <ol className={styles.cards}>
      {views.map((view, i) => {
        const planet = planetOf(view)
        const line = lineOf(view)
        return (
          <li key={view.id}>
            <button
              type="button"
              className={styles.card}
              data-selected={view.id === selectedId || undefined}
              aria-current={view.id === selectedId ? 'true' : undefined}
              onClick={() => onOpen(view.id)}
            >
              <span className={styles.cardHead}>
                <span className={styles.numeral}>{toRoman(i + 1)}</span>
                <span className={styles.status} data-status={view.status}>
                  {statusWord(view)}
                </span>
              </span>
              <PlanetSvg className={styles.cardStage} spec={planet.spec} still />
              <span className={styles.cardTitle}>{titleOf(view)}</span>
              <span className={styles.cardLine} data-empty={!line || undefined}>
                {line || 'No line yet'}
              </span>
              <span className={styles.cardFoot}>
                <span>{planet.name}</span>
                <span>{whereOf(view)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
