import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import type { InboxState, SiteEnquiry } from '@shared/domain/inbox'
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABEL,
  type EnquiryStatus
} from '@shared/domain/inbox.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import {
  inboxOpen,
  inboxReachable,
  useInbox,
  useInboxActions,
  useSiteEnquiries,
  type InboxActions
} from '@renderer/hooks/useInbox'
import { formatRelative, formatStamp } from '@renderer/features/dispatch/lib/present'
import { InboxGate, InboxStatus } from './components/InboxChrome'
import { DeleteControl, DetailRows, NoteField, StatusSwitch } from './components/Filed'
import styles from './Inbox.module.scss'

const TABS = [
  { id: 'dj', label: 'DJ' },
  { id: 'producer', label: 'PRODUCER' }
] as const
type ServicesTab = (typeof TABS)[number]['id']

/** The list's lenses. OPEN is everything still in play, and the default. */
type EnquiryFilter = 'open' | 'all' | EnquiryStatus

const FILTERS: { value: EnquiryFilter; label: string }[] = [
  { value: 'open', label: 'OPEN' },
  { value: 'all', label: 'ALL' },
  ...ENQUIRY_STATUSES.map((status) => ({ value: status, label: ENQUIRY_STATUS_LABEL[status] }))
]

/** Done with: settled one way or the other, or put away. */
const SETTLED: ReadonlySet<EnquiryStatus> = new Set(['confirmed', 'declined', 'archived'])

/**
 * SERVICES: what the website books.
 *
 * Two tabs, for the two things the website offers. DJ is the "Book me as a
 * DJ" enquiries, checked in alongside CONTACT's messages. PRODUCER waits for
 * the website to take payment: a booking is only worth filing once it is
 * paid for (the deposit on a commission, the whole fee for a one-to-one), and
 * that side of the website is not built yet.
 *
 * The tab is kept in the address, `?tab=producer`, so a notification or a
 * link can open the one it means.
 */
export function ServicesPage(): ReactNode {
  const section = getSection('services')
  const state = useInbox()
  const actions = useInboxActions()
  const open = inboxOpen(state)

  const [searchParams, setSearchParams] = useSearchParams()
  const tab: ServicesTab = searchParams.get('tab') === 'producer' ? 'producer' : 'dj'
  const chooseTab = (next: ServicesTab): void => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === 'dj') params.delete('tab')
        else params.set('tab', next)
        return params
      },
      { replace: true }
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="services"
        actions={
          <InboxStatus
            state={state}
            syncing={actions.pending === 'sync'}
            onSync={() => void actions.sync()}
          />
        }
      />

      <InboxGate state={state} what="SERVICES" />

      {open ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Services">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={tab === entry.id}
                onClick={() => chooseTab(entry.id)}
              >
                {entry.label}
                {entry.id === 'dj' && state.waiting.enquiries > 0 ? (
                  <span className={styles.waiting}>{state.waiting.enquiries}</span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === 'dj' ? <DjTab state={state} actions={actions} /> : <ProducerTab />}
        </>
      ) : null}
    </div>
  )
}

