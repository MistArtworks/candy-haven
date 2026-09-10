/**
 * Zod-free half of the releases domain — see projects.constants.ts for why the
 * split exists.
 */

/**
 * What a release is *of*.
 *
 * A single goes out on its own; an album goes out as one object with many
 * tracks. Rather than model those as two different things, a release names its
 * subject and says which kind it is — so the release section holds one list
 * whether the operator ships singles, albums, or both.
 */
export const RELEASE_SUBJECTS = ['project', 'volume'] as const
export type ReleaseSubject = (typeof RELEASE_SUBJECTS)[number]

/**
 * The folders created inside every release directory.
 *
 * Three, and deliberately few. This is a hand-off package, not a workspace: the
 * work happened in the project folder, and what lands here is the small set of
 * finished files a distributor asks for.
 */
export const RELEASE_SCAFFOLD_FOLDERS = ['MASTER', 'ART', 'COPY'] as const
export type ReleaseScaffoldFolder = (typeof RELEASE_SCAFFOLD_FOLDERS)[number]

export const RELEASE_SCAFFOLD_PURPOSE: Record<ReleaseScaffoldFolder, string> = {
  MASTER: 'The audio that ships.',
  ART: 'Cover art and canvas.',
  COPY: 'Titles, credits, anything written.'
}

/** The three files a release carries, chosen from what the scan already found. */
export const DELIVERABLE_KINDS = ['master', 'cover', 'canvas'] as const
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]

export const DELIVERABLE_LABEL: Record<DeliverableKind, string> = {
  master: 'FINAL MASTER',
  cover: 'COVER ART',
  canvas: 'CANVAS'
}

export const DELIVERABLE_HINT: Record<DeliverableKind, string> = {
  master: 'The exact audio file that ships.',
  cover: 'Square artwork, 3000×3000 or larger.',
  canvas: 'Looping vertical video, 9:16, 3–8 seconds.'
}

/** Which scaffold folder each deliverable is copied into. */
export const DELIVERABLE_DESTINATION: Record<DeliverableKind, ReleaseScaffoldFolder> = {
  master: 'MASTER',
  cover: 'ART',
  canvas: 'ART'
}

export const MAX_RELEASE_TITLE_LENGTH = 120

/**
 * Turns a release title into something safe to use as a directory name.
 *
 * A release *does* get a real folder, so unlike a volume title this has to
 * survive the filesystem. Illegal characters are replaced rather than stripped,
 * so `AUX: VOL. 2` becomes `AUX - VOL. 2` instead of `AUX VOL. 2` — the reader
 * can still see where the punctuation was.
 */
export function slugifyReleaseTitle(title: string): string {
  const replaced = title
    .replace(/[:|]/g, ' - ')
    .replace(/["<>*?]/g, '')
    .replace(/[\\/]/g, '-')

  const collapsed = replaced.replace(/\s+/g, ' ').trim()
  // Windows refuses a trailing dot or space on a directory name.
  const trimmed = collapsed.replace(/[. ]+$/, '')

  return trimmed.length > 0 ? trimmed.slice(0, MAX_RELEASE_TITLE_LENGTH) : 'Untitled release'
}
