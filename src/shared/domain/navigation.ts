/**
 * Canonical route registry. Declared in shared so the main process can build
 * native menus and deep links against the same source of truth as the renderer.
 */

export const SECTION_IDS = [
  'nexus',
  'calendar',
  'interface',
  'archive',
  'auditorium',
  'darkroom',
  'consultation',
  'discography',
  'releases',
  'leads',
  'artists',
  'contact',
  'services',
  'observatory',
  'lore',
  'colophon',
  'telemetry',
  'dispatch',
  'regulation',
  'catechism'
] as const

export type SectionId = (typeof SECTION_IDS)[number]

/**
 * The categories the rail is grouped under, as the console arranges it.
 *
 * Ordered, and the order is the order departments appear. Reorganised in
 * 1.27.0, when four divisions had stopped saying where things were:
 * PRODUCTION held the projects, the catalogue, the roster, the calendar and
 * two tools, and PUBLICATION held the stream, the website and the inbox. Each
 * category now answers one question, and LEADS, out of ARTISTS, opened
 * COMMUNITY (Candy's name for it, and the home for networking to come).
 *
 * This is only the console's own arrangement. REGULATION, under DIRECTORY,
 * lets the operator make their own categories, rename these, move pages
 * between them and pin pages and categories (`arrangeSections`).
 */
export const SECTION_GROUP_IDS = [
  'command',
  'studio',
  'catalogue',
  'community',
  'publication',
  'oversight'
] as const

export type SectionGroupId = (typeof SECTION_GROUP_IDS)[number]

export interface SectionGroupDefinition {
  id: SectionGroupId
  /** Uppercase category name, drawn as the rail's sub-masthead. */
  label: string
  /** What the category is for, in a few words. Carried as the group's title. */
  purpose: string
}

export const SECTION_GROUP: Record<SectionGroupId, SectionGroupDefinition> = {
  command: {
    id: 'command',
    label: 'COMMAND',
    purpose: 'Where the day is seen whole: the overview, the calendar, and instruction'
  },
  studio: {
    id: 'studio',
    label: 'STUDIO',
    purpose: 'Where the work is made, heard and developed'
  },
  catalogue: {
    id: 'catalogue',
    label: 'CATALOGUE',
    purpose: 'What is released, and how the website shows it'
  },
  /*
   * The people: who you are getting to know, who you work with, and who
   * writes in. Named by Candy, on DISPATCH, as the place networking grows.
   */
  community: {
    id: 'community',
    label: 'COMMUNITY',
    purpose: "The people: who you're getting to know, who you work with, and who writes in"
  },
  /*
   * What the public sees: the stream while it is live, and the website's own
   * pages. The website's inbox moved to COMMUNITY and its discography to
   * CATALOGUE, which is what they are about.
   */
  publication: {
    id: 'publication',
    label: 'PUBLICATION',
    purpose: "What the public sees: the stream while it is live, and the website's own pages"
  },
  oversight: {
    id: 'oversight',
    label: 'OVERSIGHT',
    purpose: 'The condition of the installation, and the rules it runs under'
  }
}

export interface SectionDefinition {
  id: SectionId
  path: string
  /** Uppercase institutional label used in the rail. */
  label: string
  /** Plain description of the section's actual function. */
  purpose: string
  /** Flavour line drawn from the world brief. */
  epigraph: string
  /** Category the console files this department under. */
  group: SectionGroupId
  /**
   * Position in the console's own arrangement. The number the operator sees
   * is the department's position in *their* rail (`Arrangement.numberOf`),
   * which is this until they rearrange it.
   */
  order: number
  /** False until the feature ships; renders a reserved-state shell. */
  implemented: boolean
  /** Other words the rail's search finds it by: "settings" for REGULATION. */
  keywords: readonly string[]
}

