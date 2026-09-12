import { useCallback, useState, type DragEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { ProjectSummary } from '@shared/domain/projects'
import { FOLDER_KIND_LABEL } from '@shared/domain/stacks.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { ArchiveGlyph } from './icons/ArchiveGlyph'
import { PROJECT_DRAG_TYPE, beginDrag, hasLeftElement, isDragging, readDragAll } from './stacks/dnd'
import styles from './MigrationView.module.scss'

interface BrowsedEntry {
  path: string
  name: string
  isProject: boolean
  hasChildren: boolean
}

export interface MigrationViewProps {
  /** Configured source roots, as the operator set them in REGULATION. */
  roots: readonly string[]
  folders: readonly ArchiveFolder[]
  /** Registered projects, so a browsed folder can be matched to its record. */
  projects: readonly ProjectSummary[]
  onFile: (
    projectIds: readonly string[],
    folderIds: readonly string[],
    folderId: string | null
  ) => void
  disabled?: boolean
}

/**
 * Source on the left, archive on the right, and the work is dragging across.
 *
 * The left pane browses **real directories** rather than the register. That is
 * the whole reason it exists: UNFILED could already list what had been indexed,
 * but a flat list of project names says nothing about how the operator's drive
 * is actually organised, and how it is organised is most of what they are
 * thinking about when deciding where something belongs.
 *
 * Only folders the register already knows can be dragged. A directory holding a
 * `.als` that has never been scanned has no record to file, and inventing one
 * here would duplicate the scan's job badly — the panel says so rather than
 * offering a drag that would fail.
 */
export function MigrationView({
  roots,
  folders,
  projects,
  onFile,
  disabled = false
}: MigrationViewProps): ReactNode {
  const [chosen, setChosen] = useState<string | null>(null)
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set())
  const [destination, setDestination] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  /*
   * Derived rather than synced. `roots` is empty on the first render and
   * arrives a tick later once settings hydrate, and mirroring that into state
   * would mean an effect that writes state on every change — the thing that
   * produces a render cascade and, here, a flash of "no locations configured"
   * before the real answer.
   */
  const source = chosen ?? roots[0] ?? null
  const setSource = setChosen

  /*
   * Through React Query, as every other read in this app is. It handles the
   * ordering hazard for free: a fast double-navigation cannot paint the
   * previous directory over the current one, because each path is its own
   * cache entry rather than a race between two promises writing one state.
   */
  const {
    data: entries = [],
    isLoading: loading,
    error
  } = useQuery({
    queryKey: ['browse', source],
    queryFn: (): Promise<BrowsedEntry[]> => window.candy.projects.browse(source as string),
    enabled: source !== null,
    // A directory listing is only as true as the moment it was read, and the
    // operator is about to move things around in it.
    staleTime: 0
  })

  const failed = error ? (error instanceof Error ? error.message : String(error)) : null

  const recordFor = useCallback(
    (path: string): ProjectSummary | undefined =>
      projects.find((project) => project.path.toLowerCase() === path.toLowerCase()),
    [projects]
  )

  const children = useCallback(
    (parentId: string | null) => folders.filter((folder) => folder.parentId === parentId),
    [folders]
  )

  const isRoot =
    source !== null && roots.some((root) => root.toLowerCase() === source.toLowerCase())

  const up = (): void => {
    if (!source || isRoot) return
    setSource(source.slice(0, source.lastIndexOf('\\')) || null)
  }

  const onDrop = (event: DragEvent<HTMLElement>, folderId: string): void => {
    event.preventDefault()
    event.stopPropagation()
    setHovered(null)
    if (disabled) return

    const ids = readDragAll(event, PROJECT_DRAG_TYPE)
    if (ids.length > 0) onFile(ids, [], folderId)
    setMarked(new Set())
  }

  return (
    <div className={styles.split}>
      <Panel
        label="On disk"
        index="01"
        icon={<ArchiveGlyph name="scan" />}
        aside={source ? undefined : 'NO ROOTS'}
      >
        <div className={styles.pane}>
          {roots.length > 1 ? (
            <div className={styles.roots}>
              {roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  className={styles.root}
                  data-selected={source?.startsWith(root) || undefined}
                  onClick={() => setSource(root)}
                >
                  {root.split('\\').filter(Boolean).pop() ?? root}
                </button>
              ))}
            </div>
          ) : null}

          {source ? (
            <div className={styles.trail} title={source}>
              <button type="button" className={styles.up} disabled={isRoot} onClick={up}>
                ←
              </button>
              <span className={styles.trailPath}>{source}</span>
            </div>
          ) : null}

          {!source ? (
            <p className={styles.empty}>
              No locations configured. Add one in REGULATION → ARCHIVE.
            </p>
          ) : failed ? (
            <p className={styles.empty}>{failed}</p>
          ) : loading ? (
            <p className={styles.empty}>Reading…</p>
          ) : entries.length === 0 ? (
            <p className={styles.empty}>Nothing in this folder.</p>
          ) : (
            <ul className={styles.list}>
              {entries.map((entry) => {
                const record = entry.isProject ? recordFor(entry.path) : undefined
                const draggable = record !== undefined && !disabled

                return (
                  <li
                    key={entry.path}
                    className={styles.entry}
                    data-project={entry.isProject || undefined}
                    data-marked={(record && marked.has(record.id)) || undefined}
                    draggable={draggable}
                    onDragStart={(event) => {
                      if (!record) return
                      const ids = marked.has(record.id) ? [...marked] : [record.id]
                      beginDrag(event, PROJECT_DRAG_TYPE, ids)
                    }}
                    onClick={(event) => {
                      if (entry.hasChildren && !entry.isProject) {
                        setSource(entry.path)
                        return
                      }
                      if (!record) return
                      setMarked((current) => {
                        const next = new Set(event.ctrlKey || event.metaKey ? current : [])
                        if (next.has(record.id)) next.delete(record.id)
                        else next.add(record.id)
                        return next
                      })
                    }}
                  >
                    <ArchiveGlyph
                      name={entry.isProject ? 'set' : 'shelf'}
                      className={styles.entryMark}
                    />
                    <span className={styles.entryName}>{entry.name}</span>
                    {entry.isProject && !record ? (
                      <span className={styles.entryNote} title="Run a scan to register it">
                        NOT INDEXED
                      </span>
                    ) : null}
                    {!entry.isProject && entry.hasChildren ? (
                      <span className={styles.entryNote}>›</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Panel>

      <Panel label="Into the archive" index="02" icon={<ArchiveGlyph name="shelf" />}>
        <div className={styles.pane}>
          <p className={styles.hint}>
            Drop onto a shelf to file there. Ctrl-click on the left to pick out several first.
          </p>

          {folders.length === 0 ? (
            <p className={styles.empty}>
              No categories yet. Make one in GENRES and it appears here.
            </p>
          ) : (
            <ul className={styles.tree}>
              {children(destination).map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={styles.shelf}
                    data-drop={hovered === folder.id || undefined}
                    style={{ ['--folder-colour' as string]: folder.colour }}
                    onClick={() => setDestination(folder.id)}
                    onDragOver={(event) => {
                      if (disabled || !isDragging(event, PROJECT_DRAG_TYPE)) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setHovered(folder.id)
                    }}
                    onDragLeave={(event) => {
                      if (hasLeftElement(event)) setHovered(null)
                    }}
                    onDrop={(event) => onDrop(event, folder.id)}
                  >
                    <span className={styles.shelfKind}>{FOLDER_KIND_LABEL[folder.kind]}</span>
                    <span className={styles.shelfName}>{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {destination ? (
            <button
              type="button"
              className={styles.up}
              onClick={() =>
                setDestination(folders.find((entry) => entry.id === destination)?.parentId ?? null)
              }
            >
              ← back
            </button>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}
