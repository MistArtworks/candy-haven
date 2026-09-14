import { parseMarkdown, parseSlides, type Block, type Slide } from '@renderer/lib/markdown'
import type { SectionId } from '@shared/domain/navigation'

/**
 * The CATECHISM's own registry.
 *
 * Same discipline as the department and overlay registries: one table drives
 * the chapter rail, the routes, the quick-guide buttons and the orientation
 * tour, so none of them can disagree about what has been written.
 *
 * The prose itself is *not* in this file, and that is the point. Every chapter
 * and every guide is a Markdown document under `docs/` and `guides/`, compiled
 * in by Vite. Correcting a sentence means editing a `.md` — no component, no
 * rebuild of anything but the bundle, and the diff reads as English.
 */

// Globbed eagerly: this is a desktop application loading from local disk, and
// the whole corpus is a few tens of kilobytes of text. Lazily importing it
// would buy a loading state nobody wants in exchange for nothing.
const DOCS = import.meta.glob('./docs/*.md', {
  eager: true,
  import: 'default',
  query: '?raw'
}) as Record<string, string>

const GUIDES = import.meta.glob('./guides/*.md', {
  eager: true,
  import: 'default',
  query: '?raw'
}) as Record<string, string>

/** `./docs/archive.md` -> `archive`. */
function slug(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
}

const DOC_BY_SLUG = new Map(Object.entries(DOCS).map(([path, body]) => [slug(path), body]))
const GUIDE_BY_SLUG = new Map(Object.entries(GUIDES).map(([path, body]) => [slug(path), body]))

// ------------------------------------------------------------------ chapters

export interface ChapterDefinition {
  /** URL segment, and the name of the Markdown file that supplies it. */
  id: string
  /** Uppercase institutional label, as everywhere else in the console. */
  label: string
  /** What the chapter covers, in a line. Drawn under the label in the rail. */
  purpose: string
  /** The department this chapter documents, when it documents exactly one. */
  section?: SectionId
}

/**
 * The reference, in order.
 *
 * Ordered as the rail is ordered, with three chapters that are not departments:
 * an overview at the top, a setup walkthrough that spans several departments,
 * and the shortcut table at the bottom.
 */
export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'overview',
    label: 'THE CONSOLE',
    purpose: 'What Candy Haven is, and how its departments are arranged'
  },
  {
    id: 'getting-started',
    label: 'COMMISSIONING',
    purpose: 'First run: the filing root, the archive, and what to set up first'
  },
  { id: 'nexus', label: 'NEXUS', purpose: 'The landing and the diagnostic grid', section: 'nexus' },
  {
    id: 'archive',
    label: 'ARCHIVE',
    purpose: 'Projects, the filing tree, the pipeline and intake',
    section: 'archive'
  },
  {
    id: 'calendar',
    label: 'CALENDAR',
    purpose: 'The dated register and its four lenses',
    section: 'calendar'
  },
  {
    id: 'auditorium',
    label: 'AUDITORIUM',
    purpose: 'The listening room and the visualiser',
    section: 'auditorium'
  },
  {
    id: 'darkroom',
    label: 'DARKROOM',
    purpose: 'Grading photographs onto the console palette',
    section: 'darkroom'
  },
  {
    id: 'observatory',
    label: 'OBSERVATORY',
    purpose: 'The broadcast kit: every overlay, and how to add it to OBS',
    section: 'observatory'
  },
  {
    id: 'telemetry',
    label: 'TELEMETRY',
    purpose: 'Host vitals and what each reading means',
    section: 'telemetry'
  },
  {
    id: 'dispatch',
    label: 'DISPATCH',
    purpose: 'The shared board, identity and rulings',
    section: 'dispatch'
  },
  {
    id: 'regulation',
    label: 'REGULATION',
    purpose: 'Every setting, by category',
    section: 'regulation'
  },
  { id: 'shortcuts', label: 'SHORTCUTS', purpose: 'Every chord the console binds' },
  {
    id: 'glossary',
    label: 'GLOSSARY',
    purpose: 'What this console calls things, and where two words differ'
  },
  {
    id: 'troubleshooting',
    label: 'FAULTS',
    purpose: 'What to do when something refuses, stalls or reads wrong'
  }
] as const

export function getChapter(id: string): ChapterDefinition | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id)
}

/**
 * A chapter's parsed body, or null when the document has not been written.
 *
 * Null rather than empty so the page can say which chapter is missing instead
 * of drawing a blank sheet that looks like a rendering fault.
 */
export function chapterBlocks(id: string): Block[] | null {
  const body = DOC_BY_SLUG.get(id)
  return body ? parseMarkdown(body) : null
}

// -------------------------------------------------------------------- guides

/**
 * A department's quick guide, as slides.
 *
 * Keyed by section id, so a page asks for its own guide without a second table
 * mapping one to the other. `orientation` is the whole-console tour and is the
 * one guide with no department.
 */
export type GuideId = SectionId | 'orientation'

export interface Guide {
  title: string
  slides: Slide[]
}

export function getGuide(id: GuideId): Guide | null {
  const body = GUIDE_BY_SLUG.get(id)
  if (!body) return null

  const { title, slides } = parseSlides(body)
  return slides.length > 0 ? { title, slides } : null
}

/** True when a department has a quick guide, so the page can offer the button. */
export function hasGuide(id: GuideId): boolean {
  return GUIDE_BY_SLUG.has(id)
}
