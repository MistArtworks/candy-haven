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

// -------------------------------------------------------------- distribution

/**
 * The places a release goes out.
 *
 * Deliberately **not** `SOCIAL_PLATFORMS`. That set carries `instagram`,
 * `tiktok`, `x` and `website` — none of which is somewhere a record is
 * distributed — and it is missing the three services that matter most after
 * the big two. The two lists were the same object while both meant "a platform
 * and a URL"; they stopped being the same object the moment one of them grew a
 * pre-save slot.
 *
 * `other` is the escape hatch, and the only entry that may appear twice: a
 * pre-save gate, a smart link, a press piece. It is also the only one whose
 * `label` is read, because the rest can name themselves.
 */
export const DISTRIBUTION_PLATFORMS = [
  'spotify',
  'apple',
  'youtube',
  'soundcloud',
  'bandcamp',
  'beatport',
  'amazon',
  'deezer',
  'tidal',
  'other'
] as const
export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORMS)[number]

export const DISTRIBUTION_PLATFORM_LABEL: Record<DistributionPlatform, string> = {
  spotify: 'SPOTIFY',
  apple: 'APPLE MUSIC',
  youtube: 'YOUTUBE MUSIC',
  soundcloud: 'SOUNDCLOUD',
  bandcamp: 'BANDCAMP',
  beatport: 'BEATPORT',
  amazon: 'AMAZON MUSIC',
  deezer: 'DEEZER',
  tidal: 'TIDAL',
  other: 'OTHER'
}

/**
 * One platform on the plan, and the two addresses it can hold.
 *
 * The zod-free twin of `ReleaseDistributionSchema` — declared here because the
 * migration mapper below has to build these without reaching for zod, and
 * because the renderer wants the type without the parser. The two agree
 * structurally, which `ReleasePatch` typechecking enforces for free.
 *
 * Both URLs may be empty, and that is the state the whole feature exists for:
 * a platform is on the plan long before there is anywhere to point at.
 */
export interface DistributionEntry {
  id: string
  platform: DistributionPlatform
  label: string
  presaveUrl: string
  streamUrl: string
}

/** Sixteen, the ceiling the flat link list carried before this replaced it. */
export const MAX_DISTRIBUTION = 16

/** What to call a row: the platform names itself unless it is `other`. */
export function distributionLabel(entry: DistributionEntry): string {
  if (entry.platform !== 'other') return DISTRIBUTION_PLATFORM_LABEL[entry.platform]
  return entry.label.trim().toUpperCase() || DISTRIBUTION_PLATFORM_LABEL.other
}

/** Rows still waiting for a stream address. The count the sheet reports. */
export function withoutStream(entries: readonly DistributionEntry[]): number {
  return entries.filter((entry) => entry.streamUrl.trim().length === 0).length
}

/**
 * A release's old flat `links[]`, read as a distribution list.
 *
 * The whole of schema migration 11, kept pure and here so a probe can drive
 * every case without a database — which no migration in this project has had
 * before. Input is structural and optional-everything on purpose: it reads
 * **unmigrated documents**, so it cannot assume the shape zod would have
 * guaranteed.
 *
 * ## Nothing the operator typed is thrown away
 *
 * A link on a platform this list also has becomes that platform's row, with
 * the address as its `streamUrl` — an existing link is somewhere the record
 * already is, never a pre-save.
 *
 * Everything else lands on `other` rather than being dropped: the socials, a
 * website, and any **second** link on a platform already used. Those keep
 * their own label if they had one, and are labelled with the platform they
 * came from if they did not, so a Spotify link that could not have the Spotify
 * row still says where it pointed.
 *
 * A link with no address at all is the one thing skipped. There was no such
 * thing — `update` refused an empty URL — and if one exists it holds nothing
 * worth a row.
 */
export function distributionFromLinks(
  links: readonly { platform?: string; url?: string; label?: string }[]
): DistributionEntry[] {
  const entries: DistributionEntry[] = []
  const taken = new Set<DistributionPlatform>()

  links.forEach((link, index) => {
    const url = (link.url ?? '').trim()
    if (!url) return

    const was = (link.platform ?? '').trim().toLowerCase()
    const known = DISTRIBUTION_PLATFORMS.find((platform) => platform === was)
    const store = known && known !== 'other' ? known : null

    // Ids only have to be unique inside the array they sit in, which is all
    // an id is for here — so the index does the job and keeps a probe's
    // assertions readable.
    const id = `dist-${index}`

    if (store && !taken.has(store)) {
      taken.add(store)
      entries.push({ id, platform: store, label: '', presaveUrl: '', streamUrl: url })
      return
    }

    /*
     * What it could not be, so the row still says where it pointed.
     *
     * Empty when the link was already `other` or carried no platform at
     * all: there is nothing it was displaced from, and labelling it
     * `OTHER` would only repeat what `distributionLabel` says anyway.
     */
    const displaced = store
      ? DISTRIBUTION_PLATFORM_LABEL[store]
      : was === 'other'
        ? ''
        : was.toUpperCase()

    entries.push({
      id,
      platform: 'other',
      label: (link.label ?? '').trim() || displaced,
      presaveUrl: '',
      streamUrl: url
    })
  })

  return entries
}

