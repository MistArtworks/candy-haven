import type { ArchiveFolder } from '@shared/domain/stacks'

/**
 * Tree arithmetic for the vestibule's shelf picker.
 *
 * Separate from `ShelfBrowser` so that file exports a component and nothing
 * else — Fast Refresh cannot swap a module that mixes the two, and a stale
 * plain function is a much worse failure than a reload.
 */

/**
 * Whether a project may be filed here.
 *
 * `VALID_CHILD_KINDS` puts genres and artists under a category and projects
 * under those, so a category is always somewhere you pass through. The service
 * refuses one outright in `refuseCategoryAsShelf`; this is the UI agreeing with
 * it rather than inventing a rule of its own.
 */
export function canShelveIn(folder: ArchiveFolder | null): boolean {
  return folder !== null && folder.kind !== 'category'
}

/** The chain from the root down to `id`, root-first. */
export function trailTo(
  folders: readonly ArchiveFolder[],
  id: string | null
): readonly ArchiveFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const trail: ArchiveFolder[] = []

  let cursor = id
  /*
   * Bounded, though the tree's own depth limit is six.
   *
   * A cycle in stored parent ids is not supposed to be possible, but the cost
   * of being wrong about that is a hung window rather than a wrong breadcrumb,
   * and this runs on the one surface that has to come up before anything else.
   */
  let guard = 0
  while (cursor && guard < 16) {
    const folder = byId.get(cursor)
    if (!folder) break
    trail.unshift(folder)
    cursor = folder.parentId
    guard += 1
  }

  return trail
}