function DjTab({ state, actions }: { state: InboxState; actions: InboxActions }): ReactNode {
  const enquiries = useSiteEnquiries(state)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<EnquiryFilter>('open')
  const [search, setSearch] = useState('')

  const all = useMemo(() => enquiries.data ?? [], [enquiries.data])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter((enquiry) => {
      if (filter === 'open' && SETTLED.has(enquiry.status)) return false
      if (filter !== 'open' && filter !== 'all' && enquiry.status !== filter) return false
      if (!needle) return true
      return [
        enquiry.name,
        enquiry.email,
        enquiry.eventName,
        enquiry.eventVenue,
        enquiry.about,
        enquiry.ref
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [all, filter, search])

  const selected = all.find((enquiry) => enquiry.id === selectedId) ?? null

  const { setNote } = actions
  const saveNote = useCallback(
    (id: string, note: string) => void setNote({ kind: 'enquiry', id, note }),
    [setNote]
  )

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel
        label="DJ enquiries"
        index="01"
        focal
        className={styles.listPanel}
        aside={
          <span className={styles.count}>
            {state.waiting.enquiries > 0 ? (
              <span className={styles.waiting}>{state.waiting.enquiries} new</span>
            ) : null}
            {all.length} in all
          </span>
        }
      >
        <div className={styles.controls}>
          <TextInput
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Name, event, venue or words"
            className={styles.searchField}
          />
          <SelectInput
            label="Show"
            value={filter}
            options={FILTERS}
            onChange={(value) => setFilter(value as EnquiryFilter)}
          />
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>
            {all.length === 0
              ? state.link.syncedAt
                ? 'No bookings yet. An enquiry sent from "Book me as a DJ" shows here the next time the console checks: when it starts, or with Check for new.'
                : 'Nothing here yet. The first check-in fills this in.'
              : 'Nothing matches that.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((enquiry) => (
              <li key={enquiry.id}>
                <EnquiryCard
                  enquiry={enquiry}
                  selected={enquiry.id === selectedId}
                  onOpen={() => setSelectedId(enquiry.id === selectedId ? null : enquiry.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        label={selected ? 'Enquiry' : 'Nothing open'}
        index="02"
        className={styles.detailPanel}
        aside={
          selected ? (
            <button type="button" className={styles.quiet} onClick={() => setSelectedId(null)}>
              Close
            </button>
          ) : null
        }
      >
        {selected ? (
          <EnquiryDetail
            key={selected.id}
            enquiry={selected}
            busy={actions.pending === 'status'}
            deleting={actions.pending === 'delete'}
            reachable={inboxReachable(state)}
            onStatus={(status) => void actions.setEnquiryStatus({ id: selected.id, status })}
            onNote={(note) => saveNote(selected.id, note)}
            onDelete={() => {
              void actions.remove({ kind: 'enquiry', id: selected.id }).then((done) => {
                if (done) setSelectedId(null)
              })
            }}
          />
        ) : (
          <p className={styles.empty}>Pick an enquiry to read it.</p>
        )}
      </Panel>
    </motion.div>
  )
}

function ProducerTab(): ReactNode {
  return (
    <Panel label="Producer bookings" index="01" focal>
      <div className={styles.soon}>
        <h3 className={styles.soonTitle}>Coming soon</h3>
        <p className={styles.soonText}>
          Producer bookings will arrive here once the website takes payment for them. A commission
          is filed when its 50% deposit is paid, and a one-to-one session when it is paid in full,
          so everything that lands here is already a booking rather than a question.
        </p>
      </div>
    </Panel>
  )
}

function EnquiryCard({
  enquiry,
  selected,
  onOpen
}: {
  enquiry: SiteEnquiry
  selected: boolean
  onOpen: () => void
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      data-settled={enquiry.status === 'archived' || enquiry.status === 'declined' || undefined}
      onClick={onOpen}
    >
      <span className={styles.cardHead}>
        {enquiry.status === 'new' ? <span className={styles.markNew}>NEW</span> : null}
        <span className={styles.cardRef}>{enquiry.ref}</span>
        <span className={styles.cardTitle}>{enquiry.eventName || 'An event'}</span>
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.cardWho}>
          {enquiry.name}
          {enquiry.budget ? ` · ${enquiry.budget}` : ''}
        </span>
        <span className={styles.spacer} />
        <span className={styles.cardStamp}>{formatRelative(enquiry.createdAt)}</span>
        <span
          className={styles.cardStatus}
          data-tone={
            enquiry.status === 'confirmed'
              ? 'good'
              : enquiry.status === 'declined'
                ? 'bad'
                : undefined
          }
        >
          {ENQUIRY_STATUS_LABEL[enquiry.status]}
        </span>
      </span>
    </button>
  )
}

function EnquiryDetail({
  enquiry,
  busy,
  deleting,
  reachable,
  onStatus,
  onNote,
  onDelete
}: {
  enquiry: SiteEnquiry
  busy: boolean
  deleting: boolean
  reachable: boolean
  onStatus: (status: EnquiryStatus) => void
  onNote: (note: string) => void
  onDelete: () => void
}): ReactNode {
  const subject = enquiry.eventName ? `Re: ${enquiry.eventName}` : 'Re: your booking enquiry'
  const reply = `mailto:${enquiry.email}?subject=${encodeURIComponent(subject)}`

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <h3 className={styles.detailTitle}>{enquiry.eventName || 'An event'}</h3>
        <span className={styles.cardRef}>{enquiry.ref}</span>
      </div>

      <DetailRows
        rows={[
          { label: 'FROM', value: enquiry.name },
          { label: 'ROLE', value: enquiry.title },
          { label: 'EMAIL', value: enquiry.email, href: `mailto:${enquiry.email}` },
          { label: 'PHONE', value: enquiry.phone },
          { label: 'EVENT', value: enquiry.eventName },
          { label: 'VENUE', value: enquiry.eventVenue },
          { label: 'BUDGET', value: enquiry.budget },
          { label: 'RECEIVED', value: formatStamp(enquiry.createdAt) }
        ]}
      />

      {enquiry.about ? <p className={styles.body}>{enquiry.about}</p> : null}

      <div className={styles.actions}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void window.candy.shell.openExternal(reply)}
        >
          Reply by email
        </Button>
      </div>

      <div className={styles.block}>
        <span className={styles.sectionLabel}>Status</span>
        <StatusSwitch
          statuses={ENQUIRY_STATUSES}
          labels={ENQUIRY_STATUS_LABEL}
          value={enquiry.status}
          busy={busy}
          onChange={onStatus}
        />
        <p className={styles.footnote}>
          Your own tracking, kept on this machine. A new enquiry keeps the rail&apos;s count lit
          until it is taken up or turned down.
        </p>
      </div>

      <div className={styles.block}>
        <NoteField note={enquiry.note} onSave={onNote} />
      </div>

      <div className={styles.block}>
        <div className={styles.actions}>
          <DeleteControl reachable={reachable} busy={deleting} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
