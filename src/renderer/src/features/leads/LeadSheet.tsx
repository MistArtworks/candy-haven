import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistLink, ArtistSummary } from '@shared/domain/artists'
import { MAX_ARTIST_LINKS, SOCIAL_PLATFORM_LABEL } from '@shared/domain/artists.constants'
import type { Lead, LeadsSettings, Opportunity } from '@shared/domain/leads'
import {
  OPPORTUNITY_KIND_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  temperatureBand
} from '@shared/domain/leads.constants'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import type { LeadsActions } from '@renderer/hooks/useLeads'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Select } from '@renderer/components/primitives/Select'
import { notify } from '@renderer/components/feedback/notify'
import { initialsOf } from '@renderer/lib/initials'
import * as shell from '@renderer/lib/shell'
import { LinkEditor } from '@renderer/features/artists/components/LinkEditor'
import { TemperatureOrb } from './TemperatureOrb'
import { TemperaturePanel } from './TemperaturePanel'
import { LogInteraction } from './LogInteraction'
import { History } from './History'
import { TaskList } from './TaskList'
import { ConvertDialog } from './ConvertDialog'
import {
  formatAgo,
  formatMoney,
  leadTaskRows,
  nextTask,
  readTemperature,
  temperatureColour
} from './model'
import artistStyles from '@renderer/features/artists/ArtistsPage.module.scss'
import styles from './Leads.module.scss'

export interface LeadSheetProps {
  lead: Lead
  /** The opportunities that came of this lead. */
  opportunities: readonly Opportunity[]
  roster: readonly ArtistSummary[]
  settings: LeadsSettings
  now: number
  actions: LeadsActions
  onOpenOpportunity: (id: string) => void
  onOpenArtist: (id: string) => void
  onClose: () => void
}

type Mode = 'read' | 'edit'

/** The roster choice that links nobody. */
const NOBODY = ''

/**
 * One lead, opened: how warm it is, what's happened, what's next.
 *
 * Read first, as an artist's sheet is, with Edit as a door to the contact
 * details. Everything that happens to a relationship day to day is on the
 * read side, though, because it's what the sheet is opened for: the
 * temperature, logging an interaction, the follow-ups, and turning the lead
 * into an opportunity.
 */
