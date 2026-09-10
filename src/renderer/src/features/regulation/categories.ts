/**
 * The settings, in groups.
 *
 * REGULATION was six panels in one grid, which was legible while there were
 * four and stopped being so once the board's connection arrived — a page where
 * everything is present at once has no shape, and the operator scrolls past
 * five things they were not looking for to reach the sixth.
 *
 * Declared as a table rather than written into the page for the same reason the
 * department rail is: the navigation and the content are then generated from
 * one source and cannot disagree about what exists.
 */
export const REGULATION_CATEGORIES = [
  'presentation',
  'startup',
  'archive',
  'integrations',
  'board',
  'updates',
  'rehearsal',
  'diagnostics'
] as const

export type RegulationCategory = (typeof REGULATION_CATEGORIES)[number]

export interface RegulationCategoryDefinition {
  id: RegulationCategory
  /** Uppercase institutional label, as everywhere else in the console. */
  label: string
  /** What this group governs, in a line. Shown under the heading. */
  purpose: string
}

export const REGULATION_CATEGORY: Record<RegulationCategory, RegulationCategoryDefinition> = {
  presentation: {
    id: 'presentation',
    label: 'PRESENTATION',
    purpose: 'Motion, interface scale and the accent this console draws with.'
  },
  startup: {
    id: 'startup',
    label: 'STARTUP',
    purpose: 'Whether this console starts with the machine, and what closing it means.'
  },
  archive: {
    id: 'archive',
    label: 'ARCHIVE',
    purpose: 'The local database that holds the register.'
  },
  integrations: {
    id: 'integrations',
    label: 'INTEGRATIONS',
    purpose: 'Accounts and services the broadcast kit reads from.'
  },
  board: {
    id: 'board',
    label: 'BOARD',
    purpose: 'The shared database behind DISPATCH, and what it is attached to.'
  },
  updates: {
    id: 'updates',
    label: 'UPDATES',
    purpose: 'Release channel and how new versions arrive.'
  },
  rehearsal: {
    id: 'rehearsal',
    label: 'REHEARSAL',
    purpose: 'Test mode, for exercising the kit without a live audience.'
  },
  diagnostics: {
    id: 'diagnostics',
    label: 'DIAGNOSTICS',
    purpose: 'Where this installation keeps its files, and what it is running on.'
  }
}

export function isRegulationCategory(value: string | null): value is RegulationCategory {
  return value !== null && REGULATION_CATEGORIES.includes(value as RegulationCategory)
}
