import { useState, type ReactNode } from 'react'
import type { LoreChapterView } from '@shared/domain/lore'
import { CHAPTER_STATUS_LABEL, DEFAULT_PLANET_ID, LORE_LIMITS } from '@shared/domain/lore.constants'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import type { LoreActions } from '@renderer/hooks/useLore'
import { formatRelative, timeOf } from '../lib/format'
import { shift, toRoman, useDragOrder } from '../lib/order'
import styles from '../Lore.module.scss'

/** The line under a chapter's title: its one line, then where it stands and since when. */
function metaOf(view: LoreChapterView): string {
  const line = view.draft?.line || view.published?.line || 'No line yet'
  if (view.status === 'draft') {
    const saved = timeOf(view.draft?.updatedAt ?? '')
    return `${line} · only here${saved ? `, saved ${formatRelative(saved)}` : ''}`
  }
  const published = timeOf(view.published?.publishedAt ?? '')
  return `${line}${published ? ` · published ${formatRelative(published)}` : ''}`
}

/**
 * The chapters, in their order here.
 *
 * Dragged by their grip, or moved a place with the arrows. Moving is kept
 * here; the website keeps its order until "Publish order", and a fetch that
 * finds the other person published a new one brings it here unless a move
 * here is waiting. Each chapter says where it stands against the website:
 * only here, published, or changed here since.
 */
export function ChapterList({
  views,
  selectedId,
  onSelect,
  actions,
  orderDiffers,
  onTakeSiteOrder
}: {
  /** In their order here. */
  views: readonly LoreChapterView[]
  selectedId: string | null
  onSelect: (id: string) => void
  actions: LoreActions
  orderDiffers: boolean
  /** Puts the published chapters back in the website's order. */
  onTakeSiteOrder: () => void
}): ReactNode {
  const ids = views.map((view) => view.id)
  const busy = actions.pending === 'reorder'
  const move = (next: string[]): void => {
    if (!busy) void actions.reorder(next)
  }
  const drag = useDragOrder(ids, move)

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const create = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed) return
    const created = await actions.createChapter({
      title: trimmed,
      line: '',
      planetId: DEFAULT_PLANET_ID,
      body: ''
    })
    if (!created) return
    setTitle('')
    setAdding(false)
    if (created.id) onSelect(created.id)
  }

  const published = views.filter((view) => view.published).length

  return (
    <div>
      <div className={styles.listHead}>
        <span className={styles.count}>
          {views.length} chapter{views.length === 1 ? '' : 's'} · {published} published
        </span>
        <span className={styles.spacer} />
        <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={adding}>
          New chapter
        </Button>
      </div>

      {orderDiffers ? (
        <div className={styles.orderNote}>
          <span>The website shows the published chapters in another order.</span>
          <span className={styles.spacer} />
          <button type="button" className={styles.quiet} onClick={onTakeSiteOrder} disabled={busy}>
            Use the website&apos;s
          </button>
          <Button
            size="sm"
            busy={actions.pending === 'publish-order'}
            onClick={() => void actions.publishOrder()}
          >
            Publish order
          </Button>
        </div>
      ) : null}

      {adding ? (
        <div className={styles.newRow}>
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="The chapter's title"
            maxLength={LORE_LIMITS.title}
            onEnter={() => void create()}
            className={styles.newRowField}
          />
          <Button
            size="sm"
            variant="primary"
            busy={actions.pending === 'create-chapter'}
            disabled={!title.trim()}
            onClick={() => void create()}
          >
            Create
          </Button>
          <Button size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {views.length === 0 ? (
        <p className={styles.empty}>
          No chapters yet. A new chapter is a draft on this PC; nothing reaches the website until it
          is published.
        </p>
      ) : (
        <ol className={styles.chapters}>
          {views.map((view, i) => {
            const title = view.draft?.title || view.published?.title || 'Untitled'
            return (
              <li
                key={view.id}
                className={styles.chapter}
                data-selected={view.id === selectedId || undefined}
                tabIndex={0}
                aria-current={view.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(view.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(view.id)
                  }
                }}
                {...drag(view.id)}
              >
                <span className={styles.grip} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className={styles.numeral}>{toRoman(i + 1)}</span>
                <span className={styles.chapterText}>
                  <span className={styles.chapterTitle}>{title}</span>
                  <span className={styles.chapterMeta}>{metaOf(view)}</span>
                </span>
                <span className={styles.chapterSide}>
                  <span className={styles.status} data-status={view.status}>
                    {view.status === 'changed' ? 'CHANGED' : CHAPTER_STATUS_LABEL[view.status]}
                  </span>
                  <button
                    type="button"
                    className={styles.writeButton}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(view.id)
                    }}
                  >
                    Write
                  </button>
                  <span className={styles.move}>
                    <button
                      type="button"
                      className={styles.moveButton}
                      aria-label={`Move ${title} up`}
                      disabled={i === 0 || busy}
                      onClick={(event) => {
                        event.stopPropagation()
                        move(shift(ids, view.id, -1))
                      }}
                    >
                      <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
                        <path
                          d="M1 5 5 1l4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.moveButton}
                      aria-label={`Move ${title} down`}
                      disabled={i === views.length - 1 || busy}
                      onClick={(event) => {
                        event.stopPropagation()
                        move(shift(ids, view.id, 1))
                      }}
                    >
                      <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
                        <path
                          d="M1 1l4 4 4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    </button>
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
