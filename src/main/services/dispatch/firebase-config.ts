import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { FirebaseConfigSchema, type FirebaseConfig } from '@shared/domain/dispatch'
import { getLogger } from '@main/core/logger'

const logger = getLogger('dispatch:config')

/**
 * Where a pasted config is kept.
 *
 * In `userData`, not in the repository and not in settings. Not in the repo
 * because a packaged build has no repository; not in settings because settings
 * are a zod-validated document that gets rewritten wholesale, and a config the
 * operator pasted by hand should be a file they can open and correct when they
 * have pasted it wrong.
 */
export function firebaseConfigPath(): string {
  return join(app.getPath('userData'), 'firebase.json')
}

/**
 * Pulls a `firebaseConfig` object out of whatever the operator pasted.
 *
 * The Firebase console hands out a JavaScript snippet, not JSON — unquoted keys,
 * single quotes, a `const` and a trailing semicolon — and asking someone to
 * convert that by hand is asking them to make a typo. So the whole snippet is
 * accepted: the object literal is found, the keys are read out one at a time
 * with a regular expression, and anything that is not a key we recognise is
 * ignored.
 *
 * Reading the keys individually rather than repairing the literal into JSON is
 * the point. A repair has to be right about every character of a format that
 * varies between console versions; this only has to find seven strings, and
 * anything it cannot find falls back to a default.
 *
 * Plain JSON parses too, because that is what this writes back.
 */
export function parseFirebaseConfig(source: string): FirebaseConfig | null {
  const text = source.trim()
  if (!text) return null

  // The easy case: something already wrote this file, or the operator pasted
  // JSON of their own accord.
  try {
    const parsed: unknown = JSON.parse(text)
    const direct = FirebaseConfigSchema.safeParse(parsed)
    if (direct.success && (direct.data.databaseURL || direct.data.projectId)) {
      return withDatabaseUrl(direct.data)
    }
  } catch {
    // Not JSON. Expected for a pasted console snippet; fall through.
  }

  const fields: Array<keyof FirebaseConfig> = [
    'apiKey',
    'authDomain',
    'databaseURL',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ]

  const found: Record<string, string> = {}
  for (const field of fields) {
    // `key: "value"` or `"key": 'value'`, in any quoting the console emits.
    const match = new RegExp(`["']?${field}["']?\\s*:\\s*["']([^"']*)["']`).exec(text)
    if (match) found[field] = match[1]
  }

  const parsed = FirebaseConfigSchema.safeParse(found)
  if (!parsed.success) return null

  return withDatabaseUrl(parsed.data)
}

/**
 * The default Realtime Database address for a project.
 *
 * The console's snippet does not always carry `databaseURL` — the block shown
 * on the "Your apps" page is generated for Firestore and Analytics, and omits
 * it unless a Realtime Database existed when the web app was registered. Since
 * that is the snippet anyone will paste, deriving the address is the difference
 * between the board working and the operator hunting through a second console
 * page for one line.
 *
 * **The region is a guess.** `<project>-default-rtdb.firebaseio.com` is right
 * for a database created in the United States, which is the default; one
 * created in Europe or Singapore answers at
 * `<project>-default-rtdb.<region>.firebasedatabase.app` instead, and there is
 * nothing in the snippet that says which. A wrong guess fails loudly on the
 * first request rather than quietly, and the console offers a field for pasting
 * the exact address.
 */
export function defaultDatabaseUrl(projectId: string): string {
  return `https://${projectId}-default-rtdb.firebaseio.com`
}

/**
 * Fills in the address if the snippet did not carry one.
 *
 * Returns null only when there is nothing to derive it from either — a config
 * with neither a `databaseURL` nor a `projectId` is not a Firebase config in
 * any useful sense.
 */
function withDatabaseUrl(config: FirebaseConfig): FirebaseConfig | null {
  if (config.databaseURL) return config
  if (!config.projectId) return null

  logger.info(
    'The pasted config carried no databaseURL; assuming the default Realtime Database address'
  )
  return { ...config, databaseURL: defaultDatabaseUrl(config.projectId) }
}

/**
 * The config, from the first place that has one.
 *
 * 1. `userData/firebase.json`, which is what the console writes.
 * 2. `info/firebaseconfig.md` beside the source, in development only — the
 *    operator keeps the snippet there, and having to paste it into the app as
 *    well on a machine that already has the file would be a chore for nothing.
 * 3. `MAIN_VITE_FIREBASE_DATABASE_URL` in the environment, for a launcher that
 *    wants to point a copy of the app at a different board.
 *
 * Never throws. An unreadable or absent config is the unconfigured state, which
 * the page is built to show.
 */
export async function loadFirebaseConfig(): Promise<FirebaseConfig | null> {
  const saved = await readIfPresent(firebaseConfigPath())
  if (saved) {
    const parsed = parseFirebaseConfig(saved)
    if (parsed) return parsed
    logger.warn('The saved Firebase config could not be read; ignoring it')
  }

  if (!app.isPackaged) {
    const repoFile = join(app.getAppPath(), 'info', 'firebaseconfig.md')
    const source = await readIfPresent(repoFile)
    if (source) {
      const parsed = parseFirebaseConfig(source)
      if (parsed) {
        logger.info('Using the Firebase config from info/firebaseconfig.md')
        return parsed
      }
    }
  }

  const fromEnv = process.env.MAIN_VITE_FIREBASE_DATABASE_URL?.trim()
  if (fromEnv) {
    return FirebaseConfigSchema.parse({
      databaseURL: fromEnv,
      projectId: process.env.MAIN_VITE_FIREBASE_PROJECT_ID?.trim() ?? ''
    })
  }

  return null
}

/** Writes a pasted config, so the next start finds it without the repo file. */
export async function saveFirebaseConfig(config: FirebaseConfig): Promise<void> {
  const path = firebaseConfigPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
