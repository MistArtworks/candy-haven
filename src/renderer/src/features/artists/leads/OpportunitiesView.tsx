import { useMemo, useState, type ReactNode } from 'react'
import { artistNameKey } from '@shared/domain/artists.constants'
import type { Lead, LeadsSettings, LeadsState, Opportunity } from '@shared/domain/leads'
import {
  OPPORTUNITY_KIND_LABEL,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  type OpportunityStage
} from '@shared/domain/leads.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { TemperatureOrb } from './TemperatureOrb'
import {
  formatDue,
  formatMoney,
  isLive,
  nextTask,
  opportunityTaskRows,
  readTemperature
} from './model'
import artistStyles from '../ArtistsPage.module.scss'
import styles from './Leads.module.scss'

export interface OpportunitiesViewProps {
  state: LeadsState
  ready: boolean
  settings: LeadsSettings
  now: number
  onOpen: (id: string) => void
  onOpenLeads: () => void
}

/**
 * OPPORTUNITIES: what came of the leads, as a board by stage.
 *
 * Stage is the work's own and separate from the lead's temperature, so the
 * board is laid out by stage and each card carries its lead's orb small: a
 * hot relationship with a stalled project reads as exactly that. Won and Lost
 * close the run; archived ones are kept out of the way until asked for.
 */
export function OpportunitiesView({
  state,
  ready,
  settings,
  now,
  onOpen,
  onOpenLeads
}: OpportunitiesViewProps): ReactNode {
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)

  const leads = useMemo(() => new Map(state.leads.map((lead) => [lead.id, lead])), [state.leads])

  const shown = useMemo(() => {
    const needle = artistNameKey(search)
    return state.opportunities.filter((opportunity) => {
      if ((opportunity.archivedAt !== null) !== archived) return false
      if (!needle) return true
      const lead = leads.get(opportunity.leadId)
      return (
        artistNameKey(opportunity.title).includes(needle) ||
        (lead ? artistNameKey(lead.name).includes(needle) : false)
      )
    })
  }, [state.opportunities, leads, search, archived])

  const live = state.opportunities.filter(isLive)
  const inPlay = totals(live)

  if (ready && !state.attached) {
    return (
      <Panel label="Opportunities" index="01">
        <p className={artistStyles.hint}>
          The archive is not connected, so the opportunities cannot be read. NEXUS reports why.
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
              aria-label="Search the opportunities"
              placeholder="Search by title or lead"
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
          <button
            type="button"
            className={artistStyles.filterChip}
            data-on={archived || undefined}
            aria-pressed={archived}
            onClick={() => setArchived((current) => !current)}
          >
            Archived
          </button>
          <span className={artistStyles.spacer} />
          <span className={artistStyles.count}>
            {live.length} live
            {inPlay.length > 0 ? ` · ${inPlay.join(' + ')} in play` : ''}
          </span>
        </div>
      </div>

      {!ready ? (
        <p className={artistStyles.hint}>Reading the opportunities…</p>
      ) : state.opportunities.length === 0 ? (
        <Panel label="Opportunities" index="01">
          <p className={artistStyles.hint}>
            No opportunities yet. They come from leads: open one in{' '}
            <button type="button" className={styles.inlineLink} onClick={onOpenLeads}>
              LEADS
            </button>{' '}
            and make an opportunity when something concrete comes of it.
          </p>
        </Panel>
      ) : (
        <div className={styles.board}>
          {OPPORTUNITY_STAGES.map((stage) => {
            const cards = shown
              .filter((opportunity) => opportunity.stage === stage)
              .sort((a, b) => b.updatedAt - a.updatedAt)
            return (
              <section key={stage} className={styles.column} data-stage={stage}>
                <header className={styles.columnHead}>
                  <span className={styles.columnLabel}>{OPPORTUNITY_STAGE_LABEL[stage]}</span>
                  <span className={styles.columnCount}>{cards.length}</span>
                </header>
                <div className={styles.columnBody}>
                  {cards.map((opportunity) => (
                    <OpportunityCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      lead={leads.get(opportunity.leadId) ?? null}
                      settings={settings}
                      now={now}
                      onOpen={() => onOpen(opportunity.id)}
                    />
                  ))}
                  {cards.length === 0 ? (
                    <span className={styles.columnEmpty}>{emptyFor(stage)}</span>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface OpportunityCardProps {
  opportunity: Opportunity
  lead: Lead | null
  settings: LeadsSettings
  now: number
  onOpen: () => void
}

function OpportunityCard({
  opportunity,
  lead,
  settings,
  now,
  onOpen
}: OpportunityCardProps): ReactNode {
  const next = nextTask(opportunityTaskRows(opportunity, lead, now))
  const value = lead ? readTemperature(lead, settings.coolingPerWeek, now).value : 0
  const money = formatMoney(opportunity.amount, opportunity.currency)
  return (
    <button
      type="button"
      className={styles.card}
      data-archived={opportunity.archivedAt !== null || undefined}
      onClick={onOpen}
    >
      <span className={styles.cardKind}>{OPPORTUNITY_KIND_LABEL[opportunity.kind]}</span>
      <span className={styles.cardTitle}>{opportunity.title}</span>
      {money ? <span className={styles.cardMoney}>{money}</span> : null}
      {lead ? (
        <span className={styles.cardLead}>
          {/* No initials at this size: they'd be a smudge four pixels high. */}
          <TemperatureOrb value={value} size={28} compact label={lead.name} />
          <span className={styles.cardLeadName}>{lead.name}</span>
        </span>
      ) : null}
      {next ? (
        <span className={styles.cardNext} data-status={next.status}>
          {next.task.title} · {formatDue(next.task, next.status, now)}
        </span>
      ) : null}
    </button>
  )
}

/** What an empty column says, so an empty board still reads as a pipeline. */
function emptyFor(stage: OpportunityStage): string {
  if (stage === 'won') return 'Nothing won yet'
  if (stage === 'lost') return 'Nothing lost'
  return '·'
}

/** What's in play, per currency: "CAD 2,400", "USD 500". */
function totals(opportunities: readonly Opportunity[]): string[] {
  const sums = new Map<string, number>()
  for (const opportunity of opportunities) {
    if (opportunity.amount === null) continue
    sums.set(opportunity.currency, (sums.get(opportunity.currency) ?? 0) + opportunity.amount)
  }
  return [...sums.entries()].map(([currency, sum]) => formatMoney(sum, currency) ?? '')
}
