import { useMemo, useState, type ReactNode } from 'react'
import type { DispatchItem } from '@shared/domain/dispatch'
import {
  DISPATCH_AREA_LABEL,
  DISPATCH_AUTHOR_LABEL,
  DISPATCH_COMMENT_MAX,
  DISPATCH_KIND_LABEL,
  DISPATCH_PRIORITY_LABEL,
  DISPATCH_REASON_MAX,
  DISPATCH_STATUS_LABEL,
  type DispatchAuthor
} from '@shared/domain/dispatch.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { TextArea } from '@renderer/components/primitives/Input'
import { formatStamp } from '../lib/present'
import styles from '../DispatchPage.module.scss'

export interface ThreadProps {
  item: DispatchItem
  identity: DispatchAuthor | null
  /** True for the one who rules on items. The other only files and comments. */
  adjudicator: boolean
  busy: boolean
  onComment: (body: string) => void
  onRule: (status: DispatchItem['status'], reason: string) => void
  onWithdraw: () => void
}

/**
 * One item in full: what was asked, what was said about it, and what was decided.
 *
 * The ruling controls are the whole reason the two panes are split rather than
 * the card expanding in place. A decision — resolve, deny with a reason, or put
 * back — deserves its own surface with the discussion visible above it, not a
 * row of buttons crammed into a list.
 */
export function Thread({
  item,
  identity,
  adjudicator,
  busy,
  onComment,
  onRule,
  onWithdraw
}: ThreadProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Oldest first: a thread is read downwards, and the newest reply is the one
  // the eye should finish on rather than start at.
  const comments = useMemo(
    () => Object.values(item.comments).sort((a, b) => a.createdAt - b.createdAt),
    [item.comments]
  )

  const canComment = identity !== null && draft.trim().length > 0

  return (
    <div className={styles.thread}>
      <header className={styles.threadHead}>
        <span className={styles.threadKind}>{DISPATCH_KIND_LABEL[item.kind]}</span>
        <h3 className={styles.threadTitle}>{item.title}</h3>
        <span className={styles.threadStatus} data-status={item.status}>
          {DISPATCH_STATUS_LABEL[item.status]}
        </span>
      </header>

      <FieldGrid columns={3}>
        <Field label="Filed by" value={DISPATCH_AUTHOR_LABEL[item.author as DispatchAuthor]} />
        <Field label="Area" value={DISPATCH_AREA_LABEL[item.area]} />
        <Field label="Priority" value={DISPATCH_PRIORITY_LABEL[item.priority]} />
      </FieldGrid>

      {item.body ? <p className={styles.threadBody}>{item.body}</p> : null}

      {/*
        The ruling, quoted back above the discussion rather than only shown as a
        badge. A denial's reason is the most important thing on the page for
        whoever filed the item, and burying it in a status chip would defeat the
        point of requiring one.
      */}
      {item.status !== 'pending' ? (
        <div className={styles.ruling} data-status={item.status}>
          <span className={styles.rulingLabel}>
            {DISPATCH_STATUS_LABEL[item.status]}
            {item.statusAt ? ` · ${formatStamp(item.statusAt)}` : ''}
          </span>
          {item.statusReason ? <p className={styles.rulingReason}>{item.statusReason}</p> : null}
        </div>
      ) : null}

      <div className={styles.comments}>
        <span className={styles.sectionLabel}>
          Discussion {comments.length > 0 ? `· ${comments.length}` : ''}
        </span>

        {comments.length === 0 ? (
          <p className={styles.empty}>Nothing said yet.</p>
        ) : (
          <ul className={styles.commentList}>
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={styles.comment}
                data-own={comment.author === identity || undefined}
              >
                <span className={styles.commentHead}>
                  <span className={styles.commentAuthor}>
                    {DISPATCH_AUTHOR_LABEL[comment.author]}
                  </span>
                  <span className={styles.commentStamp}>{formatStamp(comment.createdAt)}</span>
                </span>
                <p className={styles.commentBody}>{comment.body}</p>
              </li>
            ))}
          </ul>
        )}

        <TextArea
          label="Reply"
          value={draft}
          onChange={setDraft}
          rows={3}
          maxLength={DISPATCH_COMMENT_MAX}
          placeholder={identity ? 'Say something' : 'Choose who you are first'}
        />
        <div className={styles.commentActions}>
          <Button
            size="sm"
            disabled={!canComment}
            busy={busy}
            onClick={() => {
              onComment(draft)
              setDraft('')
            }}
          >
            Post
          </Button>
        </div>
      </div>

      {/*
        Only one of them rules. The other sees the outcome and the reason but no
        controls — a board where either party can close the other's request is
        not a board, it is a race.
      */}
      {adjudicator ? (
        <div className={styles.ruleBlock}>
          <span className={styles.sectionLabel}>Ruling</span>

          <TextArea
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={2}
            maxLength={DISPATCH_REASON_MAX}
            placeholder="Required to deny. Optional to resolve."
            hint="Whoever filed this reads this line first."
          />

          <div className={styles.ruleActions}>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || item.status === 'resolved'}
              onClick={() => {
                onRule('resolved', reason)
                setReason('')
              }}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="danger"
              // Mirrors the service, which refuses this too. Disabling here says
              // so before the click rather than after it.
              disabled={busy || item.status === 'denied' || reason.trim().length === 0}
              title={
                reason.trim().length === 0 ? 'Give a reason first' : 'Deny, with the reason above'
              }
              onClick={() => {
                onRule('denied', reason)
                setReason('')
              }}
            >
              Deny
            </Button>
            <Button
              size="sm"
              disabled={busy || item.status === 'pending'}
              onClick={() => {
                onRule('pending', '')
                setReason('')
              }}
            >
              Put back to pending
            </Button>

            <span className={styles.cardSpacer} />

            {/*
              Withdrawing is not denying. It takes the discussion with it, so it
              asks — and it asks in place rather than in a dialog, because a
              modal for a two-person board is more ceremony than the act needs.
            */}
            {confirming ? (
              <>
                <span className={styles.confirmText}>Delete this and its comments?</span>
                <Button size="sm" variant="danger" busy={busy} onClick={onWithdraw}>
                  Delete
                </Button>
                <Button size="sm" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setConfirming(true)}>
                Withdraw
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