// -------------------------------------------------------------------- limits

export const MAX_RELEASE_TITLE = 120
export const MAX_RELEASE_SUBTITLE = 96
export const MAX_LABEL_NAME = 96
export const MAX_CATALOGUE_NUMBER = 32
/**
 * The storage ceiling on a tracklist, **deliberately above the rule.**
 *
 * `maxTracksFor` is what the operator meets; this is only the bound the schema
 * declares. Keeping them apart is not fussiness — `DiscographyReleaseSchema`
 * is `safeParse`d by `toRelease`, which *skips* a record it cannot read, so
 * tightening the schema's own `.max()` to match a rule would make any release
 * already exceeding it vanish from the catalogue rather than merely refuse the
 * next write. A rule can be lowered safely; a storage bound cannot.
 */
export const MAX_TRACKS = 60

/**
 * How many tracks a release of this kind may hold.
 *
 * **One** for a single and a remix. Both words name a single recording, and a
 * release claiming to be one while listing four is the register disagreeing
 * with itself — which was the actual complaint that produced this rule: the
 * sheet offered ADD A TRACK on a single that already had its track.
 *
 * Note what this refuses, because it is a real trade the operator accepted: a
 * single that ships with its own remix or an extended edit — `Original Mix`
 * plus `Nasko Remix` — is a normal two-track single on every store, and it has
 * to be filed as an EP here. That was put to them alongside a softer option
 * that flagged the mismatch without refusing it, and the hard limit is what
 * they chose.
 *
 * **Forty** for everything else. Ample for an album or a compilation without
 * leaving the ceiling effectively absent.
 *
 * Expressed through `seedsOneTrack` rather than re-listing the kinds, because
 * it is the same statement read twice: the kinds that *arrive* with one track
 * are exactly the kinds that name one recording, so they are exactly the kinds
 * that may *hold* one. A new kind that seeds a track would want this limit
 * too, and coupling them means it gets it without a second edit.
 */
export function maxTracksFor(kind: ReleaseKind): number {
  return seedsOneTrack(kind) ? 1 : 40
}
export const MAX_TRACK_TITLE = 120
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

/**
 * Largest canvas handed to the renderer, in bytes.
 *
 * Far below `MAX_AUDIO_BYTES`, and for a different reason: a canvas is a
 * three-to-eight-second vertical loop that Spotify itself caps in the low
 * megabytes, so anything approaching this is the wrong file. The whole thing
 * crosses the bridge at once — there is no streaming and no seeking to do — so
 * the ceiling is what keeps a mistaken pick from copying a feature film into
 * the renderer.
 */
export const MAX_CANVAS_BYTES = 64 * 1024 * 1024

/**
 * Media type per canvas extension.
 *
 * Load-bearing for exactly the reason `AUDIO_MIME` documents: the file reaches
 * the element as a blob URL, and for a blob the type carried on the `Blob` *is*
 * the media type. Chromium does not sniff the bytes the way it does a network
 * response, so a wrong or missing type produces an element that loads, reports
 * a size, and then fails to decode without saying why.
 */
export const CANVAS_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  gif: 'image/gif'
}

/** The media type for a lowercase, dotless extension. */
export function canvasMimeFor(extension: string): string {
  return CANVAS_MIME[extension] ?? 'video/mp4'
}

/**
 * Whether a canvas can be played rather than only shown.
 *
 * A GIF is in `CANVAS_EXTENSIONS` because a canvas may legitimately be one,
 * but it is an image and the renderer's CSP is `img-src 'self' data:` — no
 * `blob:` — so it cannot arrive the way a video does. It goes through the
 * thumbnail channel instead and draws as a still. Widening the image policy to
 * animate a format nobody delivers a canvas in would be the wrong trade.
 */
export function canvasIsVideo(extension: string): boolean {
  return extension.toLowerCase() !== 'gif' && extension.trim().length > 0
}

/** The extension of a stored path, lowercase and dotless. Empty if none. */
export function extensionOf(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}


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

// ------------------------------------------------------------------ publish

/**
 * Whether a character is one the filesystem refuses.
 *
 * Written as a scan rather than a regex class, for the reason
 * `stacks.constants.ts` records beside its own: a control-character range in a
 * literal is unreadable and a lint violation that has to be suppressed, and
 * comparing code points says the same thing plainly.
 */
