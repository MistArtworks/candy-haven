import type { ProjectStage } from './projects.constants'

/**
 * Zod-free half of the discography domain — see projects.constants.ts for why
 * the split exists.
 *
 * ## What this replaces
 *
 * VOLUMES (album / EP / compilation, tracks bound in order) and the
 * stood-down RELEASES model (title, date, cover, canvas, master) were two
 * records describing one thing, and neither carried what actually ships a
 * track: a label, a catalogue number, a UPC, an ISRC, a date, a list of
 * platforms it went out on. This is those two, merged, with that added.
 *
 * Decision D2 in docs/DISCOGRAPHY.md, put to the operator and answered.
 */

// --------------------------------------------------------------------- kinds

export const RELEASE_KINDS = ['single', 'ep', 'album', 'compilation', 'remix'] as const
export type ReleaseKind = (typeof RELEASE_KINDS)[number]

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  single: 'SINGLE',
  ep: 'EP',
  album: 'ALBUM',
  compilation: 'COMPILATION',
  remix: 'REMIX'
}

export const RELEASE_KIND_PURPOSE: Record<ReleaseKind, string> = {
  single: 'One track, or a track and its edits.',
  ep: 'A short set, usually three to six tracks.',
  album: 'A full-length body of work.',
  compilation: 'Tracks gathered from elsewhere, or from several hands.',
  remix: 'Somebody else’s work, rebuilt — or yours, rebuilt by somebody else.'
}

/**
 * How many tracks a kind is expected to carry.
 *
 * Advisory, and deliberately not enforced. A two-track EP and a nine-track
 * single both exist in the world, and an application that refused to record
 * one would be wrong about reality rather than helpfully strict. The register
 * says so in a hint and files it anyway.
 */
export const RELEASE_KIND_TRACK_HINT: Record<ReleaseKind, string> = {
  single: 'Usually one to three.',
  ep: 'Usually three to six.',
  album: 'Usually seven or more.',
  compilation: 'No expected length.',
  remix: 'Usually one.'
}

/**
 * Kinds that arrive with their one track already on them.
 *
 * A single **is** a recording. Raising one called `Ossuary` and then being
 * asked to add a track called `Ossuary` is the same fact typed twice, and the
 * catalogue reading `0 tracks` for it is not honest minimalism — it is the
 * register disagreeing with what the operator just said the thing was.
 *
 * So a single and a remix are seeded with one track taking the release's
 * title. An EP, an album and a compilation are not: those genuinely start
 * empty and are filled over time, and inventing a first track for them would
 * be guessing at a running order.
 *
 * This is not the same as inventing records from ambiguous input — the
 * mistake schema v3 refused to make with tag strings. The operator stated the
 * kind explicitly; one track is what that word means, and it is one press to
 * rename, relink or remove.
 */
export function seedsOneTrack(kind: ReleaseKind): boolean {
  return kind === 'single' || kind === 'remix'
}

// -------------------------------------------------------------------- status

/**
 * Where a release has got to. **Two states: it is out, or it is not.**
 *
 * Distinct from a project's *stage*, and the difference is worth stating: a
 * stage is how finished the work is, a status is how public it is. A track can
 * be at TRACK READY and sit unreleased for a year while a label schedules it.
 *
 * ## Why this is two and was five
 *
 * It was `idea` · `planned` · `scheduled` · `released` · `shelved`, and three
 * of those stopped earning their place the day TRACK READY became the gate
 * into the catalogue (see `LINKABLE_PROJECT_STAGES`):
 *
 * - **`idea`** described a release you were only thinking about. Nothing
 *   linkable is speculative any more — every track on an entry is work the
 *   operator has already declared finished, so the entry is past being an idea
 *   by construction.
 * - **`planned`** was `scheduled` without a date, which is what a null
 *   `releaseDate` already says. Two ways to write one fact.
 * - **`shelved`** duplicated the project's own SHELVED stage, which is where
 *   parking work belongs — and parking the *record* of something while the
 *   work carries on was never a state the operator wanted.
 *
 * Cut on the operator's instruction, 2026-09-17, against a recommendation to
 * keep all five. Decision D9 in docs/DISCOGRAPHY.md records the trade-off that
 * was accepted: there is no longer a status meaning "intended, no date". The
 * absence of a `releaseDate` carries that instead, which is why `scheduled`
 * does **not** require one.
 */
export const RELEASE_STATUSES = ['scheduled', 'released'] as const
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number]

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  scheduled: 'SCHEDULED',
  released: 'RELEASED'
}

export const RELEASE_STATUS_PURPOSE: Record<ReleaseStatus, string> = {
  // Deliberately not "dated and committed to". A date is optional here — it is
  // the only thing left that can say "intended, not dated yet", so the wording
  // must not imply one is required.
  scheduled: 'Committed to, whether or not it has a date yet.',
  released: 'Out in the world. Moves every linked project to the RELEASED stage.'
}

/** A release that has actually shipped, for the catalogue lens and counts. */
export function isPublic(status: ReleaseStatus): boolean {
  return status === 'released'
}

/**
 * Statuses that read as still coming, for the forthcoming lens.
 *
 * Now the exact complement of `isPublic`, since there are only two. Kept as
 * its own function rather than inlined as `!isPublic`: the lens asks "what is
 * coming", which is a different question that currently has the same answer,
 * and collapsing the two would hide that a third status has to touch both.
 */
export function isForthcoming(status: ReleaseStatus): boolean {
  return status === 'scheduled'
}

// -------------------------------------------------------------------- lenses

