/**
 * Shared plumbing for the one-off discography harvest.
 *
 * Every source writes its raw responses into `.seed-cache/` and reads them
 * back on the next run. That is not an optimisation — Odesli allows roughly
 * ten calls a minute, so a harvest that re-fetched on every tweak of the
 * matcher would take longer to iterate than to write. The cache is also what
 * makes the run reproducible: the report can be rebuilt months later from the
 * bytes the APIs actually returned, rather than from what they return then.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CACHE = join(ROOT, '.seed-cache')

/**
 * The credentials, read from disk at runtime.
 *
 * Deliberately not `dotenv` and deliberately not `process.env`: this file is
 * read once, by one script, and putting a client secret into the environment
 * of everything downstream is a wider blast radius than the job needs.
 */
export async function credentials() {
  const path = join(ROOT, '.env.seed')
  if (!existsSync(path)) throw new Error('.env.seed not found — see the plan.')

  const out = {}
  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (match) out[match[1]] = match[2].trim()
  }
  return out
}

export async function cacheWrite(name, data) {
  await mkdir(CACHE, { recursive: true })
  await writeFile(join(CACHE, `${name}.json`), JSON.stringify(data, null, 2), 'utf8')
}

export async function cacheRead(name) {
  const path = join(CACHE, `${name}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A fetch that survives the two things these APIs actually do: rate-limit, and
 * fail transiently.
 *
 * `Retry-After` is honoured when given — Spotify sends it in seconds and means
 * it — and otherwise the backoff doubles. Five attempts is enough for a
 * harvest of this size; past that the failure is real and the report should
 * say so rather than the script grinding on.
 */
export async function request(url, options = {}, attempt = 1) {
  const response = await fetch(url, options)

  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 5) throw new Error(`${response.status} after ${attempt} attempts: ${url}`)
    const after = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 1000
    process.stdout.write(`    ${response.status} — waiting ${Math.round(wait / 1000)}s\n`)
    await sleep(wait)
    return request(url, options, attempt + 1)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText} — ${url}\n${body.slice(0, 300)}`)
  }

  return response.json()
}

/** Paces a sequence of calls to a stated ceiling, in calls per minute. */
export async function paced(items, perMinute, work) {
  const gap = 60_000 / perMinute
  const out = []
  for (const [index, item] of items.entries()) {
    const started = Date.now()
    out.push(await work(item, index))
    const remaining = gap - (Date.now() - started)
    if (index < items.length - 1 && remaining > 0) await sleep(remaining)
  }
  return out
}

/**
 * Runs `work` over `items` with a fixed number in flight.
 *
 * Spotify's batch endpoints (`/tracks?ids=`, `/albums?ids=`) answer 403 for
 * applications registered now, so a harvest that used to be one call per fifty
 * records is one call per record. A small pool keeps that quick without
 * tripping the rate limiter — and `request` backs off on a 429 anyway, so the
 * worst case is slow rather than broken.
 */
export async function pool(items, size, work) {
  const out = new Array(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        out[index] = await work(items[index], index)
      }
    })
  )

  return out
}

/** `https://open.spotify.com/artist/<id>?si=…` → `<id>`. Bare ids pass through. */
export function spotifyArtistId(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  const match = /artist[/:]([A-Za-z0-9]+)/.exec(trimmed)
  return match ? match[1] : trimmed
}

export function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
