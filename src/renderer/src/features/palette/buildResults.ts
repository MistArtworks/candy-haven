import { SECTION_GROUP, type SectionDefinition } from '@shared/domain/navigation'
import type { ProjectSummary } from '@shared/domain/projects'
import { PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import type { DiscographySummary } from '@shared/domain/discography'
import { RELEASE_KIND_LABEL } from '@shared/domain/discography.constants'
import type { ArtistSummary } from '@shared/domain/artists'
import { ARTIST_ROLE_LABEL, artistNameKey } from '@shared/domain/artists.constants'

/**
 * The palette's result index.
 *
 * Kept free of React and IPC on purpose: the four sources (pages, projects,
 * releases, artists) are merged, filtered and capped here so `CommandPalette`
 * itself stays about wiring hotkeys, a query field and a keyboard cursor to
 * this list, not about how each source is matched.
 */

export type PaletteGroupId = 'pages' | 'actions' | 'projects' | 'releases' | 'artists'

export interface PaletteResult {
  id: string
  title: string
  subtitle?: string
  /**
   * What Enter does, in the imperative — shown as the row's own answer to
   * "what happens if I press it", the way the boards' own captions always
   * name the action rather than leaving it implied.
   */
  verb: string
  /** Where `navigate()` sends the operator when this row is chosen. */
  path: string
}

export interface PaletteGroup {
  id: PaletteGroupId
  label: string
  results: PaletteResult[]
}

export interface PaletteSources {
  sections: readonly SectionDefinition[]
  projects: readonly ProjectSummary[]
  releases: readonly DiscographySummary[]
  artists: readonly ArtistSummary[]
}

const GROUP_LABEL: Record<PaletteGroupId, string> = {
  pages: 'Pages',
  actions: 'Actions',
  projects: 'Projects',
  releases: 'Releases',
  artists: 'Artists'
}

/** Fixed, context-free verbs. NEW PROJECT/NEW EVENT are deliberately absent —
 * both need something the palette cannot supply blind (a shelf, a date). */
const ACTIONS: readonly PaletteResult[] = [
  {
    id: 'action-release',
    title: 'New Release',
    subtitle: 'Discography',
    verb: 'Raise',
    path: '/discography?new=release'
  },
  {
    id: 'action-artist',
    title: 'New Artist',
    subtitle: 'Artists',
    verb: 'Add',
    path: '/artists?new=artist'
  },
  {
    // Named after Dispatch's own hotkey for the same action ("File
    // something"), so the palette does not invent a second verb for one act.
    id: 'action-compose',
    title: 'Compose',
    subtitle: 'Dispatch',
    verb: 'File',
    path: '/dispatch?new=compose'
  }
]

/** Rows per group — enough to notice a match without one wide hit pushing
 * every other group off screen. */
const MAX_PER_GROUP = 6

function releaseHaystack(release: DiscographySummary): string {
  return [
    release.title,
    release.subtitle,
    release.label,
    ...release.artistNames,
    ...release.trackTitles
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Nothing answers a query that has not been asked. Every group — pages
 * included — waits for the first character, rather than opening on a
 * standing menu of everywhere the console goes.
 */
export function buildPaletteGroups(sources: PaletteSources, query: string): PaletteGroup[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const artistNeedle = artistNameKey(query)

  const pages: PaletteResult[] = sources.sections
    .filter((section) => section.label.toLowerCase().includes(needle))
    .map((section) => ({
      id: `page-${section.id}`,
      title: section.label,
      subtitle: SECTION_GROUP[section.group].label,
      verb: 'Jump',
      path: section.path
    }))

  const actions: PaletteResult[] = ACTIONS.filter((action) =>
    action.title.toLowerCase().includes(needle)
  )

  // Projects arrive pre-filtered — the registry query already carries the
  // same `search` text, matched server-side exactly as ARCHIVE's own search
  // box matches it.
  const projects: PaletteResult[] = sources.projects.slice(0, MAX_PER_GROUP).map((project) => ({
    id: `project-${project.id}`,
    title: project.name,
    subtitle: PROJECT_CATEGORY_LABEL[project.category],
    verb: 'Open',
    path: `/archive?project=${project.id}`
  }))

  const releases: PaletteResult[] = sources.releases
    .filter((release) => releaseHaystack(release).includes(needle))
    .slice(0, MAX_PER_GROUP)
    .map((release) => ({
      id: `release-${release.id}`,
      title: release.title,
      subtitle: release.label || RELEASE_KIND_LABEL[release.kind],
      verb: 'Open',
      path: `/discography?release=${release.id}`
    }))

  const artists: PaletteResult[] = sources.artists
    .filter(
      (artist) =>
        artist.nameKey.includes(artistNeedle) ||
        artistNameKey(artist.realName).includes(artistNeedle)
    )
    .slice(0, MAX_PER_GROUP)
    .map((artist) => ({
      id: `artist-${artist.id}`,
      title: artist.name,
      subtitle: artist.roles.map((role) => ARTIST_ROLE_LABEL[role]).join(', ') || undefined,
      verb: 'Open',
      path: `/artists?artist=${artist.id}`
    }))

  const groups: PaletteGroup[] = [
    { id: 'pages', label: GROUP_LABEL.pages, results: pages },
    { id: 'actions', label: GROUP_LABEL.actions, results: actions },
    { id: 'projects', label: GROUP_LABEL.projects, results: projects },
    { id: 'releases', label: GROUP_LABEL.releases, results: releases },
    { id: 'artists', label: GROUP_LABEL.artists, results: artists }
  ]

  return groups.filter((group) => group.results.length > 0)
}
