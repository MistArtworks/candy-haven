import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { BookingChangeResult, InboxState, SiteBooking } from '@shared/domain/inbox'
import {
  BOOKING_KIND_LABEL,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABEL,
  CANCEL_NOTE_MAX,
  type BookingStatus
} from '@shared/domain/inbox.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { DateInput, SelectInput, TextArea, TextInput } from '@renderer/components/primitives/Input'
import { notify } from '@renderer/components/feedback/notify'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { gridVariants } from '@renderer/motion/transitions'
import { inboxReachable, useSiteBookings, type InboxActions } from '@renderer/hooks/useInbox'
import { useNow } from '@renderer/hooks/useLeads'
import { formatRelative, formatStamp } from '@renderer/features/dispatch/lib/present'
import { DetailRows, NoteField, StatusSwitch } from './components/Filed'
import {
  clockOf,
  dayHere,
  instantHere,
  lengthOf,
  minuteHere,
  money,
  whenHere,
  whenShort,
  whenThere
} from './lib/bookingTime'
import styles from './Inbox.module.scss'

/**
 * The list's lenses. OPEN is everything still in play (not done with, not
 * cancelled), and the default; UPCOMING is the sessions still to come.
 */
type BookingFilter = 'open' | 'upcoming' | 'commissions' | 'cancelled' | 'all' | BookingStatus

const FILTERS: { value: BookingFilter; label: string }[] = [
  { value: 'open', label: 'OPEN' },
  { value: 'upcoming', label: 'UPCOMING SESSIONS' },
  { value: 'commissions', label: 'COMMISSIONS' },
  { value: 'cancelled', label: 'CANCELLED' },
  { value: 'all', label: 'ALL' },
  ...BOOKING_STATUSES.map((status) => ({ value: status, label: BOOKING_STATUS_LABEL[status] }))
]

const SETTLED: ReadonlySet<BookingStatus> = new Set(['done', 'archived'])

/** A session still to come: the only kind that can be moved or cancelled. */
const upcoming = (booking: SiteBooking, now: number): boolean =>
  booking.kind === 'session' && !booking.cancelled && (booking.start ?? 0) > now

/** Every quarter of an hour, for the time a session moves to. */
const QUARTERS = Array.from({ length: 96 }, (_, i) => ({
  value: String(i * 15),
  label: clockOf(i * 15)
}))

/**
 * PRODUCER: "Book me as a music producer", as the website takes it.
 *
 * Every booking here is paid for: a commission's first half, a session's
 * whole fee. The website keeps what the client gave and paid, and a
 * session's time; this console keeps where each one stands and the
 * operator's note, as DJ does. A session can be moved to another time or
 * cancelled from here, which the website does: it frees the time, moves or
 * takes away the calendar event, and emails the client. A commission's
 * other half is paid on the website, with its invoice; the pay link can be
 * copied from here to send once the work is ready.
 */
