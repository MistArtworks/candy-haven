import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { ProjectSummary } from '@shared/domain/projects'
import { Panel } from '@renderer/components/primitives/Panel'
import { getStage } from '@shared/domain/projects.constants'
import { TileGrid, type Tile } from './tiles/TileGrid'
import { describeFolder } from './tiles/describe'
import { FolderTrail } from './stacks/FolderTrail'
import { PROJECT_DRAG_TYPE, hasLeftElement, isDragging, readDragAll } from './stacks/dnd'
import styles from './IntakeView.module.scss'

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

  const toggleMarked = useCallback((id: string, additive: boolean) => {
    setMarked((current) => {
      if (!additive) return current.has(id) && current.size === 1 ? new Set() : new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isRoot =
    source !== null && roots.some((root) => root.toLowerCase() === source.toLowerCase())

  const up = (): void => {
    if (!source || isRoot) return
    setChosen(source.slice(0, source.lastIndexOf(SEPARATOR)) || null)
  }

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

  /** Projects filed at the level the destination pane is standing on. */
  const filedHere = useMemo(
    () => projects.filter((project) => project.folderId === destination).length,
    [projects, destination]
  )

  const fileHere = (projectIds: readonly string[], folderId: string | null): void => {
    if (disabled || projectIds.length === 0) return
    onFile(projectIds, [], folderId)
    setMarked(new Set())
  }

  const onDropIntoOpen = (event: DragEvent<HTMLElement>): void => {
    setDropping(false)
    if (disabled || destination === null) return
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
                  title={root}
                  onClick={() => setChosen(root)}
                >
                  {labelRoots(roots)[root]}
                </button>
              ))}
            </div>
          ) : null}

          {source ? (
            <div className={styles.trail}>
              <button type="button" className={styles.up} disabled={isRoot} onClick={up}>
                ◂
              </button>
              <span className={styles.trailPath} title={source}>
                {source}
              </span>
              <span className={styles.trailCount}>
                {entries.filter((entry) => entry.isProject).length} projects
              </span>
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
            <Empty title="Reading…" />
          ) : entries.length === 0 ? (
            <Empty title="Nothing here." hint="No projects and no folders to walk into." />
          ) : (
            <div className={styles.scroll}>
              <TileGrid
                tiles={tiles}
                onOpen={openTile}
                marked={marked}
                onMark={toggleMarked}
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
        <div className={styles.body}>
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

          {shelves.length === 0 ? (
            <Empty
              title={destination === null ? 'No categories yet.' : 'Nothing on this shelf.'}
              hint={
                destination === null
                  ? 'Build the tree in STACKS first — a category, then the genres and artists inside it.'
                  : 'Drop here to file into this shelf, or go back and choose another.'
              }
            />
          ) : (
            <div className={styles.scroll}>
              <TileGrid
                tiles={shelves}
                onOpen={setDestination}
                onDropMany={(projectIds, _folderIds, tileId) => fileHere(projectIds, tileId)}
                disabled={disabled}
              />
            </div>
          )}

          {/*
            The open shelf is a drop target in its own right, which is what
            makes "file into the folder I am standing in" possible when it has
            no sub-shelves to aim at.
          */}
          {destination !== null ? (
            <div
              className={styles.here}
              data-drop={dropping || undefined}
              onDragOver={(event) => {
                if (disabled || !isDragging(event, PROJECT_DRAG_TYPE)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropping(true)
              }}
              onDragLeave={(event) => {
                if (hasLeftElement(event)) setDropping(false)
              }}
              onDrop={onDropIntoOpen}
            >
              File into {trail.at(-1)?.name}
            </div>
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
