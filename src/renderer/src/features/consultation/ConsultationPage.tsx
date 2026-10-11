import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import type {
  Consultation,
  ConsultationState,
  ConsultationStorage
} from '@shared/domain/consultation'
import { CLOSING_SOON_MS, formatLeft, isLinkOpen } from '@shared/domain/consultation.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import { gridVariants } from '@renderer/motion/transitions'
import {
  consultationOpen,
  consultationReachable,
  useConsultation,
  useConsultationActions,
  useConsultationFeedback,
  useConsultations
} from '@renderer/hooks/useConsultation'
import { useNow } from '@renderer/hooks/useLeads'
import { formatStamp } from '@renderer/features/dispatch/lib/present'
import { CheckForNew, WebsiteGate, WebsiteStatus } from '@renderer/components/website/WebsiteChrome'
import { formatBytes, plural } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { LinkDetail } from './components/LinkDetail'
import { ProducerPage } from './components/ProducerPage'
import { ShareDialog } from './components/ShareDialog'
import styles from './Consultation.module.scss'

/** Past this share of the free storage, the meter turns to the alarm. */
const NEARLY_FULL = 0.9

/**
 * CONSULTATION: a track shared for other producers' feedback.
 *
 * **Share a track** uploads a bounce from this machine to the website's
 * Vercel Blob store and opens a link for it there, open for one to seven
 * days. The
 * producer it is sent to types a name, listens, leaves notes at a moment or
 * over a section, tries tools on it (EQ, compressor or limiter, sidechain,
 * width, saturation) and sends it. Their feedback comes back here on the
 * check-ins, as the inbox's messages do, and is heard through the same
 * tools, A/B, on the console's transport.
 *
 * When a link closes, its page stops answering, and the website deletes
 * the track and its feedback; the link stays in the list as EXPIRED until
 * it is removed. The meter is the free storage the tracks not yet deleted
 * take. See docs/CONSULTATION.md.
 *
 * The link open is in the address (`?link=`), as DISCOGRAPHY's open
 * release is, and so is a producer's page on it (`&producer=`), which takes
 * the place of the list: the transport bar's way back comes to it.
 */
