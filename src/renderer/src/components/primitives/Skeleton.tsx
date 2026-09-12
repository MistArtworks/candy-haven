import type { CSSProperties, ReactNode } from 'react'
import styles from './Skeleton.module.scss'

export interface SkeletonProps {
  /** CSS width. Defaults to filling the container. */
  width?: string
  /** CSS height. Defaults to one line of body text. */
  height?: string
  className?: string
}

/**
 * A slab standing in for something still being read.
 *
 * Deliberately not the usual rounded grey pill. Corners are square, as they are
 * everywhere in this console, and the sweep is a single band of alabaster at
 * low opacity crossing obsidian — the same material the thing it replaces will
 * be drawn in. A placeholder that does not belong to the palette announces
 * itself as a loading widget; this one reads as the panel arriving.
 *
 * Marked `aria-hidden`. A screen reader should be told *that* something is
 * loading, once, by the container — not handed nine empty boxes. Every helper
 * below is wrapped in a region that carries the announcement.
 */
export function Skeleton({ width, height, className }: SkeletonProps): ReactNode {
  const style: CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height

  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.bone} ${className}` : styles.bone}
      style={style}
    />
  )
}

export interface SkeletonRegionProps {
  /** Announced to assistive technology while the region is in place. */
  label: string
  children: ReactNode
  className?: string
}

/**
 * The announcement wrapper every skeleton composition sits in.
 *
 * `aria-busy` rather than a live region: the content is *about* to exist in
 * this same place, so the correct statement is "this region is busy", not a
 * separate message that would then need retracting when the data lands.
 */
export function SkeletonRegion({ label, children, className }: SkeletonRegionProps): ReactNode {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  )
}

export interface SkeletonTextProps {
  /** How many lines to draw. */
  lines?: number
  label?: string
}

/** A paragraph's worth of lines, the last one short as real text usually is. */
export function SkeletonText({ lines = 3, label = 'Loading' }: SkeletonTextProps): ReactNode {
  return (
    <SkeletonRegion label={label} className={styles.text}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '58%' : '100%'} />
      ))}
    </SkeletonRegion>
  )
}

export interface SkeletonTilesProps {
  /** How many plates to draw. */
  count?: number
  label?: string
}

/**
 * A grid of plates, matching the register's own tile grid.
 *
 * The count is a guess at what is coming and does not need to be right — what
 * matters is that the grid is already the right shape, so the real tiles
 * replace these in place instead of the page reflowing around them.
 */
export function SkeletonTiles({ count = 8, label = 'Loading' }: SkeletonTilesProps): ReactNode {
  return (
    <SkeletonRegion label={label} className={styles.tiles}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.tile} aria-hidden="true">
          <Skeleton width="34px" height="34px" />
          <Skeleton width="70%" height="9px" />
          <Skeleton width="45%" height="8px" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

export interface SkeletonRowsProps {
  count?: number
  label?: string
}

/** Ledger rows, for the list view and any other table. */
export function SkeletonRows({ count = 8, label = 'Loading' }: SkeletonRowsProps): ReactNode {
  return (
    <SkeletonRegion label={label} className={styles.rows}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.row} aria-hidden="true">
          <Skeleton width="15px" height="15px" />
          {/*
            Widths vary per row rather than being uniform. A column of
            identical bars reads as a progress bar chart; uneven ones read as
            names, which is what will actually land here.
          */}
          <Skeleton width={`${38 + ((index * 13) % 34)}%`} height="9px" />
          <Skeleton width="56px" height="8px" />
        </div>
      ))}
    </SkeletonRegion>
  )
}
