/**
 * Jev, through TypeSafe's System One API.
 *
 * One `POST` per call:
 *
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer apikey_…
 *   { model, state, questions: { <name>: { type, instructions, criteria } } }
 *
 * and the response carries one answer per question, each with the option it
 * chose and the probability mass behind every option. There is no prose in
 * either direction, which is the entire reason this is not an LLM client with
 * a JSON schema bolted on.
 *
 * ## Several questions, one call
 *
 * `ask` takes a map, so independent questions about the same state go in one
 * round trip. Questions whose answers *depend* on each other must not —
 * that is what `ObjectPipeline`'s stages are for, and the difference matters
 * because an option list that has to cover every combination grows
 * quadratically.
 */
import { request } from '../net'
import type { Answers, Oracle, Question } from './types'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'

export interface JevOptions {
  apiKey: string
  /** Defaults to `jev-latest`, which is what the service recommends pinning to. */
  model?: string
  /** Overridable for a proxy or a self-hosted gateway. */
  endpoint?: string
}

/**
 * True for a key this client can actually use.
 *
 * TypeSafe keys are prefixed `apikey_`. Checked rather than assumed because
 * the alternative failure is a 401 several minutes into a long run, and the
 * common mistake is pasting an OpenRouter or Anthropic key into the field.
 */
export function isJevKey(key: string): boolean {
  return key.trim().startsWith('apikey_')
}

export class JevOracle implements Oracle {
  readonly name = 'Jev'

  private readonly apiKey: string
  private readonly model: string
  private readonly endpoint: string

  constructor(options: JevOptions) {
    this.apiKey = options.apiKey.trim()
    this.model = options.model ?? MODEL
    this.endpoint = options.endpoint ?? ENDPOINT
    if (!this.apiKey) throw new Error('Jev needs an API key.')
  }

  async ask(state: string, questions: Record<string, Question>): Promise<Answers> {
    const payload = await request<{ answers?: Answers }>(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: this.model, state, questions })
    })

    return payload.answers ?? {}
  }
}

/**
 * The oracle for a key, or null when there is no usable one.
 *
 * Null rather than a throw: every caller so far has a defensible thing to do
 * without an oracle — flag everything for a human — and forcing them into a
 * try/catch to discover that would be the wrong shape.
 */
export function jevFor(apiKey: string, options: Omit<JevOptions, 'apiKey'> = {}): Oracle | null {
  const key = (apiKey || '').trim()
  if (!key) return null
  return new JevOracle({ ...options, apiKey: key })
}
