import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { shell } from 'electron'
import type { ProjectRecord } from '@shared/domain/projects'
import type { RecentSet } from '@shared/domain/recent'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import type { ProjectsService } from '@main/services/projects/projects.service'
import { liveWindowTitles } from '@main/services/stacks/live-window'
import { pathExists } from '@main/services/stacks/filesystem'
import { readLiveRecents } from './live-recents'

const logger = getLogger('recent')

/** How many of its own opens Haven remembers. Live keeps about thirty. */
const MAX_HISTORY = 100
/** How many the list answers with. */
const MAX_LISTED = 50
/** Live's window titles are read at most this often, and given this long. */
const TITLES_FRESH_MS = 5_000
const TITLES_BUDGET_MS = 2_000

interface Opened {
  path: string
  at: number
}

/**
 * Recently opened sets, for ARCHIVE's RECENT lens and the RECENT menus in
 * ARCHIVE and on the quick strip (`RecentSet`).
 *
 * Three sources, because no one of them sees everything:
 *
 * 1. **Live's own recent list**, from its preferences (`readLiveRecents`): a
 *    set opened straight in Live, from Explorer or Live's own menu, is there.
 *    Live writes the file when it saves its preferences, though, so it trails
 *    a Live still running.
 * 2. **What Haven opened**, with when (`record`, kept in `recent-sets.json`),
 *    which is there the moment it happens. Anything Haven opened since Live's
 *    list was last written comes first.
 * 3. **The set Live has open now**, from its window title, which leads the
 *    list whichever way it was opened.
 *
 * Each set is matched to its ARCHIVE project by path, so the lens can show
 * the project and the menus can open its dossier.
 */
export class RecentService {
  private history: Opened[] | null = null
  private titles: { at: number; titles: string[] } | null = null
  private titlesReading: Promise<string[]> | null = null

  constructor(
    private readonly projects: ProjectsService,
    /** TEMPORARY PROJECTS, where New project's temporary sets go; null before setup. */
    private readonly temporaryRoot: () => string | null
  ) {}

  private get file(): string {
    return join(getPaths().userData, 'recent-sets.json')
  }

