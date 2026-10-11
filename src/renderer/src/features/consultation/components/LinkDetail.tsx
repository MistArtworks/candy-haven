import { useEffect, useState, type ReactNode } from 'react'
import type {
  Consultation,
  ConsultationFeedback,
  ConsultationState
} from '@shared/domain/consultation'
import {
  DAY_MS,
  MAX_LINK_DAYS,
  formatLeft,
  isLinkOpen
} from '@shared/domain/consultation.constants'
import { formatClock } from '@shared/consult/engine'
import { usePlayback } from '@renderer/app/providers/playback'
import { Button } from '@renderer/components/primitives/Button'
import { DialogChip, DialogChips } from '@renderer/components/primitives/Dialog'
import { DetailRows } from '@renderer/features/inbox/components/Filed'
import { formatRelative, formatStamp } from '@renderer/features/dispatch/lib/present'
import {
  consultationReachable,
  useConsultationFeedback,
  type ConsultationActions
} from '@renderer/hooks/useConsultation'
import { useCopy } from '@renderer/hooks/useCopy'
import { formatBytes, plural } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { insertFor, trackKey } from '../lib/listen'
import { hasTools } from '../lib/track'
import styles from '../Consultation.module.scss'

/** Whole days a link can be open for, counted from when it was shared. */
const DAYS = Array.from({ length: MAX_LINK_DAYS }, (_, index) => index + 1)

/**
 * One shared track: where it stands, its link, when it closes, and the
 * feedback on it while it is open. A closed one is only the record that it
 * was, its track and feedback deleted, and can be removed.
 *
 * Opening it reads its feedback, as opening a message reads it; what was
 * new when it was opened reads NEW until it is put away. Each producer who
 * sent some is a row, and opens their own page.
 */
