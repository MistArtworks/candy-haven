import {
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { motion } from 'motion/react'
import { gridVariants, panelVariants } from '@renderer/motion/transitions'
import { useArtwork } from '@renderer/hooks/useProjects'
import { ArchiveIcon, type ArchiveMark } from '../icons/ArchiveIcon'
import { resolveRange } from '../../lib/marking'
import {
  FOLDER_DRAG_TYPE,
  PROJECT_DRAG_TYPE,
  beginDrag,
  hasLeftElement,
  isDragging,
  readDragAll
} from '../stacks/dnd'
import styles from '../stacks/stacks.module.scss'

/**
 * One thing the operator can open.
 *
 * Generalised out of the old `FolderGrid`, which knew about `ArchiveFolder`
 * directly. Every lens now draws large tiles — shelves, volumes, releases,
 * projects — and they should be the same object at the same size rather than
 * four grids that merely resemble each other. So the grid takes a flat
 * descriptor and knows nothing about the domain.
 */
/**
 * One mark on a tile's second line.
 *
 * A shelf's caption is a sentence — "3 projects · 1 folder" — and a string is
 * the right shape for it. A project's caption is a *set of separate facts*,
 * each of which wants its own treatment: a tag carries a colour the operator
 * picked, and a tempo is a figure that should be set in the readout face beside
 * every other figure in the console. Joining those into one grey string was
 * what threw both away.
 */
export interface TileFacet {
  label: string
  /** Operator-picked chip colour. Drawn plain when absent. */
  colour?: string
  /** A figure rather than a label: set in the monospace readout face. */
  readout?: boolean
}

export interface Tile {
  id: string
  mark: ArchiveMark
  name: string
  /** Second line. Empty renders as "Empty" rather than a bare zero. */
  detail?: string
  /**
   * Structured second line, drawn instead of `detail` when present.
   *
   * Both are kept because both are right somewhere: folders, volumes and the
   * bin all caption themselves with a sentence, and only projects have facets.
   * An empty array still falls back to `detail`, so a project with no tags,
   * tempo or key is captioned rather than blank.
   */
  facets?: readonly TileFacet[]
  colour?: string
  favourite?: boolean
  /** Full path or other identifier, shown as the native tooltip. */
  title?: string
  /** Marks the shelf the browser is standing in; opens the folder lid. */
  open?: boolean
  /** Accepts a dropped project. Folders that may hold projects set this. */
  acceptsProjects?: boolean
  /** Accepts a dropped folder, re-parenting it. */
  acceptsFolders?: boolean
  /** Can itself be dragged onto another tile. */
  draggableAs?: 'folder' | 'project'
  /**
   * Cover art to draw in place of the mark, when the object has any.
   *
   * Optional and usually absent: a project acquires artwork late, if at all.
   * Where it exists it is far more identifying than a generic set mark, and
   * where it does not the mark is a better answer than an empty frame — which
   * is why this replaces the mark rather than sitting beside it.
   */
  coverPath?: string | null
}

/**
 * A "make something here" tile, drawn after the real ones.
 *
 * A list rather than one optional label, because a shelf can hold two kinds of
 * new thing — a folder and a project — and the second used to be a lone button
 * sitting under the grid. Creating a folder and creating a project are the same
 * gesture at the same place, so they belong in the same row of tiles rather
 * than one being a tile and the other a stray control beneath it.
 */
export interface AddTile {
  label: string
  mark: ArchiveMark
  onClick: () => void
  disabled?: boolean
}

export interface TileGridProps {
  tiles: readonly Tile[]
  /**
   * Opens the tile. Double click, Enter, or Space.
   *
   * Separate from selection because a grid of objects behaves like a file
   * browser: one click says *which* one, two says *go*. Opening on a single
   * click meant every attempt to look at a folder's colour or read its second
   * line navigated away from the shelf instead.
   */
  onOpen: (id: string) => void
  /** The tile a single click marked. Null when nothing is selected. */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /**
   * Tiles picked out for a bulk move. Distinct from `selectedId`, which is the
   * cursor: this is the set that a drag from any of them will carry.
   */
  marked?: ReadonlySet<string>
  /** Ctrl/Cmd-click. `additive` false replaces the set with this one tile. */
  onMark?: (id: string, additive: boolean) => void
  /**
   * Shift-click: mark everything between the last marked tile and this one.
   *
   * Separate from `onMark` because the grid is what knows the *order* tiles are
   * drawn in, and a range is defined by that order rather than by anything the
   * owner of the set can see. The grid resolves the span and hands over the
   * finished list.
   */
  onMarkRange?: (ids: readonly string[]) => void
  onMenu?: (event: MouseEvent<HTMLElement>, id: string) => void
  /** A project was dropped onto a tile. */
  onDropProject?: (projectId: string, tileId: string) => void
  /** A folder was dropped onto a tile, re-parenting it. */
  onDropFolder?: (folderId: string, tileId: string) => void
  /**
   * Several things were dropped onto a tile.
   *
   * Takes precedence over the two single-item handlers where it is supplied,
   * so a caller does not have to implement both. A drag of one arrives here as
   * a list of one.
   */
  onDropMany?: (projectIds: readonly string[], folderIds: readonly string[], tileId: string) => void
  /**
   * Tiles as a grid of squares, or as a single column of rows.
   *
   * The tiles themselves are identical either way — same marks, same swatch,
   * same drop and drag behaviour — and only the grid's own layout changes.
   * That is the point: INTAKE offers both, and a drag must not behave
   * differently depending on which the operator is looking at.
   */
  layout?: 'grid' | 'rows'
  /** Trailing "new …" tiles. Omitted draws none. */
  adds?: readonly AddTile[]
  /** Omitted leaves the corner mark passive rather than clickable. */
  onToggleFavourite?: (id: string) => void
  disabled?: boolean
}

/**
 * The shelves.
 *
 * Extra-large tiles, one mark per object, name beneath. Deliberately the
 * largest thing in the department: a tile here is a place the operator goes,
 * not a row they scan, and the brief's preference for one unmistakable focal
 * object over a dense field applies at component scale too.
 *
 * Both drop directions are handled — a project files into a folder, a folder
 * nests under another — which is why a tile inspects the drag's *type* rather
 * than assuming what it is carrying.
 */
export function TileGrid({
  tiles,
  onOpen,
  onMenu,
  selectedId,
  onSelect,
  onDropProject,
  onDropFolder,
  onDropMany,
  marked,
  onMark,
  onMarkRange,
  layout = 'grid',
  adds,
  onToggleFavourite,
  disabled = false
}: TileGridProps): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  /** Where a Shift-click measures from. The last tile deliberately touched. */
  const [anchor, setAnchor] = useState<string | null>(null)

  /**
   * Every draggable tile between the anchor and `id`, inclusive.
   *
   * Restricted to tiles of the same kind as the target, so shift-clicking
   * across a shelf that mixes folders and projects selects a coherent set
   * rather than one the drag would then have to split. Falls back to the single
   * tile when there is no anchor yet, which makes the first Shift-click behave
   * as an ordinary mark instead of doing nothing.
   */
  const rangeTo = (id: string): string[] => {
    const kind = tiles.find((tile) => tile.id === id)?.draggableAs
    if (!kind) return []

    // Narrowed to tiles of the same kind before the span is measured, so
    // shift-clicking across a shelf that mixes folders and projects selects a
    // coherent set rather than one the drag would then have to split.
    const eligible = tiles.filter((tile) => tile.draggableAs === kind).map((tile) => tile.id)
    return resolveRange(eligible, anchor, id)
  }

  const onDrop = (event: DragEvent<HTMLElement>, tile: Tile): void => {
    event.preventDefault()
    /*
     * The grid sits inside a panel that is itself a drop target for the folder
     * currently open. Without this, dropping on a tile would file the project
     * twice — once into the tile, then again into the shelf underneath it as
     * the event bubbled — and the second move would race the first.
     */
    event.stopPropagation()
    setHovered(null)
    setDragging(null)
    if (disabled) return

    const projectIds = tile.acceptsProjects ? readDragAll(event, PROJECT_DRAG_TYPE) : []
    // A folder dropped on itself is the commonest misfire of this gesture and
    // means nothing; the service would refuse it, but not silently.
    const folderIds = tile.acceptsFolders
      ? readDragAll(event, FOLDER_DRAG_TYPE).filter((id) => id !== tile.id)
      : []

    if (projectIds.length === 0 && folderIds.length === 0) return

    if (onDropMany) {
      onDropMany(projectIds, folderIds, tile.id)
      return
    }

    // Single-item callers that never opted into bulk still work.
    if (projectIds[0]) onDropProject?.(projectIds[0], tile.id)
    else if (folderIds[0]) onDropFolder?.(folderIds[0], tile.id)
  }

  const accepts = (event: DragEvent<HTMLElement>, tile: Tile): boolean =>
    (tile.acceptsProjects === true && isDragging(event, PROJECT_DRAG_TYPE)) ||
    (tile.acceptsFolders === true && isDragging(event, FOLDER_DRAG_TYPE))

  return (
    <motion.div
      className={styles.grid}
      data-layout={layout}
      // Once anything is marked, every box stays visible rather than appearing
      // on hover — mid-selection the operator is comparing what is ticked
      // against what is not, and boxes that vanish make that impossible.
      data-marking={(marked?.size ?? 0) > 0 || undefined}
      variants={gridVariants}
      initial="initial"
      animate="animate"
    >
      {tiles.map((tile) => (
        <motion.article
          key={tile.id}
          variants={panelVariants}
          className={styles.tile}
          style={{ '--folder-colour': tile.colour ?? 'var(--ch-concrete-500)' } as CSSProperties}
          role="button"
          tabIndex={0}
          draggable={!disabled && tile.draggableAs !== undefined}
          data-drop={hovered === tile.id || undefined}
          data-dragging={dragging === tile.id || undefined}
          data-selected={selectedId === tile.id || undefined}
          data-marked={marked?.has(tile.id) || undefined}
          title={tile.title ?? tile.name}
          onClick={(event) => {
            /*
             * Shift marks a run, Ctrl/Cmd marks one, a plain click navigates.
             *
             * Shift is checked first because a range is what the operator means
             * when they hold both, and it is the gesture that makes a bulk
             * migration bearable — marking twelve projects with Ctrl is twelve
             * deliberate clicks, which is the work this was meant to remove.
             */
            /*
             * Both chords are gated on the tile being pickable, and that gate
             * is load-bearing rather than tidiness.
             *
             * A tile with no `draggableAs` is not a thing this grid can move:
             * in INTAKE a folder is a *directory to walk into*, and its id is a
             * filesystem path rather than a record id. Marking one put a path
             * into a set the filing call then reads as a project id — so the
             * grid drew a folder as marked, counted it, and offered to file
             * something that could not be filed.
             *
             * The checkbox has always been gated this way, which is why the
             * mismatch only appeared via the keyboard chords.
             */
            const pickable = tile.draggableAs !== undefined

            if (event.shiftKey && pickable && onMarkRange) {
              event.preventDefault()
              onMarkRange(rangeTo(tile.id))
              return
            }

            if ((event.ctrlKey || event.metaKey) && pickable && onMark) {
              event.preventDefault()
              onMark(tile.id, true)
              // Remembered so a following Shift-click has somewhere to measure
              // from. Anchoring on the last *marked* tile rather than the last
              // clicked one is what makes Ctrl-then-Shift behave.
              setAnchor(tile.id)
              return
            }

            // A modifier on a tile that cannot be picked up does nothing at
            // all, rather than falling through to open it — the operator was
            // reaching for a selection, not for navigation.
            if ((event.ctrlKey || event.metaKey || event.shiftKey) && !pickable) {
              event.preventDefault()
              return
            }

            if (onSelect) onSelect(tile.id)
            else onOpen(tile.id)
            setAnchor(tile.id)
          }}
          onDoubleClick={() => onOpen(tile.id)}
          // Right-clicking selects as well, so the menu that appears is
          // visibly attached to something.
          onContextMenu={(event) => {
            onSelect?.(tile.id)
            onMenu?.(event, tile.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(tile.id)
            }
          }}
          /*
            Capture-phase handlers throughout, because this is a motion
            component and motion claims the plain `onDragStart` / `onDragEnd`
            names for its own pointer-drag gesture — a handler passed under
            those names would be swallowed rather than reaching the DOM. The
            other drag events are not motion props and pass through as normal.
          */
          onDragStartCapture={(event) => {
            if (!tile.draggableAs) return
            setDragging(tile.id)

            /*
             * A drag from a marked tile carries every marked tile of the same
             * kind; a drag from anywhere else carries only itself and leaves
             * the marks alone.
             *
             * That asymmetry is deliberate. It means a bulk move cannot happen
             * by accident — the operator has to have marked the very tile they
             * then pick up — while an ordinary drag of one thing behaves
             * exactly as it always has, marks or no marks.
             */
            const kind = tile.draggableAs
            const ids =
              marked?.has(tile.id) === true
                ? tiles
                    .filter((entry) => entry.draggableAs === kind && marked.has(entry.id))
                    .map((entry) => entry.id)
                : [tile.id]

            beginDrag(event, kind === 'folder' ? FOLDER_DRAG_TYPE : PROJECT_DRAG_TYPE, ids)
          }}
          onDragEndCapture={() => {
            setDragging(null)
            setHovered(null)
          }}
          onDragOver={(event) => {
            if (disabled || !accepts(event, tile)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setHovered(tile.id)
          }}
          onDragLeave={(event) => {
            if (hasLeftElement(event)) setHovered(null)
          }}
          onDrop={(event) => onDrop(event, tile)}
        >
          {/*
            The corner mark is the control, not a badge.

            It used to appear only once something was already a favourite, which
            left the right-click menu as the only way to make one — a gesture
            nobody finds by looking. Drawn always, faint when off, it is
            discoverable on the object it applies to.

            `stopPropagation` because the whole tile is a button: without it,
            marking a favourite would also walk into the folder.
          */}
          {onToggleFavourite ? (
            <button
              type="button"
              className={styles.tilePin}
              data-on={tile.favourite || undefined}
              aria-pressed={tile.favourite ?? false}
              aria-label={tile.favourite ? 'Remove favourite' : 'Favourite'}
              title={tile.favourite ? 'Remove favourite' : 'Favourite'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavourite(tile.id)
              }}
            >
              ◆
            </button>
          ) : tile.favourite ? (
            <span className={styles.tilePin} data-on aria-label="Favourite">
              ◆
            </span>
          ) : null}

          {/*
            The checkbox, for tiles that can be picked up.

            Marking worked before this and was invisible: Ctrl-click did the
            job and nothing on screen said so, which made a bulk migration a
            piece of folklore rather than a feature. The chords still work —
            they are faster once known — but the box is what makes them
            findable, and it is the only way to mark without a modifier.

            `stopPropagation` rather than `preventDefault` alone: the tile
            itself is a button, and without it a click on the box would mark
            and *then* navigate.
          */}
          {onMark && tile.draggableAs && !disabled ? (
            <button
              type="button"
              className={styles.tileCheck}
              role="checkbox"
              aria-checked={marked?.has(tile.id) ?? false}
              aria-label={`Mark ${tile.name}`}
              title={`Mark ${tile.name}`}
              onClick={(event) => {
                event.stopPropagation()
                // Shift extends from the anchor even when the gesture began on
                // the box, so the two ways of marking behave the same.
                if (event.shiftKey && onMarkRange) {
                  onMarkRange(rangeTo(tile.id))
                  return
                }
                onMark(tile.id, true)
                setAnchor(tile.id)
              }}
            >
              <span className={styles.tileCheckMark} aria-hidden="true" />
            </button>
          ) : null}

          <TileMark tile={tile} />
          <span className={styles.tileName}>{tile.name}</span>
          {tile.facets && tile.facets.length > 0 ? (
            <TileFacets facets={tile.facets} />
          ) : (
            <span className={styles.tileCount}>{tile.detail || 'Empty'}</span>
          )}
        </motion.article>
      ))}

      {(adds ?? []).map((add) => (
        <motion.button
          key={add.label}
          type="button"
          variants={panelVariants}
          className={`${styles.tile} ${styles.addTile}`}
          onClick={add.onClick}
          disabled={disabled || add.disabled}
        >
          <ArchiveIcon mark={add.mark} className={styles.tileIcon} />
          <span className={styles.tileName}>{add.label}</span>
          <span className={styles.tileCount}>&nbsp;</span>
        </motion.button>
      ))}
    </motion.div>
  )
}
/**
 * A tile's second and third lines: its figures, then its tags.
 *
 * Two rows rather than one, and the order is the point. Tempo and key are what
 * every project has and what the eye scans down a shelf comparing, so they hold
 * the fixed position directly under the name. Tags are the operator's own
 * labels, vary in number from none to several, and carry colour — putting them
 * on the same line pushed the figures to a different horizontal position on
 * every tile, which is exactly what makes a column unscannable.
 *
 * Partitioned here rather than by the caller, so a caller supplies one flat
 * list of facts and this decides how they are set.
 */