  private async load(): Promise<Opened[]> {
    if (this.history) return this.history
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as unknown
      this.history = Array.isArray(parsed)
        ? parsed.filter(
            (entry): entry is Opened =>
              typeof entry?.path === 'string' && typeof entry?.at === 'number'
          )
        : []
    } catch {
      this.history = []
    }
    return this.history
  }

  /** Haven opened a set: it goes to the top. */
  async record(path: string, at = Date.now()): Promise<void> {
    if (!/\.als$/i.test(path)) return
    const history = await this.load()
    const key = path.toLowerCase()
    this.history = [
      { path, at },
      ...history.filter((entry) => entry.path.toLowerCase() !== key)
    ].slice(0, MAX_HISTORY)
    try {
      await writeFile(this.file, `${JSON.stringify(this.history, null, 2)}\n`, 'utf8')
    } catch (error) {
      logger.warn('Could not keep the recent sets', error)
    }
  }

  /** Opens a set from a RECENT menu, and records it. */
  async open(path: string): Promise<void> {
    if (!/\.als$/i.test(path)) {
      throw new AppError('Only an Ableton set can be opened from here.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }
    if (!(await pathExists(path))) {
      throw new AppError(`${basename(path)} isn't there any more.`, {
        code: ErrorCode.NotFound,
        hint: 'It was moved or deleted since it was last opened.',
        recoverable: false
      })
    }
    const failure = await shell.openPath(path)
    if (failure) {
      throw new AppError(`Could not open ${basename(path)}.`, {
        code: ErrorCode.Unknown,
        hint: failure,
        recoverable: true
      })
    }
    await this.record(path)
  }

  /** The list, newest first. */
  async list(): Promise<RecentSet[]> {
    const [history, live, titles, records] = await Promise.all([
      this.load(),
      readLiveRecents().catch(() => ({ paths: [], savedAt: null })),
      this.liveTitles(),
      this.projects.listRecords().catch(() => [] as ProjectRecord[])
    ])

    // What Haven opened since Live last wrote its list, then Live's list,
    // then the rest of Haven's own, each set once.
    const savedAt = live.savedAt ?? 0
    const ordered: { path: string; at: number | null }[] = []
    const seen = new Set<string>()
    const push = (path: string, at: number | null): void => {
      const key = path.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      ordered.push({ path, at })
    }
    const openedAt = new Map(history.map((entry) => [entry.path.toLowerCase(), entry.at]))
    for (const entry of history) if (entry.at > savedAt) push(entry.path, entry.at)
    for (const path of live.paths) push(path, openedAt.get(path.toLowerCase()) ?? null)
    for (const entry of history) push(entry.path, entry.at)

    const inRegister = records.filter((record) => record.trashedAt === null)
    const bySet = new Map<string, ProjectRecord>()
    for (const record of inRegister) {
      for (const set of record.sets) bySet.set(set.path.toLowerCase(), record)
    }
    const projectOf = (path: string): ProjectRecord | null => {
      const key = path.toLowerCase()
      const direct = bySet.get(key)
      if (direct) return direct
      // A set saved into a project folder since its last scan.
      return (
        inRegister.find((record) => key.startsWith(`${record.path.toLowerCase()}${sep}`)) ?? null
      )
    }

    // The set Live has open now: matched by name and folder, from what is
    // listed or anything in the register.
    const current = titles.map(parseTitle).filter((entry): entry is LiveTitle => entry !== null)
    const matchesTitle = (path: string): boolean =>
      current.some(
        (title) =>
          basename(path).replace(/\.als$/i, '') === title.set &&
          basename(dirname(path)) === title.folder
      )
    let openNowPath = ordered.find((entry) => matchesTitle(entry.path))?.path ?? null
    if (!openNowPath && current.length > 0) {
      openNowPath =
        inRegister.flatMap((record) => record.sets.map((set) => set.path)).find(matchesTitle) ??
        null
    }
    if (openNowPath) {
      const key = openNowPath.toLowerCase()
      const at = openedAt.get(key) ?? null
      const rest = ordered.filter((entry) => entry.path.toLowerCase() !== key)
      ordered.splice(0, ordered.length, { path: openNowPath, at }, ...rest)
    }

    const listed = ordered.slice(0, MAX_LISTED)
    const present = await Promise.all(listed.map((entry) => pathExists(entry.path)))
    const temporary = this.temporaryRoot()?.toLowerCase() ?? null

    return listed.map((entry, index) => {
      const project = projectOf(entry.path)
      return {
        path: entry.path,
        name: basename(entry.path).replace(/\.als$/i, ''),
        folder: basename(dirname(entry.path)),
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        openedAt: entry.at,
        exists: present[index],
        temporary: temporary !== null && entry.path.toLowerCase().startsWith(`${temporary}${sep}`),
        openNow: openNowPath !== null && entry.path.toLowerCase() === openNowPath.toLowerCase()
      }
    })
  }

  /**
   * Live's window titles, cached briefly; empty if Windows takes too long.
   * One read at a time: lists asked for together (the console's and the
   * strip's) share it.
   */
  private liveTitles(): Promise<string[]> {
    if (this.titles && Date.now() - this.titles.at < TITLES_FRESH_MS) {
      return Promise.resolve(this.titles.titles)
    }
    this.titlesReading ??= Promise.race([
      liveWindowTitles().then((value) => value ?? []),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TITLES_BUDGET_MS))
    ])
      .then((titles) => {
        this.titles = { at: Date.now(), titles }
        return titles
      })
      .finally(() => {
        this.titlesReading = null
      })
    return this.titlesReading
  }
}

interface LiveTitle {
  set: string
  folder: string
}

/**
 * `Name [Name Project] - Ableton Live 12 Suite`, with a `*` after the name
 * while unsaved. Null for anything else, an unsaved Untitled set included:
 * it has no file yet.
 */
export function parseTitle(title: string): LiveTitle | null {
  const match = /^(.+?)\*?\s+\[(.+?)\]\s+-\s+Ableton Live/.exec(title)
  if (!match) return null
  return { set: match[1].trim(), folder: match[2].trim() }
}
