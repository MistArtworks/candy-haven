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
import {
  FOLDER_DRAG_TYPE,
  PROJECT_DRAG_TYPE,
  beginDrag,
  hasLeftElement,
  isDragging,
  readDrag
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
export interface Tile {
  id: string
  mark: ArchiveMark
  name: string
  /** Second line. Empty renders as "Empty" rather than a bare zero. */
  detail?: string
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
  onMenu?: (event: MouseEvent<HTMLElement>, id: string) => void
  /** A project was dropped onto a tile. */
  onDropProject?: (projectId: string, tileId: string) => void
  /** A folder was dropped onto a tile, re-parenting it. */
  onDropFolder?: (folderId: string, tileId: string) => void
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
  adds,
  onToggleFavourite,
  disabled = false
}: TileGridProps): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

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

    if (tile.acceptsProjects) {
      const projectId = readDrag(event, PROJECT_DRAG_TYPE)
      if (projectId) {
        onDropProject?.(projectId, tile.id)
        return
      }
    }

    if (tile.acceptsFolders) {
      const folderId = readDrag(event, FOLDER_DRAG_TYPE)
      // A folder dropped on itself is the commonest misfire of this gesture and
      // means nothing; the service would refuse it, but not silently.
      if (folderId && folderId !== tile.id) onDropFolder?.(folderId, tile.id)
    }
  }

  const accepts = (event: DragEvent<HTMLElement>, tile: Tile): boolean =>
    (tile.acceptsProjects === true && isDragging(event, PROJECT_DRAG_TYPE)) ||
    (tile.acceptsFolders === true && isDragging(event, FOLDER_DRAG_TYPE))

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
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
          title={tile.title ?? tile.name}
          onClick={() => (onSelect ? onSelect(tile.id) : onOpen(tile.id))}
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
            beginDrag(
              event,
              tile.draggableAs === 'folder' ? FOLDER_DRAG_TYPE : PROJECT_DRAG_TYPE,
              tile.id
            )
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
          <TileMark tile={tile} />
          <span className={styles.tileName}>{tile.name}</span>
          <span className={styles.tileCount}>{tile.detail || 'Empty'}</span>
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
