import { z } from 'zod'

/**
 * THE QUICK STRIP: a small window that stays on top of everything, holding
 * whatever the operator pins to it.
 *
 * A pin points at a **target**, and targets are deliberately open-ended: a
 * department, an action the strip runs itself, a file or folder anywhere on
 * this PC, a stack or a project in the ARCHIVE, or a web address. The same
 * shape is what
 * a CALENDAR entry carries as its attachments, so "open what this session is
 * about" and "open what I pinned" are one thing, opened one way
 * (main/app/targets.ts).
 *
 * On the strip, pins can also be gathered into **groups**: one icon that
 * drops down the pins in it. Groups are the strip's alone, so an attachment
 * is never one.
 */

// ------------------------------------------------------------------ targets

/** What the strip can do itself, rather than open. */
export const STRIP_ACTIONS = [
  'new-project',
  'add-to-today',
  'open-link',
  'console',
  'vestibule'
] as const
export type StripAction = (typeof STRIP_ACTIONS)[number]

export const STRIP_ACTION_LABEL: Record<StripAction, string> = {
  'new-project': 'New project',
  'add-to-today': 'Add to today',
  'open-link': 'Open a website',
  console: 'The console',
  vestibule: 'The vestibule'
}

/**
 * Where a stack or a project opens: Ableton (a project's set), the ARCHIVE
 * (the stack, or the project's dossier) or Explorer (its folder on disk).
 * A pin told one goes straight there; told none, the strip asks.
 */
export const OPENS_IN = ['ableton', 'archive', 'explorer'] as const
export type OpensIn = (typeof OPENS_IN)[number]

/** Each way in a word, for the controls that set it. */
export const OPENS_IN_LABEL: Record<OpensIn, string> = {
  ableton: 'Ableton',
  archive: 'ARCHIVE',
  explorer: 'Explorer'
}

const path = z.string().min(1).max(1024)

export const TargetSchema = z.discriminatedUnion('kind', [
  /** A department, by its path in the navigation registry. */
  z.object({ kind: z.literal('page'), route: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('action'), action: z.enum(STRIP_ACTIONS) }),
  /** Opened with whatever Windows opens it with. */
  z.object({ kind: z.literal('file'), path }),
  /** Listed beside the strip, to step through and open from. */
  z.object({ kind: z.literal('folder'), path }),
  /** An ARCHIVE folder (a category, a genre, an artist): in the console or Explorer. */
  z.object({
    kind: z.literal('stack'),
    folderId: z.string().min(1),
    opensIn: z.enum(['archive', 'explorer']).optional()
  }),
  /** A project in the ARCHIVE: in Ableton, unless it's told otherwise. */
  z.object({
    kind: z.literal('project'),
    projectId: z.string().min(1),
    opensIn: z.enum(OPENS_IN).optional()
  }),
  z.object({ kind: z.literal('link'), url: z.string().url().max(2048) })
])
export type Target = z.infer<typeof TargetSchema>
export type TargetKind = Target['kind']

export const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  page: 'PAGE',
  action: 'ACTION',
  file: 'FILE',
  folder: 'FOLDER',
  stack: 'STACK',
  project: 'PROJECT',
  link: 'LINK'
}

/** The longest a website's icon may be: a small PNG, as a data address. */
export const SITE_ICON_LENGTH = 40_000

/** A target with a name: a button on the strip, or an attachment on an entry. */
export const PinSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  target: TargetSchema,
  /**
   * A website's own icon, as a small PNG data address, fetched from the site
   * once (renderer/features/strip/siteIcon.ts). Empty when the site has none;
   * left out until it has been looked for.
   */
  icon: z.string().max(SITE_ICON_LENGTH).optional()
})
export type Pin = z.infer<typeof PinSchema>

// ------------------------------------------------------------------- groups

/** The icons a group can wear, from the strip's own (renderer/features/strip/icons.tsx). */
export const GROUP_ICONS = [
  'collection',
  'folder',
  'stack',
  'audio',
  'set',
  'disc',
  'listen',
  'mic',
  'globe',
  'link',
  'star',
  'bolt',
  'image',
  'calendar'
] as const
export type GroupIcon = (typeof GROUP_ICONS)[number]

