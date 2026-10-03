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
 */

// ------------------------------------------------------------------ targets

/** What the strip can do itself, rather than open. */
export const STRIP_ACTIONS = ['new-project', 'add-to-today', 'console', 'vestibule'] as const
export type StripAction = (typeof STRIP_ACTIONS)[number]

export const STRIP_ACTION_LABEL: Record<StripAction, string> = {
  'new-project': 'New project',
  'add-to-today': 'Add to today',
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

/** A target with a name: a button on the strip, or an attachment on an entry. */
export const PinSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  target: TargetSchema
})
export type Pin = z.infer<typeof PinSchema>

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
export const DEFAULT_PINS: Pin[] = [
  { id: 'new-project', label: 'New project', target: { kind: 'action', action: 'new-project' } },
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
  /** Any number, in order. */
  pins: z.array(PinSchema).max(200).default(DEFAULT_PINS),
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

/** A popup opened beside the strip, and what it is about. */
export const StripPopupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new-project') }),
  z.object({ kind: z.literal('today'), entryId: z.string().nullable().default(null) }),
  z.object({ kind: z.literal('add') }),
  z.object({ kind: z.literal('folder'), path, label: z.string() }),
  /** A pin's own options: rename, remove, show in Explorer. */
  z.object({ kind: z.literal('pin'), pinId: z.string() }),
  /** The ways a stack or a project pin opens, when it hasn't been told one. */
  z.object({ kind: z.literal('choose'), pinId: z.string() }),
  /** The strip's menu: the console, the vestibule, hide, quit. */
  z.object({ kind: z.literal('menu') })
])
export type StripPopup = z.infer<typeof StripPopupSchema>

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
