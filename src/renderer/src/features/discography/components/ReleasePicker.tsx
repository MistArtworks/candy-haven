import { useMemo, useState, type ReactNode } from 'react'
import type { DiscographySummary } from '@shared/domain/discography'
import { RELEASE_KIND_LABEL } from '@shared/domain/discography.constants'
import { Button } from '@renderer/components/primitives/Button'
import { formatIsoDate } from '@renderer/lib/format'
import styles from './TrackList.module.scss'

export interface ReleasePickerProps {
  /** The catalogue. This release and anything already collected are filtered out. */
  releases: readonly DiscographySummary[]
  /** The release being added to, so it cannot be offered itself. */
  currentId: string
  /** Ids already on this tracklist, so a record is not collected twice. */
  collectedIds: readonly string[]
  busy: boolean
  onChoose: (releaseId: string) => void
  onCancel: () => void
}

/**
 * Which record already in the catalogue this row is.
 *
 * ## What it is for
 *
 * An album is assembled from singles that are already out. Typing their
 * titles in again would be three chances to disagree with the records that
 * hold them — and the ISRC, the duration and the project link would all have
 * to be typed a second time or lost. Naming the release instead fills the row
 * from it and records the membership, which is what lets a single say `ALSO ON
 * — CREATURE` without either record storing the relationship twice.
 *
 * ## Why singles and EPs, not everything
 *
 * Offered in catalogue order with the kind on every row, and nothing is
 * excluded by kind: a compilation legitimately collects an album's track, and
 * refusing that would be guessing at how somebody files their own back
 * catalogue. What *is* excluded is this release and anything already on it —
 * the first would be a record citing itself, and the second is a duplicate
 * row the service would take and nobody wants.
 *
 * The search is over the title alone. A back catalogue is dozens of records,
 * not thousands, and a filter that also read labels and years would be a
 * feature nobody reached for.
 */
export function ReleasePicker({
  releases,
  currentId,
  collectedIds,
  busy,
  onChoose,
  onCancel
}: ReleasePickerProps): ReactNode {
  const [search, setSearch] = useState('')

  const offered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const taken = new Set(collectedIds)

    return releases.filter((release) => {
      if (release.id === currentId || taken.has(release.id)) return false
      if (!needle) return true
      return release.title.toLowerCase().includes(needle)
    })
  }, [releases, currentId, collectedIds, search])

  return (
    <div className={styles.picker} role="group" aria-label="Add a release to this running order">
      <div className={styles.pickerHead}>
        <input
          className={styles.pickerSearch}
          value={search}
          aria-label="Search the catalogue"
          placeholder="Search the catalogue"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {offered.length === 0 ? (
        <p className={styles.addHint}>
          {releases.length <= 1
            ? 'Nothing else in the catalogue yet.'
            : search.trim()
              ? 'Nothing matches that.'
              : 'Everything else is already on this running order.'}
        </p>
      ) : (
        <ul className={styles.pickerList}>
          {offered.map((release) => (
            <li key={release.id}>
              <button
                type="button"
                className={styles.pickerRow}
                disabled={busy}
                onClick={() => onChoose(release.id)}
              >
                <span className={styles.pickerTitle}>{release.title}</span>
                <span className={styles.pickerMeta}>
                  {RELEASE_KIND_LABEL[release.kind]}
                  {release.releaseDate ? ` · ${formatIsoDate(release.releaseDate)}` : ''}
                  {release.trackCount > 1 ? ` · ${release.trackCount} tracks` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
