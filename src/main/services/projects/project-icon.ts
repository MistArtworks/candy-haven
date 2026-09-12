import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { getLogger } from '@main/core/logger'

const logger = getLogger('projects:icon')
const run = promisify(execFile)

/** Live's own name for the file, and for the directory it keeps it in. */
const ICON_FILE_NAME = 'AProject.ico'
const PROJECT_INFO_DIRECTORY = 'Ableton Project Info'
const DESKTOP_INI = 'Desktop.ini'

/** Where Live installs itself. Each edition gets its own directory here. */
const ABLETON_PROGRAM_DATA = 'C:\\ProgramData\\Ableton'

/**
 * Makes a project folder draw Live's project icon in Explorer.
 *
 * Not our invention — this is exactly what Live does when it first saves a
 * project, reproduced so that a project Candy Haven created looks right before
 * Live has ever opened it. Verified against a real Live-made project:
 *
 *     Hyperpop Project\                    <- ReadOnly
 *     ├── Ableton Project Info\
 *     │   └── AProject.ico                 <- copied verbatim from Live
 *     ├── Desktop.ini                      <- Hidden
 *     └── Hyperpop.als
 *
 * Three conditions must **all** hold or Explorer silently draws a plain folder:
 * the ini exists with this exact content, the ini is hidden, and the folder
 * itself carries ReadOnly. The last one is the easy one to miss — it is what
 * tells the shell to go looking for a `Desktop.ini` at all.
 *
 * `IconFile` is a *relative* path, which is why filing and migration cannot
 * break the icon: the folder can be moved or renamed and the reference still
 * resolves.
 */
const DESKTOP_INI_CONTENT = [
  '[.ShellClassInfo]',
  'ConfirmFileOp=0',
  'NoSharing=0',
  `IconFile=${PROJECT_INFO_DIRECTORY}\\${ICON_FILE_NAME}`,
  'IconIndex=0',
  ''
].join('\r\n')

/** Resolved once per run. `null` means "looked and did not find". */
let cached: string | null | undefined

/**
 * Finds a copy of Live's project icon, preferring Live's own installation.
 *
 * Deliberately **not** shipped with the app. Using Ableton's icon rather than
 * one of ours means a project folder looks identical before and after Live
 * first saves it — invent our own and it is either replaced under the operator
 * on first save, or their archive grows two visibly different kinds of project
 * folder for no functional reason. Reading it from the installation rather than
 * bundling it also avoids redistributing Ableton's asset, and keeps us in step
 * with whatever Live version is actually installed.
 *
 * `harvestFrom` is the fallback for a non-standard install: any project folder
 * Live has already saved has its own copy, byte for byte the same file.
 */
export async function locateProjectIcon(
  harvestFrom: readonly string[] = []
): Promise<string | null> {
  if (cached !== undefined) return cached

  const store = join(app.getPath('userData'), ICON_FILE_NAME)

  if (await exists(store)) {
    cached = store
    return cached
  }

  const source = (await findInAbletonInstall()) ?? (await findInProjects(harvestFrom))

  if (!source) {
    logger.warn(
      'No AProject.ico found; created projects will not carry the icon until Live saves them'
    )
    cached = null
    return cached
  }

  try {
    await copyFile(source, store)
    logger.info(`Cached the project icon from ${source}`)
    cached = store
  } catch (error) {
    // Usable without the cache, just re-resolved next launch.
    logger.warn('Could not cache the project icon', error)
    cached = source
  }

  return cached
}

async function findInAbletonInstall(): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(ABLETON_PROGRAM_DATA)
  } catch {
    return null
  }

  /*
   * Dot-prefixed directories are skipped. A machine mid-update has a staged
   * copy beside the live one — `.Live 12 Suite_updated` alongside
   * `Live 12 Suite` — and the staged one is not what is running.
   *
   * Reverse alphabetical so the newest edition wins when several are installed;
   * `Live 12 Suite` sorts above `Live 11 Suite`.
   */
  const editions = entries
    .filter((name) => !name.startsWith('.'))
    .sort((a, b) => b.localeCompare(a))

  for (const edition of editions) {
    const candidate = join(ABLETON_PROGRAM_DATA, edition, 'Resources', 'Misc', ICON_FILE_NAME)
    if (await exists(candidate)) return candidate
  }

  return null
}

async function findInProjects(projectPaths: readonly string[]): Promise<string | null> {
  for (const path of projectPaths) {
    const candidate = join(path, PROJECT_INFO_DIRECTORY, ICON_FILE_NAME)
    if (await exists(candidate)) return candidate
  }
  return null
}

/**
 * Writes the icon, the ini and the attributes onto a project folder.
 *
 * Idempotent, and deliberately forgiving: a project that cannot be stamped is
 * still a perfectly good project, so every failure here is logged and swallowed
 * rather than raised. Refusing to create a project because Explorer would draw
 * the wrong icon would be the wrong trade.
 *
 * Returns whether the folder ended up carrying the icon, so a bulk conform can
 * report a count rather than guessing.
 */
export async function stampProjectIcon(
  projectPath: string,
  harvestFrom: readonly string[] = []
): Promise<boolean> {
  const icon = await locateProjectIcon(harvestFrom)
  if (!icon) return false

  try {
    const infoDirectory = join(projectPath, PROJECT_INFO_DIRECTORY)
    await mkdir(infoDirectory, { recursive: true })

    const target = join(infoDirectory, ICON_FILE_NAME)
    // Left alone when Live has already put one there. Live's copy is the
    // authority on its own icon, and overwriting it gains nothing.
    if (!(await exists(target))) await copyFile(icon, target)

    const ini = join(projectPath, DESKTOP_INI)
    /*
     * The ini is rewritten even when present, because a hidden file is easy to
     * write and hard to inspect — and a stale or truncated one is the failure
     * that produces a plain folder with no explanation. The content is fixed,
     * so rewriting costs nothing.
     *
     * Hidden has to come off before writing: `writeFile` cannot open an
     * existing hidden file for truncation on Windows.
     */
    await attrib(['-h', ini]).catch(() => undefined)
    await writeFile(ini, DESKTOP_INI_CONTENT, 'utf8')
    await attrib(['+h', ini])

    // The attribute that actually switches folder customisation on.
    await attrib(['+r', projectPath])

    return true
  } catch (error) {
    logger.warn(`Could not stamp the project icon onto ${projectPath}`, error)
    return false
  }
}

/** Whether a folder already draws the icon. Cheap enough to call in a loop. */
export async function hasProjectIcon(projectPath: string): Promise<boolean> {
  return (
    (await exists(join(projectPath, DESKTOP_INI))) &&
    (await exists(join(projectPath, PROJECT_INFO_DIRECTORY, ICON_FILE_NAME)))
  )
}

/**
 * Node has no API for Windows file attributes, so this shells out.
 *
 * `attrib` is a system binary at a fixed location and every argument here is
 * either a literal flag or a path we constructed, so there is nothing to
 * interpolate and nothing to quote — `execFile` passes the array straight
 * through without a shell.
 */
async function attrib(args: readonly string[]): Promise<void> {
  await run('attrib', [...args], { windowsHide: true })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
