/** Small async utilities shared by the service layer. */

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface RetryOptions {
  attempts: number
  /** Base delay in ms; grows exponentially and is capped by `maxDelayMs`. */
  baseDelayMs: number
  maxDelayMs?: number
  signal?: AbortSignal
  onAttemptFailed?: (error: unknown, attempt: number) => void
}

/** Retries `task` with exponential backoff, rethrowing the final failure. */
export async function retry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs = 10_000, signal, onAttemptFailed } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt)
    } catch (error) {
      lastError = error
      onAttemptFailed?.(error, attempt)
      if (attempt === attempts) break
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      await delay(backoff, signal)
    }
  }

  throw lastError
}

/**
 * Maps `items` through `task` with a bounded number in flight.
 *
 * Used where the work is I/O-heavy and the input is operator-sized rather than
 * fixed — decompressing every Ableton set under a scanned root, for instance.
 * Unbounded `Promise.all` over a few thousand files exhausts file handles;
 * running them one at a time wastes most of the wait.
 */
export async function mapWithConcurrency<In, Out>(
  items: readonly In[],
  limit: number,
  task: (item: In, index: number) => Promise<Out>
): Promise<Out[]> {
  const results = new Array<Out>(items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Rejects with a timeout error if `promise` does not settle within `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
