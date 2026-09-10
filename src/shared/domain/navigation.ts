/**
 * Canonical route registry. Declared in shared so the main process can build
 * native menus and deep links against the same source of truth as the renderer.
 */

export const SECTION_IDS = [
  'nexus',
  'interface',
  'archive',
  'calendar',
  'auditorium',
  'observatory',
  'telemetry',
  'dispatch',
  'regulation'
] as const

export type SectionId = (typeof SECTION_IDS)[number]

/**
 * The divisions the rail is grouped under.
 *
 * Ordered, and the order is the order departments appear — a section's group is
 * therefore not free to contradict its position in the list. Nine entries in one
 * undivided column read as a menu; four named divisions read as an organisation
 * chart, which is the register this console is written in.
 */
export const SECTION_GROUP_IDS = ['command', 'production', 'broadcast', 'oversight'] as const

export type SectionGroupId = (typeof SECTION_GROUP_IDS)[number]

export interface SectionGroupDefinition {
  id: SectionGroupId
  /** Uppercase division name, drawn as the rail's sub-masthead. */
  label: string
  /** What the division is for, in a few words. Carried as the group's title. */
  purpose: string
}

export const SECTION_GROUP: Record<SectionGroupId, SectionGroupDefinition> = {
  command: {
    id: 'command',
    label: 'COMMAND',
    purpose: 'Where the system is seen whole and instructed'
  },
  production: {
    id: 'production',
    label: 'PRODUCTION',
    purpose: 'The work itself: what is filed, when it is due, and how it sounds'
  },
  broadcast: {
    id: 'broadcast',
    label: 'BROADCAST',
    purpose: 'What is served to an audience while it is live'
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
  /** Division the rail files this department under. */
  group: SectionGroupId
  /** Index used for directional page transitions. */
  order: number
  /** False until the feature ships; renders a reserved-state shell. */
  implemented: boolean
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
    implemented: true
  },
  {
    id: 'interface',
    path: '/interface',
    label: 'INTERFACE',
    purpose: 'Natural-language command console for system-wide operations',
    epigraph: 'The core remembers what the people have forgotten.',
    group: 'command',
    order: 1,
    implemented: false
  },
  {
    id: 'archive',
    path: '/archive',
    label: 'ARCHIVE',
    purpose: 'Project registry, production pipeline and release packaging',
    epigraph: 'Endless hallways of memory. Records rewritten, realities curated.',
    group: 'production',
    order: 2,
    implemented: true
  },
  {
    id: 'calendar',
    path: '/calendar',
    label: 'CALENDAR',
    purpose: 'The dated register: sessions, deliveries and observances',
    epigraph: 'Nothing arrives early. Nothing arrives late. Everything is scheduled.',
    group: 'production',
    order: 3,
    implemented: true
  },
  {
    id: 'auditorium',
    path: '/auditorium',
    label: 'AUDITORIUM',
    purpose: 'Listening room: one file, played and rendered visible',
    epigraph: 'Sound is the only record that cannot be falsified.',
    group: 'production',
    order: 4,
    implemented: true
  },
  {
    id: 'observatory',
    path: '/observatory',
    label: 'OBSERVATORY',
    purpose: 'Stream overlays and live selection rites served to OBS',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    group: 'broadcast',
    order: 5,
    implemented: true
  },
  {
    id: 'telemetry',
    path: '/telemetry',
    label: 'TELEMETRY',
    purpose: 'Host vitals: processor, memory, graphics and storage',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    group: 'oversight',
    order: 6,
    implemented: true
  },
  {
    id: 'dispatch',
    path: '/dispatch',
    label: 'DISPATCH',
    purpose: 'Feedback and suggestions between operators, ruled on and recorded',
    epigraph: 'Nothing is lost that is entered into the record.',
    group: 'oversight',
    order: 7,
    implemented: true
  },
  {
    id: 'regulation',
    path: '/regulation',
    label: 'REGULATION',
    purpose: 'Operator settings, archive control and update channel',
    epigraph: 'Harmony is maintained.',
    group: 'oversight',
    order: 8,
    implemented: true
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

export interface SectionGroup {
  definition: SectionGroupDefinition
  sections: readonly SectionDefinition[]
}

/**
 * The rail, in divisions.
 *
 * Derived from `SECTIONS` rather than declared a second time, so a department
 * added to the registry appears under its division without a second edit — and
 * so the two lists cannot disagree about what exists. A division with no
 * departments is dropped rather than drawn empty.
 */
export function getSectionGroups(): SectionGroup[] {
  return SECTION_GROUP_IDS.map((id) => ({
    definition: SECTION_GROUP[id],
    sections: SECTIONS.filter((section) => section.group === id)
  })).filter((group) => group.sections.length > 0)
}