/** Pins in one group, at most. */
export const GROUP_SIZE = 48

/**
 * A group: one icon on the strip that drops down the pins in it, each opened
 * as it would be from the strip. One level deep: a group holds pins, never
 * another group.
 */
export const GroupPinSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  group: z.object({
    icon: z.enum(GROUP_ICONS).default('collection'),
    items: z.array(PinSchema).max(GROUP_SIZE).default([])
  })
})
export type GroupPin = z.infer<typeof GroupPinSchema>

/** What the strip holds: pins, and groups of them. */
export const StripPinSchema = z.union([PinSchema, GroupPinSchema])
export type StripPin = Pin | GroupPin

export const isGroup = (pin: StripPin): pin is GroupPin => 'group' in pin

/** Every pin that opens something, the ones in groups included. */
export function allPins(pins: readonly StripPin[]): Pin[] {
  return pins.flatMap((pin) => (isGroup(pin) ? pin.group.items : [pin]))
}

export function groupsOf(pins: readonly StripPin[]): GroupPin[] {
  return pins.filter(isGroup)
}

/** Where a pin is: on the strip, or in a group, and its place in that row. */
export interface PinPlace {
  pin: StripPin
  /** The group it's in; null on the strip itself. */
  group: GroupPin | null
  index: number
  /** How many share its row: the strip's pins, or its group's. */
  count: number
}

export function findPin(pins: readonly StripPin[], id: string): PinPlace | null {
  const top = pins.findIndex((pin) => pin.id === id)
  if (top >= 0) return { pin: pins[top], group: null, index: top, count: pins.length }
  for (const pin of pins) {
    if (!isGroup(pin)) continue
    const index = pin.group.items.findIndex((item) => item.id === id)
    if (index >= 0) {
      return { pin: pin.group.items[index], group: pin, index, count: pin.group.items.length }
    }
  }
  return null
}

const withItems = (group: GroupPin, items: Pin[]): GroupPin => ({
  ...group,
  group: { ...group.group, items: items.slice(0, GROUP_SIZE) }
})

/** The strip's pins with one changed, wherever it is. */
export function updatePin(
  pins: readonly StripPin[],
  id: string,
  change: (pin: StripPin) => StripPin
): StripPin[] {
  return pins.map((pin) => {
    if (pin.id === id) return change(pin)
    if (!isGroup(pin) || !pin.group.items.some((item) => item.id === id)) return pin
    return withItems(
      pin,
      pin.group.items.map((item) => {
        if (item.id !== id) return item
        const changed = change(item)
        // A pin in a group can't become one.
        return isGroup(changed) ? item : changed
      })
    )
  })
}

/** The strip's pins without one, wherever it was; a group goes with its pins. */
export function removePin(pins: readonly StripPin[], id: string): StripPin[] {
  return pins
    .filter((pin) => pin.id !== id)
    .map((pin) =>
      isGroup(pin) && pin.group.items.some((item) => item.id === id)
        ? withItems(
            pin,
            pin.group.items.filter((item) => item.id !== id)
          )
        : pin
    )
}

/** A place for pins: on the strip (`group` null) or in a group, before the pin at `index`. */
export interface PinSlot {
  group: string | null
  index: number
}

/** Pins put in at a slot. A group only goes on the strip itself. */
export function insertPins(
  pins: readonly StripPin[],
  added: readonly StripPin[],
  slot: PinSlot
): StripPin[] {
  if (!slot.group) {
    const at = Math.max(0, Math.min(pins.length, slot.index))
    return [...pins.slice(0, at), ...added, ...pins.slice(at)]
  }
  const items = added.filter((pin): pin is Pin => !isGroup(pin))
  return pins.map((pin) => {
    if (pin.id !== slot.group || !isGroup(pin)) return pin
    const at = Math.max(0, Math.min(pin.group.items.length, slot.index))
    return withItems(pin, [...pin.group.items.slice(0, at), ...items, ...pin.group.items.slice(at)])
  })
}

/**
 * Moves a pin to a slot, the slot counted as its row was before the pin was
 * lifted. A group can't go into another, and a group that's full takes no more.
 */
