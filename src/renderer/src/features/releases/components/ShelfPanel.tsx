import type { ReactNode } from 'react'
import type { ReleasesState } from '@shared/domain/releases'
import { SHELF_SIZE } from '@shared/domain/releases.constants'
import { RELEASE_KIND_LABEL } from '@shared/domain/discography.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { Plate } from '@renderer/components/primitives/Plate'
import type { ReleasesActions } from '@renderer/hooks/useReleases'
import styles from '../ReleasesPage.module.scss'

/**
 * The website's home page shelf: up to eight releases, in the order set
 * here, as it'll be after Update. Put on with Add to shelf; moved and taken
 * off here. With none picked, the website shows the newest.
 */
export function ShelfPanel({
  state,
  actions
}: {
  state: ReleasesState
  actions: ReleasesActions
}): ReactNode {
  const shelf = state.staged.shelf ?? state.site?.shelf ?? []
  const changed = state.staged.shelf !== null
  const busy = actions.pending === 'stage'

  const describe = (
    siteId: string
  ): { title: string; kind: ReleasesState['entries'][number]['kind']; art: string | null } => {
    const here = state.entries.find((entry) => entry.siteId === siteId)
    if (here) return { title: here.title, kind: here.kind, art: here.artworkPath }
    const there = state.remote.find((release) => release.id === siteId)
    return { title: there?.title ?? 'Not on the website', kind: there?.kind ?? 'single', art: null }
  }

  const move = (from: number, to: number): void => {
    const next = [...shelf]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    void actions.stageShelf(next)
  }

  return (
    <Panel
      label="Home page shelf"
      index="01"
      className={styles.shelfPanel}
      aside={`${shelf.length} of ${SHELF_SIZE}${changed ? ' · changes with Update' : ''}`}
    >
      <ol className={styles.shelf}>
        {Array.from({ length: SHELF_SIZE }, (_, i) => {
          const siteId = shelf[i]
          if (!siteId) {
            return (
              <li key={`empty-${i}`} className={styles.slot} data-empty>
                <span className={styles.slotNumber}>{i + 1}</span>
                <span className={styles.slotEmpty}>Empty</span>
              </li>
            )
          }
          const { title, kind, art } = describe(siteId)
          return (
            <li key={siteId} className={styles.slot}>
              <span className={styles.slotNumber}>{i + 1}</span>
              <Plate path={art} fallback={RELEASE_KIND_LABEL[kind].slice(0, 2)} size={44} alt="" />
              <span className={styles.slotTitle}>{title}</span>
              <span className={styles.slotTools}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${title} earlier`}
                  disabled={i === 0 || busy}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${title} later`}
                  disabled={i === shelf.length - 1 || busy}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Take ${title} off the shelf`}
                  disabled={busy}
                  onClick={() => void actions.stageShelf(shelf.filter((id) => id !== siteId))}
                >
                  ×
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      <p className={styles.note}>
        {shelf.length
          ? 'The website shows these, in this order. Hidden ones are left out.'
          : 'None picked: the website shows the newest eight. Pick releases below and press Add to shelf.'}
      </p>
    </Panel>
  )
}
