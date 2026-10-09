import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { CheckForNew, WebsiteGate, WebsiteStatus } from '@renderer/components/website/WebsiteChrome'
import { useSystemStore } from '@renderer/app/store/system.store'
import { useOfferings, useOfferingsActions } from '@renderer/hooks/useOfferings'
import { HoursTab } from '@renderer/features/offerings/HoursTab'
import { OfferingsTab } from '@renderer/features/offerings/OfferingsTab'
import { DeleteControl, DetailRows, NoteField, StatusSwitch } from './components/Filed'
import { ProducerTab } from './ProducerTab'
import styles from './Inbox.module.scss'

const TABS = [
  { id: 'dj', label: 'DJ' },
  { id: 'producer', label: 'PRODUCER' },
  { id: 'offerings', label: 'OFFERINGS' },
  { id: 'hours', label: 'HOURS' }
] as const
type ServicesTab = (typeof TABS)[number]['id']

const isTab = (value: string | null): value is ServicesTab =>
  TABS.some((entry) => entry.id === value)

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
 * DJ is the "Book me as a DJ" enquiries, checked in alongside CONTACT's
 * messages. PRODUCER is "Book me as a music producer": every booking there
 * is already paid for (the deposit on a commission, the whole fee for a
 * one-to-one), checked in with the rest, and a session can be moved or
 * cancelled from here (see ProducerTab). OFFERINGS and HOURS are what
 * that page offers and when its sessions can be booked, written here and
 * published to the website (see features/offerings).
 *
 * The tab is kept in the address, `?tab=producer`, so a notification or a
 * link can open the one it means.
 */
export function ServicesPage(): ReactNode {
  const section = getSection('services')
  const state = useInbox()
  const actions = useInboxActions()
  const open = inboxOpen(state)

  const offerings = useOfferings()
  const offeringsActions = useOfferingsActions()

  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: ServicesTab = isTab(requested) ? requested : 'dj'
  const chooseTab = (next: ServicesTab): void => {
    // Leaving a service or the hours half-typed is guarded as leaving the
    // page is: the unsaved-changes bar asks for a save or a discard.
    const { unsaved, nudgeUnsaved } = useSystemStore.getState()
    if (unsaved?.dirty) {
      nudgeUnsaved()
      return
    }
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

  // What the website offers is fetched once, the first time OFFERINGS or
  // HOURS opens while someone's signed in: the other person may have
  // published since. After that, Check the website.
  const publishing = tab === 'offerings' || tab === 'hours'
  const fetched = useRef(false)
  const { sync: syncOfferings } = offeringsActions
  useEffect(() => {
    if (!publishing || fetched.current || !open) return
    fetched.current = true
    void syncOfferings()
  }, [publishing, open, syncOfferings])

  return (
    <div className={styles.page}>
      <PageHeader
        section={section.id}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="services"
        actions={<WebsiteStatus link={state.link} />}
      />

      <WebsiteGate link={state.link} what="SERVICES">
        What the website&apos;s visitors send is kept behind the same two accounts as the board, and
        signing in here signs in there too. The website checks the sign-in itself before it hands
        anything over, so nothing is fetched or shown until someone has.
      </WebsiteGate>

      {open ? (
        <>
          <div className={styles.toolbar}>
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
                  {entry.id === 'producer' && state.waiting.bookings > 0 ? (
                    <span className={styles.waiting}>{state.waiting.bookings}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {publishing ? null : (
              <CheckForNew
                link={state.link}
                syncing={actions.pending === 'sync'}
                onSync={() => void actions.sync()}
              />
            )}
          </div>

          {tab === 'dj' ? (
            <DjTab state={state} actions={actions} />
          ) : tab === 'producer' ? (
            <ProducerTab state={state} actions={actions} />
          ) : tab === 'offerings' ? (
            <OfferingsTab state={offerings} actions={offeringsActions} />
          ) : (
            <HoursTab state={offerings} actions={offeringsActions} />
          )}
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
