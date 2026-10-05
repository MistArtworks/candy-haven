import { Fragment, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { Settings } from '@shared/domain/settings'
import { SECTIONS } from '@shared/domain/navigation'
import {
  GROUP_ICONS,
  OPENS_IN,
  REMINDER_LEADS,
  STRIP_ACTIONS,
  STRIP_ACTION_LABEL,
  STRIP_LOOKS,
  STRIP_LOOK_LABEL,
  StripSettingsSchema,
  TARGET_KIND_LABEL,
  allPins,
  baseName,
  groupsOf,
  insertPins,
  isGroup,
  movePinTo,
  normalizeAddress,
  openedIn,
  opensInLabel,
  removePin,
  shiftPin,
  siteNameOf,
  takeOutOfGroup,
  targetKey,
  ungroup,
  updatePin,
  waysToOpen,
  type GroupIcon,
  type GroupPin,
  type OpensIn,
  type Pin,
  type PinSlot,
  type StripPin,
  type Target
} from '@shared/domain/strip'
import type { ApplySettings } from '@renderer/hooks/useSettings'
import { Panel } from '@renderer/components/primitives/Panel'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { Button } from '@renderer/components/primitives/Button'
import { Icon } from '@renderer/features/strip/icons'
import { PinFace } from '@renderer/features/strip/PinFace'
import { pinsFromDrop } from '@renderer/features/strip/useStrip'
import { usePinnedArchive } from '@renderer/features/strip/usePinnedArchive'
import { ArchivePicker } from './ArchivePicker'
import styles from '../RegulationPage.module.scss'

/**
 * QUICK STRIP: the small window on top of everything. How it looks, what's
 * on it and in what order, and today's agenda and its reminders.
 *
 * Pins can also be added by dropping files, folders and links on the strip
 * itself, and renamed, moved, grouped or removed by right-clicking one there;
 * this is where all of them are, and where stacks, projects, pages and links
 * are added.
 */
export function StripPanels({
  settings,
  apply
}: {
  settings: Settings | null
  apply: ApplySettings
}): ReactNode {
  const strip = settings?.strip ?? StripSettingsSchema.parse({})
  const set = (patch: Partial<Settings['strip']>): void => apply({ strip: patch })
  const setPins = (pins: StripPin[]): void => set({ pins })

  return (
    <>
      <Panel label="Quick strip" index="01">
        <div className={styles.controls}>
          <div className={styles.control}>
            <span className={styles.controlLabel}>Show the strip</span>
            <Toggle
              label="Show the strip"
              checked={strip.enabled}
              onChange={() => set({ enabled: !strip.enabled })}
            />
            <p className={styles.controlHint}>
              A small window, on top of everything, from the moment the PC starts. Drag it by any
              empty part; it stays where you leave it.
            </p>
          </div>

          <div className={styles.control}>
            <span className={styles.controlLabel}>Look</span>
            <div className={styles.segmented} role="group" aria-label="Look">
              {STRIP_LOOKS.map((look) => (
                <button
                  key={look}
                  type="button"
                  className={styles.segment}
                  data-selected={strip.look === look || undefined}
                  onClick={() => set({ look })}
                >
                  {STRIP_LOOK_LABEL[look].toUpperCase()}
                </button>
              ))}
            </div>
            <p className={styles.controlHint}>
              Panel puts today, the pins and who is signed in in a card, like Discord&apos;s corner.
              Horizontal and Vertical put everything in one line.
            </p>
          </div>

          <div className={styles.control}>
            <span className={styles.controlLabel}>On top of every window</span>
            <Toggle
              label="On top of every window"
              checked={strip.onTop}
              onChange={() => set({ onTop: !strip.onTop })}
            />
          </div>

          <div className={styles.control}>
            <span className={styles.controlLabel}>Today</span>
            <Toggle
              label="Show today's agenda"
              checked={strip.today}
              onChange={() => set({ today: !strip.today })}
            />
            <p className={styles.controlHint}>
              Today&apos;s entries from CALENDAR, what&apos;s overdue, and what&apos;s out today.
              Click it for the list: tick things off, open what each is about, move them on.
            </p>
          </div>

          <div className={styles.control}>
            <span className={styles.controlLabel}>Reminders</span>
            <div className={styles.segmented} role="group" aria-label="Reminders">
              {REMINDER_LEADS.map((lead) => (
                <button
                  key={lead}
                  type="button"
                  className={styles.segment}
                  data-selected={strip.reminderMinutes === lead || undefined}
                  onClick={() => set({ reminderMinutes: lead })}
                >
                  {lead === 0 ? 'OFF' : `${lead} MIN`}
                </button>
              ))}
            </div>
            <p className={styles.controlHint}>
              A notification this long before a timed entry starts. Click it and the entry opens on
              the strip, with what it&apos;s about one click away.
            </p>
          </div>

          <div className={styles.control}>
            <span className={styles.controlLabel}>Where it sits</span>
            <Button size="sm" variant="ghost" onClick={() => set({ position: null })}>
              Back to the bottom right
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        label="Pins"
        index="02"
        aside={`${allPins(strip.pins).length}`}
        className={styles.wide}
      >
        <PinList pins={strip.pins} onChange={setPins} />
      </Panel>
    </>
  )
}

/** The data a pin row carries while it's dragged: the pin's id. */
const PIN_DRAG = 'application/x-candy-pin'

/** Where a pin points, before (or without) the ARCHIVE saying more. */
function describe(target: Target): string {
  switch (target.kind) {
    case 'page':
      return target.route
    case 'action':
      return STRIP_ACTION_LABEL[target.action]
    case 'file':
    case 'folder':
      return target.path
    case 'stack':
      return 'A stack in the ARCHIVE'
    case 'project':
      return 'A project in the ARCHIVE'
    case 'link':
      return target.url
  }
}

/** Where a pin points, in full: a path, an address, or its place in the ARCHIVE. */
function PinWhere({ target }: { target: Target }): ReactNode {
  const archive = usePinnedArchive(target)
  const text = archive?.where ?? describe(target)
  return (
    <span
      className={styles.pinWhere}
      title={archive?.path ?? text}
      data-gone={archive?.gone || undefined}
    >
      {text}
    </span>
  )
}

/**
 * A row of the list: a pin on the strip, a group, a pin in a group, or the
 * place an empty group's pins would go.
 */
type Row =
  | { kind: 'pin'; pin: Pin; index: number; count: number }
  | { kind: 'group'; pin: GroupPin; index: number; count: number }
  | { kind: 'item'; pin: Pin; group: GroupPin; groupIndex: number; index: number; count: number }
  | { kind: 'hollow'; group: GroupPin; groupIndex: number }

function rowsOf(pins: readonly StripPin[]): Row[] {
  return pins.flatMap((pin, index): Row[] => {
    if (!isGroup(pin)) return [{ kind: 'pin', pin, index, count: pins.length }]
    const { items } = pin.group
    const inside: Row[] = items.length
      ? items.map((item, at) => ({
          kind: 'item',
          pin: item,
          group: pin,
          groupIndex: index,
          index: at,
          count: items.length
        }))
      : [{ kind: 'hollow', group: pin, groupIndex: index }]
    return [{ kind: 'group', pin, index, count: pins.length }, ...inside]
  })
}

const sameSlot = (slot: PinSlot | null, group: string | null, index: number): boolean =>
  slot !== null && slot.group === group && slot.index === index

/**
 * Every pin, in order, and each group with its pins under it. Drag one by its
 * handle to move it (or use its arrows): along the strip, into a group or out
 * of one. Files and folders from Explorer, and links from a browser, dropped
 * on the list are pinned where they land.
 */
function PinList({
  pins,
  onChange
}: {
  pins: StripPin[]
  onChange: (pins: StripPin[]) => void
}): ReactNode {
  const [link, setLink] = useState('')
  const [picking, setPicking] = useState<'stack' | 'project' | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  /** Where a drop would land. */
  const [slot, setSlot] = useState<PinSlot | null>(null)
  /** The group whose icon is being chosen. */
  const [choosing, setChoosing] = useState<string | null>(null)
  /** A group just made, its name ready to type. */
  const [fresh, setFresh] = useState<string | null>(null)
  /** Where Add puts things: on the strip (null), or in a group. */
  const [into, setInto] = useState<string | null>(null)
  const pinned = useMemo(() => new Set(allPins(pins).map((pin) => targetKey(pin.target))), [pins])
  const groups = groupsOf(pins)
  const addTo = groups.find((group) => group.id === into) ?? null
  const movingGroup = dragging !== null && pins.some((pin) => pin.id === dragging && isGroup(pin))

  const append = (added: StripPin[]): void =>
    onChange(
      insertPins(
        pins,
        added,
        addTo
          ? { group: addTo.id, index: addTo.group.items.length }
          : { group: null, index: pins.length }
      )
    )
  const add = (label: string, target: Target): void =>
    append([{ id: crypto.randomUUID(), label: label.slice(0, 80), target }])
  const makeGroup = (): void => {
    const id = crypto.randomUUID()
    onChange([...pins, { id, label: 'New group', group: { icon: 'collection', items: [] } }])
    setInto(id)
    setFresh(id)
  }
  const rename = (id: string, label: string, was: string): void =>
    onChange(updatePin(pins, id, (one) => ({ ...one, label: label || was })))
  const tell = (id: string, way: OpensIn | null): void =>
    onChange(
      updatePin(pins, id, (one) =>
        isGroup(one) ? one : { ...one, target: openedIn(one.target, way) }
      )
    )
  const wear = (id: string, icon: GroupIcon): void =>
    onChange(
      updatePin(pins, id, (one) => (isGroup(one) ? { ...one, group: { ...one.group, icon } } : one))
    )

  /**
   * Where a drop over a row lands. Over a pin, before it in its top half and
   * after it in its bottom half; over a group, before it in its top third and
   * into it below that; anywhere else on the list, at the end. A group being
   * moved lands on the strip alone: over a group's pins, after that group.
   */
  const landing = (event: DragEvent<HTMLElement>, row: Row | null): PinSlot => {
    if (!row) return { group: null, index: pins.length }
    const box = event.currentTarget.getBoundingClientRect()
    const upper = event.clientY < box.top + box.height / 2
    switch (row.kind) {
      case 'pin':
        return { group: null, index: upper ? row.index : row.index + 1 }
      case 'group':
        if (movingGroup) return { group: null, index: upper ? row.index : row.index + 1 }
        return event.clientY < box.top + box.height / 3
          ? { group: null, index: row.index }
          : { group: row.pin.id, index: 0 }
      case 'item':
        if (movingGroup) return { group: null, index: row.groupIndex + 1 }
        return { group: row.group.id, index: upper ? row.index : row.index + 1 }
      case 'hollow':
        return movingGroup
          ? { group: null, index: row.groupIndex + 1 }
          : { group: row.group.id, index: 0 }
    }
  }

  const dragOver = (event: DragEvent<HTMLElement>, row: Row | null): void => {
    const { types } = event.dataTransfer
    const outside = types.includes('Files') || types.includes('text/uri-list')
    if (!outside && !types.includes(PIN_DRAG)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = outside ? 'copy' : 'move'
    const next = landing(event, row)
    setSlot((was) => (sameSlot(was, next.group, next.index) ? was : next))
  }

  const drop = async (event: DragEvent<HTMLElement>, row: Row | null): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    const at = landing(event, row)
    setSlot(null)
    setDragging(null)
    const moving = event.dataTransfer.getData(PIN_DRAG)
    if (moving) {
      onChange(movePinTo(pins, moving, at))
      return
    }
    const added = await pinsFromDrop(event.dataTransfer)
    if (added.length) onChange(insertPins(pins, added, at))
  }

  const handle = (pin: StripPin): ReactNode => (
    <span
      className={styles.pinHandle}
      draggable
      title="Drag to move"
      onDragStart={(event) => {
        event.dataTransfer.setData(PIN_DRAG, pin.id)
        event.dataTransfer.effectAllowed = 'move'
        const row = event.currentTarget.closest('li')
        if (row) event.dataTransfer.setDragImage(row, 14, row.offsetHeight / 2)
        setDragging(pin.id)
      }}
      onDragEnd={() => {
        setDragging(null)
        setSlot(null)
      }}
    >
      <Icon glyph="grip" size={16} />
    </span>
  )

  const arrows = (pin: StripPin, index: number, count: number): ReactNode => (
    <>
      <button
        type="button"
        aria-label={`Move ${pin.label} earlier`}
        disabled={index === 0}
        onClick={() => onChange(shiftPin(pins, pin.id, -1))}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${pin.label} later`}
        disabled={index === count - 1}
        onClick={() => onChange(shiftPin(pins, pin.id, 1))}
      >
        ↓
      </button>
    </>
  )

  const targetRow = (row: Extract<Row, { kind: 'pin' | 'item' }>): ReactNode => {
    const { pin } = row
    const ways = waysToOpen(pin.target)
    const told =
      pin.target.kind === 'stack' || pin.target.kind === 'project' ? (pin.target.opensIn ?? '') : ''
    const group = row.kind === 'item' ? row.group : null
    const mark = group
      ? sameSlot(slot, group.id, row.index)
        ? 'before'
        : row.index === row.count - 1 && sameSlot(slot, group.id, row.count)
          ? 'after'
          : undefined
      : sameSlot(slot, null, row.index)
        ? 'before'
        : undefined
    return (
      <li
        key={pin.id}
        className={styles.pinRow}
        data-depth={group ? 1 : undefined}
        data-dragging={dragging === pin.id || undefined}
        data-drop={mark}
        onDragOver={(event) => dragOver(event, row)}
        onDrop={(event) => void drop(event, row)}
      >
        {handle(pin)}
        <span className={styles.pinGlyph}>
          <PinFace pin={pin} size={17} />
        </span>
        <input
          className={styles.pinName}
          value={pin.label}
          maxLength={80}
          aria-label="Name"
          onChange={(event) => rename(pin.id, event.target.value, pin.label)}
        />
        <span className={styles.pinKind}>{TARGET_KIND_LABEL[pin.target.kind]}</span>
        <PinWhere target={pin.target} />
        {ways.length ? (
          <select
            className={styles.pinSelect}
            value={told}
            aria-label={`What a click on ${pin.label} does`}
            onChange={(event) =>
              tell(pin.id, OPENS_IN.find((way) => way === event.target.value) ?? null)
            }
          >
            <option value="">Ask each time</option>
            {ways.map((way) => (
              <option key={way} value={way}>
                {opensInLabel(pin.target, way)}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <span className={styles.pinTools}>
          {arrows(pin, row.index, row.count)}
          {group ? (
            <button
              type="button"
              title={`Out of ${group.label}, onto the strip`}
              aria-label={`Take ${pin.label} out of ${group.label}`}
              onClick={() => onChange(takeOutOfGroup(pins, pin.id))}
            >
              ↰
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Remove ${pin.label}`}
            onClick={() => onChange(removePin(pins, pin.id))}
          >
            ×
          </button>
        </span>
      </li>
    )
  }

  const groupRow = (row: Extract<Row, { kind: 'group' }>): ReactNode => {
    const group = row.pin
    const count = group.group.items.length
    return (
      <Fragment key={group.id}>
        <li
          className={styles.pinRow}
          data-group
          data-dragging={dragging === group.id || undefined}
          data-drop={sameSlot(slot, null, row.index) ? 'before' : undefined}
          data-into={slot?.group === group.id || undefined}
          onDragOver={(event) => dragOver(event, row)}
          onDrop={(event) => void drop(event, row)}
        >
          {handle(group)}
          <button
            type="button"
            className={styles.pinGroupIcon}
            title="Choose its icon"
            aria-label={`Choose ${group.label}'s icon`}
            aria-expanded={choosing === group.id}
            onClick={() => setChoosing((was) => (was === group.id ? null : group.id))}
          >
            <Icon glyph={group.group.icon} size={17} />
          </button>
          <input
            className={styles.pinName}
            value={group.label}
            maxLength={80}
            aria-label="Group name"
            autoFocus={fresh === group.id}
            onFocus={(event) => {
              if (fresh !== group.id) return
              event.currentTarget.select()
              setFresh(null)
            }}
            onChange={(event) => rename(group.id, event.target.value, group.label)}
          />
          <span className={styles.pinKind}>GROUP</span>
          <span className={styles.pinWhere}>
            {count
              ? `${count} ${count === 1 ? 'pin' : 'pins'}, dropped down from its icon`
              : 'Empty: drag pins in, or choose it under Add'}
          </span>
          <span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!count}
              onClick={() => onChange(ungroup(pins, group.id))}
            >
              Ungroup
            </Button>
          </span>
          <span className={styles.pinTools}>
            {arrows(group, row.index, row.count)}
            <button
              type="button"
              aria-label={`Remove ${group.label} and its pins`}
              onClick={() => onChange(removePin(pins, group.id))}
            >
              ×
            </button>
          </span>
        </li>
        {choosing === group.id ? (
          <li className={styles.pinIcons} aria-label={`${group.label}'s icon`}>
            {GROUP_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={styles.pinIconChoice}
                data-on={group.group.icon === icon || undefined}
                aria-pressed={group.group.icon === icon}
                aria-label={icon}
                title={icon}
                onClick={() => {
                  wear(group.id, icon)
                  setChoosing(null)
                }}
              >
                <Icon glyph={icon} size={17} />
              </button>
            ))}
          </li>
        ) : null}
      </Fragment>
    )
  }

  const pages = SECTIONS.filter((section) => section.implemented)
  const linkUrl = normalizeAddress(link)

  return (
    <div
      className={styles.pinList}
      data-dropping={(slot !== null && dragging === null) || undefined}
      onDragOver={(event) => dragOver(event, null)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSlot(null)
      }}
      onDrop={(event) => void drop(event, null)}
    >
      {pins.length ? (
        <ol className={styles.pinRows}>
          {rowsOf(pins).map((row) => {
            if (row.kind === 'group') return groupRow(row)
            if (row.kind !== 'hollow') return targetRow(row)
            return (
              <li
                key={`${row.group.id}:hollow`}
                className={styles.pinHollow}
                data-drop={sameSlot(slot, row.group.id, 0) ? 'into' : undefined}
                onDragOver={(event) => dragOver(event, row)}
                onDrop={(event) => void drop(event, row)}
              >
                Nothing in {row.group.label} yet: drag pins here.
              </li>
            )
          })}
          <li
            className={styles.pinTail}
            aria-hidden="true"
            data-drop={sameSlot(slot, null, pins.length) ? 'before' : undefined}
            onDragOver={(event) => dragOver(event, null)}
            onDrop={(event) => void drop(event, null)}
          />
        </ol>
      ) : (
        <p className={styles.pinEmpty}>
          Nothing pinned. Add something below, or drop files, folders and links here or on the
          strip.
        </p>
      )}

      <div className={styles.pinAdd}>
        <div className={styles.pinAddHead}>
          <span className={styles.controlLabel}>Add</span>
          {groups.length ? (
            <label className={styles.pinInto}>
              <span className={styles.pinIntoLabel}>to</span>
              <select
                className={styles.pinSelect}
                value={addTo?.id ?? ''}
                aria-label="Add to"
                onChange={(event) => setInto(event.target.value || null)}
              >
                <option value="">The strip</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className={styles.pinAddRow}>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={picking === 'stack'}
            onClick={() => setPicking((was) => (was === 'stack' ? null : 'stack'))}
          >
            Stack…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={picking === 'project'}
            onClick={() => setPicking((was) => (was === 'project' ? null : 'project'))}
          >
            Project…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const path = await window.candy.shell.selectFile({ title: 'Pin a file' })
              if (path) add(baseName(path), { kind: 'file', path })
            }}
          >
            File…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const path = await window.candy.shell.selectDirectory('Pin a folder')
              if (path) add(baseName(path), { kind: 'folder', path })
            }}
          >
            Folder…
          </Button>
          {STRIP_ACTIONS.map((action) => (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              onClick={() => add(STRIP_ACTION_LABEL[action], { kind: 'action', action })}
            >
              {STRIP_ACTION_LABEL[action]}
            </Button>
          ))}
          <span className={styles.pinAddRule} />
          <Button size="sm" variant="ghost" onClick={makeGroup}>
            New group
          </Button>
        </div>
        {picking ? (
          <ArchivePicker
            key={picking}
            want={picking}
            pinned={pinned}
            onPick={(pin) => {
              append([pin])
              setPicking(null)
            }}
            onCancel={() => setPicking(null)}
          />
        ) : null}
        <div className={styles.pinAddRow}>
          <select
            className={styles.pinSelect}
            value=""
            aria-label="Pin a department"
            onChange={(event) => {
              const section = pages.find((one) => one.path === event.target.value)
              if (section) add(section.label, { kind: 'page', route: section.path })
            }}
          >
            <option value="">A department…</option>
            {pages.map((section) => (
              <option key={section.id} value={section.path}>
                {section.label}
              </option>
            ))}
          </select>
          <input
            className={styles.pinLink}
            value={link}
            placeholder="A website: youtube.com"
            aria-label="Pin a website"
            spellCheck={false}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !linkUrl) return
              add(siteNameOf(linkUrl), { kind: 'link', url: linkUrl })
              setLink('')
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!linkUrl}
            onClick={() => {
              if (!linkUrl) return
              add(siteNameOf(linkUrl), { kind: 'link', url: linkUrl })
              setLink('')
            }}
          >
            Pin website
          </Button>
        </div>
        <p className={styles.controlHint}>
          A stack opens in the ARCHIVE or in Explorer, and a project in Ableton, in the ARCHIVE or
          in its folder: a click asks which, unless the pin is told one. A pinned folder opens as a
          list beside the strip, a file with whatever Windows opens it with, and a website in your
          browser, wearing its own icon. A group is one icon on the strip that drops down the pins
          in it. Drag a pin by its handle to move it, into a group or out of one, and drop files,
          folders and links here, or on the strip, to pin them.
        </p>
      </div>
    </div>
  )
}
