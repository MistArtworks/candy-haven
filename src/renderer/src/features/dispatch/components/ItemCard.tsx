import type { ReactNode } from 'react'
import type { DispatchItem } from '@shared/domain/dispatch'
import {
  DISPATCH_AREA_LABEL,
  DISPATCH_AUTHOR_LABEL,
  DISPATCH_KIND_LABEL,
  DISPATCH_PRIORITY_LABEL,
  DISPATCH_STATUS_LABEL,
  type DispatchAuthor
} from '@shared/domain/dispatch.constants'
import { formatRelative } from '../lib/present'
import styles from '../DispatchPage.module.scss'

export interface ItemCardProps {
  item: DispatchItem
  selected: boolean
  /** Comments the reader has not seen. Zero draws nothing. */
  unread: number
  /** True for an item the reader has never opened at all. */
  unseen: boolean
  onOpen: () => void
}

/**
 * One item, as a row on the board.
 *
 * The unread mark is the reason this is a component rather than a list item.
 * Two people use this asynchronously — one files something and closes the app,
 * the other answers hours later — so the only question the board has to answer
 * at a glance is *has anything happened since I last looked*, and the answer has
 * to survive being one row among forty.
 *
 * So it is a crimson count, the one saturated colour the page is allowed, and it
 * sits where the eye lands rather than at the end of the row. NEW and a comment
 * count are separate marks: an item nobody has replied to yet is the one most
 * easily missed, precisely because it has no discussion to draw attention.
 */
export function ItemCard({ item, selected, unread, unseen, onOpen }: ItemCardProps): ReactNode {
  const comments = Object.keys(item.comments).length

  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      data-status={item.status}
      onClick={onOpen}
    >
      <span className={styles.cardMarks}>
        {unseen ? <span className={styles.markNew}>NEW</span> : null}
        {unread > 0 ? (
          <span className={styles.markUnread} title={`${unread} unread`}>
            {unread}
          </span>
        ) : null}
      </span>

      <span className={styles.cardHead}>
        <span className={styles.cardKind}>{DISPATCH_KIND_LABEL[item.kind]}</span>
        <span className={styles.cardTitle}>{item.title}</span>
      </span>

      <span className={styles.cardMeta}>
        <span className={styles.cardAuthor}>
          {DISPATCH_AUTHOR_LABEL[item.author as DispatchAuthor]}
        </span>
        <span className={styles.cardArea}>{DISPATCH_AREA_LABEL[item.area]}</span>
        {item.priority !== 'normal' ? (
          <span className={styles.cardPriority} data-level={item.priority}>
            {DISPATCH_PRIORITY_LABEL[item.priority]}
          </span>
        ) : null}
        <span className={styles.cardSpacer} />
        {comments > 0 ? (
          <span className={styles.cardComments}>
            {comments} comment{comments === 1 ? '' : 's'}
          </span>
        ) : null}
        <span className={styles.cardStamp}>{formatRelative(item.updatedAt)}</span>
        <span className={styles.cardStatus} data-status={item.status}>
          {DISPATCH_STATUS_LABEL[item.status]}
        </span>
      </span>
    </button>
  )
}
