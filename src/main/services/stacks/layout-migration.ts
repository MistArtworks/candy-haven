import { dirname, join } from 'node:path'
import type { Db } from 'mongodb'
import {
  PROJECTS_DIRECTORY_NAME,
  RELEASE_MASTERED_TRACKS_DIRECTORY_NAME,
  WRAPPER_DIRECTORY_NAME
} from '@shared/domain/stacks.constants'
import { Collections } from '@main/services/archive/schema'
import { getLogger } from '@main/core/logger'
import { ensureDirectory, moveDirectory, pathExists, rewritePath } from './filesystem'

const logger = getLogger('stacks:layout')

/**
 * The category existing shelves are moved into.
 *
 * Neutral on purpose. The operator's genres were made before categories
 * existed, so nothing about them says which category they belong to, and
 * guessing would put a name on the operator's work that they did not choose.
 * It is an ordinary folder record — renaming it is the same gesture as renaming
 * anything else in the tree.
 */
const DEFAULT_CATEGORY_NAME = 'GENERAL'

interface FolderDocument {
  _id: string
  parentId: string | null
  name: string
  kind?: string
  path: string
  colour: string
  order: number
  favourite: boolean
  trashedAt: number | null
  trashedFrom: string | null
  createdAt: number
  updatedAt: number
}

/**
 * Moves an archive built on the old layout onto `Candy Haven\Projects`.
 *
 * The tree used to hang directly off the wrapper with genres as its top level.
 * It now sits inside `Projects`, one level further down, with a category above
 * every genre. That is a change to *directories on disk*, not only to records,
 * which is why this lives beside the filesystem helpers rather than in
 * `schema.ts` — but it is triggered by the schema version, because it must
 * happen exactly once and before anything reads the tree.
 *
 * Disk first, database second, as everywhere else in this service: a move that
 * fails leaves the records describing where the directories actually still are.
 *
 * Idempotent by inspection rather than by flag: if every live top-level folder
 * already sits directly inside `Projects`, this returns without touching
 * anything. That matters more than it sounds — the schema version is only
 * recorded once the *whole* migration chain succeeds, so a later step failing
 * means this one runs again on the next launch. It did exactly that during
 * development, and the first version of it was not in fact idempotent; see the
 * note on deriving the wrapper below.
 */
