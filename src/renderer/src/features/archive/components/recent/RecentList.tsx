import type { ReactNode } from 'react'
import type { RecentSet } from '@shared/domain/recent'
import { formatAgo } from '@renderer/features/leads/model'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from './RecentList.module.scss'

export interface RecentListProps {
  sets: readonly RecentSet[]
  loading?: boolean
  /** How many to show; the rest are left out. */
  limit?: number
  now: number
  onOpen: (set: RecentSet) => void
  /** Offered beside a set in the ARCHIVE: its project's dossier. */
  onDossier?: (projectId: string) => void
  /**
   * Focus on the first set that can be opened, for a menu opened from the
   * keyboard. Rows carry `data-row`, for a menu walking them by arrow.
   */
  autoFocus?: boolean
}

/**
 * Where a set sits, the way Live's own recent menu tells sets apart: the
 * folders around its project folder, `Personal › Dubstep`.
 */
function whereOf(set: RecentSet): string {
  const parts = set.path.split(/[\\/]/).filter(Boolean)
  // …\Personal\Dubstep\DJ SET Project\DJ SET.als → Personal › Dubstep
  return parts.slice(Math.max(0, parts.length - 4), parts.length - 2).join(' › ')
}

/**
 * Recently opened sets, newest first: the rows of ARCHIVE's RECENT menu, the
 * strip's, and the RECENT lens's sets outside the archive.
 *
 * Like Live's File → Open Recent Set: a press opens the set in Live. The set
 * Live has open now says so; one moved or deleted since stays listed, as
 * Live's does, but dimmed and not pressable.
 */
export function RecentList({
  sets,
  loading = false,
  limit,
  now,
  onOpen,
  onDossier,
  autoFocus = false
}: RecentListProps): ReactNode {
  if (sets.length === 0) {
    return (
      <p className={styles.quiet}>
        {loading
          ? 'Reading what Live opened lately…'
          : 'Nothing opened yet. Sets you open, in Live or from Candy Haven, are listed here, newest first.'}
      </p>
    )
  }

  const shown = limit ? sets.slice(0, limit) : sets
  // The keyboard lands on the first set that can be opened.
  const first = shown.findIndex((set) => set.exists)

  return (
    <ol className={styles.list}>
      {shown.map((set, index) => {
        const where = whereOf(set)
        const state = !set.exists
          ? 'Not found'
          : set.openNow
            ? 'Open now'
            : set.openedAt
              ? formatAgo(set.openedAt, now)
              : ''
        return (
          <li key={set.path} className={styles.item}>
            <button
              type="button"
              className={styles.row}
              data-gone={!set.exists || undefined}
              data-now={set.openNow || undefined}
              disabled={!set.exists}
              data-row
              autoFocus={autoFocus && index === first}
              onClick={() => onOpen(set)}
              {...tooltipTrigger(
                set.exists ? `Open in Live: ${set.path}` : `Not found: ${set.path}`
              )}
            >
              <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.body}>
                <span className={styles.name}>{set.name}</span>
                <span className={styles.where}>
                  {where || set.folder}
                  {/* A missing set says Not found; whether it was filed no longer matters. */}
                  {set.temporary ? (
                    <span className={styles.outside}> · temporary</span>
                  ) : set.projectId || !set.exists ? null : (
                    <span className={styles.outside}> · not in the archive</span>
                  )}
                </span>
              </span>
              {state ? (
                <span className={styles.state} data-now={set.openNow || undefined}>
                  {state}
                </span>
              ) : null}
            </button>
            {onDossier && set.projectId ? (
              <button
                type="button"
                className={styles.dossier}
                aria-label={`${set.name}: open its dossier`}
                onClick={() => onDossier(set.projectId as string)}
                {...tooltipTrigger('Its dossier in the ARCHIVE')}
              >
                Dossier
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
