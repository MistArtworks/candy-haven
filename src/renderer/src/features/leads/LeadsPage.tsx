import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { useArtists } from '@renderer/hooks/useArtists'
import { useLeads, useLeadsActions, useLeadsSettings, useNow } from '@renderer/hooks/useLeads'
import { useSystemStore, selectArchive } from '@renderer/app/store/system.store'
import { plural } from '@renderer/lib/format'
import { LeadsView } from './LeadsView'
import { LeadSheet } from './LeadSheet'
import { NewLeadDialog } from './NewLeadDialog'
import { OpportunitiesView } from './OpportunitiesView'
import { OpportunitySheet } from './OpportunitySheet'
import { isLive, openTaskRows } from './model'
import pageStyles from '@renderer/features/artists/ArtistsPage.module.scss'
import styles from './Leads.module.scss'

/**
 * Which half of the page is showing: the leads, or the opportunities that came
 * of them. In the URL (`?lens=`) with the open sheets, so a reminder, the
 * strip, NEXUS or CALENDAR lands on a lead or an opportunity directly.
 */
type Lens = 'leads' | 'opportunities'

const LENS_LABEL: Record<Lens, string> = {
  leads: 'Leads',
  opportunities: 'Opportunities'
}

function lensOf(value: string | null): Lens {
  return value === 'opportunities' ? 'opportunities' : 'leads'
}

/**
 * LEADS: the people the practice is getting to know, and the work that comes
 * of them.
 *
 * Two lenses of ARTISTS until 1.27.0, when Candy asked on DISPATCH for them to
 * have a section of their own: the CRM is daily work, and a tab inside the
 * roster hid it. It opened COMMUNITY. The roster is still where a lead is
 * linked to somebody the practice already works with (`On the roster`), and
 * the link opens their record there.
 */
export function LeadsPage(): ReactNode {
  const section = getSection('leads')
  const navigate = useNavigate()
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  // The roster, for linking a lead to somebody already on it.
  const { data: artists } = useArtists(ready)
  const roster = useMemo(() => artists ?? [], [artists])

  const [searchParams, setSearchParams] = useSearchParams()
  const lens = lensOf(searchParams.get('lens'))
  const openLeadId = searchParams.get('lead')
  const openOpportunityId = searchParams.get('opportunity')

  /** Several at once, so a move between lenses is one history step. */
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const leads = useLeads()
  const actions = useLeadsActions()
  const settings = useLeadsSettings()
  const now = useNow(30_000, leads.state)
  const [adding, setAdding] = useState(false)

  // The palette's NEW LEAD arrives as an intent, as ARTISTS' NEW ARTIST does.
  const newIntent = searchParams.get('new')
  const showAdd = adding || newIntent === 'lead'
  const clearNewIntent = (): void => setParams({ new: null })

  const openLead = openLeadId
    ? (leads.state.leads.find((lead) => lead.id === openLeadId) ?? null)
    : null
  const openOpportunity = openOpportunityId
    ? (leads.state.opportunities.find((entry) => entry.id === openOpportunityId) ?? null)
    : null

  const activeLeads = leads.state.leads.filter((lead) => lead.archivedAt === null).length
  const overdue = openTaskRows(leads.state.leads, leads.state.opportunities, now).filter(
    (row) => row.status === 'overdue'
  ).length
  const liveOpportunities = leads.state.opportunities.filter(isLive).length

  const goToLead = (id: string): void => setParams({ lens: null, lead: id, opportunity: null })
  const goToOpportunity = (id: string): void =>
    setParams({ lens: 'opportunities', opportunity: id, lead: null })
  const goToArtist = (id: string): void => {
    void navigate(`/artists?artist=${encodeURIComponent(id)}`)
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        section={section.id}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="leads"
        actions={
          <div className={pageStyles.headerActions}>
            <StatusDot
              tone={overdue > 0 ? 'warn' : activeLeads > 0 ? 'online' : 'offline'}
              label={
                overdue > 0
                  ? `${plural(activeLeads, 'lead')}, ${overdue} overdue`
                  : plural(activeLeads, 'lead')
              }
            />
          </div>
        }
      />

      {ready ? (
        <div className={styles.lenses} role="group" aria-label="Leads lens">
          {(Object.keys(LENS_LABEL) as Lens[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.lens}
              data-selected={lens === entry || undefined}
              aria-pressed={lens === entry}
              onClick={() =>
                setParams({
                  lens: entry === 'leads' ? null : entry,
                  lead: null,
                  opportunity: null
                })
              }
            >
              {LENS_LABEL[entry]}
              <span className={styles.lensCount}>
                {entry === 'leads' ? activeLeads : liveOpportunities}
              </span>
              {entry === 'leads' && overdue > 0 ? (
                <span className={styles.lensAlert}>{overdue} overdue</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {!ready ? (
        <Panel label="Leads" index="01">
          <p className={pageStyles.hint}>
            The archive is not connected, so the leads cannot be read. NEXUS reports why.
          </p>
        </Panel>
      ) : lens === 'leads' ? (
        <LeadsView
          state={leads.state}
          ready={leads.ready}
          settings={settings}
          now={now}
          actions={actions}
          roster={roster}
          onOpenLead={(id) => setParams({ lead: id })}
          onOpenOpportunity={goToOpportunity}
          onAdd={() => setAdding(true)}
        />
      ) : (
        <OpportunitiesView
          state={leads.state}
          ready={leads.ready}
          settings={settings}
          now={now}
          onOpen={(id) => setParams({ opportunity: id })}
          onOpenLeads={() => setParams({ lens: null })}
        />
      )}

      {showAdd ? (
        <NewLeadDialog
          roster={roster}
          busy={actions.busy}
          onCancel={() => {
            setAdding(false)
            if (newIntent) clearNewIntent()
          }}
          onSubmit={(draft) => {
            void actions.create(draft).then((state) => {
              if (!state) return
              setAdding(false)
              if (newIntent) clearNewIntent()
              // Straight into the new lead's sheet, as a new artist's opens.
              const made = [...state.leads].sort((a, b) => b.createdAt - a.createdAt)[0]
              if (made) goToLead(made.id)
            })
          }}
        />
      ) : null}

      <AnimatePresence>
        {openLead ? (
          <LeadSheet
            key={openLead.id}
            lead={openLead}
            opportunities={leads.state.opportunities.filter(
              (entry) => entry.leadId === openLead.id
            )}
            roster={roster}
            settings={settings}
            now={now}
            actions={actions}
            onOpenOpportunity={goToOpportunity}
            onOpenArtist={goToArtist}
            onClose={() => setParams({ lead: null })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {openOpportunity ? (
          <OpportunitySheet
            key={openOpportunity.id}
            opportunity={openOpportunity}
            lead={leads.state.leads.find((lead) => lead.id === openOpportunity.leadId) ?? null}
            settings={settings}
            now={now}
            actions={actions}
            onOpenLead={goToLead}
            onClose={() => setParams({ opportunity: null })}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