export function LeadSheet({
  lead,
  opportunities,
  roster,
  settings,
  now,
  actions,
  onOpenOpportunity,
  onOpenArtist,
  onClose
}: LeadSheetProps): ReactNode {
  const [mode, setMode] = useState<Mode>('read')
  const [converting, setConverting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const dismiss = useBackdropDismiss(onClose)

  // Esc closes, unless a dialog over the sheet took it first (useDialogKeys).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const reading = readTemperature(lead, settings.coolingPerWeek, now)
  const shown = preview ?? reading.value
  const band = temperatureBand(shown)
  const rows = leadTaskRows(lead, now)
  const next = nextTask(rows)
  const artist = lead.artistId ? (roster.find((entry) => entry.id === lead.artistId) ?? null) : null
  const last = lead.interactions.at(-1) ?? null
  const archived = lead.archivedAt !== null

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
          aria-label={lead.name}
          onClick={(event) => event.stopPropagation()}
        >
          <header
            className={styles.leadHead}
            style={{ '--temp': temperatureColour(shown) } as CSSProperties}
          >
            <TemperatureOrb
              value={shown}
              initials={initialsOf(lead.name)}
              size={132}
              label={lead.name}
            />

            <div className={styles.leadTitle}>
              <span className={styles.leadNameRow}>
                <span className={styles.leadName}>{lead.name}</span>
                {archived ? <span className={styles.archivedMark}>Archived</span> : null}
              </span>
              <span className={styles.readout} aria-live="polite">
                <b className={styles.readoutValue}>{Math.round(shown)}%</b>
                <span className={styles.readoutBand}>{band.label}</span>
                <span className={styles.readoutSource} data-manual={reading.pinned || undefined}>
                  {reading.pinned ? 'Set by you' : 'From your interactions'}
                </span>
              </span>
              <span className={styles.leadMeta}>
                Added {formatAgo(lead.createdAt, now)} · {lead.interactions.length} interaction
                {lead.interactions.length === 1 ? '' : 's'}
                {last ? ` · last ${formatAgo(last.at, now)}` : ''}
              </span>
              {artist ? (
                <button
                  type="button"
                  className={styles.rosterLink}
                  onClick={() => onOpenArtist(artist.id)}
                >
                  On the roster as {artist.name} →
                </button>
              ) : null}
            </div>

            <div className={artistStyles.sheetActions}>
              {mode === 'read' ? (
                <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
                  Edit
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setMode('read')}>
                  Done editing
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </header>

          {mode === 'read' ? (
            <div className={styles.leadBody}>
              <div className={styles.leadColumn}>
                <TemperaturePanel
                  reading={reading}
                  disabled={archived}
                  onSet={(value) => void actions.setTemperature(lead.id, value)}
                  onPreview={setPreview}
                />

                <section className={styles.block}>
                  <span className={styles.fieldLabel}>Log an interaction</span>
                  <LogInteraction
                    suggestions={settings.interactions}
                    completing={next}
                    disabled={archived}
                    onLog={async (draft, complete) => {
                      const state = await actions.log(
                        lead.id,
                        draft,
                        complete && next ? next.ref : null
                      )
                      return state !== null
                    }}
                  />
                </section>

                <section className={styles.block}>
                  <span className={styles.fieldLabel}>Interactions</span>
                  <History
                    lead={lead}
                    coolingPerWeek={settings.coolingPerWeek}
                    now={now}
                    disabled={archived}
                    onRemove={(id) => void actions.unlog(lead.id, id)}
                  />
                </section>
              </div>

              <div className={styles.leadColumn}>
                <section className={styles.block}>
                  <span className={styles.fieldLabel}>Follow-ups</span>
                  <TaskList
                    rows={rows}
                    now={now}
                    actions={actions}
                    parent={archived ? null : { kind: 'lead', id: lead.id }}
                    empty="Nothing to follow up. Add one for the next step."
                  />
                </section>

                <section className={styles.block}>
                  <span className={styles.fieldLabel}>Opportunities</span>
                  {opportunities.length === 0 ? (
                    <p className={styles.quiet}>
                      None yet. When something concrete comes of this, make it an opportunity: it
                      keeps this lead, and gets a stage of its own.
                    </p>
                  ) : (
                    <ul className={styles.oppList}>
                      {opportunities.map((opportunity) => (
                        <li key={opportunity.id}>
                          <button
                            type="button"
                            className={styles.oppRow}
                            onClick={() => onOpenOpportunity(opportunity.id)}
                          >
                            <span className={styles.oppTitle}>{opportunity.title}</span>
                            <span className={styles.oppMeta}>
                              {[
                                OPPORTUNITY_KIND_LABEL[opportunity.kind],
                                formatMoney(opportunity.amount, opportunity.currency)
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            <span className={styles.stageMark} data-stage={opportunity.stage}>
                              {opportunity.archivedAt !== null
                                ? 'Archived'
                                : OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!archived ? (
                    <div>
                      <Button size="sm" variant="primary" onClick={() => setConverting(true)}>
                        Make an opportunity
                      </Button>
                    </div>
                  ) : null}
                </section>

                <ContactBlock lead={lead} />
              </div>
            </div>
          ) : (
            <EditBody lead={lead} roster={roster} actions={actions} />
          )}

          {/*
            Always at the foot, in both modes. Delete was behind Edit, at the
            bottom of the form, and Candy couldn't find a way to delete a lead
            at all; it asks first, in place.
          */}
          <footer className={artistStyles.sheetFoot}>
            {confirming ? (
              <>
                <span className={artistStyles.confirmText}>
                  Delete {lead.name} for good? Their history goes, and{' '}
                  {opportunities.length === 0
                    ? 'they have no opportunities.'
                    : `${opportunities.length} ${opportunities.length === 1 ? 'opportunity goes' : 'opportunities go'} with them.`}{' '}
                  Archiving keeps all of it.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    void actions.remove(lead.id).then((state) => {
                      if (state) onClose()
                    })
                  }}
                >
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void actions.update(lead.id, { archived: !archived })}
                >
                  {archived ? 'Bring back from the archive' : 'Archive'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                  Delete lead
                </Button>
              </>
            )}
          </footer>
        </motion.section>
      </motion.div>

      {converting ? (
        <ConvertDialog
          leadName={lead.name}
          busy={actions.busy}
          onCancel={() => setConverting(false)}
          onSubmit={(draft) => {
            void actions.convert({ ...draft, leadId: lead.id }).then((state) => {
              if (!state) return
              setConverting(false)
              const made = state.opportunities
                .filter((entry) => entry.leadId === lead.id)
                .sort((a, b) => b.createdAt - a.createdAt)[0]
              notify.done('Opportunity made', {
                detail: `${draft.title}, from ${lead.name}. It starts Open.`,
                action: made
                  ? { label: 'Open it', onClick: () => onOpenOpportunity(made.id) }
                  : undefined
              })
            })
          }}
        />
      ) : null}
    </Portal>
  )
}

/** How to reach them, read: the links pressable, the notes as prose. */
function ContactBlock({ lead }: { lead: Lead }): ReactNode {
  const nothing = !lead.email && !lead.phone && lead.links.length === 0 && !lead.notes.trim()
  return (
    <section className={styles.block}>
      <span className={styles.fieldLabel}>Contact</span>
      {nothing ? (
        <p className={styles.quiet}>Nothing on file. Add their profiles and details in Edit.</p>
      ) : null}
      {lead.email || lead.phone ? (
        <dl className={styles.contactList}>
          {lead.email ? (
            <>
              <dt>Email</dt>
              <dd className={styles.selectable}>{lead.email}</dd>
            </>
          ) : null}
          {lead.phone ? (
            <>
              <dt>Phone</dt>
              <dd className={styles.selectable}>{lead.phone}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {lead.links.length > 0 ? (
        <ul className={artistStyles.linkList}>
          {lead.links.map((link) => (
            <li key={link.id}>
              <button
                type="button"
                className={artistStyles.linkRow}
                onClick={() => shell.openExternal(link.url)}
              >
                <span className={artistStyles.linkPlatform}>
                  {link.label || SOCIAL_PLATFORM_LABEL[link.platform]}
                </span>
                <span className={artistStyles.linkUrl}>{link.url}</span>
                <span className={artistStyles.linkGo} aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {lead.notes.trim() ? <p className={artistStyles.readNotes}>{lead.notes}</p> : null}
    </section>
  )
}

/** The contact details, written as they're typed, as an artist's are. */
function EditBody({
  lead,
  roster,
  actions
}: {
  lead: Lead
  roster: readonly ArtistSummary[]
  actions: LeadsActions
}): ReactNode {
  const [name, setName] = useEchoedText(lead.name, (value) => {
    if (value.trim()) void actions.update(lead.id, { name: value })
  })
  const [email, setEmail] = useEchoedText(lead.email, (value) => {
    void actions.update(lead.id, { email: value })
  })
  const [phone, setPhone] = useEchoedText(lead.phone, (value) => {
    void actions.update(lead.id, { phone: value })
  })
  const [notes, setNotes] = useEchoedText(lead.notes, (value) => {
    void actions.update(lead.id, { notes: value })
  })

  return (
    <div className={artistStyles.sheetBody}>
      <div className={artistStyles.sheetFields}>
        <TextInput label="Name" value={name} onChange={setName} maxLength={120} />
        <div className={artistStyles.field}>
          <span className={artistStyles.fieldLabel}>On the roster</span>
          <Select
            ariaLabel="On the roster"
            value={lead.artistId ?? NOBODY}
            options={[
              { value: NOBODY, label: 'Not on the roster' },
              ...roster.map((artist) => ({ value: artist.id, label: artist.name }))
            ]}
            onChange={(value) =>
              void actions.update(lead.id, { artistId: value === NOBODY ? null : value })
            }
          />
        </div>
        <TextInput label="Email" value={email} onChange={setEmail} maxLength={200} />
        <TextInput label="Phone" value={phone} onChange={setPhone} maxLength={60} />
      </div>

      <div className={artistStyles.field}>
        <span className={artistStyles.fieldLabel}>Profiles and links</span>
        <LinkEditor
          links={lead.links}
          max={Math.min(MAX_ARTIST_LINKS, 12)}
          onChange={(links: ArtistLink[]) => void actions.update(lead.id, { links })}
        />
      </div>

      <div className={artistStyles.field}>
        <span className={artistStyles.fieldLabel}>Notes</span>
        <textarea
          className={artistStyles.notes}
          value={notes}
          rows={5}
          maxLength={4000}
          placeholder="How you came across them, what they make, who you know in common."
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </div>
  )
}