export function movePinTo(pins: readonly StripPin[], id: string, slot: PinSlot): StripPin[] {
  const place = findPin(pins, id)
  if (!place) return [...pins]
  if (slot.group && isGroup(place.pin)) return [...pins]
  const sameRow = (place.group?.id ?? null) === slot.group
  if (sameRow && (slot.index === place.index || slot.index === place.index + 1)) return [...pins]
  if (!sameRow && slot.group) {
    const into = pins.find((pin) => pin.id === slot.group)
    if (!into || !isGroup(into) || into.group.items.length >= GROUP_SIZE) return [...pins]
  }
  // Lifting a pin from the strip shifts what follows it on the strip, and so
  // a slot on the strip after it, whether or not it goes back to the strip.
  const lifted = !place.group && !slot.group && place.index < slot.index ? 1 : 0
  const shifted = sameRow && place.group && place.index < slot.index ? 1 : 0
  return insertPins(removePin(pins, id), [place.pin], {
    group: slot.group,
    index: slot.index - lifted - shifted
  })
}

/** One earlier (-1) or later (1), among the pins it shares a row with. */
export function shiftPin(pins: readonly StripPin[], id: string, by: number): StripPin[] {
  const place = findPin(pins, id)
  if (!place) return [...pins]
  const to = Math.max(0, Math.min(place.count - 1, place.index + by))
  if (to === place.index) return [...pins]
  return movePinTo(pins, id, {
    group: place.group?.id ?? null,
    index: to > place.index ? to + 1 : to
  })
}

/** Into a group, at its end. */
export function moveIntoGroup(pins: readonly StripPin[], id: string, groupId: string): StripPin[] {
  const into = pins.find((pin) => pin.id === groupId)
  if (!into || !isGroup(into)) return [...pins]
  return movePinTo(pins, id, { group: groupId, index: into.group.items.length })
}

/** Out of its group, onto the strip just after it. */
export function takeOutOfGroup(pins: readonly StripPin[], id: string): StripPin[] {
  const place = findPin(pins, id)
  if (!place?.group) return [...pins]
  const at = pins.findIndex((pin) => pin.id === place.group?.id)
  return movePinTo(pins, id, { group: null, index: at + 1 })
}

/** A group undone: its pins on the strip, where it was. */
export function ungroup(pins: readonly StripPin[], groupId: string): StripPin[] {
  return pins.flatMap((pin) => (pin.id === groupId && isGroup(pin) ? pin.group.items : [pin]))
}

/** A new group on the strip, where a pin was, with that pin in it. */
export function groupAround(
  pins: readonly StripPin[],
  id: string,
  group: { id: string; label: string }
): StripPin[] {
  const place = findPin(pins, id)
  if (!place || isGroup(place.pin)) return [...pins]
  const made: GroupPin = { ...group, group: { icon: 'collection', items: [place.pin] } }
  // Where the pin was on the strip, or just after the group it was in.
  const at = place.group ? pins.findIndex((one) => one.id === place.group?.id) + 1 : place.index
  return insertPins(removePin(pins, id), [made], { group: null, index: at })
}

// ----------------------------------------------------------------- websites

/**
 * A web address as typed, made whole: `youtube.com` -> `https://youtube.com/`.
 * Null for anything that isn't a web page's address: mail, files, scripts.
 */
export function normalizeAddress(text: string): string | null {
  const typed = text.trim()
  if (!typed || /\s/.test(typed)) return null
  // A scheme of its own (not a host and its port, as in localhost:3000).
  const schemed = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(typed)
  const whole = schemed ? typed : `https://${typed}`
  if (!URL.canParse(whole)) return null
  const url = new URL(whole)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname
  if (!host.includes('.') && host !== 'localhost' && !host.startsWith('[')) return null
  return url.href
}

/** A website's first name, from its address: `https://www.youtube.com/x` -> `youtube.com`. */
export function siteNameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

/** One string per target, so the same thing is not pinned or attached twice. */
export function targetKey(target: Target): string {
  switch (target.kind) {
    case 'page':
      return `page:${target.route}`
    case 'action':
      return `action:${target.action}`
    case 'file':
    case 'folder':
      // Windows paths are not case sensitive, so neither is this.
      return `${target.kind}:${target.path.toLowerCase()}`
    case 'stack':
      return `stack:${target.folderId}`
    case 'project':
      return `project:${target.projectId}`
    case 'link':
      return `link:${target.url}`
  }
}