export const SECTIONS: readonly SectionDefinition[] = [
  {
    id: 'nexus',
    path: '/',
    label: 'NEXUS',
    purpose: 'Operational overview and system state',
    epigraph: 'A central node where harmonic data is processed and distributed.',
    group: 'command',
    order: 0,
    implemented: true,
    keywords: ['home', 'overview', 'landing']
  },
  {
    id: 'calendar',
    path: '/calendar',
    label: 'CALENDAR',
    purpose: 'The dated register: sessions, deliveries and observances',
    epigraph: 'Nothing arrives early. Nothing arrives late. Everything is scheduled.',
    group: 'command',
    order: 1,
    implemented: true,
    keywords: ['schedule', 'events', 'sessions', 'deadlines', 'dates', 'today']
  },
  {
    id: 'interface',
    path: '/interface',
    label: 'INTERFACE',
    purpose: 'Natural-language command console for system-wide operations',
    epigraph: 'The core remembers what the people have forgotten.',
    group: 'command',
    order: 2,
    implemented: false,
    keywords: ['ai', 'assistant']
  },
  {
    id: 'archive',
    path: '/archive',
    label: 'ARCHIVE',
    purpose: 'Project registry, production pipeline and release packaging',
    epigraph: 'Endless hallways of memory. Records rewritten, realities curated.',
    group: 'studio',
    order: 3,
    implemented: true,
    keywords: ['projects', 'ableton', 'sets', 'intake', 'stacks', 'temporary']
  },
  {
    id: 'auditorium',
    path: '/auditorium',
    label: 'AUDITORIUM',
    purpose: 'Listening room: one file, played and rendered visible',
    epigraph: 'Sound is the only record that cannot be falsified.',
    group: 'studio',
    order: 4,
    implemented: true,
    keywords: ['player', 'listen', 'visualiser', 'audio']
  },
  {
    id: 'darkroom',
    path: '/darkroom',
    label: 'DARKROOM',
    purpose: 'Grade photographs onto the console palette and export them',
    epigraph: 'Every likeness must be developed before it may be shown.',
    group: 'studio',
    order: 5,
    implemented: true,
    keywords: ['photos', 'images', 'pictures', 'grade']
  },
  {
    /*
     * A track shared for other producers' feedback, through a link on the
     * website that stays open a week at most. They leave notes and try
     * tools on it there; their feedback is heard back here, through the
     * same tools. Behind the DISPATCH sign-in. See docs/CONSULTATION.md.
     */
    id: 'consultation',
    path: '/consultation',
    label: 'CONSULTATION',
    purpose: "A track shared for other producers' feedback, and their notes heard back",
    epigraph: 'Every ear consulted. Every verdict recorded, then burned.',
    group: 'studio',
    order: 6,
    implemented: true,
    keywords: ['feedback', 'share', 'link', 'mix', 'master', 'eq', 'producers', 'notes']
  },
  {
    id: 'discography',
    path: '/discography',
    label: 'DISCOGRAPHY',
    purpose: 'Everything released: singles, EPs, albums and remixes, and where they went',
    epigraph: 'What is released cannot be unreleased. The record stands.',
    group: 'catalogue',
    order: 7,
    implemented: true,
    keywords: ['catalogue', 'singles', 'albums', 'eps', 'remixes', 'tracks']
  },
  {
    /*
     * DISCOGRAPHY, as the website shows it. The catalogue stays in
     * DISCOGRAPHY; this sends it, through the same API as LORE: "Publish
     * everything" once, then each release when its sheet is done with. Which
     * releases are shown and the home page shelf are set here.
     * See docs/RELEASES.md.
     */
    id: 'releases',
    path: '/releases',
    label: 'RELEASES',
    purpose: 'The discography as the website shows it: what is shown, and the shelf',
    epigraph: 'Every record carries its own way out.',
    group: 'catalogue',
    order: 8,
    implemented: true,
    keywords: ['website', 'shelf', 'publish']
  },
  {
    /*
     * ARTISTS' LEADS and OPPORTUNITIES, given a page of their own in 1.27.0,
     * as Candy asked on DISPATCH: the CRM is daily work, and a tab inside the
     * roster hid it. The first department in COMMUNITY.
     */
    id: 'leads',
    path: '/leads',
    label: 'LEADS',
    purpose: "The people you're getting to know, and the work that comes of them",
    epigraph: 'Every alliance begins as a signal answered.',
    group: 'community',
    order: 9,
    implemented: true,
    keywords: ['opportunities', 'crm', 'network', 'networking', 'follow-ups', 'contacts']
  },
  {
    id: 'artists',
    path: '/artists',
    label: 'ARTISTS',
    purpose: 'The roster: who the practice works with, and what they are on',
    epigraph: 'Many forms. One underlying frequency.',
    group: 'community',
    order: 10,
    implemented: true,
    keywords: ['roster', 'people', 'collaborators', 'credits']
  },
  {
    /*
     * What the website's contact page sends, copied here on every check-in.
     *
     * Behind the DISPATCH sign-in, and the reason the website has an API at
     * all: the record is in the website's database, which this console never
     * reaches directly. See docs/INBOX.md.
     */
    id: 'contact',
    path: '/contact',
    label: 'CONTACT',
    purpose: 'Messages sent from the website, read and answered',
    epigraph: 'No voice that reaches the gate goes unrecorded.',
    group: 'community',
    order: 11,
    implemented: true,
    keywords: ['messages', 'inbox', 'email', 'website']
  },
  {
    /*
     * What the website books, and what it offers: DJ enquiries, producer
     * bookings (moved or cancelled from here), and the producer services
     * and hours, published from here. Same sign-in, same check-ins as
     * CONTACT.
     */
    id: 'services',
    path: '/services',
    label: 'SERVICES',
    purpose: 'Bookings from the website, and the services and hours it offers',
    epigraph: 'The work is asked for before it is made.',
    group: 'community',
    order: 12,
    implemented: true,
    keywords: [
      'bookings',
      'enquiries',
      'dj',
      'producer',
      'sessions',
      'offerings',
      'prices',
      'hours',
      'website'
    ]
  },
  {
    id: 'observatory',
    path: '/observatory',
    label: 'OBSERVATORY',
    purpose: 'Stream overlays and live selection rites served to OBS',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    group: 'publication',
    order: 13,
    implemented: true,
    keywords: ['stream', 'overlays', 'obs', 'broadcast', 'twitch']
  },
  {
    /*
     * The lore of Nayara, written here and published to the website: its
     * chapters, and the planet each is read beside. Drafts are kept on this
     * machine; a chapter reaches the website, through the same API as
     * CONTACT, only when it is published. See docs/LORE.md.
     */
    id: 'lore',
    path: '/lore',
    label: 'LORE',
    purpose: 'The lore of Nayara: chapters and planets, written here, published to the website',
    epigraph: 'The world is fiction. The story is not.',
    group: 'publication',
    order: 14,
    implemented: true,
    keywords: ['nayara', 'story', 'chapters', 'planets', 'website']
  },
  {
    /*
     * The details the website carries on every page.
     *
     * A colophon is the note at the back of a book saying who made it and
     * where they can be found; the website's footer and contact pages are
     * exactly that note, so this is where it is written.
     *
     * Reserved again in 1.19.1, while the website's side is worked out: the
     * page says it is coming soon, and the built department waits in the
     * code for its route to swap back.
     */
    id: 'colophon',
    path: '/colophon',
    label: 'COLOPHON',
    purpose: 'The details the website carries: where to write, call, message and follow',
    epigraph: 'Every record carries the seal of where it may be answered.',
    group: 'publication',
    order: 15,
    implemented: false,
    keywords: ['website', 'details', 'profiles', 'socials']
  },
  {
    id: 'telemetry',
    path: '/telemetry',
    label: 'TELEMETRY',
    purpose: 'Host vitals: processor, memory, graphics and storage',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    group: 'oversight',
    order: 16,
    implemented: true,
    keywords: ['cpu', 'memory', 'gpu', 'system', 'performance', 'vitals']
  },
  {
    id: 'dispatch',
    path: '/dispatch',
    label: 'DISPATCH',
    purpose: 'Feedback and suggestions between operators, ruled on and recorded',
    epigraph: 'Nothing is lost that is entered into the record.',
    group: 'oversight',
    order: 17,
    implemented: true,
    keywords: ['feedback', 'suggestions', 'board', 'requests', 'faults', 'bugs']
  },
  {
    id: 'regulation',
    path: '/regulation',
    label: 'REGULATION',
    purpose: 'Operator settings, archive control and update channel',
    epigraph: 'Harmony is maintained.',
    group: 'oversight',
    order: 18,
    implemented: true,
    keywords: ['settings', 'preferences', 'options', 'directory', 'pins']
  },
  {
    id: 'catechism',
    path: '/catechism',
    label: 'CATECHISM',
    purpose: 'How this console is operated, department by department',
    epigraph: 'We do not question the shape of the universe.',
    group: 'oversight',
    order: 19,
    implemented: true,
    keywords: ['help', 'docs', 'documentation', 'guide', 'manual', 'handbook']
  }
] as const