/**
 * The ways into the catalogue.
 *
 * Fewer than the ARCHIVE's, because a discography is one flat list read three
 * ways rather than a tree with places in it. `ALL` leads, as it does in
 * `ARCHIVE_LENSES`, and the department opens on `CATALOGUE` — what is out is
 * what a discography is mostly for.
 *
 * The `SHELVED` lens went with the status of that name. A lens that can only
 * ever select nothing is worse than no lens: it reads as an empty shelf rather
 * than as a category that no longer exists.
 */
export const DISCOGRAPHY_LENSES = ['all', 'catalogue', 'forthcoming'] as const
export type DiscographyLens = (typeof DISCOGRAPHY_LENSES)[number]

export const DISCOGRAPHY_LENS_LABEL: Record<DiscographyLens, string> = {
  all: 'ALL',
  catalogue: 'CATALOGUE',
  forthcoming: 'FORTHCOMING'
}

export const DISCOGRAPHY_LENS_PURPOSE: Record<DiscographyLens, string> = {
  all: 'Every entry, whatever its status.',
  catalogue: 'What is out in the world.',
  forthcoming: 'Scheduled, not yet released.'
}

// ---------------------------------------------------------------------- sort

export const DISCOGRAPHY_SORTS = ['date', 'title', 'kind', 'tracks'] as const
export type DiscographySort = (typeof DISCOGRAPHY_SORTS)[number]

export const DISCOGRAPHY_SORT_LABEL: Record<DiscographySort, string> = {
  date: 'RELEASE DATE',
  title: 'TITLE',
  kind: 'KIND',
  tracks: 'TRACKS'
}

// -------------------------------------------------------------------- limits

export const MAX_RELEASE_TITLE = 120
export const MAX_RELEASE_SUBTITLE = 96
export const MAX_LABEL_NAME = 96
export const MAX_CATALOGUE_NUMBER = 32
export const MAX_TRACKS = 60
export const MAX_TRACK_TITLE = 120
export const MAX_RELEASE_LINKS = 16
export const MAX_COPYRIGHT_LINE = 160

/**
 * Credit rows, and the note one can carry.
 *
 * Sixteen is generous for a release — there are only eight roles, so a list
 * this long is already saying something twice — and it exists to bound the
 * document rather than to shape the form.
 */
export const MAX_CREDITS = 16
export const MAX_CREDIT_NOTE = 96

// ------------------------------------------------------- the gate from ARCHIVE

/**
 * The project stages a track may be linked to.
 *
 * The ARCHIVE's pipeline is the gate into the catalogue. Reaching TRACK READY
 * is the operator's statement that the work is finished, and finished work is
 * what goes on a release — so the picker offers exactly that stage and the one
 * after it, rather than every project on the disk.
 *
 * This matters more than it looks. The register also holds everything the
 * scanner found loose in the intake roots: scratch sets called `Untitled`,
 * `ting`, `Uh`. Offering those made the picker a wall of noise with the real
 * work buried in it, and no amount of sorting fixes a list whose contents are
 * mostly not candidates.
 *
 * `released` is included because a linked project is *moved* there the moment
 * its release goes out. Leaving it off would mean a track could be linked and
 * then never re-linked — the act of shipping would disqualify the work from
 * the catalogue it had just entered.
 *
 * Typed against `ProjectStage` so a renamed stage is a compile error here
 * rather than a filter that silently matches nothing. The import is type-only
 * and therefore erased, so it cannot create the runtime cycle documented in
 * `dates.ts`.
 */
export const LINKABLE_PROJECT_STAGES: readonly ProjectStage[] = ['ready', 'released']

export function isLinkableStage(stage: ProjectStage): boolean {
  return LINKABLE_PROJECT_STAGES.includes(stage)
}

/** Artwork and canvas are copied into the archive, so this bounds the copy. */
export const MAX_ARTWORK_BYTES = 32 * 1024 * 1024
export const ARTWORK_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif'] as const
export const CANVAS_EXTENSIONS = ['mp4', 'mov', 'webm', 'gif'] as const

// ------------------------------------------------------------- identifiers

/**
 * ISRC — the code that identifies a *recording*, so it lives on the track.
 *
 * `CC-XXX-YY-NNNNN`: two-letter country, three-character registrant, two-digit
 * year, five-digit designation. Stored without separators, because that is how
 * every distributor wants it pasted back, and formatted for display.
 */
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/

export function normaliseIsrc(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidIsrc(value: string): boolean {
  return ISRC_PATTERN.test(normaliseIsrc(value))
}

export function formatIsrc(value: string): string {
  const clean = normaliseIsrc(value)
  if (!ISRC_PATTERN.test(clean)) return value
  return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}-${clean.slice(7)}`
}

/**
 * UPC / EAN — the code that identifies a *product*, so it lives on the release.
 *
 * Twelve or thirteen digits. Not check-digit validated: distributors issue
 * these and an app that refused a valid one because of an arithmetic slip
 * would be worse than one that takes what it is given.
 */
export function normaliseUpc(value: string): string {
  return value.replace(/[\s-]/g, '')
}

export function isValidUpc(value: string): boolean {
  const clean = normaliseUpc(value)
  return /^\d{12,14}$/.test(clean)
}

// --------------------------------------------------------------------- dates

/**
 * The year a release belongs to, for grouping the catalogue.
 *
 * Reads the `YYYY-MM-DD` string directly rather than going through `Date`, for
 * the reason recorded at the top of `calendar.constants.ts`: a release dated
 * the 1st of January is in that year wherever the machine thinks it is.
 */
export function releaseYear(releaseDate: string | null): number | null {
  if (!releaseDate) return null
  const year = Number.parseInt(releaseDate.slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}
