import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { ArtistSummary } from '@shared/domain/artists'
import { SOCIAL_PLATFORM_LABEL, artistNameKey } from '@shared/domain/artists.constants'
import type { Lead, LeadsSettings, LeadsState } from '@shared/domain/leads'
import { temperatureBand } from '@shared/domain/leads.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import type { LeadsActions } from '@renderer/hooks/useLeads'
import { initialsOf } from '@renderer/lib/initials'
import { TemperatureOrb } from './TemperatureOrb'
import { TaskList } from './TaskList'
import {
  byUrgency,
  formatAgo,
  formatDue,
  isLive,
  leadTaskRows,
  nextTask,
  openTaskRows,
  readTemperature,
  temperatureColour,
  type TaskRow
} from './model'
import artistStyles from '@renderer/features/artists/ArtistsPage.module.scss'
import styles from './Leads.module.scss'

export interface LeadsViewProps {
  state: LeadsState
  ready: boolean
  settings: LeadsSettings
  now: number
  actions: LeadsActions
  roster: readonly ArtistSummary[]
  onOpenLead: (id: string) => void
  onOpenOpportunity: (id: string) => void
  onAdd: () => void
}

type Sort = 'attention' | 'hottest' | 'newest'
type Show = 'active' | 'overdue' | 'archived'

const SORT_LABEL: Record<Sort, string> = {
  attention: 'Needs you',
  hottest: 'Hottest',
  newest: 'Newest'
}

const SHOW_LABEL: Record<Show, string> = {
  active: 'Active',
  overdue: 'Overdue',
  archived: 'Archived'
}

/**
 * LEADS: everybody Candy is building a relationship with, each with their
 * orb, so the list reads warm to cold at a glance.
 *
 * Follow-ups that are due lead the page, across every lead and opportunity,
 * with the same actions as their reminders: this is where the console says
 * what's overdue, as the strip does away from it.
 */
