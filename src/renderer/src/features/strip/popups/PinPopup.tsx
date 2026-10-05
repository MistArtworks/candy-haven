import { useState, type ReactNode } from 'react'
import {
  GROUP_ICONS,
  GROUP_SIZE,
  OPENS_IN_LABEL,
  TARGET_KIND_LABEL,
  findPin,
  groupAround,
  groupsOf,
  isGroup,
  moveIntoGroup,
  openedIn,
  opensInLabel,
  removePin,
  shiftPin,
  takeOutOfGroup,
  ungroup,
  updatePin,
  waysToOpen,
  type GroupIcon,
  type GroupPin,
  type OpensIn,
  type Pin,
  type PinPlace,
  type StripPin
} from '@shared/domain/strip'
import { Icon } from '../icons'
import { PinFace } from '../PinFace'
import { lookUpAndKeep } from '../siteIcon'
import { savePins, useNotice, useStripSettings } from '../useStrip'
import { usePinnedArchive } from '../usePinnedArchive'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

interface OptionsProps<T> {
  pin: T
  place: PinPlace
  pins: StripPin[]
  onClose: () => void
}

/**
 * A pin's options, from right-clicking it on the strip or in a group: rename,
 * move, show, into a group or out of one, remove. A stack or a project also
 * lists the ways it opens, and which one a click takes (or that a click asks).
 * A group's options name it, choose its icon, undo it, or remove it.
 */
export function PinPopup({ pinId, onClose }: { pinId: string; onClose: () => void }): ReactNode {
  const settings = useStripSettings()
  const place = findPin(settings.pins, pinId)
  if (!place) return null
  return isGroup(place.pin) ? (
    <GroupOptions
      key={pinId}
      pin={place.pin}
      place={place}
      pins={settings.pins}
      onClose={onClose}
    />
  ) : (
    <TargetOptions
      key={pinId}
      pin={place.pin}
      place={place}
      pins={settings.pins}
      onClose={onClose}
    />
  )
}

/** Where looking a website's icon up again got to. */
type Looking = 'asking' | 'found' | 'none' | 'unreachable'

const LOOKING_TEXT: Record<Looking, string> = {
  asking: 'Asking the site for its icon…',
  found: 'It has its icon.',
  none: 'The site has no icon to give.',
  unreachable: 'The site couldn’t be reached.'
}

function TargetOptions({ pin, place, pins, onClose }: OptionsProps<Pin>): ReactNode {
  const [label, setLabel] = useState(pin.label)
  const archive = usePinnedArchive(pin.target)
  const [notice, say] = useNotice()
  const [looking, setLooking] = useState<Looking | null>(null)

  const { target } = pin
  const ways = waysToOpen(target)
  const told =
    target.kind === 'stack' || target.kind === 'project' ? (target.opensIn ?? null) : null
  const where =
    archive?.where ?? ('path' in target ? target.path : 'url' in target ? target.url : null)
  const inGroup = place.group
  const others = groupsOf(pins).filter((group) => group.id !== inGroup?.id)

  const rename = (): void => {
    const name = label.trim()
    if (!name || name === pin.label) return
    void savePins(updatePin(pins, pin.id, (one) => ({ ...one, label: name.slice(0, 80) })))
  }
  const tell = (way: OpensIn | null): void => {
    void savePins(
      updatePin(pins, pin.id, (one) =>
        isGroup(one) ? one : { ...one, target: openedIn(one.target, way) }
      )
    )
  }
  const done = (next: StripPin[]): void => {
    void savePins(next)
    onClose()
  }
  const lookAgain = async (url: string): Promise<void> => {
    setLooking('asking')
    const found = await lookUpAndKeep(pin.id, url)
    setLooking(found === null ? 'unreachable' : found ? 'found' : 'none')
  }
  const intoNewGroup = async (): Promise<void> => {
    const id = crypto.randomUUID()
    await savePins(groupAround(pins, pin.id, { id, label: 'New group' }))
    // Straight to the new group's options, to name it and choose its icon.
    void window.candy.strip.popup({ kind: 'pin', pinId: id })
  }

  return (
    <div className={styles.pinPopup}>
      <PopupHead
        title={`${TARGET_KIND_LABEL[target.kind]}${inGroup ? ` · ${inGroup.label}` : ''}`}
        onClose={onClose}
      />
      <div className={styles.pinHead}>
        <PinFace pin={pin} />
        <input
          className={styles.input}
          value={label}
          maxLength={80}
          aria-label="Name"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') rename()
          }}
        />
      </div>
      {where ? (
        <p className={styles.where} data-gone={archive?.gone || undefined}>
          {where}
        </p>
      ) : null}
      {ways.length ? (
        <div className={styles.onClick}>
          <span className={styles.fieldLabel}>On click</span>
          <div className={styles.chips} role="group" aria-label="On click">
            <button
              type="button"
              className={styles.chip}
              data-on={told === null || undefined}
              onClick={() => tell(null)}
            >
              Ask
            </button>
            {ways.map((way) => (
              <button
                key={way}
                type="button"
                className={styles.chip}
                data-on={told === way || undefined}
                onClick={() => tell(way)}
              >
                {OPENS_IN_LABEL[way]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.menu}>
        {ways.map((way) => (
          <button
            key={way}
            type="button"
            className={styles.menuItem}
            onClick={() =>
              window.candy.strip
                .openTarget(openedIn(target, way))
                .catch((cause: Error) => say(cause.message))
            }
          >
            {opensInLabel(target, way)}
          </button>
        ))}
        {ways.length ? <span className={styles.menuRule} /> : null}
        {target.kind === 'file' || target.kind === 'folder' ? (
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void window.candy.shell.reveal(target.path)
              onClose()
            }}
          >
            Show in Explorer
          </button>
        ) : null}
        {target.kind === 'link' ? (
          <button
            type="button"
            className={styles.menuItem}
            disabled={looking === 'asking'}
            onClick={() => void lookAgain(target.url)}
          >
            Look for its icon again
          </button>
        ) : null}
        <button
          type="button"
          className={styles.menuItem}
          disabled={place.index === 0}
          onClick={() => void savePins(shiftPin(pins, pin.id, -1))}
        >
          Move earlier
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={place.index === place.count - 1}
          onClick={() => void savePins(shiftPin(pins, pin.id, 1))}
        >
          Move later
        </button>
        <span className={styles.menuRule} />
        {inGroup ? (
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => done(takeOutOfGroup(pins, pin.id))}
          >
            Out of {inGroup.label}, onto the strip
          </button>
        ) : null}
        {others.map((group) => (
          <button
            key={group.id}
            type="button"
            className={styles.menuItem}
            disabled={group.group.items.length >= GROUP_SIZE}
            onClick={() => done(moveIntoGroup(pins, pin.id, group.id))}
          >
            Into {group.label}
          </button>
        ))}
        <button type="button" className={styles.menuItem} onClick={() => void intoNewGroup()}>
          Into a new group
        </button>
        <span className={styles.menuRule} />
        <button
          type="button"
          className={styles.menuItem}
          data-danger
          onClick={() => done(removePin(pins, pin.id))}
        >
          {inGroup ? `Remove from ${inGroup.label}` : 'Remove from the strip'}
        </button>
      </div>
      {looking ? (
        <p className={styles.popupNotice} data-tone="quiet">
          {LOOKING_TEXT[looking]}
        </p>
      ) : null}
      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
    </div>
  )
}

