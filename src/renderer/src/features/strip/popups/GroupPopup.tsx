import { useState, type ReactNode } from 'react'
import {
  GROUP_SIZE,
  TARGET_KIND_LABEL,
  baseName,
  findPin,
  insertPins,
  isGroup,
  normalizeAddress,
  siteNameOf,
  type Pin
} from '@shared/domain/strip'
import { Icon } from '../icons'
import { PinFace } from '../PinFace'
import { openPin } from '../openPin'
import { carriesPins, pinsFromDrop, savePins, useNotice, useStripSettings } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * A group's pins, dropped down from its icon: the icons alone, and the name
 * of the one under the pointer beneath them. Each opens as it would from the
 * strip; right-click one for its options. The + adds a website, a file or a
 * folder, and files, folders and links dropped here go in too.
 */
export function GroupPopup({ pinId, onClose }: { pinId: string; onClose: () => void }): ReactNode {
  const settings = useStripSettings()
  const [hovered, setHovered] = useState<Pin | null>(null)
  const [adding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const [dropping, setDropping] = useState(false)
  const [notice, say] = useNotice()

  const place = findPin(settings.pins, pinId)
  if (!place || !isGroup(place.pin)) return null
  const group = place.pin
  const { items } = group.group
  const full = items.length >= GROUP_SIZE
  const url = normalizeAddress(address)

  const put = async (added: Pin[]): Promise<void> => {
    if (!added.length) return
    const room = GROUP_SIZE - items.length
    if (room <= 0) {
      say(`${group.label} is full`)
      return
    }
    await savePins(
      insertPins(settings.pins, added.slice(0, room), { group: group.id, index: items.length })
    )
  }

  const pick = async (kind: 'file' | 'folder'): Promise<void> => {
    const path = await window.candy.strip.pick(kind)
    if (!path) return
    await put([
      { id: crypto.randomUUID(), label: baseName(path).slice(0, 80), target: { kind, path } }
    ])
  }

  const addSite = async (): Promise<void> => {
    if (!url) return
    await put([{ id: crypto.randomUUID(), label: siteNameOf(url), target: { kind: 'link', url } }])
    setAddress('')
  }

  return (
    <div
      className={styles.groupPopup}
      onDragOver={(event) => {
        if (!carriesPins(event.dataTransfer)) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropping(false)
        void pinsFromDrop(event.dataTransfer).then(put)
      }}
    >
      <PopupHead title={group.label} onClose={onClose} />
      <div className={styles.groupIcons} data-dropping={dropping || undefined}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.pin}
            title={item.label}
            aria-label={item.label}
            onMouseEnter={() => setHovered(item)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(item)}
            onBlur={() => setHovered(null)}
            onClick={() => openPin(item, say)}
            onContextMenu={(event) => {
              event.preventDefault()
              void window.candy.strip.popup({ kind: 'pin', pinId: item.id })
            }}
          >
            <PinFace pin={item} />
          </button>
        ))}
        <button
          type="button"
          className={styles.pin}
          data-add
          title={full ? `${group.label} is full` : 'Add to this group'}
          aria-label={`Add to ${group.label}`}
          aria-expanded={adding}
          disabled={full}
          onClick={() => setAdding((was) => !was)}
        >
          <Icon glyph="add" />
        </button>
      </div>

      <p className={styles.groupName}>
        {hovered ? (
          <>
            <span className={styles.groupNameText}>{hovered.label}</span>
            <span className={styles.groupKind}>{TARGET_KIND_LABEL[hovered.target.kind]}</span>
          </>
        ) : (
          <span className={styles.groupHint}>
            {items.length
              ? 'Right-click one for its options'
              : 'Empty: drop files or links here, or press +'}
          </span>
        )}
      </p>

      {adding ? (
        <div className={styles.groupAdd}>
          <input
            className={styles.input}
            value={address}
            placeholder="A website: youtube.com"
            aria-label="A website's address"
            spellCheck={false}
            autoFocus
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addSite()
            }}
          />
          <div className={styles.pickRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!url}
              onClick={() => void addSite()}
            >
              Add website
            </button>
            <button type="button" className={styles.textButton} onClick={() => void pick('file')}>
              File…
            </button>
            <button type="button" className={styles.textButton} onClick={() => void pick('folder')}>
              Folder…
            </button>
          </div>
          <p className={styles.quiet}>
            Stacks, projects and actions go in from REGULATION, or right-click a pin on the strip.
          </p>
        </div>
      ) : null}

      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
    </div>
  )
}
