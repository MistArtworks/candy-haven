import { cp, mkdir, readdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'

const logger = getLogger('stacks:filesystem')

/**
 * Every disk operation the filing tree performs, in one place.
 *
 * Filing moves the operator's actual Ableton project folders, which is the most
 * destructive thing this application does. The rules that make that safe are
 * therefore collected here rather than spread through the service:
 *
 *   - nothing is ever overwritten or merged; a collision is refused outright
 *   - a directory is never removed recursively while it still holds anything
 *   - a cross-volume move copies, verifies, and only then deletes the source
 *   - a file held open by Ableton Live produces a hint saying exactly that
 *
 * Nothing here touches the database. The service pairs each of these with the
 * matching record write.
 */

// ---------------------------------------------------------------- inspection

/** Case-insensitive, as Windows paths are. */
function normalise(path: string): string {
  return resolve(path).toLowerCase()
}

export function samePath(left: string, right: string): boolean {
  return normalise(left) === normalise(right)
}

/**
 * Whether `child` sits underneath `parent`.
 *
 * Compared through `relative` rather than `startsWith`, so `C:\Work\Mix` is not
 * treated as living inside `C:\Work\Mixdowns`.
 */
export function pathIsInside(child: string, parent: string): boolean {
  const rel = relative(normalise(parent), normalise(child))
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Entries directly inside a directory. Empty when it does not exist. */
export async function listEntries(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

// ------------------------------------------------------------------ creation

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/**
 * Creates a directory that must not already exist.
 *
 * `recursive: false` is the point: a silent success on an existing directory
 * would let two folder records claim one directory on disk.
 */
export async function createDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  try {
    await mkdir(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AppError(`A folder called “${basenameOf(path)}” is already there.`, {
        code: ErrorCode.Validation,
        hint: 'Pick a different name, or file into the existing folder.',
        recoverable: false
      })
    }
    throw translate(error, path)
  }
}

function basenameOf(path: string): string {
  return path.split(sep).filter(Boolean).pop() ?? path
}

// -------------------------------------------------------------------- moving

/**
 * Moves a directory, with every guard the operation warrants.
 *
 * Same-volume moves are a `rename`: atomic, instant, and timestamp-preserving,
 * which matters because the scanner reuses a stored `.als` analysis only while
 * modification time and size are unchanged. A move that reset mtimes would turn
 * the next launch scan into a full re-read of every set in the project.
 */
export async function moveDirectory(from: string, to: string): Promise<void> {
  if (samePath(from, to)) return

  if (pathIsInside(to, from)) {
    throw new AppError('A folder cannot be moved inside itself.', {
      code: ErrorCode.Validation,
      recoverable: false
    })
  }

  if (!(await directoryExists(from))) {
    throw new AppError('That folder is no longer on disk.', {
      code: ErrorCode.NotFound,
      hint: 'Run a scan to bring the register back in step with the filesystem.',
      recoverable: true
    })
  }

  if (await pathExists(to)) {
    throw new AppError(`Something called “${basenameOf(to)}” is already in that folder.`, {
      code: ErrorCode.Validation,
      hint: 'Rename one of them first — nothing is merged or overwritten automatically.',
      recoverable: false
    })
  }

  await mkdir(dirname(to), { recursive: true })

  try {
    await rename(from, to)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw translate(error, from)
  }

  // Different volume. `rename` cannot span devices, so this is copy-then-delete
  // — and the delete only happens once the copy has been proven complete.
  logger.info(`Cross-volume move, copying: ${from} -> ${to}`)
  await copyAcrossVolumes(from, to)
}

/**
 * Copies a tree to another volume, verifies it, and only then removes the source.
 *
 * Verification compares file count and total bytes. It is not a checksum — that
 * would mean reading tens of gigabytes of samples twice — but it catches the
 * failure that actually happens here: a copy interrupted part way by a full
 * disk, a disconnected drive or a locked file. A mismatch leaves the original
 * exactly where it was and removes the partial copy, so the worst outcome is a
 * refused move rather than a half-moved project.
 */
async function copyAcrossVolumes(from: string, to: string): Promise<void> {
  const source = await measureTree(from)

  try {
    await cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      /*
       * The scanner's analysis cache is keyed on modification time, so copying
       * with fresh timestamps would cost a full re-read of every set in the
       * project on the next scan.
       *
       * This preserves them to the millisecond but not beyond: `utimes` drops
       * the fractional millisecond that `mtimeMs` reports, so a set moved
       * across drives is read once more and then matches from then on. Worth
       * noting rather than working around — the alternative is loosening the
       * cache's equality test for every project to spare a one-time re-read of
       * the handful that ever change volume.
       */
      preserveTimestamps: true
    })
  } catch (error) {
    await rm(to, { recursive: true, force: true }).catch(() => undefined)
    throw translate(error, from)
  }

  const copied = await measureTree(to)

  if (copied.files !== source.files || copied.bytes !== source.bytes) {
    await rm(to, { recursive: true, force: true }).catch(() => undefined)
    throw new AppError('The copy did not match the original, so nothing was moved.', {
      code: ErrorCode.Unknown,
      hint: `Expected ${source.files} files and ${source.bytes} bytes, got ${copied.files} and ${copied.bytes}. The project is untouched where it was.`,
      recoverable: true
    })
  }

  await rm(from, { recursive: true })
}