function isUnwritable(character: string): boolean {
  const code = character.codePointAt(0)
  // Below the space, minus the ones that *are* whitespace — those are folded
  // to a space instead, because deleting a tab from `two<tab>words` joins them
  // into one and corrupts the name silently.
  if (code !== undefined && code < 0x20 && !isWhitespaceControl(code)) return true
  return '"*?<>|'.includes(character)
}

/** Tab, line feed, vertical tab, form feed, carriage return. */
function isWhitespaceControl(code: number): boolean {
  return code === 0x09 || (code >= 0x0a && code <= 0x0d)
}

/**
 * One path segment, made safe to write without refusing the operator's text.
 *
 * `validateFolderName` in stacks.constants.ts **rejects** these characters,
 * which is right for a folder the operator is naming: they typed it, so they
 * can retype it. It is wrong here. A release legitimately called
 * `Moves Like Jaggar: Reprise` must not be unpublishable because a colon
 * cannot be written to NTFS — the title is the record and the filename is a
 * derivation of it, so the derivation bends.
 *
 * The separators become a hyphen, because `/` and `:` are almost always
 * standing in for one. The rest are dropped, because `Who?` should not become
 * `Who-`.
 */
export function safeSegment(value: string): string {
  const swept = [...value]
    .map((character) => {
      if (character === '/' || character === ':' || character === '\\') return '-'
      const code = character.codePointAt(0)
      // Folded to a space so the whitespace collapse below joins the words
      // with one separator rather than none.
      if (code !== undefined && isWhitespaceControl(code)) return ' '
      return isUnwritable(character) ? '' : character
    })
    .join('')

  return (
    swept
      .replace(/\s+/g, ' ')
      .trim()
      // A trailing dot or space is legal in the string and silently dropped by
      // the filesystem, which leaves the record and the folder disagreeing
      // about the folder's own name. Stripped here so they cannot.
      .replace(/[. ]+$/, '')
  )
}

/**
 * Names joined as a credit reads: commas, and `&` before the last.
 *
 * `A`, `A & B`, `A, B & C`. No Oxford comma — no record sleeve has ever
 * carried one.
 */
export function billedAs(names: readonly string[]): string {
  const clean = names.map(safeSegment).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} & ${clean[clean.length - 1]}`
}

/** The `(feat. …)` clause, or an empty string when nobody is featured. */
export function featuring(names: readonly string[]): string {
  const billed = billedAs(names)
  return billed ? ` (feat. ${billed})` : ''
}

/**
 * The folder a release is published into, and the file a single ships as.
 *
 * `<main artists> - <title> (feat. <featured>)`, with the clause omitted
 * entirely when there is nobody to name. An uncredited release falls back to
 * the title alone rather than printing a stray separator.
 */
export function releaseFolderName(
  mainArtists: readonly string[],
  title: string,
  featuredArtists: readonly string[] = []
): string {
  const billed = billedAs(mainArtists)
  const stem = safeSegment(title) || 'Untitled'
  return `${billed ? `${billed} - ` : ''}${stem}${featuring(featuredArtists)}`
}

/**
 * One track of a multi-track release.
 *
 * `NN <main artists> - <track title> (feat. …)`. The number is the running
 * order, zero-padded to two so the folder sorts the way the record plays.
 *
 * A single is **not** named this way: its one file takes the folder's own
 * name, which is what was asked for and what a distributor expects.
 */
export function trackFileName(
  position: number,
  mainArtists: readonly string[],
  title: string,
  featuredArtists: readonly string[] = []
): string {
  const number = String(position).padStart(2, '0')
  return `${number} ${releaseFolderName(mainArtists, title, featuredArtists)}`
}

/**
 * A track's own features: whoever it credits that the release does not bill.
 *
 * `addTrack` copies a linked project's credits onto the track, so a track's
 * `artistIds` routinely includes the main artist — printing those raw would
 * put `(feat. Candy Heist)` on Candy Heist's own record. Subtracting the
 * billing leaves the people the track adds, which is what a feature is.
 */
export function trackFeatureIds(
  trackArtistIds: readonly string[],
  mainArtistIds: readonly string[]
): string[] {
  const billed = new Set(mainArtistIds)
  return trackArtistIds.filter((id) => !billed.has(id))
}

/** The fixed names inside a published folder. */
export const COVER_ART_STEM = 'Cover Art'
export const CANVAS_STEM = 'Spotify Canvas'
export const DETAILS_FILE_NAME = 'Release Details.txt'

/** What an unrecognised credit role prints as in the details file. */
export const ARTIST_ROLE_CREDIT_FALLBACK = 'CREDITED'
