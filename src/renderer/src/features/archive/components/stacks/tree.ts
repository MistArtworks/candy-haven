import type { ArchiveFolder } from '@shared/domain/stacks'

/**
 * Reading the filing tree.
 *
 * The tree arrives as a flat list of folders carrying `parentId`, which is how
 * it is stored and how a rename cascade is easiest to express. These are the
 * few derivations the browser needs to render it. A tree is tens of folders, so
 * all of this is plain array work rather than an index.
 */

/** Direct children of a folder, or the top level with `null`. */
export function childrenOf(
  folders: readonly ArchiveFolder[],
  parentId: string | null
): ArchiveFolder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * The path from the top of the tree down to a folder, inclusive.
 *
 * Bounded rather than recursive: a corrupt record whose parent chain loops
 * would otherwise hang the render, and a breadcrumb that gives up is far better
 * than a page that never paints.
 */
export function trailTo(folders: readonly ArchiveFolder[], id: string | null): ArchiveFolder[] {
  if (!id) return []

  const trail: ArchiveFolder[] = []
  let current = folders.find((folder) => folder.id === id)

  while (current && trail.length < 32) {
    trail.unshift(current)
    current = current.parentId
      ? folders.find((folder) => folder.id === current?.parentId)
      : undefined
  }

  return trail
}

/** How many sub-folders each folder has, keyed by folder id. */
export function childCountsOf(folders: readonly ArchiveFolder[]): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const folder of folders) {
    if (!folder.parentId) continue
    counts[folder.parentId] = (counts[folder.parentId] ?? 0) + 1
  }

  return counts
}

/**
 * Every folder in reading order, for the "File to…" menu.
 *
 * Sorted by full path so a folder always follows its parent, which is the
 * only ordering that lets a flat list stand in for a tree without indentation
 * the menu has no room for.
 */
export function inReadingOrder(folders: readonly ArchiveFolder[]): ArchiveFolder[] {
  return [...folders].sort((a, b) => a.path.localeCompare(b.path))
}