function GroupOptions({ pin: group, place, pins, onClose }: OptionsProps<GroupPin>): ReactNode {
  const [label, setLabel] = useState(group.label)
  /** Asked once before a group with pins in it goes, with them. */
  const [sure, setSure] = useState(false)
  const count = group.group.items.length
  const pinsWord = `${count} ${count === 1 ? 'pin' : 'pins'}`

  const rename = (): void => {
    const name = label.trim()
    if (!name || name === group.label) return
    void savePins(updatePin(pins, group.id, (one) => ({ ...one, label: name.slice(0, 80) })))
  }
  const wear = (icon: GroupIcon): void => {
    void savePins(
      updatePin(pins, group.id, (one) =>
        isGroup(one) ? { ...one, group: { ...one.group, icon } } : one
      )
    )
  }
  const done = (next: StripPin[]): void => {
    void savePins(next)
    onClose()
  }

  return (
    <div className={styles.pinPopup}>
      <PopupHead title="Group" onClose={onClose} />
      <div className={styles.pinHead}>
        <Icon glyph={group.group.icon} />
        <input
          className={styles.input}
          value={label}
          maxLength={80}
          aria-label="Name"
          autoFocus={group.label === 'New group'}
          onFocus={(event) => {
            if (group.label === 'New group') event.currentTarget.select()
          }}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') rename()
          }}
        />
      </div>
      <p className={styles.where}>{count ? `${pinsWord} in it` : 'Empty for now'}</p>
      <div className={styles.onClick}>
        <span className={styles.fieldLabel}>Icon</span>
        <div className={styles.iconChoices} role="group" aria-label="Icon">
          {GROUP_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className={styles.iconChoice}
              data-on={group.group.icon === icon || undefined}
              aria-label={icon}
              aria-pressed={group.group.icon === icon}
              title={icon}
              onClick={() => wear(icon)}
            >
              <Icon glyph={icon} size={17} />
            </button>
          ))}
        </div>
      </div>
      <div className={styles.menu}>
        <button
          type="button"
          className={styles.menuItem}
          disabled={place.index === 0}
          onClick={() => void savePins(shiftPin(pins, group.id, -1))}
        >
          Move earlier
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={place.index === place.count - 1}
          onClick={() => void savePins(shiftPin(pins, group.id, 1))}
        >
          Move later
        </button>
        <span className={styles.menuRule} />
        <button
          type="button"
          className={styles.menuItem}
          disabled={!count}
          onClick={() => done(ungroup(pins, group.id))}
        >
          Ungroup: its pins back on the strip
        </button>
        <button
          type="button"
          className={styles.menuItem}
          data-danger
          onClick={() => {
            if (count && !sure) {
              setSure(true)
              return
            }
            done(removePin(pins, group.id))
          }}
        >
          {sure ? `Remove it and its ${pinsWord}? Click again` : 'Remove the group'}
        </button>
      </div>
    </div>
  )
}
