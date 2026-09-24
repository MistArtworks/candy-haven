import type { ReactNode } from 'react'
import type { ArtistRecord } from '@shared/domain/artists'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../DiscographyPage.module.scss'

export interface CreditPickerProps {
  roster: readonly ArtistRecord[]
  /** The release's own artist — the main artist. Usually one: the operator. */
  billed: readonly string[]
  /** Billed alongside: the `feat.` half of the title. */
  featured: readonly string[]
  onBilled: (artistIds: string[]) => void
  onFeatured: (artistIds: string[]) => void
}

/**
 * Who a release is **by**, in two lists.
 *
 * Split rather than one list with roles because the distinction is how a
 * release is *titled*, not a fact about the people: `CANDY HEIST feat. NASKO`
 * is two positions on a cover, and an artist can hold either on different
 * releases.
 *
 * Distinct from the credit rows beneath it, which say who *did* the work.
 * This decides the billing; those are the liner notes, and somebody can
 * legitimately appear in both — the main artist of a single usually also
 * produced and wrote it.
 *
 * The first list was labelled BILLED AS, which is the trade's own term and
 * meant nothing to the one person using this. MAIN ARTIST says the same thing
 * in the words he used when asking for it.
 *
 * A name in one list is disabled in the other rather than hidden. Hiding it
 * would leave the operator wondering where somebody went; disabled says "they
 * are already credited, further up".
 */
export function CreditPicker({
  roster,
  billed,
  featured,
  onBilled,
  onFeatured
}: CreditPickerProps): ReactNode {
  if (roster.length === 0) {
    return (
      <div className={styles.gutterRow}>
        <span className={styles.gutterLabel}>Credits</span>
        <p className={styles.hint}>
          Nobody on the roster yet. Add people in ARTISTS and they can be credited here.
        </p>
      </div>
    )
  }

  const toggle = (list: readonly string[], id: string, apply: (next: string[]) => void): void => {
    apply(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id])
  }

  return (
    <div className={styles.credits}>
      <div className={styles.gutterRow}>
        <span className={styles.gutterLabel}>Main artist</span>
        <div className={styles.chips}>
          {roster.map((artist) => (
            <button
              key={artist.id}
              type="button"
              className={styles.chip}
              data-on={billed.includes(artist.id) || undefined}
              aria-pressed={billed.includes(artist.id)}
              disabled={featured.includes(artist.id)}
              {...tooltipTrigger(
                featured.includes(artist.id) ? 'Already credited as featured' : ''
              )}
              onClick={() => toggle(billed, artist.id, onBilled)}
            >
              {artist.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.gutterRow}>
        <span className={styles.gutterLabel}>Featuring</span>
        <div className={styles.chips}>
          {roster.map((artist) => (
            <button
              key={artist.id}
              type="button"
              className={styles.chip}
              data-on={featured.includes(artist.id) || undefined}
              aria-pressed={featured.includes(artist.id)}
              disabled={billed.includes(artist.id)}
              {...tooltipTrigger(billed.includes(artist.id) ? 'Already billed as the artist' : '')}
              onClick={() => toggle(featured, artist.id, onFeatured)}
            >
              {artist.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
