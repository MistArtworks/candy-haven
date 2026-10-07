import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/** What Live's preferences say it opened lately, and when they were saved. */
export interface LiveRecents {
  /** Newest first, as Live's own Open Recent Set lists them. */
  paths: string[]
  /** When the newest preferences file was written: Live's list is as of then. */
  savedAt: number | null
}

const MARKER = Buffer.from('RecentDocsList', 'latin1')

/**
 * Live's recent sets, from its preferences, newest Live first.
 *
 * Each version keeps its own `Preferences.cfg` under
 * `%APPDATA%\Ableton\Live <version>\Preferences`; the one written last is the
 * Live in use, and its list leads. Older versions' lists follow, for history,
 * with anything already listed left out. Missing or unreadable preferences
 * mean an empty list, never an error: plenty of PCs running Haven have no
 * Live on them.
 */
export async function readLiveRecents(): Promise<LiveRecents> {
  const root = join(app.getPath('appData'), 'Ableton')
  let versions: string[] = []
  try {
    versions = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('Live '))
      .map((entry) => entry.name)
  } catch {
    return { paths: [], savedAt: null }
  }

  const files: { file: string; savedAt: number }[] = []
  for (const version of versions) {
    const file = join(root, version, 'Preferences', 'Preferences.cfg')
    try {
      files.push({ file, savedAt: (await stat(file)).mtimeMs })
    } catch {
      // A version folder without preferences: never launched, or cleaned up.
    }
  }
  files.sort((a, b) => b.savedAt - a.savedAt)

  const seen = new Set<string>()
  const paths: string[] = []
  for (const { file } of files) {
    let buffer: Buffer
    try {
      buffer = await readFile(file)
    } catch {
      continue
    }
    for (const path of parseRecentDocs(buffer)) {
      const key = path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      paths.push(path)
    }
  }
  return { paths, savedAt: files[0]?.savedAt ?? null }
}

/**
 * The paths in a `Preferences.cfg`'s recent list, in its order.
 *
 * The file is Live's own binary format, undocumented, so this reads only what
 * it has to. The list's values follow the last `RecentDocsList` in the file;
 * each path is a UTF-16 string after a 32-bit count of its characters, with a
 * fixed run of fields between one and the next. The list ends at the first
 * string that isn't a set (the next preference along is another path).
 *
 * Exact rather than a scan for anything ending `.als`: a name with an accent
 * in it decodes whole, and paths elsewhere in the file are never mistaken for
 * the list.
 */
export function parseRecentDocs(buffer: Buffer): string[] {
  const at = buffer.lastIndexOf(MARKER)
  if (at < 0) return []

  const paths: string[] = []
  let cursor = at + MARKER.length
  for (;;) {
    const next = nextString(buffer, cursor)
    if (!next || !/\.als$/i.test(next.text)) break
    paths.push(next.text.replace(/\//g, '\\'))
    cursor = next.end
  }
  return paths
}

/** Within a few hundred bytes of `from`, the next length-prefixed path. */
function nextString(buffer: Buffer, from: number): { text: string; end: number } | null {
  const limit = Math.min(from + 512, buffer.length - 4)
  for (let offset = from; offset < limit; offset += 1) {
    const length = buffer.readUInt32LE(offset)
    if (length < 4 || length > 1024) continue
    const end = offset + 4 + length * 2
    if (end > buffer.length) continue
    const text = buffer.toString('utf16le', offset + 4, end)
    if (looksLikePath(text)) return { text, end }
  }
  return null
}

function looksLikePath(text: string): boolean {
  // A drive (C:/…) or a share (//server/…), and nothing unprintable in it.
  return (
    /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(text) &&
    [...text].every((character) => character.charCodeAt(0) >= 0x20)
  )
}
