import { copyFile, cp, mkdir, readdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

/**
 * A path under `parent` that nothing occupies, suffixing until one is free.
 *
 * `Untitled Project` becomes `Untitled Project (2)`, then `(3)`, and so on.
 * The suffix goes on the *whole* folder name rather than before Live's
 * ` Project` ending, because the scanner derives a display name by stripping
 * exactly that ending — `Untitled Project (2)` reads as "Untitled Project (2)"
 * in the register, which is honest, whereas `Untitled (2) Project` would read
 * as "Untitled (2)" and quietly claim to be a project the operator named.
 *
 * Exists because Live names every new project `Untitled Project`. A migration
 * bringing in work from several folders therefore collides on the *common*
 * case rather than a rare one, and refusing the second one is a dead end the
 * operator can only escape by renaming directories by hand.
 *
 * Returns the desired path untouched when nothing is in the way, so the
 * ordinary case is unchanged and no suffix appears where none is needed.
 */
export async function freePath(parent: string, basename: string): Promise<string> {
  const desired = join(parent, basename)
  if (!(await pathExists(desired))) return desired

  // Bounded rather than `while (true)`: a directory with a thousand collisions
  // is a fault worth surfacing, not a loop worth finishing.
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = join(parent, `${basename} (${suffix})`)
    if (!(await pathExists(candidate))) return candidate
  }

  throw new AppError(`Could not find a free name for “${basename}”.`, {
    code: ErrorCode.Validation,
    hint: 'That shelf already holds a thousand projects of this name.',
    recoverable: false
  })
}

/**
 * `freePath` for a file: the suffix goes *before* the extension.
 *
 * `Sugar Rush.wav` becomes `Sugar Rush (2).wav`, where `freePath` would have
 * produced `Sugar Rush.wav (2)` — a file Windows no longer considers audio, and
 * which the scanner would not list as a bounce.
 *
 * Exists for demoting a final mix and master. It returns to the project folder
 * under the name the operator gave it when it shipped, and by then they may
 * well have bounced something new under that same name. `moveFile` refuses to
 * overwrite, quite rightly, so without this the demotion is simply a dead end.
 */
export async function freeFilePath(parent: string, fileName: string): Promise<string> {
  const desired = join(parent, fileName)
  if (!(await pathExists(desired))) return desired

  const extension = extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = join(parent, `${stem} (${suffix})${extension}`)
    if (!(await pathExists(candidate))) return candidate
  }

  throw new AppError(`Could not find a free name for “${fileName}”.`, {
    code: ErrorCode.Validation,
    hint: 'That folder already holds a thousand files of this name.',
    recoverable: false
  })
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

/**
 * Duplicates a project folder, leaving the original exactly where it is.
 *
 * The same verified copy `moveDirectory` performs across volumes, stopping
 * before the delete. Used by migration in COPY mode, where keeping the original
 * untouched is the entire point of choosing it.
 *
 * Verification is file count and total bytes rather than a checksum, for the
 * reason recorded above: a copy interrupted by a full disk or a disconnected
 * drive is the failure that actually happens, and reading tens of gigabytes of
 * samples twice to catch a bit-flip is not a trade worth making.
 */
export async function copyDirectory(from: string, to: string): Promise<void> {
  if (samePath(from, to)) return

  if (pathIsInside(to, from)) {
    throw new AppError('A folder cannot be copied inside itself.', {
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

  const source = await measureTree(from)

  try {
    await cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true
    })
  } catch (error) {
    await rm(to, { recursive: true, force: true }).catch(() => undefined)
    throw translate(error, from)
  }

  const copied = await measureTree(to)

  if (copied.files !== source.files || copied.bytes !== source.bytes) {
    await rm(to, { recursive: true, force: true }).catch(() => undefined)
    throw new AppError('The copy did not match the original, so nothing was filed.', {
      code: ErrorCode.Unknown,
      hint: `Expected ${source.files} files and ${source.bytes} bytes, got ${copied.files} and ${copied.bytes}. The project is untouched where it was.`,
      recoverable: true
    })
  }

  logger.info(`Copied ${from} -> ${to}`)
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
/**
 * Moves a single file, refusing rather than overwriting.
 *
 * Separate from `moveDirectory` because the checks differ: there is no
 * "inside itself" case, and the cross-volume fallback is a plain copy rather
 * than a verified tree walk. The refusal on an occupied destination is the
 * same rule the whole service follows — nothing is merged or overwritten
 * without the operator having said so.
 */
export async function moveFile(from: string, to: string): Promise<void> {
  if (samePath(from, to)) return

  if (!(await pathExists(from))) {
    throw new AppError('That file is no longer on disk.', {
      code: ErrorCode.NotFound,
      hint: 'Run a scan to bring the register back in step with the filesystem.',
      recoverable: true
    })
  }

  if (await pathExists(to)) {
    throw new AppError(`Something called \u201c${basenameOf(to)}\u201d is already there.`, {
      code: ErrorCode.Validation,
      hint: 'Choose another name \u2014 nothing is overwritten automatically.',
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

  // Different volume. Copy, then remove the original only once it is there.
  await copyFile(from, to)
  await rm(from, { force: true })
}

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