export function ProducerTab({
  state,
  actions
}: {
  state: InboxState
  actions: InboxActions
}): ReactNode {
  const bookings = useSiteBookings(state)
  const now = useNow(60_000, state.revision)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<BookingFilter>('open')
  const [search, setSearch] = useState('')

  const all = useMemo(() => bookings.data ?? [], [bookings.data])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter((booking) => {
      if (filter === 'open' && (SETTLED.has(booking.status) || booking.cancelled)) return false
      if (filter === 'upcoming' && !upcoming(booking, now)) return false
      if (filter === 'commissions' && booking.kind !== 'commission') return false
      if (filter === 'cancelled' && !booking.cancelled) return false
      if (BOOKING_STATUSES.includes(filter as BookingStatus) && booking.status !== filter)
        return false
      if (!needle) return true
      return [booking.name, booking.email, booking.itemName, booking.ref, booking.clientNote]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [all, filter, search, now])

  const selected = all.find((booking) => booking.id === selectedId) ?? null

  const { setBookingNote } = actions
  const saveNote = useCallback(
    (id: string, note: string) => void setBookingNote({ id, note }),
    [setBookingNote]
  )

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel
        label="Producer bookings"
        index="01"
        focal
        className={styles.listPanel}
        aside={
          <span className={styles.count}>
            {state.waiting.bookings > 0 ? (
              <span className={styles.waiting}>{state.waiting.bookings} new</span>
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
            placeholder="Name, service, reference or words"
            className={styles.searchField}
          />
          <SelectInput
            label="Show"
            value={filter}
            options={FILTERS}
            onChange={(value) => setFilter(value as BookingFilter)}
          />
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>
            {all.length === 0
              ? state.link.syncedAt
                ? 'No bookings yet. A booking paid on "Book me as a music producer" shows here the next time the console checks: when it starts, or with Check for new.'
                : 'Nothing here yet. The first check-in fills this in.'
              : 'Nothing matches that.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  selected={booking.id === selectedId}
                  onOpen={() => setSelectedId(booking.id === selectedId ? null : booking.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        label={selected ? 'Booking' : 'Nothing open'}
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
          <BookingDetail
            key={selected.id}
            booking={selected}
            website={state.link.website}
            now={now}
            reachable={inboxReachable(state)}
            actions={actions}
            onNote={(note) => saveNote(selected.id, note)}
          />
        ) : (
          <p className={styles.empty}>Pick a booking to see it.</p>
        )}
      </Panel>
    </motion.div>
  )
}

function BookingCard({
  booking,
  selected,
  onOpen
}: {
  booking: SiteBooking
  selected: boolean
  onOpen: () => void
}): ReactNode {
  const paidInFull = booking.kind === 'session' || booking.invoice?.status === 'paid'
  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      data-settled={booking.cancelled || SETTLED.has(booking.status) || undefined}
      onClick={onOpen}
    >
      <span className={styles.cardHead}>
        {booking.status === 'new' && !booking.cancelled ? (
          <span className={styles.markNew}>NEW</span>
        ) : null}
        <span className={styles.cardRef}>{booking.ref}</span>
        <span className={styles.cardTitle}>{booking.itemName || 'A booking'}</span>
        <span className={styles.spacer} />
        <span className={styles.cardKind}>{BOOKING_KIND_LABEL[booking.kind]}</span>
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.cardWho}>
          {booking.name}
          {booking.kind === 'session' && booking.start
            ? ` · ${whenShort(booking.start)}`
            : ` · ${paidInFull ? 'Paid in full' : 'Half paid'}`}
        </span>
        <span className={styles.spacer} />
        <span className={styles.cardStamp}>{formatRelative(booking.createdAt)}</span>
        <span className={styles.cardStatus} data-tone={booking.cancelled ? 'bad' : undefined}>
          {booking.cancelled ? 'CANCELLED' : BOOKING_STATUS_LABEL[booking.status]}
        </span>
      </span>
    </button>
  )
}

type Changing = 'move' | 'cancel' | null

function BookingDetail({
  booking,
  website,
  now,
  reachable,
  actions,
  onNote
}: {
  booking: SiteBooking
  website: string
  now: number
  reachable: boolean
  actions: InboxActions
  onNote: (note: string) => void
}): ReactNode {
  const [changing, setChanging] = useState<Changing>(null)
  const session = booking.kind === 'session'
  const subject = `Re: ${booking.itemName || 'your booking'} (${booking.ref})`
  const reply = `mailto:${booking.email}?subject=${encodeURIComponent(subject)}`
  const invoice = booking.invoice
  const payLink = invoice && website ? `${website}/services/pay?invoice=${invoice.ref}` : null
  const lastMove = booking.moves[booking.moves.length - 1] ?? null

  const rows = [
    { label: 'KIND', value: BOOKING_KIND_LABEL[booking.kind] },
    ...(session && booking.start
      ? [
          { label: 'WHEN', value: whenHere(booking.start) },
          {
            label: 'THEIR TIME',
            value: whenThere(booking.start, booking.visitorTimeZone) ?? ''
          },
          { label: 'LENGTH', value: booking.end ? lengthOf(booking.start, booking.end) : '' },
          {
            label: 'MEETS ON',
            value:
              booking.meetOn === 'discord'
                ? `Discord${booking.discord ? `, ${booking.discord}` : ''} (Meet link as a fallback)`
                : 'Google Meet'
          }
        ]
      : []),
    { label: 'FROM', value: booking.name },
    { label: 'EMAIL', value: booking.email, href: `mailto:${booking.email}` },
    { label: 'PHONE', value: booking.phone },
    { label: 'INSTAGRAM', value: booking.instagram },
    ...(session || !booking.discord ? [] : [{ label: 'DISCORD', value: booking.discord }]),
    {
      label: 'PAID',
      value: session
        ? `${money(booking.nowCents)} in full`
        : `${money(booking.nowCents)} of ${money(booking.totalCents)}`
    },
    ...(invoice
      ? [
          {
            label: 'THE OTHER HALF',
            value:
              invoice.status === 'paid'
                ? `${money(invoice.dueCents)}, paid${invoice.paidAt ? ` ${formatStamp(invoice.paidAt)}` : ''} (${invoice.ref})`
                : `${money(invoice.dueCents)} due, invoice ${invoice.ref}`
          }
        ]
      : []),
    { label: 'BOOKED', value: formatStamp(booking.createdAt) }
  ]

  const copyPayLink = (): void => {
    if (!payLink) return
    void navigator.clipboard.writeText(payLink).then(
      () =>
        notify.done('Pay link copied', {
          detail: 'Send it when the work is ready: it opens the invoice for the other half.'
        }),
      (cause: unknown) => notify.refuse(cause, { label: 'Not copied' })
    )
  }

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <h3 className={styles.detailTitle}>{booking.itemName || 'A booking'}</h3>
        <span className={styles.cardRef}>{booking.ref}</span>
      </div>

      {booking.cancelled ? (
        <p className={styles.notice} data-tone="bad">
          <span className={styles.noticeLabel}>Cancelled</span>
          {booking.cancelledAt ? formatStamp(booking.cancelledAt) : ''}
          {booking.cancelNote ? `. They were told: ${booking.cancelNote}` : '.'} Any refund is made
          in Stripe.
        </p>
      ) : lastMove ? (
        <p className={styles.notice}>
          <span className={styles.noticeLabel}>Moved</span>
          from {whenHere(lastMove.from)}, {formatRelative(lastMove.at)}.
        </p>
      ) : null}

      <DetailRows rows={rows} />

      {booking.clientNote ? (
        <div className={styles.block}>
          <span className={styles.sectionLabel}>Their note</span>
          <p className={styles.body}>{booking.clientNote}</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void window.candy.shell.openExternal(reply)}
        >
          Reply by email
        </Button>
        {session && booking.meetLink && !booking.cancelled ? (
          <Button size="sm" onClick={() => void window.candy.shell.openExternal(booking.meetLink)}>
            Open the Meet link
          </Button>
        ) : null}
        {payLink && invoice?.status === 'open' ? (
          <Button size="sm" onClick={copyPayLink}>
            Copy the pay link
          </Button>
        ) : null}
        {booking.paymentUrl ? (
          <Button
            size="sm"
            onClick={() => void window.candy.shell.openExternal(booking.paymentUrl)}
          >
            See the payment
          </Button>
        ) : null}
      </div>

      {session && !booking.cancelled ? (
        <div className={styles.block}>
          <span className={styles.sectionLabel}>Its time</span>
          <div className={styles.actions}>
            {reachable ? (
              <>
                <Button size="sm" onClick={() => setChanging('move')}>
                  Move to another time
                </Button>
                {upcoming(booking, now) ? (
                  <Button size="sm" onClick={() => setChanging('cancel')}>
                    Cancel the session
                  </Button>
                ) : null}
              </>
            ) : (
              <span {...tooltipTrigger('Moving and cancelling happen on the website')}>
                <Button size="sm" disabled>
                  Connect to move or cancel
                </Button>
              </span>
            )}
          </div>
          <p className={styles.footnote}>
            Done on the website: the old time opens up again, the calendar event follows, and the
            client gets an email.
          </p>
        </div>
      ) : null}

      <div className={styles.block}>
        <span className={styles.sectionLabel}>Status</span>
        <StatusSwitch
          statuses={BOOKING_STATUSES}
          labels={BOOKING_STATUS_LABEL}
          value={booking.status}
          busy={actions.pending === 'status'}
          onChange={(status) => void actions.setBookingStatus({ id: booking.id, status })}
        />
        <p className={styles.footnote}>
          Your own tracking, kept on this machine. A new booking keeps the rail&apos;s count lit
          until it is taken up.
        </p>
      </div>

      <div className={styles.block}>
        <NoteField note={booking.note} onSave={onNote} />
      </div>

      {changing === 'move' ? (
        <MoveDialog
          booking={booking}
          now={now}
          actions={actions}
          onClose={() => setChanging(null)}
        />
      ) : null}
      {changing === 'cancel' ? (
        <CancelDialog booking={booking} actions={actions} onClose={() => setChanging(null)} />
      ) : null}
    </div>
  )
}

/** What the website did beyond the booking, said once it's done. */
function told(result: Extract<BookingChangeResult, { status: 'done' }>, what: string): void {
  const calendar =
    result.calendar === 'failed'
      ? 'The calendar event could not be changed: fix it by hand.'
      : result.calendar === 'not-connected'
        ? 'Google is not connected on the website, so the calendar was not changed.'
        : ''
  const email =
    result.email === 'sent'
      ? 'The client has an email saying so.'
      : result.email === 'failed'
        ? 'The email to the client could not be sent: write to them.'
        : 'The client was not emailed: write to them.'
  const detail = [calendar, email].filter(Boolean).join(' ')
  if (result.calendar === 'failed' || result.email !== 'sent') notify.report(what, { detail })
  else notify.done(what, { detail })
}

function MoveDialog({
  booking,
  now,
  actions,
  onClose
}: {
  booking: SiteBooking
  now: number
  actions: InboxActions
  onClose: () => void
}): ReactNode {
  const [day, setDay] = useState(() => dayHere(booking.start ?? now))
  const [minute, setMinute] = useState(() => minuteHere(booking.start ?? now))
  const [busy, setBusy] = useState<string | null>(null)
  const at = instantHere(day, minute)
  const theirs = at ? whenThere(at, booking.visitorTimeZone) : null
  const problem = !at
    ? 'Pick a day.'
    : at <= now
      ? 'Pick a time that is still to come.'
      : at === booking.start
        ? 'That is the time it is at already.'
        : null

  const move = async (force: boolean): Promise<void> => {
    if (!at) return
    const result = await actions.moveBooking({ id: booking.id, start: at, force })
    if (!result) return
    if (result.status === 'busy') {
      setBusy(result.message)
      return
    }
    told(result, `Moved to ${whenShort(at)}`)
    onClose()
  }

  return (
    <Dialog
      title="Move the session"
      subtitle={`${booking.name}, now ${booking.start ? whenShort(booking.start) : ''}`}
      confirmLabel={busy ? 'Move it anyway' : 'Move it'}
      canConfirm={!problem}
      busy={actions.pending === 'move'}
      onConfirm={() => void move(Boolean(busy))}
      onCancel={onClose}
      footnote="The same length, at the new time. The website frees the old time, moves the calendar event (the Meet link stays) and emails the client."
    >
      <div className={styles.dialogFields}>
        <div className={styles.dialogRow}>
          <DateInput
            label="Day"
            value={day}
            onChange={(value) => {
              setDay(value)
              setBusy(null)
            }}
            clearable={false}
          />
          <SelectInput
            label="Time, here"
            value={String(minute)}
            options={QUARTERS}
            onChange={(value) => {
              setMinute(Number(value))
              setBusy(null)
            }}
          />
        </div>
        {theirs ? <p className={styles.their}>Their time: {theirs}</p> : null}
        {problem ? <p className={styles.their}>{problem}</p> : null}
        {busy ? (
          <p className={styles.warning}>
            {busy} Another booking never shares a time; your calendar can, if you say so.
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

function CancelDialog({
  booking,
  actions,
  onClose
}: {
  booking: SiteBooking
  actions: InboxActions
  onClose: () => void
}): ReactNode {
  const [note, setNote] = useState('')

  const cancel = async (): Promise<void> => {
    const result = await actions.cancelBooking({ id: booking.id, note })
    if (!result || result.status !== 'done') return
    told(result, 'Session cancelled')
    onClose()
  }

  return (
    <Dialog
      title="Cancel the session"
      subtitle={`${booking.name}, ${booking.start ? whenShort(booking.start) : ''}`}
      confirmLabel="Cancel the session"
      danger
      canConfirm
      busy={actions.pending === 'cancel'}
      onConfirm={() => void cancel()}
      onCancel={onClose}
      footnote="The time opens up again, the event comes off your calendar, and the client gets an email. Any refund is yours to make in Stripe: See the payment."
    >
      <div className={styles.dialogFields}>
        <TextArea
          label="A note to them"
          value={note}
          onChange={setNote}
          rows={4}
          maxLength={CANCEL_NOTE_MAX}
          placeholder="Optional. Why, and what happens next: another time, or a refund."
          hint="Goes in the email, under the line saying it's cancelled."
        />
      </div>
    </Dialog>
  )
}
