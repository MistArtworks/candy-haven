import { Fragment, useCallback, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { ProjectSummary } from '@shared/domain/projects'
import { Panel } from '@renderer/components/primitives/Panel'
import { getStage } from '@shared/domain/projects.constants'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { TileGrid, type Tile } from './tiles/TileGrid'
import { describeFolder } from './tiles/describe'
import { FolderTrail } from './stacks/FolderTrail'
import { PROJECT_DRAG_TYPE, hasLeftElement, isDragging, readDragAll } from './stacks/dnd'
import shelf from './stacks/stacks.module.scss'
import styles from './IntakeView.module.scss'
import { SkeletonTiles } from '@renderer/components/primitives/Skeleton'

const SEPARATOR = String.fromCharCode(92)

interface BrowsedEntry {
  path: string
  name: string
  isProject: boolean
  projects: number
  children: number
}

export interface IntakeViewProps {
  /** Configured source locations, as the operator set them in REGULATION. */
  roots: readonly string[]
  folders: readonly ArchiveFolder[]
  /** Registered projects, so a browsed folder can be matched to its record. */
  projects: readonly ProjectSummary[]
  onFile: (
    projectIds: readonly string[],
    folderIds: readonly string[],
    folderId: string | null
  ) => void
  /** How the source pane draws. The same entries and handlers either way. */
  view: 'list' | 'grid'
  disabled?: boolean
}

/**
 * Where work comes in: source on the left, archive on the right.
 *
 * Named INTAKE rather than MIGRATION. A migration is something a database has
 * once; this is what an archive does whenever material arrives, which is the
 * relationship the operator actually has with it. The word also says which
 * direction the work moves, where "migration" is silent about it.
 *
 * The left pane browses **real directories** rather than the register, and that
 * is the whole reason it exists. The register could already list what had been
 * indexed, but a flat list of project names says nothing about how the drive is
 * organised, and how it is organised is most of what the operator is thinking
 * about when deciding where something belongs.
 *
 * Both panes are drawn with the department's own furniture — `TileGrid`,
 * `FolderTrail`, `Panel` — rather than a layout of their own. An earlier build
 * hand-rolled both, and it showed: tile marks were `ArchiveGlyph` scaled up to
 * 28px, which is the 16-unit field drawn at twice the size it is hinted for,
 * and the destination pane's breadcrumb was a bare "← back" row. Two grids that
 * merely resemble each other is exactly what `TileGrid` was generalised out of
 * `FolderGrid` to prevent.
 */
export function IntakeView({
  roots,
  folders,
  projects,
  onFile,
  view,
  disabled = false
}: IntakeViewProps): ReactNode {
  const [chosen, setChosen] = useState<string | null>(null)
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set())
  const [destination, setDestination] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  /*
   * Derived rather than synced. `roots` is empty on the first render and
   * arrives a tick later once settings hydrate; mirroring that into state would
   * mean an effect writing state on every change, and a flash of "no locations
   * configured" before the real answer.
   */
  const source = chosen ?? roots[0] ?? null

  /*
   * Through React Query, as every other read in this app is. It handles the
   * ordering hazard for free: a fast double-navigation cannot paint the
   * previous directory over the current one, because each path is its own cache
   * entry rather than a race between two promises writing one state.
   */
  const {
    data: entries = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['browse', source],
    queryFn: (): Promise<BrowsedEntry[]> => window.candy.projects.browse(source as string),
    enabled: source !== null,
    // A directory listing is only as true as the moment it was read, and the
    // operator is about to move things around in it.
    staleTime: 0
  })

  const byPath = useMemo(
    () => new Map(projects.map((project) => [project.path.toLowerCase(), project])),
    [projects]
  )

  /** Every id the register holds, so a filing call can refuse anything else. */
  const knownProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects])

  /*
   * One tile per entry, in the department's own vocabulary.
   *
   * A directory that holds a set is a `project` mark; anything else is a
   * `folder` mark and can be walked into. The tile's id is the *record* id
   * where one exists, because that is what filing takes — and the path
   * otherwise, which is enough to navigate by and not enough to drag.
   */
  const tiles = useMemo<Tile[]>(
    () =>
      entries.map((entry) => {
        const record = entry.isProject ? byPath.get(entry.path.toLowerCase()) : undefined

        return {
          id: record?.id ?? entry.path,
          mark: entry.isProject ? 'project' : 'folder',
          name: entry.name,
          /*
           * Captioned exactly as a shelf tile is — `describeFolder` and the
           * stage badge's own wording — so a directory on the left and a shelf
           * on the right read as the same kind of object at the same size.
           *
           * The one departure is NOT INDEXED, which is not a state a shelf can
           * be in: it says why the tile cannot be picked up, which is the only
           * question the operator will have about it.
           */
          detail: entry.isProject
            ? record
              ? getStage(record.stage).label
              : 'NOT INDEXED'
            : describeFolder(entry.projects, entry.children),
          colour: record?.colour,
          title: entry.path,
          coverPath: null,
          // Only a project the register knows can be picked up. One it has
          // never seen has no record to file, and inventing one here would do
          // the scan's job badly.
          draggableAs: record && !disabled ? 'project' : undefined
        }
      }),
    [entries, byPath, disabled]
  )

  const openTile = useCallback(
    (id: string) => {
      const entry = entries.find((candidate) => candidate.path === id)
      // A path id is a directory to walk into; a record id is a project, and
      // opening one from here would take the operator out of the view they are
      // working in.
      if (entry && !entry.isProject) setChosen(entry.path)
    },
    [entries]
  )

  /*
   * Single click selects, double click opens — as STACKS has always behaved.
   *
   * This pane used to open a folder on a *single* click, because it had no
   * notion of a selected tile to fall back to. That made it the one grid in the
   * department with different rules, and the cost landed on exactly the gesture
   * this view is for: a click meant to mark or merely to look at a folder
   * navigated away from the one being worked in instead.
   *
   * Supplying `onSelect` is what moves opening onto the double click, because
   * `TileGrid` only opens on a single click when nothing else claims it.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const toggleMarked = useCallback((id: string, additive: boolean) => {
    setMarked((current) => {
      if (!additive) return current.has(id) && current.size === 1 ? new Set() : new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** Shift-click. The grid resolved the span; this adds it to what is marked. */
  const markRange = useCallback((ids: readonly string[]) => {
    setMarked((current) => new Set([...current, ...ids]))
  }, [])

  /** Every project in this folder that the register knows, so can be filed. */
  const markableIds = useMemo(
    () => tiles.filter((tile) => tile.draggableAs === 'project').map((tile) => tile.id),
    [tiles]
  )

  const allMarked = markableIds.length > 0 && markableIds.every((id) => marked.has(id))

  const toggleAll = useCallback(() => {
    setMarked((current) => {
      const every = markableIds.length > 0 && markableIds.every((id) => current.has(id))
      return every ? new Set() : new Set(markableIds)
    })
  }, [markableIds])

  /*
   * Marks are dropped when the operator walks somewhere else.
   *
   * A set carried across a navigation would be invisible — the tiles it refers
   * to are no longer on screen — and would then be filed by the next drag from
   * a folder that has nothing to do with it. Keyed on `source` rather than on
   * the click handler so it holds however the operator navigates: a tile, the
   * breadcrumb, or a root arriving underneath them.
   *
   * React's documented "adjusting state when a prop changes" pattern, as
   * `ConsoleLayout` uses for its transition direction: comparing against the
   * previous value during render and setting immediately. React discards the
   * in-progress render and re-runs before touching the DOM, so no extra frame
   * is committed — where an effect would clear the marks one paint *after* the
   * new folder had already drawn them.
   */
  const [markedIn, setMarkedIn] = useState(source)

  if (markedIn !== source) {
    setMarkedIn(source)
    setMarked(new Set())
    // The cursor goes with them. A tile selected in the folder just left is not
    // on screen, and leaving it set would carry a stale highlight into a grid
    // that happens to reuse the id.
    setSelectedId(null)
  }

  /*
   * The walk from the configured location down to where the operator is.
   *
   * A breadcrumb rather than the raw path and a back arrow. The arrow was a
   * bare character with no box and no label, sitting beside a path that looked
   * like a readout — so three levels down there was no visible way back, and
   * the honest report was "no option to go back" even though the control was
   * on screen.
   *
   * The destination pane has had a proper trail all along, because it borrows
   * the shelves'. This builds the same thing from path segments and borrows
   * the same styles, so the two panes navigate identically.
   */
  const crumbs = useMemo(() => {
    const root = roots.find((candidate) => isUnder(source, candidate))
    if (!source || !root) return []

    const label = labelRoots(roots)[root]
    const rest = source.slice(root.length).split(SEPARATOR).filter(Boolean)

    let walked = root
    return [
      { path: root, name: label },
      ...rest.map((segment) => {
        walked = walked + SEPARATOR + segment
        return { path: walked, name: segment }
      })
    ]
  }, [source, roots])

  // -------------------------------------------------------------- destination

  const trail = useMemo(() => {
    const crumbs: ArchiveFolder[] = []
    let cursor = destination

    while (cursor) {
      const folder = folders.find((entry) => entry.id === cursor)
      if (!folder) break
      crumbs.unshift(folder)
      cursor = folder.parentId
    }

    return crumbs
  }, [destination, folders])

  const shelves = useMemo<Tile[]>(
    () =>
      folders
        .filter((folder) => folder.parentId === destination)
        .map((folder) => ({
          id: folder.id,
          mark: folder.kind,
          name: folder.name,
          detail: describeFolder(
            projects.filter((project) => project.folderId === folder.id).length,
            folders.filter((child) => child.parentId === folder.id).length
          ),
          colour: folder.colour,
          title: folder.path,
          // A category holds genres and artists, never work — so it is a place
          // to walk through here rather than a place to drop on.
          acceptsProjects: folder.kind !== 'category'
        })),
    [folders, destination, projects]
  )

  /*
   * What is already on the shelf being looked at.
   *
   * The pane drew only shelves, so a project filed successfully vanished from
   * the view that filed it — INTAKE could put work somewhere and then show
   * nothing there, which reads as the move having failed. The shelves lens has
   * always drawn folders and projects in one grid; this does the same.
   *
   * Draggable, so a project put on the wrong shelf can be moved to the right
   * one without leaving the view. Dropping it back on the pane it is already
   * filed in is a no-op the service resolves.
   */
  const filed = useMemo<Tile[]>(
    () =>
      destination === null
        ? []
        : projects
            .filter((project) => project.folderId === destination)
            .map((project) => ({
              id: project.id,
              mark: 'project' as const,
              name: project.name,
              detail: getStage(project.stage).label,
              colour: project.colour,
              favourite: project.favourite,
              title: project.path,
              coverPath: project.coverPath,
              draggableAs: 'project' as const
            })),
    [projects, destination]
  )

  const filedHere = filed.length

  const fileHere = (projectIds: readonly string[], folderId: string | null): void => {
    if (disabled) return

    /*
     * Narrowed to ids the register actually knows, rather than trusted.
     *
     * A folder in the source pane is identified by its *path*, because it has
     * no record to be identified by — so anything reaching this call that is
     * not a registered project would be sent to the service as a project id
     * and come back as a failure naming a path. The grid no longer lets a
     * folder be marked, and this makes that a property of the filing call as
     * well as of the gesture.
     *
     * Checked against the whole register rather than against the source pane's
     * own tiles: a drop can originate in *either* pane — a project already on a
     * shelf can be dragged onto a different one — and the destination pane's
     * tiles are not in the source pane's list.
     */
    const filable = projectIds.filter((id) => knownProjectIds.has(id))
    if (filable.length === 0) return

    onFile(filable, [], folderId)
    setMarked(new Set())
  }

  /*
   * The whole pane is the drop target for the shelf currently open.
   *
   * It was a strip along the foot reading FILE INTO <shelf>, which made the
   * commonest action in the view — put this on the shelf I am standing in —
   * the one needing the most aim. The pane *is* the destination; asking the
   * operator to hit a band inside it was asking them to hit the label rather
   * than the thing it labelled.
   *
   * Shelf tiles still win over the pane beneath them: `TileGrid` stops a tile
   * drop from bubbling, so aiming at a shelf files into that shelf and aiming
   * anywhere else files into the open one.
   *
   * Not offered at the root, where no shelf is open — "file into all
   * categories" would mean unfiling, which is where these projects already are.
   */
  const acceptsDrop = !disabled && destination !== null

  const onDropIntoOpen = (event: DragEvent<HTMLElement>): void => {
    setDropping(false)
    if (!acceptsDrop) return
    if (!isDragging(event, PROJECT_DRAG_TYPE)) return

    event.preventDefault()
    fileHere(readDragAll(event, PROJECT_DRAG_TYPE), destination)
  }

  return (
    <div className={styles.split}>
      <Panel
        label="On disk"
        index="01"
        className={styles.pane}
        aside={labelFor(source, roots)}
        flush
      >
        <div className={styles.body}>
          {roots.length > 1 ? (
            <div className={styles.roots}>
              {roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  className={styles.root}
                  data-selected={isUnder(source, root) || undefined}
                  {...tooltipTrigger(root)}
                  onClick={() => setChosen(root)}
                >
                  {labelRoots(roots)[root]}
                </button>
              ))}
            </div>
          ) : null}

          {source ? (
            <nav className={shelf.trail} aria-label="Folder trail">
              {crumbs.map((crumb, index) => (
                <Fragment key={crumb.path}>
                  {index > 0 ? (
                    <span className={shelf.crumbSeparator} aria-hidden="true">
                      ▸
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={shelf.crumb}
                    data-current={index === crumbs.length - 1 || undefined}
                    {...tooltipTrigger(crumb.path)}
                    onClick={() => setChosen(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                </Fragment>
              ))}

              <span className={shelf.trailSpacer} />
              <span className={shelf.trailCount}>
                {entries.filter((entry) => entry.isProject).length} project
                {entries.filter((entry) => entry.isProject).length === 1 ? '' : 's'} here
              </span>
            </nav>
          ) : null}

          {/*
            The selection bar: what is marked, and the way to file it.

            Marking existed before this and was invisible — Ctrl-click worked,
            nothing said so, and the only way to act on a marked set was still
            to drag one of its members. So a migration of twelve projects was
            twelve drags, which is the work this view was built to remove.

            Drawn only once something is marked, so the pane is unchanged for
            the single-project case that dragging already handles well. `MARK
            ALL` is always offered, because it is also the discovery: it is how
            an operator finds out the view has a selection at all.
          */}
          {markableIds.length > 0 ? (
            <div className={styles.selection} data-active={marked.size > 0 || undefined}>
              <button
                type="button"
                className={styles.selectAll}
                onClick={toggleAll}
                disabled={disabled}
              >
                {allMarked ? 'Clear all' : 'Mark all'}
              </button>

              {marked.size > 0 ? (
                <>
                  <span className={styles.selectionCount}>
                    {marked.size} marked
                    {/* Named so the gesture is learnable rather than folklore. */}
                    <span className={styles.selectionHint}>
                      Tick, Ctrl-click to add · Shift-click for a run
                    </span>
                  </span>

                  <button
                    type="button"
                    className={styles.selectionFile}
                    disabled={disabled || destination === null}
                    {...tooltipTrigger(
                      destination === null
                        ? 'Open a shelf in the right-hand pane first'
                        : `File ${marked.size} into ${trail.at(-1)?.name ?? 'this shelf'}`
                    )}
                    onClick={() => fileHere([...marked], destination)}
                  >
                    File {marked.size} into {trail.at(-1)?.name?.toUpperCase() ?? 'SHELF'}
                  </button>
                </>
              ) : (
                <span className={styles.selectionHint}>
                  Tick a tile to mark · Ctrl-click or Shift-click for a run · Double-click to open
                </span>
              )}
            </div>
          ) : null}

          {!source ? (
            <Empty
              title="No locations set."
              hint="INTAKE browses the folders you point it at. Add one under REGULATION → ARCHIVE → FILING and it appears here."
            />
          ) : error ? (
            <Empty title="Could not read that folder." hint={String(error)} />
          ) : isLoading ? (
            // Drawn as the grid that is coming rather than as a word. Walking
            // into a folder is the most-repeated gesture in this view, so the
            // pane flashing empty between each step was the most-repeated jolt.
            <div className={styles.scroll}>
              <SkeletonTiles count={6} label="Reading the folder" />
            </div>
          ) : entries.length === 0 ? (
            <Empty title="Nothing here." hint="No projects and no folders to walk into." />
          ) : (
            <div className={styles.scroll}>
              <TileGrid
                tiles={tiles}
                onOpen={openTile}
                selectedId={selectedId}
                onSelect={setSelectedId}
                marked={marked}
                onMark={toggleMarked}
                onMarkRange={markRange}
                layout={view === 'grid' ? 'grid' : 'rows'}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </Panel>

      <Panel
        label="Into the archive"
        index="02"
        className={styles.pane}
        aside={trail.at(-1)?.name.toUpperCase() ?? 'ALL CATEGORIES'}
        flush
      >
        <div
          className={styles.body}
          data-drop={dropping || undefined}
          onDragOver={(event) => {
            if (!acceptsDrop || !isDragging(event, PROJECT_DRAG_TYPE)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropping(true)
          }}
          onDragLeave={(event) => {
            if (hasLeftElement(event)) setDropping(false)
          }}
          onDrop={onDropIntoOpen}
        >
          {/*
            The same breadcrumb the shelves use, and for the same reason: every
            crumb is a drop target, so a project can be filed at any level of
            the walk without navigating back to it first.
          */}
          <FolderTrail
            trail={trail}
            onNavigate={setDestination}
            onFileProject={(projectId, folderId) => fileHere([projectId], folderId)}
            shown={filedHere}
          />

          {shelves.length === 0 && filed.length === 0 ? (
            <Empty
              title={destination === null ? 'No categories yet.' : 'Nothing on this shelf yet.'}
              hint={
                destination === null
                  ? 'Build the tree in STACKS first — a category, then the genres and artists inside it.'
                  : 'Drop anywhere in this pane to file into this shelf, or walk back up the trail.'
              }
            />
          ) : (
            <div className={styles.scroll}>
              {/*
                Shelves first, then what is filed on this one — the same order
                the STACKS lens draws, so walking into a genre shows the same
                arrangement in both places.
              */}
              <TileGrid
                tiles={[...shelves, ...filed]}
                onOpen={(id) => {
                  // Only a shelf opens. A project tile here is a readout of
                  // what landed, and opening its dossier would take the
                  // operator out of the view they are filing in.
                  if (shelves.some((shelf) => shelf.id === id)) setDestination(id)
                }}
                onDropMany={(projectIds, _folderIds, tileId) => {
                  if (shelves.some((shelf) => shelf.id === tileId)) fileHere(projectIds, tileId)
                }}
                disabled={disabled}
              />
            </div>
          )}

          {/*
            Says what releasing will do, and is not itself a target —
            `pointer-events: none`, so it cannot intercept the drop it is
            describing. Drawn only while a drag is over the pane: standing
            instructions are chrome, where this is an answer.
          */}
          {dropping ? (
            <p className={styles.dropHint} aria-hidden="true">
              File into {trail.at(-1)?.name}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}

function Empty({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {hint ? <p className={styles.emptyHint}>{hint}</p> : null}
    </div>
  )
}

/** The short name of the location being browsed, for the panel's aside. */
function labelFor(source: string | null, roots: readonly string[]): string | undefined {
  if (!source) return undefined
  const root = roots.find((candidate) => isUnder(source, candidate))
  return root ? labelRoots(roots)[root].toUpperCase() : undefined
}

/**
 * Whether `path` is `root` or sits beneath it.
 *
 * Compared on a segment boundary rather than with a bare `startsWith`, which
 * would call `C:\MusicOld` a child of `C:\Music` and light up the wrong tab.
 */
function isUnder(path: string | null, root: string): boolean {
  if (!path) return false
  const target = path.toLowerCase()
  const parent = root.toLowerCase().replace(/\\+$/, '')
  return target === parent || target.startsWith(parent + SEPARATOR)
}

/**
 * The shortest trailing segments that tell each root apart from the others.
 *
 * The last segment alone is usually the whole answer, but two configured
 * locations very often end in the same word — a filing root at
 * `C:\Users\hanee\Music` beside a source at `C:\Users\hanee\Desktop\Music` gave
 * two tabs both saying MUSIC, which reads as a duplicate rather than a choice.
 */
function labelRoots(roots: readonly string[]): Record<string, string> {
  const parts = new Map(roots.map((root) => [root, root.split(SEPARATOR).filter(Boolean)]))
  const labels: Record<string, string> = {}

  for (const root of roots) {
    const own = parts.get(root) as string[]

    for (let depth = 1; depth <= own.length; depth += 1) {
      const candidate = own.slice(-depth).join(SEPARATOR)
      const clashes = roots.some(
        (other) =>
          other !== root &&
          (parts.get(other) as string[]).slice(-depth).join(SEPARATOR).toLowerCase() ===
            candidate.toLowerCase()
      )

      if (!clashes || depth === own.length) {
        labels[root] = candidate
        break
      }
    }
  }

  return labels
}
