/**
 * Canonical route registry. Declared in shared so the main process can build
 * native menus and deep links against the same source of truth as the renderer.
 */

export const SECTION_IDS = [
  'nexus',
  'archive',
  'observatory',
  'interface',
  'telemetry',
  'dispatch',
  'regulation'
] as const

export type SectionId = (typeof SECTION_IDS)[number]

export interface SectionDefinition {
  id: SectionId
  path: string
  /** Uppercase institutional label used in the rail. */
  label: string
  /** Plain description of the section's actual function. */
  purpose: string
  /** Flavour line drawn from the world brief. */
  epigraph: string
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
    order: 0,
    implemented: true
  },
  {
    id: 'archive',
    path: '/archive',
    label: 'ARCHIVE',
    purpose: 'Project registry, production pipeline and release packaging',
    epigraph: 'Endless hallways of memory. Records rewritten, realities curated.',
    order: 1,
    implemented: true
  },
  {
    id: 'observatory',
    path: '/observatory',
    label: 'OBSERVATORY',
    purpose: 'Stream overlays and live selection rites served to OBS',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    order: 2,
    implemented: true
  },
  {
    id: 'interface',
    path: '/interface',
    label: 'INTERFACE',
    purpose: 'Natural-language command console for system-wide operations',
    epigraph: 'The core remembers what the people have forgotten.',
    order: 3,
    implemented: false
  },
  {
    id: 'telemetry',
    path: '/telemetry',
    label: 'TELEMETRY',
    purpose: 'Host vitals: processor, memory, graphics and storage',
    epigraph: 'A place for cosmic observation and planetary surveillance.',
    order: 4,
    implemented: true
  },
  {
    id: 'dispatch',
    path: '/dispatch',
    label: 'DISPATCH',
    purpose: 'Feedback and suggestions between operators, ruled on and recorded',
    epigraph: 'Nothing is lost that is entered into the record.',
    order: 5,
    implemented: true
  },
  {
    id: 'regulation',
    path: '/regulation',
    label: 'REGULATION',
    purpose: 'Operator settings, archive control and update channel',
    epigraph: 'Harmony is maintained.',
    order: 6,
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