function TileFacets({ facets }: { facets: readonly TileFacet[] }): ReactNode {
  const readouts = facets.filter((facet) => facet.readout)
  const tags = facets.filter((facet) => !facet.readout)

  return (
    <span className={styles.tileFacets}>
      {readouts.length > 0 ? (
        <span className={styles.tileMeta}>
          {readouts.map((facet) => (
            <span key={facet.label} className={styles.tileReadout}>
              {facet.label}
            </span>
          ))}
        </span>
      ) : null}

      {tags.length > 0 ? (
        <span className={styles.tileTags}>
          {tags.map((facet) => (
            <span
              key={facet.label}
              className={styles.tileTag}
              // Set as a custom property rather than a colour, so the chip can
              // derive both its rule and its wash from the one value the
              // operator picked.
              style={facet.colour ? ({ '--tag-colour': facet.colour } as CSSProperties) : undefined}
            >
              {facet.label}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}

/**
 * A tile's artwork, or its mark.
 *
 * Split into its own component because `useArtwork` is a hook and the grid maps
 * over its tiles — calling it inside that loop would break the rules of hooks
 * the moment the number of tiles changed, which for a folder being filled is
 * every few seconds.
 */
function TileMark({ tile }: { tile: Tile }): ReactNode {
  const dataUrl = useArtwork(tile.coverPath ?? null, 160)

  if (dataUrl) {
    return <img src={dataUrl} alt="" className={styles.tileArt} draggable={false} />
  }

  return <ArchiveIcon mark={tile.mark} open={tile.open} className={styles.tileIcon} />
}
