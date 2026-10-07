import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Lead, LeadsSettings, Opportunity } from '@shared/domain/leads'
import {
  CLOSED_STAGES,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_KIND_LABEL,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  temperatureBand
} from '@shared/domain/leads.constants'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import type { LeadsActions } from '@renderer/hooks/useLeads'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { initialsOf } from '@renderer/lib/initials'
import { TemperatureOrb } from './TemperatureOrb'
import { TaskList } from './TaskList'
import {
  amountOf,
  formatAgo,
  formatMoney,
  formatWhen,
  opportunityTaskRows,
  readTemperature,
  temperatureColour
} from './model'
import artistStyles from '@renderer/features/artists/ArtistsPage.module.scss'
import styles from './Leads.module.scss'

export interface OpportunitySheetProps {
  opportunity: Opportunity
  lead: Lead | null
  settings: LeadsSettings
  now: number
  actions: LeadsActions
  onOpenLead: (id: string) => void
  onClose: () => void
}

/** The run of stages, before Won and Lost close it. */
const RUN = OPPORTUNITY_STAGES.filter((stage) => !CLOSED_STAGES.includes(stage))

/**
 * One opportunity, opened: where it stands, what's next, what it's worth.
 *
 * The stage is set the way a project's is in the ARCHIVE's dossier: every
 * stage in one row, one press each, passed ones underlined, so a deal that
 * jumps from talks to agreed is one press and not three. Won and Lost sit
 * apart from the run, as SHELVE does there; so does Archive, which keeps the
 * record without it being in the way.
 */
