/**
 * Constants half of LORE: the lore of Nayara, written here and published to
 * the website.
 *
 * The limits are the website's, word for word: it checks them again before
 * it keeps anything, and a draft the page let through only to be refused
 * there would be a draft the operator has to shorten twice. See
 * docs/LORE.md.
 */

export const LORE_LIMITS = {
  title: 80,
  line: 200,
  body: 100_000,
  slug: 60,
  planetName: 60
} as const

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A chapter's address from its title. Made here; the website checks only
 * that it's well formed and that no other published chapter has it.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LORE_LIMITS.slug)
    .replace(/-+$/g, '')
  return slug || 'chapter'
}

export const LORE_LINK_STATES = [
  /** No Firebase config on this machine, so there is no sign-in to use. */
  'unconfigured',
  'signed-out',
  'syncing',
  'online',
  /** The last call failed. What was fetched before is still shown. */
  'offline'
] as const
export type LoreLinkState = (typeof LORE_LINK_STATES)[number]

/**
 * Where a chapter stands against the website.
 *
 * `changed` is anything about it that differs from what's live: its text,
 * title, line, address, or its planet, edited in the library since.
 */
export const CHAPTER_STATUSES = ['draft', 'published', 'changed'] as const
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  changed: 'CHANGED SINCE PUBLISHED'
}

/** The planet a new chapter starts with. */
export const DEFAULT_PLANET_ID = 'preset:network'

/** The department's tabs: the chapters' list, one chapter being written, the planets. */
export const LORE_TABS = ['chapters', 'write', 'planets'] as const
export type LoreTab = (typeof LORE_TABS)[number]

/** How a chapter is looked at while it's written: the text, the text beside the preview, or the preview. */
export const WRITE_VIEWS = ['write', 'split', 'preview'] as const
export type WriteView = (typeof WRITE_VIEWS)[number]
