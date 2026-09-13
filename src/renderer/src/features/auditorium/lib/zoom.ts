/**
 * How much of the file the surveyed render shows at once.
 *
 * Continuous, and driven by the wheel over the stage. It used to be five fixed
 * steps — 4, 8, 16, 30 seconds and ALL — which had two problems. The first is
 * that the step you want is always between two of the ones offered. The second
 * is worse: ALL was a *different render* rather than the far end of the same
 * one. At ALL the picture stood still and the playhead crossed it; at every
 * other setting the picture moved and the playhead stood still. Two behaviours
 * behind one control, and changing zoom changed which of them you were looking
 * at.
 *
 * One rule replaces both. The window is `span` seconds wide, centred on the
 * playhead, and clamped so it cannot run off either end of the file. Wind it
 * out past the file's length and the clamp holds it at the whole file with the
 * playhead travelling across it, which is the old ALL — arrived at by the same
 * arithmetic as every other setting rather than by a special case.
 */

/** The tightest window. Below a third of a second a bar is a single cycle. */
export const MIN_SPAN = 0.3

/**
 * The window a file opens at.
 *
 * Twelve seconds is a phrase: long enough to see a bar or two of context
 * either side of the playhead, short enough that individual hits are still
 * separate objects rather than a block.
 */
export const DEFAULT_SPAN = 12

/**
 * How hard the wheel bites, per notch.
 *
 * Multiplicative, because zoom is perceived logarithmically — adding a second
 * per notch is imperceptible when the window is a minute wide and violent when
 * it is two seconds. This is about a sixth of an octave per typical notch,
 * which takes a dozen or so to cross the whole useful range.
 */
const WHEEL_RATE = 0.0016

/** The whole file, or as much of it as there is. */
export function fullSpan(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_SPAN
}

/** Holds a span inside the range the file can actually show. */
export function clampSpan(span: number, duration: number): number {
  return Math.min(Math.max(span, MIN_SPAN), fullSpan(duration))
}

/** The span a wheel gesture arrives at, from the one it started on. */
export function zoomBy(span: number, deltaY: number, duration: number): number {
  return clampSpan(span * Math.exp(deltaY * WHEEL_RATE), duration)
}

/** Whether the window is showing everything there is. */
export function isFullSpan(span: number, duration: number): boolean {
  return span >= fullSpan(duration) - 1e-6
}

/**
 * Where the visible window starts, in seconds.
 *
 * Centred on the playhead and then clamped to the file, which is the whole of
 * the zoom model. The clamp is what makes the ends behave: without it the first
 * six seconds of a track are drawn against half a stage of nothing, and an
 * operator checking a fade-in is looking at an empty frame.
 */
export function windowStart(position: number, duration: number, span: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (span >= duration) return 0
  return Math.min(Math.max(position - span / 2, 0), duration - span)
}

/** The label the transport carries for a span. */
export function spanLabel(span: number, duration: number): string {
  if (isFullSpan(span, duration)) return 'ALL'
  if (span >= 60) return `${(span / 60).toFixed(1)}M`
  return span >= 10 ? `${Math.round(span)}S` : `${span.toFixed(1)}S`
}

/**
 * The instant under a point on the stage, as a fraction across it.
 *
 * Shared by every caller that turns a click into a seek, so the console page
 * and the detached player cannot disagree with the render about where a given
 * pixel is in the file.
 */
export function timeAtFraction(
  fraction: number,
  position: number,
  duration: number,
  span: number
): number {
  const window = Math.min(span, fullSpan(duration))
  return windowStart(position, duration, span) + fraction * window
}
