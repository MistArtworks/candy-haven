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
  /**
   * The longest this will wait between attempts, in milliseconds.
   *
   * A ceiling, not a target: `Retry-After` is honoured *up to* this and the
   * call fails past it. See `TOO_LONG_TO_WAIT` for why obeying a large one
   * is worse than refusing it.
   */
  maxWaitMs?: number
  /** Abandon a single attempt that has produced nothing in this long. */
  timeoutMs?: number
  /** Called before each wait, so a caller can say why it has gone quiet. */
  onRetry?: (info: { status: number; waitMs: number; attempt: number }) => void
}

/**
 * Past this, a `Retry-After` is refused rather than obeyed.
 *
 * Spotify answers a hard rate-limit with a `Retry-After` measured in *hours*
 * — 70571 seconds, nineteen and a half hours, observed 21 Sep 2026 after
 * three full harvests in one afternoon. Sleeping for that is indistinguishable
 * from a hang: the caller sits there, the operator watches a log that has
 * stopped moving, and nothing ever says why.
 *
 * Two minutes is the most a person will wait while watching. Anything longer
 * is not a retry, it is a different day, and the honest response is to stop
 * and say so.
 */
const TOO_LONG_TO_WAIT = 120_000

/** How long one attempt may take before it is abandoned. */
const DEFAULT_TIMEOUT = 30_000

/** `70571` → `19h 36m`, for an error a person has to act on. */
function humanWait(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
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
  const {
    attempts = 5,
    maxWaitMs = TOO_LONG_TO_WAIT,
    timeoutMs = DEFAULT_TIMEOUT,
    onRetry,
    ...init
  } = options
  let attempt = 1

  for (;;) {
    // A socket that accepts and then says nothing used to hang the caller
    // for as long as the process lived. One attempt, one deadline.
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })

    if (response.status === 429 || response.status >= 500) {
      const after = Number(response.headers.get('retry-after'))
      const asked = Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 1000

      /*
       * A wait longer than the ceiling is reported, not slept through.
       *
       * This is the case that matters: the service is not asking to be
       * retried in a moment, it has locked the application out. Obeying it
       * looks exactly like a hang, and the operator cannot tell the
       * difference between "waiting" and "broken" without being told.
       */
      if (asked > maxWaitMs) {
        throw new Error(
          `${hostOf(url)} is rate-limiting this application and asked to be left alone for ` +
            `${humanWait(asked)}. Nothing more can be read from it until then.`
        )
      }

      if (attempt >= attempts) throw new Error(`${response.status} after ${attempt} attempts`)

      onRetry?.({ status: response.status, waitMs: asked, attempt })
      logger.warn(`${response.status} from ${hostOf(url)} — waiting ${Math.round(asked / 1000)}s`)
      await sleep(asked)
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
