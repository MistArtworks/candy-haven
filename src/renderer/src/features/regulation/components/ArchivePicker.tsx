import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { ArchiveFolder } from '@shared/domain/stacks'
import { FOLDER_KIND_LABEL } from '@shared/domain/stacks.constants'
import { targetKey, type Pin } from '@shared/domain/strip'
import { useStacksTree } from '@renderer/hooks/useStacks'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { Button } from '@renderer/components/primitives/Button'
import { trailTo } from '@renderer/features/vestibule/components/shelf-tree'
import styles from '../RegulationPage.module.scss'

/** Projects listed at once; the search narrows the rest. */
const PROJECT_ROWS = 10

/** One row of the picker: a stack or a project, and the pin it would make. */
interface Choice {
  pin: Pin
  name: string
  colour: string
  /** Its kind (a stack) or its stack (a project). */
  note: string
  /** How far in it sits, for a stack listed as the tree. */
  depth: number
}

/**
 * A stack or a project from the ARCHIVE, to pin to the strip.
 *
 * Stacks are listed as the tree they are, each under its parent; projects by
 * name, the most recently worked on first. Typing narrows either; Enter pins
 * the first that isn't pinned yet, and Escape puts the picker away.
 */
export function ArchivePicker({
  want,
  pinned,
  onPick,
  onCancel
}: {
  want: 'stack' | 'project'
  /** `targetKey`s of what's pinned already. */
  pinned: ReadonlySet<string>
  onPick: (pin: Pin) => void
  onCancel: () => void
}): ReactNode {
  const [search, setSearch] = useState('')
  const tree = useStacksTree()
  const registry = useProjectRegistry({})
  const folders = useMemo(() => tree.data?.folders ?? [], [tree.data])

  const { choices, more } = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const trail = (id: string | null): string =>
      trailTo(folders, id)
        .map((folder) => folder.name)
        .join(' › ')

    if (want === 'stack') {
      const listed = needle
        ? folders
            .filter((folder) => folder.name.toLowerCase().includes(needle))
            .map((folder) => ({ folder, depth: 0 }))
        : treeOrder(folders)
      return {
        choices: listed.map(({ folder, depth }) => ({
          pin: {
            id: crypto.randomUUID(),
            label: folder.name.slice(0, 80),
            target: { kind: 'stack', folderId: folder.id }
          },
          name: folder.name,
          colour: folder.colour,
          note:
            needle && folder.parentId
              ? `${FOLDER_KIND_LABEL[folder.kind]} · ${trail(folder.parentId)}`
              : FOLDER_KIND_LABEL[folder.kind],
          depth
        })) satisfies Choice[],
        more: 0
      }
    }

    const projects = registry.data?.projects ?? []
    const found = needle
      ? projects.filter((project) => project.name.toLowerCase().includes(needle))
      : [...projects].sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)
    return {
      choices: found.slice(0, PROJECT_ROWS).map((project) => ({
        pin: {
          id: crypto.randomUUID(),
          label: project.name.slice(0, 80),
          target: { kind: 'project', projectId: project.id }
        },
        name: project.name,
        colour: project.colour,
        note: trail(project.folderId) || 'UNFILED',
        depth: 0
      })) satisfies Choice[],
      more: Math.max(0, found.length - PROJECT_ROWS)
    }
  }, [want, search, folders, registry.data])

  const isPinned = (choice: Choice): boolean => pinned.has(targetKey(choice.pin.target))
  const first = choices.find((choice) => !isPinned(choice))
  const loading = want === 'stack' ? tree.isLoading : registry.isLoading
  const failed = want === 'stack' ? tree.isError : registry.isError

  return (
    <div
      className={styles.pinPicker}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <input
        className={styles.pinName}
        value={search}
        autoFocus
        maxLength={80}
        placeholder={want === 'stack' ? 'Find a stack' : 'Find a project'}
        aria-label={want === 'stack' ? 'Find a stack' : 'Find a project'}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && first) onPick(first.pin)
        }}
      />

      {loading ? <p className={styles.controlHint}>Reading the ARCHIVE…</p> : null}
      {failed ? (
        <p className={styles.controlHint}>The ARCHIVE couldn&apos;t be read. Is it connected?</p>
      ) : null}
      {!loading && !failed && choices.length === 0 ? (
        <p className={styles.controlHint}>
          {search.trim()
            ? `No ${want} by that name.`
            : want === 'stack'
              ? 'The ARCHIVE has no stacks yet.'
              : 'The ARCHIVE holds no projects yet.'}
        </p>
      ) : null}

      {choices.length ? (
        <ul className={styles.pinPickerList}>
          {choices.map((choice) => {
            const held = isPinned(choice)
            return (
              <li key={targetKey(choice.pin.target)}>
                <button
                  type="button"
                  className={styles.pinPickerItem}
                  style={{ '--depth': choice.depth } as CSSProperties}
                  disabled={held}
                  onClick={() => onPick(choice.pin)}
                >
                  <span
                    className={styles.pinPickerChip}
                    style={{ background: choice.colour }}
                    aria-hidden="true"
                  />
                  <span className={styles.pinPickerName}>{choice.name}</span>
                  <span className={styles.pinPickerNote}>{held ? 'PINNED' : choice.note}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className={styles.pinPickerFoot}>
        <span className={styles.pinPickerNote}>
          {more > 0 ? `${more} more; narrow the search` : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The stacks as the tree they are: each parent, then what's filed in it. */
function treeOrder(folders: readonly ArchiveFolder[]): { folder: ArchiveFolder; depth: number }[] {
  const children = new Map<string | null, ArchiveFolder[]>()
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? []
    siblings.push(folder)
    children.set(folder.parentId, siblings)
  }

  const listed: { folder: ArchiveFolder; depth: number }[] = []
  const walk = (parentId: string | null, depth: number): void => {
    const siblings = [...(children.get(parentId) ?? [])].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name)
    )
    for (const folder of siblings) {
      listed.push({ folder, depth })
      // Bounded, as trailTo is: a cycle would otherwise hang the page.
      if (depth < 16) walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return listed
}
