/**
 * The three things every outbound HTTP caller in the main process needs.
 *
 * Lifted out of the discography seeder, where they were written, because none
 * of them is about discography: a retrying fetch, a concurrency pool and a
 * rate limiter are the shape of talking to *any* public API, and the seeder is
 * a folder marked for deletion. Anything here survives it.
 *
 * Dependency-free on purpose, like everything else in `core/` — no Electron,
 * no services, so a probe can drive it without a window.
 */
import { getLogger } from './logger'

const logger = getLogger('net')

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RequestOptions extends RequestInit {
  /** How many times to retry a 429 or a 5xx before giving up. */
  attempts?: number
}

/**
 * A fetch that survives the two things public APIs actually do: rate-limit,
 * and fail transiently.
 *
 * `Retry-After` is honoured when it is given — Spotify sends it in seconds and
 * means it — and otherwise the backoff doubles. Five attempts is the default
 * because past that the failure is real, and a caller grinding on is worse
 * than one that reports.
 *
 * A non-retryable failure throws with the status and the first line of the
 * body, which is almost always the service explaining itself.
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { attempts = 5, ...init } = options
  let attempt = 1

  for (;;) {
    const response = await fetch(url, init)

    if (response.status === 429 || response.status >= 500) {
      if (attempt >= attempts) throw new Error(`${response.status} after ${attempt} attempts`)
      const after = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 1000
      logger.warn(`${response.status} from ${hostOf(url)} — waiting ${Math.round(wait / 1000)}s`)
      await sleep(wait)
      attempt += 1
      continue
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`${response.status} ${response.statusText} — ${body.slice(0, 200)}`)
    }

    return (await response.json()) as T
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 40)
  }
}

/**
 * Runs `work` over `items` with a fixed number in flight.
 *
 * Results come back in the order of `items`, not the order they finished, so a
 * caller can zip them against the input without carrying an index around.
 */
export async function pool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: Math.min(Math.max(size, 1), items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        out[index] = await work(items[index], index)
      }
    })
  )

  return out
}

/**
 * Paces a sequence of calls to a stated ceiling, in calls per minute.
 *
 * Sequential by definition — a ceiling and a pool are different instruments,
 * and a service that publishes "twenty a minute" means twenty, not twenty at
 * once.
 */
export async function paced<T, R>(
  items: readonly T[],
  perMinute: number,
  work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const gap = 60_000 / perMinute
  const out: R[] = []

  for (const [index, item] of items.entries()) {
    const started = Date.now()
    out.push(await work(item, index))
    const remaining = gap - (Date.now() - started)
    if (index < items.length - 1 && remaining > 0) await sleep(remaining)
  }

  return out
}

/** `Authorization: Basic …`, which several services want and none documents. */
export function basicAuth(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString('base64')
}
