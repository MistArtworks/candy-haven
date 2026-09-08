import type { MusicalKey } from '@shared/domain/projects'

/**
 * Presentation helpers specific to the project registry.
 *
 * Pure functions. Anything general enough for other departments belongs in
 * lib/format.ts instead; these encode how *this* register reads — compact
 * relative days in a dense table, institutional date stamps in a dossier.
 */

/** `150.004` -> `150`, `128.5` -> `128.5`, `null` -> `—`. */
export function formatTempo(bpm: number | null): string {
  if (bpm === null || !Number.isFinite(bpm)) return '—'
  return Number.isInteger(bpm) ? String(bpm) : String(Math.round(bpm * 10) / 10)
}

/**
 * Live's song key, e.g. `D Minor`.
 *
 * The scale can legitimately be absent — Live stores it as an index into its
 * own mode list, and an index this build does not recognise degrades to the
 * root note alone rather than to a guessed mode.
 */
export function formatKey(key: MusicalKey | null, abbreviate = false): string {
  if (!key) return '—'
  if (!key.scale) return key.root
  return `${key.root} ${abbreviate ? key.scale.slice(0, 3) : key.scale}`
}

/**
 * Compact age for a table column: `TODAY`, `4D`, `3W`, `7MO`, `2Y`.
 *
 * Deliberately coarse. In a register sorted by last touched, the useful
 * question is "recent or not", and a full timestamp per row would be ten
 * columns of noise.
 */
export function formatRelativeDay(timestamp: number): string {
  if (!timestamp) return '—'

  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days < 0) return 'TODAY'
  if (days === 0) return 'TODAY'
  if (days === 1) return 'YESTERDAY'
  if (days < 7) return `${days}D`
  if (days < 31) return `${Math.floor(days / 7)}W`
  if (days < 365) return `${Math.floor(days / 30)}MO`
  return `${Math.floor(days / 365)}Y`
}

const MONTHS = [
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

/** Full stamp for record metadata: `14 MAR 2026 · 21:07`. */
export function formatStamp(timestamp: number): string {
  if (!timestamp) return '—'

  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

/** `222` seconds -> `3:42`. */
export function formatLength(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—'

  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
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
