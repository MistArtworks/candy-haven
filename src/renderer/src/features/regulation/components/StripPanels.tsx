import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { Settings } from '@shared/domain/settings'
import { SECTIONS } from '@shared/domain/navigation'
import {
  OPENS_IN,
  REMINDER_LEADS,
  STRIP_ACTIONS,
  STRIP_ACTION_LABEL,
  STRIP_LOOKS,
  STRIP_LOOK_LABEL,
  StripSettingsSchema,
  TARGET_KIND_LABEL,
  baseName,
  openedIn,
  opensInLabel,
  targetKey,
  waysToOpen,
  type OpensIn,
  type Pin,
  type Target
} from '@shared/domain/strip'
import type { ApplySettings } from '@renderer/hooks/useSettings'
import { Panel } from '@renderer/components/primitives/Panel'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { Button } from '@renderer/components/primitives/Button'
import { Icon } from '@renderer/features/strip/icons'
import { targetGlyph } from '@renderer/features/strip/glyphs'
import { pinsFromDrop } from '@renderer/features/strip/useStrip'
import { usePinnedArchive } from '@renderer/features/strip/usePinnedArchive'
import { ArchivePicker } from './ArchivePicker'
import styles from '../RegulationPage.module.scss'

/**
 * QUICK STRIP: the small window on top of everything. How it looks, what's
 * on it and in what order, and today's agenda and its reminders.
 *
 * Pins can also be added by dropping files and folders on the strip itself,
 * and renamed, moved or removed by right-clicking one there; this is where
 * all of them are, and where stacks, projects, pages and links are added.
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
  const setPins = (pins: Pin[]): void => set({ pins })

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

      <Panel label="Pins" index="02" aside={`${strip.pins.length}`} className={styles.wide}>
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
 * Every pin, in order. Drag one by its handle to move it (or use its arrows),
 * and drop files and folders from Explorer on the list to pin them where they
 * land.
 */
function PinList({ pins, onChange }: { pins: Pin[]; onChange: (pins: Pin[]) => void }): ReactNode {
  const [link, setLink] = useState('')
  const [picking, setPicking] = useState<'stack' | 'project' | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  /** Where a drop would land: before the pin at this index, or at the end. */
  const [slot, setSlot] = useState<number | null>(null)
  const pinned = useMemo(() => new Set(pins.map((pin) => targetKey(pin.target))), [pins])

  const add = (label: string, target: Target): void =>
    onChange([...pins, { id: crypto.randomUUID(), label, target }])
  const move = (index: number, by: number): void => {
    const next = [...pins]
    const [moved] = next.splice(index, 1)
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, moved)
    onChange(next)
  }
  /** Moves a pin to a slot, counted as the list was before it was lifted. */
  const moveTo = (id: string, to: number): void => {
    const from = pins.findIndex((pin) => pin.id === id)
    if (from < 0 || to === from || to === from + 1) return
    const next = [...pins]
    const [moved] = next.splice(from, 1)
    next.splice(to > from ? to - 1 : to, 0, moved)
    onChange(next)
  }
  const tell = (id: string, way: OpensIn | null): void =>
    onChange(
      pins.map((pin) => (pin.id === id ? { ...pin, target: openedIn(pin.target, way) } : pin))
    )

  // Over a row, a drop lands before it in its top half and after it in its
  // bottom half; anywhere else on the list, at the end.
  const landing = (event: DragEvent<HTMLElement>, index: number | null): number => {
    if (index === null) return pins.length
    const box = event.currentTarget.getBoundingClientRect()
    return event.clientY < box.top + box.height / 2 ? index : index + 1
  }

  const dragOver = (event: DragEvent<HTMLElement>, index: number | null): void => {
    const { types } = event.dataTransfer
    const files = types.includes('Files')
    if (!files && !types.includes(PIN_DRAG)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = files ? 'copy' : 'move'
    setSlot(landing(event, index))
  }

  const drop = async (event: DragEvent<HTMLElement>, index: number | null): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    const at = landing(event, index)
    setSlot(null)
    setDragging(null)
    const moving = event.dataTransfer.getData(PIN_DRAG)
    if (moving) {
      moveTo(moving, at)
      return
    }
    const added = await pinsFromDrop(event.dataTransfer.files)
    if (added.length) onChange([...pins.slice(0, at), ...added, ...pins.slice(at)])
  }

  const pages = SECTIONS.filter((section) => section.implemented)
  const linkOk = URL.canParse(link) && /^https?:$/.test(new URL(link || 'x:').protocol)

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
          {pins.map((pin, index) => {
            const ways = waysToOpen(pin.target)
            const told =
              pin.target.kind === 'stack' || pin.target.kind === 'project'
                ? (pin.target.opensIn ?? '')
                : ''
            return (
              <li
                key={pin.id}
                className={styles.pinRow}
                data-dragging={dragging === pin.id || undefined}
                data-drop={
                  slot === index
                    ? 'before'
                    : slot === pins.length && index === pins.length - 1
                      ? 'after'
                      : undefined
                }
                onDragOver={(event) => dragOver(event, index)}
                onDrop={(event) => void drop(event, index)}
              >
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
                <span className={styles.pinGlyph}>
                  <Icon glyph={targetGlyph(pin.target)} size={17} />
                </span>
                <input
                  className={styles.pinName}
                  value={pin.label}
                  maxLength={80}
                  aria-label="Name"
                  onChange={(event) =>
                    onChange(
                      pins.map((one) =>
                        one.id === pin.id ? { ...one, label: event.target.value || pin.label } : one
                      )
                    )
                  }
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
                  <button
                    type="button"
                    aria-label={`Move ${pin.label} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${pin.label} later`}
                    disabled={index === pins.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${pin.label}`}
                    onClick={() => onChange(pins.filter((one) => one.id !== pin.id))}
                  >
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className={styles.pinEmpty}>
          Nothing pinned. Add something below, or drop files and folders here or on the strip.
        </p>
      )}

      <div className={styles.pinAdd}>
        <span className={styles.controlLabel}>Add</span>
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
        </div>
        {picking ? (
          <ArchivePicker
            key={picking}
            want={picking}
            pinned={pinned}
            onPick={(pin) => {
              onChange([...pins, pin])
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
            placeholder="https://…"
            aria-label="Pin a link"
            onChange={(event) => setLink(event.target.value.trim())}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!linkOk}
            onClick={() => {
              add(new URL(link).hostname, { kind: 'link', url: link })
              setLink('')
            }}
          >
            Pin link
          </Button>
        </div>
        <p className={styles.controlHint}>
          A stack opens in the ARCHIVE or in Explorer, and a project in Ableton, in the ARCHIVE or
          in its folder: a click asks which, unless the pin is told one. A pinned folder opens as a
          list beside the strip; a file opens with whatever Windows opens it with. Drag a pin by its
          handle to move it, and drop files and folders here, or on the strip, to pin them.
        </p>
      </div>
    </div>
  )
}
