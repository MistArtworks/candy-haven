/**
 * The transport's clock.
 *
 * Shared by the department page and the detached player, which is the only
 * reason it is a module: two windows showing the same file must not disagree
 * about how long it is.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
