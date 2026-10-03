import { readdir, stat } from 'node:fs/promises'
import { dirname, extname, join, parse } from 'node:path'
import { shell } from 'electron'
import { SECTIONS } from '@shared/domain/navigation'
import type { FolderListing, Target } from '@shared/domain/strip'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'

const logger = getLogger('targets')

/** A folder lists at most this many things; a sample library can hold thousands. */
const LISTED = 400

/** What opening a target can ask of the rest of the application. */
export interface TargetHost {
  /** The console, at a department when one is named. */
  openConsole(route: string | null): Promise<void>
  openVestibule(): Promise<void>
  /** A project in Ableton. */
  openProject(projectId: string): Promise<void>
  /** An ARCHIVE folder, refused in words when it's gone. */
  stack(folderId: string): Promise<{ path: string }>
  /** A project's folder on disk, and the stack it's filed in. */
  project(projectId: string): Promise<{ path: string; folderId: string | null }>
}

/**
 * Opens what a pin or a calendar attachment points at.
 *
 * Folders and the strip's own actions are the strip's to show (it lists a
 * folder beside itself, and runs New project in its popup), so they never
 * reach here; everything else opens in one place, the same way from the strip,
 * a reminder or CALENDAR.
 *
 * A stack or a project opens the way it's told. Told none (the strip asks
 * first, so that is a CALENDAR attachment), a stack opens in the ARCHIVE and a
 * project in Ableton.
 */
export async function openTarget(target: Target, host: TargetHost): Promise<void> {
  switch (target.kind) {
    case 'page':
      return host.openConsole(checkedRoute(target.route))
    case 'action':
      if (target.action === 'console') return host.openConsole(null)
      if (target.action === 'vestibule') return host.openVestibule()
      return
    case 'stack': {
      const stack = await host.stack(target.folderId)
      if (target.opensIn === 'explorer') return openPath(stack.path)
      return host.openConsole(archiveRoute(target.folderId))
    }
    case 'project': {
      if (!target.opensIn || target.opensIn === 'ableton') {
        return host.openProject(target.projectId)
      }
      const project = await host.project(target.projectId)
      if (target.opensIn === 'explorer') return openPath(project.path)
      // Its dossier, over the stack it's filed in.
      return host.openConsole(archiveRoute(project.folderId, target.projectId))
    }
    case 'file':
    case 'folder':
      return openPath(target.path)
    case 'link':
      return openLink(target.url)
  }
}

/**
 * A department's path, checked against the navigation registry: it ends up
 * in the address the console loads, so an unknown one opens the console where
 * it always opens rather than anywhere a pin says. A query (`?section=strip`)
 * may follow.
 */
function checkedRoute(route: string): string | null {
  const [path] = route.split('?')
  const known = SECTIONS.some((section) => section.implemented && section.path === path)
  if (!known) logger.warn(`Ignored an unknown page: ${route}`)
  return known ? route : null
}

/** The ARCHIVE at a stack, with a project's dossier open when one is named. */
function archiveRoute(folderId: string | null, projectId?: string): string {
  const query = new URLSearchParams()
  if (folderId) query.set('folder', folderId)
  if (projectId) query.set('project', projectId)
  return `/archive?${query.toString()}`
}

/** Whether a path is a file or a folder, or not there at all. */
export async function kindOf(path: string): Promise<'file' | 'folder' | null> {
  try {
    return (await stat(path)).isDirectory() ? 'folder' : 'file'
  } catch {
    return null
  }
}

/** A file or folder, with whatever Windows opens it with. */
export async function openPath(path: string): Promise<void> {
  const problem = await shell.openPath(path)
  if (problem) {
    throw new AppError(`That couldn't be opened: ${problem}`, {
      code: ErrorCode.NotFound,
      hint: 'It may have been moved or deleted.',
      recoverable: true
    })
  }
}

async function openLink(url: string): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError('Only web addresses open from here.', {
      code: ErrorCode.Validation,
      recoverable: false
    })
  }
  await shell.openExternal(parsed.href)
}

/**
 * What a folder holds, folders first, then files, each by name. Hidden and
 * system files (a dot first, or desktop.ini and the like) are left out.
 */
export async function listFolder(path: string): Promise<FolderListing> {
  const parent = dirname(path) === path ? null : dirname(path)
  try {
    const entries = await readdir(path, { withFileTypes: true })
    const items = entries
      .filter((entry) => !entry.name.startsWith('.') && !HIDDEN.has(entry.name.toLowerCase()))
      .map((entry) => {
        const folder = entry.isDirectory()
        return {
          name: entry.name,
          path: join(path, entry.name),
          folder,
          extension: folder ? '' : extname(entry.name).slice(1).toLowerCase()
        }
      })
      .sort((a, b) =>
        a.folder === b.folder
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : a.folder
            ? -1
            : 1
      )
      .slice(0, LISTED)
    return { path, parent: isRoot(path) ? null : parent, items, problem: null }
  } catch (error) {
    logger.warn(`Could not list ${path}`, error)
    const exists = await stat(path).then(
      () => true,
      () => false
    )
    return {
      path,
      parent,
      items: [],
      problem: exists ? 'This folder can’t be read.' : 'This folder isn’t there any more.'
    }
  }
}

const HIDDEN = new Set(['desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information'])

function isRoot(path: string): boolean {
  const { root } = parse(path)
  return root === path || `${root}` === `${path}\\`
}