export function ConsultationPage(): ReactNode {
  const section = getSection('consultation')
  const state = useConsultation()
  const actions = useConsultationActions()
  const consultations = useConsultations(state)
  const open = consultationOpen(state)
  const reachable = consultationReachable(state)
  const now = useNow(30_000, state.revision)

  const [params, setParams] = useSearchParams()
  const pickedId = params.get('link')
  const producerId = params.get('producer')
  const [sharing, setSharing] = useState(false)
  // When the link was opened here, for its producers' NEW marks; this
  // page's own opening when it was not opened first (the way back in).
  const [pageOpenedAt] = useState(() => Date.now())
  const [opened, setOpened] = useState<{ link: string; at: number } | null>(null)

  const all = useMemo(() => consultations.data ?? [], [consultations.data])
  // The newest still open, until one is picked: that is where feedback is.
  const selected =
    all.find((link) => link.id === pickedId) ??
    all.find((link) => isLinkOpen(link, now)) ??
    all[0] ??
    null
  const live = all.filter((link) => isLinkOpen(link, now)).length
  // A producer's page, only while their link is open: a closed one's feedback is gone.
  const producing = producerId !== null && selected !== null && isLinkOpen(selected, now)

  const openLink = (id: string): void => setParams({ link: id }, { replace: true })
  const openProducer = (linkId: string, feedbackId: string): void =>
    setParams({ link: linkId, producer: feedbackId }, { replace: true })

  // Unknown until the first check-in answers; the website refuses the pass then if it must.
  const noStore = state.storage.configured === false
  const canShare = reachable && !noStore

  return (
    <div className={styles.page}>
      <PageHeader
        section={section.id}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="consultation"
        actions={<WebsiteStatus link={state.link} />}
      />

      <WebsiteGate link={state.link} what="CONSULTATION">
        A shared track and its link are kept by the website, behind the same two accounts as the
        board, and signing in here signs in there too. Nothing is fetched or shown until someone
        has.
      </WebsiteGate>

      {open && producing && selected && producerId ? (
        <ProducerView
          link={selected}
          state={state}
          producerId={producerId}
          openedAt={opened?.link === selected.id ? opened.at : pageOpenedAt}
          onBack={() => openLink(selected.id)}
          onPick={(feedbackId) => openProducer(selected.id, feedbackId)}
        />
      ) : null}

      {open && !producing ? (
        <div className={styles.toolbar}>
          <StorageMeter storage={state.storage} />
          <div className={styles.toolbarActions}>
            <span
              {...tooltipTrigger(
                !reachable
                  ? 'Sharing opens a link on the website, so it needs the website'
                  : noStore
                    ? 'The website has no Blob store to keep tracks in yet'
                    : ''
              )}
            >
              <Button
                disabled={!canShare}
                icon={
                  // An arrow out of a tray: something leaving.
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                    <path
                      d="M6 7.2V1.6M3.6 4 6 1.6 8.4 4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    />
                    <path d="M1.8 7.8v2.4h8.4V7.8" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                }
                onClick={() => setSharing(true)}
              >
                {reachable ? 'Share a track…' : 'Connect to share'}
              </Button>
            </span>
            <CheckForNew
              link={state.link}
              syncing={actions.pending === 'sync'}
              onSync={() => void actions.sync()}
            />
          </div>
        </div>
      ) : null}

      {open && noStore && !producing ? (
        <p className={styles.notice}>
          <span className={styles.noticeLabel}>NO STORE</span>
          The website has no Blob store yet, so there is nowhere to keep a shared track. It is set
          up once, in the website&apos;s Vercel project, and costs nothing. The CATECHISM&apos;s
          CONSULTATION chapter says where the steps are.
        </p>
      ) : null}

      {open && !producing ? (
        <motion.div
          className={styles.grid}
          variants={gridVariants}
          initial="initial"
          animate="animate"
        >
          <Panel
            label="Shared"
            index="01"
            className={styles.listPanel}
            aside={
              <span className={styles.count}>
                {state.waiting > 0 ? (
                  <span className={styles.waiting}>{state.waiting} new</span>
                ) : null}
                {live} open · {all.length} in all
              </span>
            }
          >
            {all.length === 0 ? (
              <p className={styles.empty}>
                {state.link.syncedAt
                  ? 'Nothing shared yet. Share a track to ask for feedback on it; the link you send is open for up to a week.'
                  : 'Nothing here yet. The first check-in fills this in.'}
              </p>
            ) : (
              <ul className={styles.list}>
                {all.map((link) => (
                  <li key={link.id}>
                    <LinkCard
                      link={link}
                      now={now}
                      selected={link.id === selected?.id}
                      onOpen={() => openLink(link.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            label={selected ? selected.title : 'Nothing open'}
            index="02"
            focal
            className={styles.detailPanel}
          >
            {selected ? (
              <LinkDetail
                key={selected.id}
                link={selected}
                state={state}
                now={now}
                actions={actions}
                onOpenProducer={(feedbackId, at) => {
                  setOpened({ link: selected.id, at })
                  openProducer(selected.id, feedbackId)
                }}
              />
            ) : (
              <p className={styles.empty}>
                Share a track, and its link and the feedback on it are here.
              </p>
            )}
          </Panel>
        </motion.div>
      ) : null}

      {sharing ? (
        <ShareDialog
          storage={state.storage}
          website={state.link.website}
          onClose={(shared) => {
            setSharing(false)
            if (shared) openLink(shared.id)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * How much of the website's free Blob storage the shared tracks take: those
 * not deleted yet, from either copy of the console. Sharing refuses a track
 * that would go past it.
 */
function StorageMeter({ storage }: { storage: ConsultationStorage }): ReactNode {
  const ratio = storage.limitBytes > 0 ? storage.usedBytes / storage.limitBytes : 0
  const free = Math.max(0, storage.limitBytes - storage.usedBytes)
  return (
    <div
      className={styles.meter}
      {...tooltipTrigger(
        'Tracks not deleted yet, shared from either copy of the console, against the storage Vercel’s free plan includes. Ending a link deletes its track at once.'
      )}
    >
      <Meter
        value={Math.min(1, ratio)}
        label="STORAGE"
        readout={`${formatBytes(storage.usedBytes)} of ${formatBytes(storage.limitBytes, 0)} · ${formatBytes(free)} free`}
        tone={ratio >= NEARLY_FULL ? 'error' : 'gold'}
        size="sm"
      />
    </div>
  )
}

function LinkCard({
  link,
  now,
  selected,
  onOpen
}: {
  link: Consultation
  now: number
  selected: boolean
  onOpen: () => void
}): ReactNode {
  const live = isLinkOpen(link, now)
  const left = link.expiresAt - now

  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      data-settled={!live || undefined}
      onClick={onOpen}
    >
      <span className={styles.cardHead}>
        {link.unread > 0 ? <span className={styles.markNew}>{link.unread} NEW</span> : null}
        <span className={styles.cardTitle}>{link.title}</span>
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.cardWho}>
          {live
            ? plural(link.feedbackCount, 'response')
            : link.endedAt
              ? `Ended ${formatStamp(link.endedAt)}`
              : `Closed ${formatStamp(link.expiresAt)}`}
        </span>
        <span className={styles.spacer} />
        {live ? (
          <span className={styles.cardStamp} data-soon={left <= CLOSING_SOON_MS || undefined}>
            closes in {formatLeft(left)}
          </span>
        ) : null}
        <span className={styles.cardStatus} data-tone={live ? 'good' : undefined}>
          {live ? 'OPEN' : 'EXPIRED'}
        </span>
      </span>
    </button>
  )
}

/** A producer's page on an open link, once its feedback is read. */
function ProducerView({
  link,
  state,
  producerId,
  openedAt,
  onBack,
  onPick
}: {
  link: Consultation
  state: ConsultationState
  producerId: string
  openedAt: number
  onBack: () => void
  onPick: (feedbackId: string) => void
}): ReactNode {
  const feedback = useConsultationFeedback(state, link.id)
  if (!feedback.data) {
    return (
      <Panel label={link.title} index="01" focal>
        <p className={styles.empty}>
          {feedback.isError ? 'Its feedback could not be read just now.' : 'Reading…'}
        </p>
      </Panel>
    )
  }
  return (
    <ProducerPage
      link={link}
      feedback={feedback.data}
      producerId={producerId}
      openedAt={openedAt}
      onBack={onBack}
      onPick={onPick}
    />
  )
}