interface TreeSize {
  files: number
  bytes: number
}

async function measureTree(path: string): Promise<TreeSize> {
  let files = 0
  let bytes = 0

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        files += 1
        bytes += (await stat(full)).size
      }
    }
  }

  await walk(path)
  return { files, bytes }
}

// ------------------------------------------------------------------ removal

/**
 * Removes a directory that must already be empty.
 *
 * Deliberately `rmdir` and not `rm({ recursive: true })`. Deleting a folder in
 * this app must never be able to take an Ableton project with it, so emptiness
 * is enforced by the filesystem itself rather than by a check the service could
 * get wrong.
 */
export async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rmdir(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return
    if (code === 'ENOTEMPTY' || code === 'EEXIST') {
      throw new AppError('That folder still has something in it.', {
        code: ErrorCode.Validation,
        hint: 'Move its contents out first — nothing is deleted from disk by this app.',
        recoverable: false
      })
    }
    throw translate(error, path)
  }
}

// ------------------------------------------------------------- path rewriting

/**
 * The form two paths are compared in: lowercased, separators unified.
 *
 * Windows accepts both slashes interchangeably and hands them back
 * inconsistently — a path typed by hand or arriving from a URL can carry `/`
 * where `join` produced `\`. Comparing raw strings would then decide two
 * spellings of one directory were unrelated, and a prefix rewrite would quietly
 * skip half a project's paths. Substitution preserves length, so slicing the
 * original by an index measured here is still correct.
 */
function comparable(value: string): string {
  return value.toLowerCase().split('/').join(sep)
}

/** `root` with exactly one trailing separator, for prefix tests. */
function asPrefix(root: string): string {
  return root.endsWith(sep) ? root : root + sep
}

/**
 * Rewrites one absolute path that used to sit under `from` to sit under `to`.
 *
 * Returns the value unchanged when it was not underneath `from`, so it is safe
 * to run across a whole record's worth of paths. The prefix test includes the
 * separator deliberately: without it, moving `Mix` would also rewrite paths
 * belonging to `Mixdowns`.
 */
export function rewritePath(value: string, from: string, to: string): string {
  const target = comparable(value)
  const source = comparable(from)

  if (target === source) return to
  if (!target.startsWith(asPrefix(source))) return value

  return to + value.slice(from.length)
}

/** Whether a path is the given root or sits underneath it. */
export function isAtOrUnder(value: string, root: string): boolean {
  const target = comparable(value)
  const base = comparable(root)
  return target === base || target.startsWith(asPrefix(base))
}

// ------------------------------------------------------------------- errors

/**
 * Turns an errno into something the operator can act on.
 *
 * `EPERM` and `EBUSY` on Windows overwhelmingly mean one thing here: the set is
 * open in Ableton Live. Saying so is the difference between a dead end and a
 * two-second fix.
 */
function translate(error: unknown, path: string): AppError {
  const code = (error as NodeJS.ErrnoException).code

  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
    return new AppError('That project is in use by another program.', {
      code: ErrorCode.PermissionDenied,
      hint: 'Close the set in Ableton Live — and any Explorer window inside the folder — then try again.',
      recoverable: true,
      cause: error
    })
  }

  if (code === 'ENOSPC') {
    return new AppError('The drive is full, so nothing was moved.', {
      code: ErrorCode.Unknown,
      hint: 'Free some space and try again. The project is untouched where it was.',
      recoverable: true,
      cause: error
    })
  }

  if (code === 'ENAMETOOLONG') {
    return new AppError('The resulting path would be too long for Windows.', {
      code: ErrorCode.Validation,
      hint: 'Use a shorter folder name, or file this project less deeply in the tree.',
      recoverable: false,
      cause: error
    })
  }

  logger.error(`Filesystem operation failed on ${path}`, error)
  return AppError.from(error, { code: ErrorCode.Unknown, recoverable: true })
}
