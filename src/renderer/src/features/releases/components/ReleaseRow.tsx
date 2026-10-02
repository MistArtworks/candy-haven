import { useState, type ReactNode } from 'react'
import { SEND_STATE_LABEL, isToSend, type StageAction } from '@shared/domain/releases.constants'
import { RELEASE_KIND_LABEL, RELEASE_STATUS_LABEL } from '@shared/domain/discography.constants'
import { Plate } from '@renderer/components/primitives/Plate'
import {
  MenuDivider,
  MenuItem,
  MenuLabel,
  MenuSurface
} from '@renderer/features/archive/components/menu/MenuSurface'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { changes, metaOf, releaseUrl, type Row, type Standing } from '../lib/present'
import styles from '../ReleasesPage.module.scss'

/** Whether visitors see it, in words; a draft says that's why. */
function seenLabel(standing: Standing): string {
  if (standing.visible === null) return 'Not on the website'
  if (standing.visible) return 'Shown'
  return standing.status === 'draft' ? 'Hidden · draft' : 'Hidden'
}

/** Its place on the shelf; "Off shelf" only when the other side has one. */
const shelfLabel = (place: number | null, other: number | null): string | null =>
  place !== null ? `Shelf · ${place + 1}` : other !== null ? 'Off shelf' : null

/**
 * One fact about a release, and what it'll be after Update when that
 * differs: `DRAFT → SCHEDULED`.
 */
function Tag({
  now,
  next,
  tone
}: {
  now: string | null
  next: string | null
  tone?: 'on' | 'off'
}): ReactNode {
  if (now === null && next === null) return null
  const moving = now !== next
  return (
    <span
      className={styles.tag}
      data-tone={tone}
      data-moving={moving || undefined}
      {...(moving ? tooltipTrigger('Changes with Update') : {})}
    >
      {moving ? (
        <>
          {now} <span className={styles.tagArrow}>→</span> {next}
        </>
      ) : (
        now
      )}
    </span>
  )
}

/**
 * A release in the list: picked or not, what it is, where it stands (and
 * will stand after Update), and one menu for what can be done to it alone.
 * Everything else is done to the picked releases at once, from the bar.
 */
export function ReleaseRow({
  row,
  website,
  picked,
  onPick,
  onAction
}: {
  row: Row
  website: string
  picked: boolean
  onPick: () => void
  onAction: (action: StageAction) => void
}): ReactNode {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const onShelf = row.next.shelf !== null
  const canSend = row.send !== null && isToSend(row.send)

  const act = (action: StageAction): void => {
    setMenu(null)
    onAction(action)
  }

  return (
    <li
      className={styles.row}
      data-send={row.send ?? undefined}
      data-picked={picked || undefined}
      data-changing={changes(row) || undefined}
    >
      <input
        type="checkbox"
        className={styles.check}
        checked={picked}
        onChange={onPick}
        aria-label={`Pick ${row.title}`}
      />
      <Plate
        path={row.artworkPath}
        fallback={RELEASE_KIND_LABEL[row.kind].slice(0, 2)}
        size={52}
        alt=""
      />
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>{row.title}</span>
        <span className={styles.rowMeta}>
          {metaOf(row.kind, row.date, row.trackCount ?? undefined)}
        </span>
        <span className={styles.rowNotes}>
          {row.send ? (
            <span className={styles.chip} data-send={row.send}>
              {row.queued ? 'SENDS WITH UPDATE' : SEND_STATE_LABEL[row.send]}
            </span>
          ) : null}
          {row.problem ? <span className={styles.problem}>{row.problem}</span> : null}
          {row.omitted.length ? (
            <span className={styles.omitted}>Not on the website: {row.omitted.join(', ')}</span>
          ) : null}
        </span>
      </div>

      <div className={styles.tags}>
        <Tag
          now={RELEASE_STATUS_LABEL[row.now.status]}
          next={RELEASE_STATUS_LABEL[row.next.status]}
        />
        <Tag
          now={seenLabel(row.now)}
          next={seenLabel(row.next)}
          tone={row.next.visible ? 'on' : 'off'}
        />
        <Tag
          now={shelfLabel(row.now.shelf, row.next.shelf)}
          next={shelfLabel(row.next.shelf, row.now.shelf)}
          tone="on"
        />
      </div>

      <button
        type="button"
        className={styles.more}
        aria-label={`More for ${row.title}`}
        aria-haspopup="menu"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.right - 200, y: rect.bottom + 4 })
        }}
      >
        ⋯
      </button>

      {menu ? (
        <MenuSurface x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuLabel>{row.title}</MenuLabel>
          <MenuItem label="Show" disabled={row.next.visible === true} onClick={() => act('show')} />
          <MenuItem
            label="Hide"
            disabled={row.next.visible === false}
            onClick={() => act('hide')}
          />
          {onShelf ? (
            <MenuItem label="Remove from shelf" onClick={() => act('shelf-remove')} />
          ) : (
            <MenuItem label="Add to shelf" onClick={() => act('shelf-add')} />
          )}
          {row.own ? (
            <MenuItem label="Send" disabled={!canSend || row.queued} onClick={() => act('send')} />
          ) : null}
          {row.slug && row.now.visible ? (
            <>
              <MenuDivider />
              <MenuItem
                label="Open on the website"
                onClick={() => {
                  setMenu(null)
                  void window.candy.shell.openExternal(releaseUrl(website, row.slug ?? ''))
                }}
              />
            </>
          ) : null}
        </MenuSurface>
      ) : null}
    </li>
  )
}
