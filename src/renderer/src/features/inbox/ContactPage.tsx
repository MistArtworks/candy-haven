import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { SiteMessage } from '@shared/domain/inbox'
import {
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABEL,
  type MessageStatus
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
  useSiteMessages
} from '@renderer/hooks/useInbox'
import { formatRelative, formatStamp } from '@renderer/features/dispatch/lib/present'
import { CheckForNew, InboxGate, InboxStatus } from './components/InboxChrome'
import { DeleteControl, DetailRows, NoteField, StatusSwitch } from './components/Filed'
import styles from './Inbox.module.scss'

/** The list's lenses. INBOX is everything not archived, and the default. */
type MessageFilter = 'inbox' | 'all' | MessageStatus

const FILTERS: { value: MessageFilter; label: string }[] = [
  { value: 'inbox', label: 'INBOX' },
  { value: 'all', label: 'ALL' },
  ...MESSAGE_STATUSES.map((status) => ({ value: status, label: MESSAGE_STATUS_LABEL[status] }))
]

/**
 * CONTACT: the messages the website's contact page sends.
 *
 * The website keeps what was sent and this page keeps a copy, brought up to
 * date when the console starts and when the operator asks, so it opens at
 * once and with the network down. Opening a new message reads it; where it
 * stands after that is the operator's own tracking, kept on this machine
 * with the note. See docs/INBOX.md.
 */
export function ContactPage(): ReactNode {
  const section = getSection('contact')
  const state = useInbox()
  const actions = useInboxActions()
  const messages = useSiteMessages(state)
  const open = inboxOpen(state)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<MessageFilter>('inbox')
  const [search, setSearch] = useState('')

  const all = useMemo(() => messages.data ?? [], [messages.data])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter((message) => {
      if (filter === 'inbox' && message.status === 'archived') return false
      if (filter !== 'inbox' && filter !== 'all' && message.status !== filter) return false
      if (!needle) return true
      return [message.name, message.email, message.subject, message.message, message.ref]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [all, filter, search])

  const selected = all.find((message) => message.id === selectedId) ?? null

  const openMessage = (message: SiteMessage): void => {
    if (message.id === selectedId) {
      setSelectedId(null)
      return
    }
    setSelectedId(message.id)
    if (message.status === 'new') void actions.read(message.id)
  }

  const { setNote } = actions
  const saveNote = useCallback(
    (id: string, note: string) => void setNote({ kind: 'message', id, note }),
    [setNote]
  )

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="contact"
        actions={<InboxStatus state={state} />}
      />

      <InboxGate state={state} what="CONTACT" />

      {open ? (
        <div className={styles.toolbar}>
          <CheckForNew
            state={state}
            syncing={actions.pending === 'sync'}
            onSync={() => void actions.sync()}
          />
        </div>
      ) : null}

      {open ? (
        <motion.div
          className={styles.grid}
          variants={gridVariants}
          initial="initial"
          animate="animate"
        >
          <Panel
            label="Messages"
            index="01"
            focal
            className={styles.listPanel}
            aside={
              <span className={styles.count}>
                {state.waiting.messages > 0 ? (
                  <span className={styles.waiting}>{state.waiting.messages} new</span>
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
                placeholder="Name, address, subject or words"
                className={styles.searchField}
              />
              <SelectInput
                label="Show"
                value={filter}
                options={FILTERS}
                onChange={(value) => setFilter(value as MessageFilter)}
              />
            </div>

            {shown.length === 0 ? (
              <p className={styles.empty}>
                {all.length === 0
                  ? state.link.syncedAt
                    ? 'Nobody has written yet. A message sent from the website shows here the next time the console checks: when it starts, or with Check for new.'
                    : 'Nothing here yet. The first check-in fills this in.'
                  : 'Nothing matches that.'}
              </p>
            ) : (
              <ul className={styles.list}>
                {shown.map((message) => (
                  <li key={message.id}>
                    <MessageCard
                      message={message}
                      selected={message.id === selectedId}
                      onOpen={() => openMessage(message)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            label={selected ? 'Message' : 'Nothing open'}
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
              <MessageDetail
                key={selected.id}
                message={selected}
                busy={actions.pending === 'status'}
                deleting={actions.pending === 'delete'}
                reachable={inboxReachable(state)}
                onStatus={(status) => void actions.setMessageStatus({ id: selected.id, status })}
                onNote={(note) => saveNote(selected.id, note)}
                onDelete={() => {
                  void actions.remove({ kind: 'message', id: selected.id }).then((done) => {
                    if (done) setSelectedId(null)
                  })
                }}
              />
            ) : (
              <p className={styles.empty}>Pick a message to read it.</p>
            )}
          </Panel>
        </motion.div>
      ) : null}
    </div>
  )
}

function MessageCard({
  message,
  selected,
  onOpen
}: {
  message: SiteMessage
  selected: boolean
  onOpen: () => void
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      data-settled={message.status === 'archived' || undefined}
      onClick={onOpen}
    >
      <span className={styles.cardHead}>
        {message.status === 'new' ? <span className={styles.markNew}>NEW</span> : null}
        <span className={styles.cardRef}>{message.ref}</span>
        <span className={styles.cardTitle}>{message.subject || '(no subject)'}</span>
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.cardWho}>
          {message.name} · {message.email}
        </span>
        <span className={styles.spacer} />
        <span className={styles.cardStamp}>{formatRelative(message.createdAt)}</span>
        <span
          className={styles.cardStatus}
          data-tone={message.status === 'replied' ? 'good' : undefined}
        >
          {MESSAGE_STATUS_LABEL[message.status]}
        </span>
      </span>
    </button>
  )
}

function MessageDetail({
  message,
  busy,
  deleting,
  reachable,
  onStatus,
  onNote,
  onDelete
}: {
  message: SiteMessage
  busy: boolean
  deleting: boolean
  reachable: boolean
  onStatus: (status: MessageStatus) => void
  onNote: (note: string) => void
  onDelete: () => void
}): ReactNode {
  const reply = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <h3 className={styles.detailTitle}>{message.subject || '(no subject)'}</h3>
        <span className={styles.cardRef}>{message.ref}</span>
      </div>

      <DetailRows
        rows={[
          { label: 'FROM', value: message.name },
          { label: 'EMAIL', value: message.email, href: `mailto:${message.email}` },
          { label: 'PHONE', value: message.phone },
          { label: 'ORGANISATION', value: message.organisation },
          { label: 'DATE', value: message.date },
          { label: 'LOCATION', value: message.location },
          { label: 'BUDGET', value: message.budget },
          { label: 'LINKS', value: message.links },
          { label: 'RECEIVED', value: formatStamp(message.createdAt) }
        ]}
      />

      <p className={styles.body}>{message.message}</p>

      <div className={styles.actions}>
        {/* Answered from the operator's own mail, which is where the reply
            belongs; marking it replied is a separate, deliberate step. */}
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
          statuses={MESSAGE_STATUSES}
          labels={MESSAGE_STATUS_LABEL}
          value={message.status}
          busy={busy}
          onChange={onStatus}
        />
        <p className={styles.footnote}>
          Your own tracking, like the note: kept on this machine, never on the website.
        </p>
      </div>

      <div className={styles.block}>
        <NoteField note={message.note} onSave={onNote} />
      </div>

      <div className={styles.block}>
        <div className={styles.actions}>
          <DeleteControl reachable={reachable} busy={deleting} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