export function OpportunitySheet({
  opportunity,
  lead,
  settings,
  now,
  actions,
  onOpenLead,
  onClose
}: OpportunitySheetProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  const dismiss = useBackdropDismiss(onClose)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [title, setTitle] = useEchoedText(opportunity.title, (value) => {
    if (value.trim()) void actions.updateOpportunity(opportunity.id, { title: value })
  })
  const [notes, setNotes] = useEchoedText(opportunity.notes, (value) => {
    void actions.updateOpportunity(opportunity.id, { notes: value })
  })
  const [amount, setAmount] = useState(
    opportunity.amount === null ? '' : String(opportunity.amount)
  )
  const [currency, setCurrency] = useState(opportunity.currency)

  const archived = opportunity.archivedAt !== null
  const reading = lead ? readTemperature(lead, settings.coolingPerWeek, now) : null
  const rows = opportunityTaskRows(opportunity, lead, now)
  const stageIndex = RUN.indexOf(opportunity.stage)
  const money = formatMoney(opportunity.amount, opportunity.currency)
  const amountOk = amount.trim() === '' || amountOf(amount) !== null

  const saveValue = (): void => {
    if (!amountOk || !currency.trim()) return
    const next = amount.trim() === '' ? null : amountOf(amount)
    if (next === opportunity.amount && currency.trim().toUpperCase() === opportunity.currency) {
      return
    }
    void actions.updateOpportunity(opportunity.id, {
      amount: next,
      currency: currency.trim().toUpperCase()
    })
  }

  return (
    <Portal>
      <motion.div
        className={artistStyles.sheetBackdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        {...dismiss}
      >
        <motion.section
          className={`${artistStyles.sheet} ${styles.leadSheet}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          role="dialog"
          aria-label={opportunity.title}
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.oppHead}>
            <div className={styles.leadTitle}>
              <span className={styles.oppKind}>
                {OPPORTUNITY_KIND_LABEL[opportunity.kind]}
                {money ? ` · ${money}` : ''}
              </span>
              <span className={styles.leadNameRow}>
                <span className={styles.leadName}>{opportunity.title}</span>
                {archived ? <span className={styles.archivedMark}>Archived</span> : null}
              </span>
              <span className={styles.leadMeta}>
                Made {formatAgo(opportunity.createdAt, now)}
                {opportunity.closedAt !== null
                  ? ` · ${OPPORTUNITY_STAGE_LABEL[opportunity.stage]} ${formatWhen(opportunity.closedAt, now)}`
                  : ''}
              </span>
            </div>

            {lead && reading ? (
              <button
                type="button"
                className={styles.oppLead}
                style={{ '--temp': temperatureColour(reading.value) } as CSSProperties}
                onClick={() => onOpenLead(lead.id)}
              >
                <TemperatureOrb
                  value={reading.value}
                  initials={initialsOf(lead.name)}
                  size={56}
                  compact
                  label={lead.name}
                />
                <span className={styles.oppLeadText}>
                  <span className={styles.oppLeadLabel}>Lead</span>
                  <span className={styles.oppLeadName}>{lead.name}</span>
                  <span className={styles.oppLeadTemp}>
                    <b>{Math.round(reading.value)}%</b> {temperatureBand(reading.value).label}
                  </span>
                </span>
              </button>
            ) : null}

            <div className={artistStyles.sheetActions}>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </header>

          <div className={styles.stageBand}>
            <span className={styles.fieldLabel}>Stage</span>
            <div className={styles.stageStrip} role="group" aria-label="Stage">
              {RUN.map((stage, index) => (
                <button
                  key={stage}
                  type="button"
                  className={styles.stageStep}
                  aria-pressed={opportunity.stage === stage}
                  data-current={opportunity.stage === stage || undefined}
                  data-passed={
                    opportunity.stage === 'won' ||
                    (stageIndex >= 0 && index < stageIndex) ||
                    undefined
                  }
                  disabled={archived}
                  onClick={() => void actions.updateOpportunity(opportunity.id, { stage })}
                >
                  <span className={styles.stageIndex}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.stageLabel}>{OPPORTUNITY_STAGE_LABEL[stage]}</span>
                </button>
              ))}
              {CLOSED_STAGES.map((stage, index) => (
                <button
                  key={stage}
                  type="button"
                  className={`${styles.stageStep} ${styles.stageClose}`}
                  data-first={index === 0 || undefined}
                  data-stage={stage}
                  aria-pressed={opportunity.stage === stage}
                  data-current={opportunity.stage === stage || undefined}
                  disabled={archived}
                  onClick={() => void actions.updateOpportunity(opportunity.id, { stage })}
                >
                  <span className={styles.stageLabel}>{OPPORTUNITY_STAGE_LABEL[stage]}</span>
                </button>
              ))}
              <button
                type="button"
                className={`${styles.stageStep} ${styles.stageArchive}`}
                aria-pressed={archived}
                data-current={archived || undefined}
                onClick={() =>
                  void actions.updateOpportunity(opportunity.id, { archived: !archived })
                }
              >
                <span className={styles.stageLabel}>{archived ? 'Archived' : 'Archive'}</span>
              </button>
            </div>
          </div>

          <div className={styles.leadBody}>
            <div className={styles.leadColumn}>
              <section className={styles.block}>
                <span className={styles.fieldLabel}>Follow-ups</span>
                <TaskList
                  rows={rows}
                  now={now}
                  actions={actions}
                  parent={archived ? null : { kind: 'opportunity', id: opportunity.id }}
                  empty="Nothing to follow up. Add the next step."
                />
              </section>
            </div>

            <div className={styles.leadColumn}>
              <section className={styles.block}>
                <span className={styles.fieldLabel}>Details</span>
                <TextInput label="What it is" value={title} onChange={setTitle} maxLength={160} />
                <div className={artistStyles.field}>
                  <span className={artistStyles.fieldLabel}>Kind</span>
                  <div className={artistStyles.chips}>
                    {OPPORTUNITY_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={artistStyles.chip}
                        data-on={opportunity.kind === kind || undefined}
                        aria-pressed={opportunity.kind === kind}
                        onClick={() => void actions.updateOpportunity(opportunity.id, { kind })}
                      >
                        {OPPORTUNITY_KIND_LABEL[kind]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.money} onBlur={saveValue}>
                  <TextInput
                    label="Value"
                    value={amount}
                    onChange={setAmount}
                    onEnter={saveValue}
                    mono
                    maxLength={14}
                    placeholder="Not set"
                    invalid={!amountOk}
                    hint={amountOk ? undefined : 'A number, as 1200 or 1200.50'}
                  />
                  <TextInput
                    label="Currency"
                    value={currency}
                    onChange={(next) => setCurrency(next.toUpperCase())}
                    onEnter={saveValue}
                    mono
                    maxLength={8}
                  />
                </div>
                <div className={artistStyles.field}>
                  <span className={artistStyles.fieldLabel}>Notes</span>
                  <textarea
                    className={artistStyles.notes}
                    value={notes}
                    rows={5}
                    maxLength={4000}
                    placeholder="Terms, dates, who else is involved."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </section>
            </div>
          </div>

          <footer className={artistStyles.sheetFoot}>
            {confirming ? (
              <>
                <span className={artistStyles.confirmText}>
                  Delete this opportunity and its follow-ups for good? Archiving keeps them.
                  {lead ? ` ${lead.name} stays a lead.` : ''}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    void actions.removeOpportunity(opportunity.id).then((state) => {
                      if (state) onClose()
                    })
                  }}
                >
                  Delete
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                Delete opportunity
              </Button>
            )}
          </footer>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