export function LeadsView({
  state,
  ready,
  settings,
  now,
  actions,
  roster,
  onOpenLead,
  onOpenOpportunity,
  onAdd
}: LeadsViewProps): ReactNode {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('attention')
  const [show, setShow] = useState<Show>('active')

  const due = useMemo(() => {
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    return openTaskRows(state.leads, state.opportunities, now).filter(
      (row) => row.task.dueAt <= endOfToday.getTime()
    )
  }, [state, now])

  const entries = useMemo(
    () =>
      state.leads.map((lead) => {
        const rows = leadTaskRows(lead, now)
        return {
          lead,
          reading: readTemperature(lead, settings.coolingPerWeek, now),
          next: nextTask(rows),
          overdue: rows.some((row) => row.status === 'overdue'),
          live: state.opportunities.filter(
            (opportunity) => opportunity.leadId === lead.id && isLive(opportunity)
          ).length
        }
      }),
    [state, settings.coolingPerWeek, now]
  )

  const shown = useMemo(() => {
    const needle = artistNameKey(search)
    const matching = entries.filter(({ lead, overdue }) => {
      if (show === 'archived' ? lead.archivedAt === null : lead.archivedAt !== null) return false
      if (show === 'overdue' && !overdue) return false
      if (!needle) return true
      return (
        artistNameKey(lead.name).includes(needle) ||
        lead.links.some((link) => link.url.toLowerCase().includes(needle)) ||
        lead.email.toLowerCase().includes(needle)
      )
    })
    return [...matching].sort((a, b) => {
      if (sort === 'hottest') return b.reading.value - a.reading.value
      if (sort === 'newest') return b.lead.createdAt - a.lead.createdAt
      // Needs you: the overdue first, then the soonest due, then the rest,
      // warmest first among equals.
      if (a.next && b.next) return byUrgency(a.next, b.next)
      if (a.next || b.next) return a.next ? -1 : 1
      return b.reading.value - a.reading.value
    })
  }, [entries, search, show, sort])

  const active = state.leads.filter((lead) => lead.archivedAt === null).length
  const overdueCount = due.filter((row) => row.status === 'overdue').length

  const openRow = (row: TaskRow): void => {
    if (row.ref.parentKind === 'opportunity') onOpenOpportunity(row.ref.parentId)
    else onOpenLead(row.leadId)
  }

  if (ready && !state.attached) {
    return (
      <Panel label="Leads" index="01">
        <p className={artistStyles.hint}>
          The archive is not connected, so the leads cannot be read. NEXUS reports why.
        </p>
      </Panel>
    )
  }

  return (
    <div className={styles.view}>
      <div className={artistStyles.bar}>
        <div className={artistStyles.barRow}>
          <div className={artistStyles.searchWrap}>
            <input
              className={artistStyles.search}
              value={search}
              aria-label="Search the leads"
              placeholder="Search by name, link or email"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                className={artistStyles.clearSearch}
                aria-label="Clear the search"
                onClick={() => setSearch('')}
              >
                ✕
              </button>
            ) : null}
          </div>
          <span className={artistStyles.spacer} />
          <Button size="sm" variant="primary" onClick={onAdd}>
            Add a lead
          </Button>
        </div>

        <div className={artistStyles.barRow}>
          <span className={artistStyles.filterLabel}>Show</span>
          {(Object.keys(SHOW_LABEL) as Show[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={artistStyles.filterChip}
              data-on={show === entry || undefined}
              aria-pressed={show === entry}
              onClick={() => setShow(entry)}
            >
              {SHOW_LABEL[entry]}
            </button>
          ))}
          <span className={artistStyles.filterDivider} aria-hidden="true" />
          <span className={artistStyles.filterLabel}>Sort</span>
          {(Object.keys(SORT_LABEL) as Sort[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={artistStyles.filterChip}
              data-on={sort === entry || undefined}
              aria-pressed={sort === entry}
              onClick={() => setSort(entry)}
            >
              {SORT_LABEL[entry]}
            </button>
          ))}
          <span className={artistStyles.spacer} />
          <span className={artistStyles.count}>
            {active} active {active === 1 ? 'lead' : 'leads'}
          </span>
        </div>
      </div>

      {due.length > 0 && show !== 'archived' ? (
        <Panel
          label="Follow-ups due"
          index="01"
          focal={overdueCount > 0}
          aside={
            <span className={styles.panelAside}>
              {overdueCount > 0 ? `${overdueCount} overdue` : 'Today'}
            </span>
          }
        >
          <TaskList rows={due} now={now} actions={actions} parent={null} onOpenWho={openRow} />
        </Panel>
      ) : null}

      <Panel label="Leads" index={due.length > 0 && show !== 'archived' ? '02' : '01'} flush>
        {!ready ? (
          <p className={`${artistStyles.hint} ${styles.listHint}`}>Reading the leads…</p>
        ) : shown.length === 0 ? (
          <p className={`${artistStyles.hint} ${styles.listHint}`}>
            {state.leads.length === 0
              ? 'No leads yet. Add somebody you want to work with: each one starts frozen, with a first interaction to follow up, and warms as you log what happens.'
              : show === 'archived'
                ? 'Nothing archived.'
                : show === 'overdue'
                  ? 'Nothing overdue.'
                  : 'Nobody matches that.'}
          </p>
        ) : (
          <ul className={styles.leadList}>
            {shown.map(({ lead, reading, next, live }) => (
              <li key={lead.id}>
                <LeadRow
                  lead={lead}
                  value={reading.value}
                  pinned={reading.pinned}
                  next={next}
                  live={live}
                  artist={roster.find((artist) => artist.id === lead.artistId) ?? null}
                  now={now}
                  onOpen={() => onOpenLead(lead.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

interface LeadRowProps {
  lead: Lead
  value: number
  pinned: boolean
  next: TaskRow | null
  live: number
  artist: ArtistSummary | null
  now: number
  onOpen: () => void
}

/** One lead on the list, as the approved prototype draws it. */
function LeadRow({
  lead,
  value,
  pinned,
  next,
  live,
  artist,
  now,
  onOpen
}: LeadRowProps): ReactNode {
  const band = temperatureBand(value)
  const last = lead.interactions.at(-1) ?? null
  return (
    <button
      type="button"
      className={styles.leadRow}
      style={{ '--temp': temperatureColour(value) } as CSSProperties}
      data-archived={lead.archivedAt !== null || undefined}
      onClick={onOpen}
    >
      <TemperatureOrb
        value={value}
        initials={initialsOf(lead.name)}
        size={64}
        compact
        label={lead.name}
      />
      <span className={styles.leadWho}>
        <span className={styles.leadRowName}>{lead.name}</span>
        <span className={styles.leadHandle}>
          {handleOf(lead) ?? (lead.email || 'No links yet')}
        </span>
        {artist || live > 0 ? (
          <span className={styles.leadTags}>
            {artist ? <span className={styles.tag}>On the roster</span> : null}
            {live > 0 ? (
              <span className={styles.tag}>
                {live} {live === 1 ? 'opportunity' : 'opportunities'}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className={styles.leadTemp}>
        <b>{Math.round(value)}%</b>
        {band.label}
        {pinned ? <span className={styles.pinMark}>Set by you</span> : null}
      </span>
      <span className={styles.leadTask}>
        {next ? (
          <>
            <span className={styles.leadTaskTitle}>{next.task.title}</span>
            <span className={styles.leadDue} data-status={next.status}>
              {formatDue(next.task, next.status, now)}
            </span>
          </>
        ) : (
          <span className={styles.leadTaskNone}>No follow-ups</span>
        )}
        <span className={styles.leadLast}>
          {last ? `${last.text} · ${formatAgo(last.at, now)}` : 'Nothing logged yet'}
        </span>
      </span>
    </button>
  )
}

/** "@nylarae · Instagram", from their first profile link. */
function handleOf(lead: Lead): string | null {
  const link = lead.links[0]
  if (!link) return null
  const platform = link.label || SOCIAL_PLATFORM_LABEL[link.platform]
  try {
    const url = new URL(link.url)
    const first = url.pathname.split('/').filter(Boolean)[0]
    const handle = first ? (first.startsWith('@') ? first : `@${first}`) : url.hostname
    return `${handle} · ${platform}`
  } catch {
    return platform
  }
}
