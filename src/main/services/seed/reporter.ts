/**
 * How every rung of the harvest tells the operator what it is doing.
 *
 * One object threaded through the sources instead of a bare `report`
 * callback, because a run has two things to say and they are not the same
 * kind of thing: **where it has got to**, which replaces itself and drives a
 * bar, and **what it just did**, which accumulates and is read.
 *
 * The second is the one that matters. A harvest is two minutes of somebody
 * else's computers being asked questions, and the operator watching it is
 * not waiting — they are deciding whether to trust what comes out. That
 * judgement needs the working.
 */
import type { SeedLogLevel } from '@shared/domain/seed'

/**
 * A URL with its secrets taken out.
 *
 * YouTube puts its API key in the query string, and so do several of the
 * keyless-but-not-really services. The log crosses the bridge into a
 * renderer, is drawn on screen, and is the single most likely thing in this
 * feature to end up in a screenshot — so redaction happens here, at the one
 * place a URL becomes text, rather than at each of the dozen call sites that
 * would each have to remember.
 *
 * Whole-value, not partial: showing the first six characters of a key is
 * showing six characters of a key.
 */
export function redact(url: string): string {
  return url
    .replace(/([?&](?:key|access_token|api_key|apikey|token|client_secret|secret)=)[^&]*/gi, '$1***')
    .replace(/(Bearer\s+)\S+/gi, '$1***')
}

/** A URL shortened to the part a person reads, with the host kept. */
export function brief(url: string, limit = 120): string {
  const clean = redact(url)
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`
}

export interface SeedReporter {
  /**
   * Where the current phase has got to. Replaces itself; drives the bar.
   *
   * `total` may be zero, which means the step does not yet know its own
   * size — the renderer draws an indeterminate bar rather than a wrong one.
   */
  progress: (note: string, done: number, total: number) => void
  /** A heading: a new rung, or a new stage within one. */
  step: (source: string, text: string) => void
  /** A call going out. Pass the raw URL; it is redacted here. */
  request: (source: string, url: string) => void
  /** What came back, summarised — a count, an id, a title. Not the payload. */
  response: (source: string, text: string) => void
  /** Anything worth reading that is neither a call nor a heading. */
  note: (source: string, text: string) => void
  /** Degraded but continuing: a skipped source, a miss, a rate limit. */
  warn: (source: string, text: string) => void
}

/**
 * A reporter that drops everything.
 *
 * For a caller that has no interest in narration — a probe, a test — so that
 * the sources can take a reporter unconditionally rather than guarding every
 * call with an optional chain.
 */
export const SILENT: SeedReporter = {
  progress: () => {},
  step: () => {},
  request: () => {},
  response: () => {},
  note: () => {},
  warn: () => {}
}

export interface ReporterSink {
  progress: (note: string, done: number, total: number) => void
  log: (level: SeedLogLevel, source: string, text: string) => void
}

/** Binds a sink into the shape the sources take. */
export function reporterFor(sink: ReporterSink): SeedReporter {
  return {
    progress: sink.progress,
    step: (source, text) => sink.log('step', source, text),
    request: (source, url) => sink.log('request', source, brief(url)),
    response: (source, text) => sink.log('response', source, text),
    note: (source, text) => sink.log('note', source, text),
    warn: (source, text) => sink.log('warn', source, text)
  }
}

/**
 * Narration that thins out as it repeats.
 *
 * The harvest makes one call per recording against three services — around
 * two hundred requests that differ only in an ISRC. Logging every one buries
 * the lines that matter; logging none loses the evidence that the rung ran
 * at all. So the first few are shown in full and the rest are counted.
 */
export function sampled(limit = 6): (index: number, total: number) => boolean {
  return (index, total) => index < limit || index === total - 1
}
