/** Presentation helpers. Pure functions — no React, no IPC. */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** Human-readable byte size, e.g. `805.7 MB`. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  // Whole bytes never need a decimal point.
  const digits = exponent === 0 ? 0 : fractionDigits
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

/** Transfer rate, e.g. `12.4 MB/s`. */
export function formatRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

/** Compact duration: `840ms`, `4.2s`, `1m 12s`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

/** Clock time for log lines, e.g. `14:07:22.418`. */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3
  )}`
}

/** Percentage string from a 0..1 ratio. Negative ratios mean indeterminate. */
export function formatRatio(ratio: number | null): string {
  if (ratio === null || ratio < 0) return '—'
  return `${Math.round(ratio * 100)}%`
}

/**
 * Shortens a long filesystem path for display, keeping the drive and the last
 * two segments: `C:\...\candy-haven\archive`.
 */
export function truncatePath(path: string, maxLength = 44): string {
  if (path.length <= maxLength) return path

  const segments = path.split(/[\\/]/).filter(Boolean)
  if (segments.length <= 2) return path

  const root = segments[0]
  const tail = segments.slice(-2).join('\\')
  return `${root}\\…\\${tail}`
}

/** Zero-padded index used for institutional numbering, e.g. `04`. */
export function formatIndex(index: number): string {
  return String(index).padStart(2, '0')
}

// ---------------------------------------------------------------- calendar
//
// Calendar dates are plain `YYYY-MM-DD` strings throughout the project — see
// the note in shared/domain/projects.constants.ts for why. A release is out on
// the 14th regardless of where the operator is, so nothing below converts one
// to an instant in local time, which would drag it across a day boundary.
//
// These lived under features/archive until TRANSMISSIONS also needed them.

export const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
] as const

/** `2026-03-14` -> `14 MAR 2026`. Parsed as a calendar date, not an instant. */
export function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return '—'

  const [year, month, day] = isoDate.split('-').map(Number)
  const label = MONTHS[month - 1]
  if (!label || !year || !day) return isoDate

  return `${String(day).padStart(2, '0')} ${label} ${year}`
}

/** Today as a `YYYY-MM-DD` string, read in the operator's own timezone. */
export function todayIso(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Distance from today to a scheduled date, as the operator thinks of it:
 * `IN 12 DAYS`, `TOMORROW`, `TODAY`, `4 DAYS AGO`.
 */
export function formatCountdown(isoDate: string | null): string {
  if (!isoDate) return 'UNDATED'

  const target = new Date(`${isoDate}T00:00:00Z`).getTime()
  if (Number.isNaN(target)) return 'UNDATED'

  const now = new Date()
  // Compare date-only values in UTC so a late-evening session does not report
  // tomorrow's release as being today.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((target - today) / 86_400_000)

  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  if (days === -1) return 'YESTERDAY'
  if (days > 0) return `IN ${days} DAYS`
  return `${Math.abs(days)} DAYS AGO`
}

/** Whether a scheduled date has passed — drives the overdue treatment. */
export function isOverdue(isoDate: string | null): boolean {
  if (!isoDate) return false

  const target = new Date(`${isoDate}T00:00:00Z`).getTime()
  if (Number.isNaN(target)) return false

  const now = new Date()
  return target < Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}