/** The ways a target can open, in the order they're offered; none for one with one way. */
export function waysToOpen(target: Target): readonly OpensIn[] {
  if (target.kind === 'stack') return ['archive', 'explorer']
  if (target.kind === 'project') return ['ableton', 'archive', 'explorer']
  return []
}

/** Whether a click asks how to open it: a stack or a project not told one. */
export function asksHowToOpen(target: Target): boolean {
  return (target.kind === 'stack' || target.kind === 'project') && !target.opensIn
}

/** A way of opening something, in words, for the thing it opens. */
export function opensInLabel(target: Target, way: OpensIn): string {
  if (way === 'ableton') return 'Open in Ableton'
  if (way === 'archive') return 'Open in ARCHIVE'
  return target.kind === 'project' ? 'Open its folder' : 'Open in Explorer'
}

/** The same target, told how to open, or (null) left to ask. */
export function openedIn(target: Target, way: OpensIn | null): Target {
  switch (target.kind) {
    case 'stack':
      return way === 'archive' || way === 'explorer'
        ? { kind: 'stack', folderId: target.folderId, opensIn: way }
        : { kind: 'stack', folderId: target.folderId }
    case 'project':
      return way
        ? { kind: 'project', projectId: target.projectId, opensIn: way }
        : { kind: 'project', projectId: target.projectId }
    default:
      return target
  }
}

/** The last part of a path, for a pin's first name: `D:\Samples\Kicks` -> `Kicks`. */
export function baseName(value: string): string {
  const parts = value.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || value
}

/**
 * A pin pointing at a file or folder that has moved, pointing where it is now;
 * null when it isn't one of those. A pin still named after what it points at
 * (`Vortex.als`) takes the new name too (`Nova.als`); one the operator named
 * keeps theirs.
 */
export function relocatedPin(pin: Pin, move: (path: string) => string): Pin | null {
  const { target } = pin
  if (target.kind !== 'file' && target.kind !== 'folder') return null
  const path = move(target.path)
  if (path === target.path) return null
  const label = pin.label === baseName(target.path) ? baseName(path).slice(0, 80) : pin.label
  return { ...pin, label, target: { ...target, path } }
}

/** The strip's pins after files and folders moved, groups included; null when none pointed into them. */
export function relocatePins(
  pins: readonly StripPin[],
  move: (path: string) => string
): StripPin[] | null {
  let changed = false
  const one = (pin: Pin): Pin => {
    const moved = relocatedPin(pin, move)
    if (!moved) return pin
    changed = true
    return moved
  }
  const next = pins.map((pin) =>
    isGroup(pin) ? { ...pin, group: { ...pin.group, items: pin.group.items.map(one) } } : one(pin)
  )
  return changed ? next : null
}

// ------------------------------------------------------------------ settings

export const STRIP_LOOKS = ['panel', 'horizontal', 'vertical'] as const
export type StripLook = (typeof STRIP_LOOKS)[number]

export const STRIP_LOOK_LABEL: Record<StripLook, string> = {
  panel: 'Panel',
  horizontal: 'Horizontal',
  vertical: 'Vertical'
}

/** What opens when Haven starts, the strip aside. */
export const LAUNCH_WITH = ['strip', 'vestibule', 'console'] as const
export type LaunchWith = (typeof LAUNCH_WITH)[number]

export const LAUNCH_WITH_LABEL: Record<LaunchWith, string> = {
  strip: 'Quick strip',
  vestibule: 'Vestibule',
  console: 'Console'
}

/** Minutes before a timed entry its reminder comes; 0 is no reminders. */
export const REMINDER_LEADS = [0, 5, 10, 15, 30] as const

/** The pins a fresh install starts with, to be changed at will. */
export const DEFAULT_PINS: StripPin[] = [
  { id: 'new-project', label: 'New project', target: { kind: 'action', action: 'new-project' } },
  { id: 'open-link', label: 'Open a website', target: { kind: 'action', action: 'open-link' } },
  { id: 'console', label: 'The console', target: { kind: 'action', action: 'console' } },
  { id: 'archive', label: 'Archive', target: { kind: 'page', route: '/archive' } },
  { id: 'discography', label: 'Discography', target: { kind: 'page', route: '/discography' } },
  { id: 'calendar', label: 'Calendar', target: { kind: 'page', route: '/calendar' } }
]

