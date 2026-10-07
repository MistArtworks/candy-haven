import type { ReactNode } from 'react'
import type { Lead } from '@shared/domain/leads'
import { formatAgo, formatWhen, signOf, signed } from './model'
import styles from './Leads.module.scss'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface HistoryProps {
  lead: Lead
  coolingPerWeek: number
  now: number
  disabled?: boolean
  onRemove: (interactionId: string) => void
}

type Row =
  | { kind: 'logged'; id: string; at: number; text: string; points: number }
  | { kind: 'quiet'; id: string; at: number; weeks: number; points: number }
  | { kind: 'added'; id: string; at: number }

/**
 * What's happened with them, newest first, ending where the lead began.
 *
 * Quiet spells are drawn between the interactions with what they cost, so
 * the number on the orb can always be added up from what's on screen. They
 * are worked out, never stored: change the cooling in REGULATION and they
 * change with it.
 */
export function History({
  lead,
  coolingPerWeek,
  now,
  disabled = false,
  onRemove
}: HistoryProps): ReactNode {
  // Replayed as `automaticTemperature` does, so a quiet spell shows what it
  // actually took: nothing, from a lead already frozen.
  const rows: Row[] = [{ kind: 'added', id: 'added', at: lead.createdAt }]
  let value = 0
  let since = lead.createdAt
  const quiet = (until: number, key: string): void => {
    const span = Math.max(0, until - since)
    const next = Math.max(0, value - (span / WEEK_MS) * Math.max(0, coolingPerWeek))
    const points = Math.round(next - value)
    const weeks = Math.floor(span / WEEK_MS)
    if (weeks >= 1 && points < 0) rows.push({ kind: 'quiet', id: key, at: until, weeks, points })
    value = next
  }
  for (const entry of [...lead.interactions].sort((a, b) => a.at - b.at)) {
    quiet(entry.at, `quiet-${entry.id}`)
    rows.push({ kind: 'logged', ...entry })
    value = Math.min(100, Math.max(0, value + entry.points))
    since = Math.max(since, entry.at)
  }
  quiet(now, 'quiet-now')
  rows.reverse()

  return (
    <ol className={styles.history}>
      {rows.map((row) => (
        <li key={row.id} className={styles.historyRow} data-kind={row.kind}>
          <span
            className={styles.historyPoints}
            data-sign={row.kind === 'added' ? undefined : signOf(row.points)}
          >
            {row.kind === 'added' ? '·' : signed(row.points)}
          </span>
          <span className={styles.historyText}>
            {row.kind === 'logged'
              ? row.text
              : row.kind === 'quiet'
                ? `Quiet for ${row.weeks} week${row.weeks === 1 ? '' : 's'}`
                : 'Added as a lead'}
          </span>
          <span className={styles.historyWhen} title={formatWhen(row.at, now)}>
            {row.kind === 'quiet' && row.id === 'quiet-now' ? 'so far' : formatAgo(row.at, now)}
          </span>
          {row.kind === 'logged' ? (
            <button
              type="button"
              className={styles.historyRemove}
              aria-label={`Remove "${row.text}"`}
              title="Logged by mistake? Remove it"
              disabled={disabled}
              onClick={() => onRemove(row.id)}
            >
              ×
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  )
}