export async function migrateToProjectsLayout(db: Db): Promise<void> {
  const folders = db.collection<FolderDocument>(Collections.ArchiveFolders)
  const projects = db.collection(Collections.Projects)

  const live = await folders.find({ trashedAt: null }).toArray()
  const roots = live.filter((folder) => folder.parentId === null)

  if (roots.length === 0) {
    // Nothing filed yet. `setup()` makes the new primitives for a fresh
    // archive, and there is no wrapper path to derive from here anyway.
    logger.info('No shelves to migrate')
    return
  }

  /*
   * The wrapper is the ancestor actually *named* `Candy Haven`.
   *
   * The first version of this took `dirname(roots[0].path)`, reasoning that a
   * top-level folder sat directly inside the wrapper by definition. True before
   * this migration has run, and false immediately after: a top-level folder
   * then sits inside `Projects`, so a second run derived the wrapper as
   * `Candy Haven\Projects`, built `Projects\Projects` beneath it, and filed
   * the category it had just made into a fresh one. The claim of idempotency
   * was wrong in exactly the case idempotency is for — a re-run after an
   * interrupted first attempt.
   *
   * Naming the segment cannot drift that way: however deep a folder has been
   * pushed, the wrapper is the `Candy Haven` in its path. Reading it from the
   * records rather than from settings is still deliberate, so this does not
   * depend on the settings service having hydrated and works on an archive
   * whose filing root has since been re-pointed.
   */
  const wrapper = wrapperOf(roots[0].path)

  if (!wrapper) {
    logger.warn(`Cannot locate the wrapper from ${roots[0].path}; leaving the tree alone`)
    return
  }

  const projectsRoot = join(wrapper, PROJECTS_DIRECTORY_NAME)

  // Case-insensitive: Windows, and a path stored with different casing than the
  // one derived here is the same directory.
  const stranded = roots.filter(
    (folder) => dirname(folder.path).toLowerCase() !== projectsRoot.toLowerCase()
  )
  if (stranded.length === 0) {
    logger.info('Shelves are already inside Projects')
    return
  }

  logger.warn(`Moving ${stranded.length} shelves into ${PROJECTS_DIRECTORY_NAME}`)

  await ensureDirectory(projectsRoot)
  await ensureDirectory(join(wrapper, RELEASE_MASTERED_TRACKS_DIRECTORY_NAME))

  const now = Date.now()
  const categoryPath = join(projectsRoot, DEFAULT_CATEGORY_NAME)
  await ensureDirectory(categoryPath)

  // Reuse a category record if a previous run got this far, so re-running does
  // not leave two folders describing one directory — `folder_path_unique`
  // would refuse the second anyway.
  const existingCategory = await folders.findOne({ path: categoryPath })
  const categoryId = existingCategory?._id ?? crypto.randomUUID()

  if (!existingCategory) {
    await folders.insertOne({
      _id: categoryId,
      parentId: null,
      name: DEFAULT_CATEGORY_NAME,
      kind: 'category',
      path: categoryPath,
      colour: stranded[0]?.colour ?? '#554e42',
      order: 0,
      favourite: false,
      trashedAt: null,
      trashedFrom: null,
      createdAt: now,
      updatedAt: now
    })
  }

  for (const folder of stranded) {
    const destination = join(categoryPath, folder.name)

    // A directory that is gone is not a reason to abandon the rest. The record
    // is re-pointed regardless; the scan reports it missing, which is the same
    // answer it would have given before this ran.
    if (await pathExists(folder.path)) {
      await moveDirectory(folder.path, destination)
    } else {
      logger.warn(`${folder.name} is not on disk; re-pointing the record only`)
    }

    /*
     * Everything beneath the moved directory is re-pointed by prefix, both
     * folders and projects. Same mechanism as `cascadePaths()` — the files are
     * byte-identical and keep their timestamps, so there is nothing to re-read.
     *
     * Matching is case-insensitive on the prefix because these are Windows
     * paths that may have been stored with different casing than they were
     * walked with.
     */
    const prefix = folder.path
    const descendants = live.filter((entry) =>
      entry.path.toLowerCase().startsWith(`${prefix.toLowerCase()}\\`)
    )

    await folders.updateOne(
      { _id: folder._id },
      { $set: { parentId: categoryId, kind: 'genre', path: destination, updatedAt: now } }
    )

    for (const descendant of descendants) {
      await folders.updateOne(
        { _id: descendant._id },
        {
          $set: {
            kind: descendant.kind ?? 'folder',
            path: rewritePath(descendant.path, prefix, destination),
            updatedAt: now
          }
        }
      )
    }

    const filed = await projects
      .find({ path: { $regex: `^${escapeRegex(prefix)}\\\\`, $options: 'i' } })
      .toArray()

    for (const project of filed) {
      await projects.updateOne(
        { _id: project._id },
        { $set: { path: rewritePath(project.path as string, prefix, destination), updatedAt: now } }
      )
    }

    logger.info(`Moved ${folder.name} -> ${destination} (${filed.length} projects re-pointed)`)
  }
}

/** Escapes a literal path for use inside a Mongo `$regex`. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The `Candy Haven` ancestor of a path, or null if there is not one.
 *
 * Matched case-insensitively: these are Windows paths, and the same directory
 * can be stored with different casing than it was walked with.
 */
function wrapperOf(path: string): string | null {
  const separator = String.fromCharCode(92)
  const parts = path.split(separator)
  const index = parts.findIndex(
    (part) => part.toLowerCase() === WRAPPER_DIRECTORY_NAME.toLowerCase()
  )

  return index < 0 ? null : parts.slice(0, index + 1).join(separator)
}