export const StripSettingsSchema = z.object({
  /** The strip is up whenever Haven runs. */
  enabled: z.boolean().default(true),
  look: z.enum(STRIP_LOOKS).default('panel'),
  /** Today's agenda, from CALENDAR, on the strip. */
  today: z.boolean().default(true),
  /** Above every other window, Ableton's included. */
  onTop: z.boolean().default(true),
  /** Folded down to the logo alone; clicking the logo opens it again. */
  collapsed: z.boolean().default(false),
  /** Any number, in order, and groups of them. */
  pins: z.array(StripPinSchema).max(200).default(DEFAULT_PINS),
  /**
   * Where the operator left it: its top-left corner in screen pixels. Null
   * until it is first moved, which puts it in the bottom right.
   */
  position: z.object({ x: z.number().int(), y: z.number().int() }).nullable().default(null),
  /** Minutes ahead of a timed entry its reminder comes; 0 turns them off. */
  reminderMinutes: z.number().int().min(0).max(120).default(10)
})
export type StripSettings = z.infer<typeof StripSettingsSchema>

// ------------------------------------------------------------------ the window

/**
 * Where on the strip a popup was opened from (a group's icon), in the
 * strip window's own pixels, so it can drop down from there.
 */
export const StripAnchorSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
})
export type StripAnchor = z.infer<typeof StripAnchorSchema>

/** A popup opened beside the strip, and what it is about. */
export const StripPopupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new-project') }),
  z.object({ kind: z.literal('today'), entryId: z.string().nullable().default(null) }),
  z.object({ kind: z.literal('add') }),
  z.object({ kind: z.literal('folder'), path, label: z.string() }),
  /** A pin's own options: rename, remove, show in Explorer; a group's too. */
  z.object({ kind: z.literal('pin'), pinId: z.string() }),
  /** The ways a stack or a project pin opens, when it hasn't been told one. */
  z.object({ kind: z.literal('choose'), pinId: z.string() }),
  /** A group's pins, dropped down from its icon. */
  z.object({
    kind: z.literal('group'),
    pinId: z.string(),
    anchor: StripAnchorSchema.nullable().default(null)
  }),
  /** Any web address, to open, or to pin. */
  z.object({ kind: z.literal('website') }),
  /**
   * A follow-up from ARTISTS' leads, with what can be done about it: open the
   * lead, log and complete, snooze, dismiss. Where a clicked reminder lands,
   * since Windows notifications can't carry those buttons themselves.
   */
  z.object({
    kind: z.literal('followup'),
    parentKind: z.enum(['lead', 'opportunity']),
    parentId: z.string(),
    taskId: z.string()
  }),
  /** The strip's menu: the console, the vestibule, hide, quit. */
  z.object({ kind: z.literal('menu') })
])
export type StripPopup = z.infer<typeof StripPopupSchema>

/** What a website says of itself (main/app/site.ts): its name and its icon. */
export const SiteInfoSchema = z.object({
  /** False when it couldn't be reached at all: worth asking again later. */
  reached: z.boolean(),
  name: z.string().nullable(),
  /** The icon's bytes as they came, in base64, and their type. */
  icon: z.object({ type: z.string(), data: z.string() }).nullable()
})
export type SiteInfo = z.infer<typeof SiteInfoSchema>

/** One thing in a folder, as the strip lists it. */
export const FolderItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  folder: z.boolean(),
  /** Lower case, no dot; empty for a folder. */
  extension: z.string()
})
export type FolderItem = z.infer<typeof FolderItemSchema>

export const FolderListingSchema = z.object({
  path: z.string(),
  /** The folder above, or null at a drive's root. */
  parent: z.string().nullable(),
  items: z.array(FolderItemSchema),
  /** Set when the folder couldn't be read, in words the strip can show. */
  problem: z.string().nullable().default(null)
})
export type FolderListing = z.infer<typeof FolderListingSchema>
