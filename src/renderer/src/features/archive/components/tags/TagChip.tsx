import type { CSSProperties, ReactNode } from 'react'
import type { TagSummary } from '@shared/domain/tags'
import styles from './tags.module.scss'

export interface TagChipProps {
  tag: TagSummary
  /** Draws pressed, for the filter row. */
  selected?: boolean
  /** Shows the usage figure after the name. Filter row only. */
  count?: boolean
  /** Makes the whole chip a button. Without it the chip is inert text. */
  onClick?: () => void
  /** Adds a × at the trailing edge. Independent of `onClick`. */
  onRemove?: () => void
  disabled?: boolean
}

/**
 * One tag, in its own colour.
 *
 * The colour is the point. A row of eight identically grey labels carries no
 * more at a glance than eight words would, and the register's whole reason for
 * having tags is that a shelf can be read rather than parsed. It arrives as an
 * inline `--tag-colour` from the record's stored hex — the same arrangement as
 * `--folder-colour` on the tiles, and for the same reason: the palette belongs
 * to the operator, so no stylesheet can know it ahead of time.
 *
 * Drawn as a tint and a rule rather than a solid fill. Solid chips at this size
 * read as buttons and pull far more attention than a label deserves, and eight
 * saturated blocks in a row would overwhelm the one accent the surrounding
 * panel is allowed.
 */
export function TagChip({
  tag,
  selected = false,
  count = false,
  onClick,
  onRemove,
  disabled = false
}: TagChipProps): ReactNode {
  const style = { '--tag-colour': tag.colour } as CSSProperties

  const body = (
    <>
      <span className={styles.chipDot} aria-hidden="true" />
      <span className={styles.chipName}>{tag.name}</span>
      {count ? <span className={styles.chipCount}>{tag.usageCount}</span> : null}
    </>
  )

  /*
   * A removable chip is a span holding a button, never a button holding one.
   * Nesting interactive elements is invalid and browsers resolve the click
   * target inconsistently — which here would mean × sometimes toggling the
   * filter instead of detaching the tag.
   */
  return (
    <span className={styles.chip} style={style} data-selected={selected || undefined}>
      {onClick ? (
        <button
          type="button"
          className={styles.chipBody}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onClick}
        >
          {body}
        </button>
      ) : (
        <span className={styles.chipBody}>{body}</span>
      )}

      {onRemove ? (
        <button
          type="button"
          className={styles.chipRemove}
          aria-label={`Remove ${tag.name}`}
          title={`Remove ${tag.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}