export function LinkDetail({
  link,
  state,
  now,
  actions,
  onOpenProducer
}: {
  link: Consultation
  state: ConsultationState
  now: number
  actions: ConsultationActions
  /** A producer's page, with when this link was opened here, for its NEW marks. */
  onOpenProducer: (feedbackId: string, openedAt: number) => void
}): ReactNode {
  const live = isLinkOpen(link, now)
  const feedback = useConsultationFeedback(state, live ? link.id : null)
  const copier = useCopy()
  const reachable = consultationReachable(state)
  const { source, insert, setInsert } = usePlayback()
  // When it was opened here: feedback read since still reads NEW.
  const [openedAt] = useState(() => Date.now())

  const open = (entry: ConsultationFeedback): void => {
    // Listening to this track already: hear the one opened.
    if (source?.key === trackKey(link) && insert?.key !== entry.id) {
      setInsert(insertFor(link, entry))
    }
    onOpenProducer(entry.id, openedAt)
  }

  const { read } = actions
  useEffect(() => {
    if (live && link.unread > 0) void read(link.id)
  }, [live, link.id, link.unread, read])

  const entries = feedback.data ?? []

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <span className={styles.stateMark} data-live={live || undefined}>
          {live ? 'OPEN' : 'EXPIRED'}
        </span>
        <span className={styles.detailWhen}>
          {live
            ? `Closes ${formatStamp(link.expiresAt)}, in ${formatLeft(link.expiresAt - now)}`
            : link.endedAt
              ? `Ended early, ${formatStamp(link.endedAt)}`
              : `Closed ${formatStamp(link.expiresAt)}`}
        </span>
      </div>

      {live && link.link ? (
        <div className={styles.linkRow}>
          <span className={styles.url} {...tooltipTrigger(link.link)}>
            {link.link}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => copier.copy(link.id, link.link as string)}
          >
            {copier.copied === link.id ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            size="sm"
            onClick={() => void window.candy.shell.openExternal(link.link as string)}
          >
            Open
          </Button>
        </div>
      ) : null}

      <DetailRows
        rows={[
          {
            label: 'SHARED',
            value: `${formatStamp(link.createdAt)}${link.sharedBy ? ` · by ${link.sharedBy}` : ''}`
          },
          { label: 'LENGTH', value: link.durationMs ? formatClock(link.durationMs / 1000) : '' },
          { label: 'TEMPO', value: link.bpm ? `${link.bpm} BPM` : '' },
          { label: 'SIZE', value: link.audio.bytes ? formatBytes(link.audio.bytes) : '' },
          { label: 'FILE', value: link.sourcePath ?? '' },
          { label: 'ASKED', value: link.message }
        ]}
      />

      {live ? (
        <>
          <CloseControls
            link={link}
            now={now}
            reachable={reachable}
            busy={actions.pending === 'expiry'}
            ending={actions.pending === 'end'}
            onClose={(expiresAt) => void actions.changeExpiry(link.id, expiresAt)}
            onEnd={() => void actions.end(link.id)}
          />

          <div className={styles.block}>
            <span className={styles.sectionLabel}>Feedback</span>
            {entries.length ? (
              <ul className={styles.producerList}>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={styles.producerRow}
                      onClick={() => open(entry)}
                    >
                      {entry.readAt === null || entry.readAt >= openedAt ? (
                        <span className={styles.markNew}>NEW</span>
                      ) : null}
                      <span className={styles.producerName}>{entry.name}</span>
                      <span className={styles.producerMeta}>
                        {plural(entry.notes.length, 'note')}
                        {hasTools(entry) ? ' · tools' : ''}
                      </span>
                      <span className={styles.spacer} />
                      <span className={styles.producerWhen}>
                        {formatRelative(entry.submittedAt)}
                      </span>
                      <span className={styles.producerGo} aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {feedback.isLoading
                  ? 'Reading…'
                  : 'Nobody has sent feedback yet. It shows here the next time the console checks: when it starts, or with Check for new.'}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className={styles.block}>
          <p className={styles.footnote}>
            Its track and all its feedback were deleted when it closed; only its name is kept.
            {link.audioDeletedAt === null
              ? ' The track is still in storage, and is deleted at the next check-in.'
              : ''}
          </p>
          <div className={styles.actions}>
            <RemoveControl
              reachable={reachable}
              busy={actions.pending === 'remove'}
              onRemove={() => void actions.remove(link.id)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * When an open link closes: any whole day from when it was shared, up to
 * the seventh, and **End now**, which asks first.
 */
function CloseControls({
  link,
  now,
  reachable,
  busy,
  ending,
  onClose,
  onEnd
}: {
  link: Consultation
  now: number
  reachable: boolean
  busy: boolean
  ending: boolean
  onClose: (expiresAt: number) => void
  onEnd: () => void
}): ReactNode {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className={styles.block}>
      <span className={styles.sectionLabel}>Open for</span>
      <DialogChips>
        {DAYS.map((days) => {
          const at = link.createdAt + days * DAY_MS
          const on = Math.abs(link.expiresAt - at) < 60_000
          return (
            <DialogChip
              key={days}
              on={on}
              label={`${days} DAY${days === 1 ? '' : 'S'}`}
              title={at <= now ? 'Gone by already' : `Closes ${formatStamp(at)}`}
              disabled={!reachable || busy || at <= now}
              onClick={() => {
                if (!on) onClose(at)
              }}
            />
          )
        })}
      </DialogChips>
      <p className={styles.footnote}>
        Counted from when it was shared. When it closes, the page stops answering, and the track and
        all its feedback are deleted. Its name stays here, marked EXPIRED.
      </p>

      <div className={styles.actions}>
        {!reachable ? (
          <span {...tooltipTrigger('The website closes the link, so ending it needs the website')}>
            <Button size="sm" disabled>
              Connect to end it
            </Button>
          </span>
        ) : confirming ? (
          <>
            <span className={styles.confirmText}>
              End it now? The page closes, and its track and feedback are deleted.
            </span>
            <Button size="sm" variant="danger" busy={ending} onClick={onEnd}>
              End now
            </Button>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setConfirming(true)}>
            End now
          </Button>
        )}
      </div>
    </div>
  )
}

/** Forgetting a closed link, here and on the website. Asks first. */
function RemoveControl({
  reachable,
  busy,
  onRemove
}: {
  reachable: boolean
  busy: boolean
  onRemove: () => void
}): ReactNode {
  const [confirming, setConfirming] = useState(false)

  if (!reachable) {
    return (
      <span
        {...tooltipTrigger(
          'Removing it forgets it on the website as well, so it needs the website'
        )}
      >
        <Button size="sm" disabled>
          Connect to remove
        </Button>
      </span>
    )
  }

  if (!confirming) {
    return (
      <Button size="sm" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    )
  }

  return (
    <>
      <span className={styles.confirmText}>Remove it for good, here and on the website?</span>
      <Button size="sm" variant="danger" busy={busy} onClick={onRemove}>
        Remove
      </Button>
      <Button size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </>
  )
}