export function getSection(id: SectionId): SectionDefinition {
  const section = SECTIONS.find((entry) => entry.id === id)
  if (!section) throw new Error(`Unknown section: ${id}`)
  return section
}

export function getSectionByPath(pathname: string): SectionDefinition | undefined {
  // Longest-prefix match so nested routes resolve to their owning section.
  return [...SECTIONS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((section) =>
      section.path === '/' ? pathname === '/' : pathname.startsWith(section.path)
    )
}

// ---------------------------------------------------------------- arranging

/** As many categories as REGULATION lets the operator make. */
export const MAX_NAVIGATION_CATEGORIES = 24
/** How long a category's name may be. */
export const MAX_NAVIGATION_CATEGORY_LABEL = 32

/** One of the operator's own categories, as REGULATION's DIRECTORY saves it. */
export interface NavigationCategoryPreference {
  /** A built-in category's id (`studio`), or `custom-…` for one they made. */
  id: string
  label: string
  /** Department ids, in rail order. Unknown ones are skipped. */
  sections: readonly string[]
}

/** `settings.navigation`, in the shape `arrangeSections` reads. */
export interface NavigationPreferences {
  /** Null: the console's own arrangement. */
  categories: readonly NavigationCategoryPreference[] | null
  /** Departments pinned to the top of the rail, in order. */
  pinned: readonly string[]
  /** Categories pinned: first in the rail, and always open. */
  pinnedCategories: readonly string[]
}

export interface ArrangedCategory {
  id: string
  label: string
  /** A built-in category's line; null for one the operator made. */
  purpose: string | null
  pinned: boolean
  sections: SectionDefinition[]
}

export interface Arrangement {
  /** Pinned pages, for the top of the rail. They stay in their categories too. */
  pinned: SectionDefinition[]
  /** Categories in rail order, pinned ones first, empty ones left out. */
  categories: ArrangedCategory[]
  /** Every department, in the order the rail numbers them. */
  ordered: SectionDefinition[]
  /** A department's number in the rail, from 1. Ctrl+1..0 follow it. */
  numberOf: (id: SectionId) => number
  /** The category a department is in. */
  categoryOf: (id: SectionId) => ArrangedCategory | undefined
}

const SECTION_BY_ID = new Map<string, SectionDefinition>(SECTIONS.map((s) => [s.id, s]))

export function isSectionId(value: string): value is SectionId {
  return SECTION_BY_ID.has(value)
}

/** The console's own categories, as preferences: what REGULATION starts editing from. */
export function defaultCategories(): NavigationCategoryPreference[] {
  return SECTION_GROUP_IDS.map((id) => ({
    id,
    label: SECTION_GROUP[id].label,
    sections: SECTIONS.filter((section) => section.group === id).map((section) => section.id)
  }))
}

/**
 * The operator's categories made whole: every department in exactly one.
 *
 * A department listed twice keeps its first place; an unknown id is dropped.
 * One that isn't listed at all (a department added by an update since the
 * operator arranged their rail) goes to the category it belongs to in the
 * console's own arrangement if they kept it, else to the first one. Empty
 * categories are kept: REGULATION shows them, the rail leaves them out.
 */
export function completeCategories(
  categories: readonly NavigationCategoryPreference[] | null | undefined
): NavigationCategoryPreference[] {
  const source = categories && categories.length > 0 ? categories : defaultCategories()
  const placed = new Set<string>()
  const whole = source.map((category) => ({
    id: category.id,
    label: category.label,
    sections: category.sections.filter((id) => {
      if (!SECTION_BY_ID.has(id) || placed.has(id)) return false
      placed.add(id)
      return true
    })
  }))

  for (const section of SECTIONS) {
    if (placed.has(section.id)) continue
    const home = whole.find((category) => category.id === section.group) ?? whole[0]
    home.sections = [...home.sections, section.id]
  }
  return whole
}

/**
 * The rail as this operator has it: pinned pages, then categories (pinned
 * ones first), each with its departments, and every department's number.
 *
 * Numbers follow the rail top to bottom, pins left out, so the rail always
 * reads 01, 02, 03, the page header says the same, and Ctrl+1..0 open the
 * first ten in it. Before the rail could be rearranged a department's number
 * was fixed; it is still its identity, it just comes from where it is.
 */
export function arrangeSections(preferences?: Partial<NavigationPreferences> | null): Arrangement {
  const pinnedCategories = new Set(preferences?.pinnedCategories ?? [])
  const whole = completeCategories(preferences?.categories)

  const arranged: ArrangedCategory[] = whole.map((category) => ({
    id: category.id,
    label: category.label.trim() || 'UNTITLED',
    purpose:
      (SECTION_GROUP as Record<string, SectionGroupDefinition>)[category.id]?.purpose ?? null,
    pinned: pinnedCategories.has(category.id),
    sections: category.sections.map((id) => SECTION_BY_ID.get(id) as SectionDefinition)
  }))

  const categories = [
    ...arranged.filter((category) => category.pinned),
    ...arranged.filter((category) => !category.pinned)
  ].filter((category) => category.sections.length > 0)

  const ordered = categories.flatMap((category) => category.sections)
  const numbers = new Map<string, number>(ordered.map((section, index) => [section.id, index + 1]))
  const homes = new Map<string, ArrangedCategory>()
  for (const category of categories) {
    for (const section of category.sections) homes.set(section.id, category)
  }

  const seen = new Set<string>()
  const pinned = (preferences?.pinned ?? []).flatMap((id) => {
    const section = SECTION_BY_ID.get(id)
    if (!section || seen.has(id)) return []
    seen.add(id)
    return [section]
  })

  return {
    pinned,
    categories,
    ordered,
    numberOf: (id) => numbers.get(id) ?? 0,
    categoryOf: (id) => homes.get(id)
  }
}

/**
 * The rail's search: departments whose name, purpose, keywords or category
 * match every word typed, best first (a name that starts with the query
 * leads). Empty for an empty query.
 */
export function searchSections(arrangement: Arrangement, query: string): SectionDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const scored = arrangement.ordered.flatMap((section) => {
    const category = arrangement.categoryOf(section.id)
    const label = section.label.toLowerCase()
    const haystack = [
      label,
      section.purpose.toLowerCase(),
      ...section.keywords,
      category?.label.toLowerCase() ?? ''
    ].join(' ')
    if (!words.every((word) => haystack.includes(word))) return []
    const score = label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2
    return [{ section, score }]
  })

  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.section)
}
