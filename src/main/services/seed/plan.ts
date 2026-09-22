/**
 * Turn the harvest into a proposal, and nothing else.
 *
 * Pure: no network, no database, no writes. It reads what the six sources
 * returned, what the adjudicator concluded, whatever the operator has since
 * overruled, and the catalogue as it stands — and returns a description of
 * writes that have not happened.
 *
 * ## Why it is rebuilt rather than patched
 *
 * The operator can flip any flagged call on the confirm screen. Every flip is
 * a full rebuild from the cached harvest, which costs nothing and buys the one
 * guarantee that matters: **what the confirm screen draws is what applying
 * would do.** A plan that was patched in place would drift from the writes it
 * described the first time a flip changed how two uploads grouped — and the
 * whole point of a confirm screen is that it cannot.
 *
 * ## The grouping rule this file exists to apply
 *
 * A record is a **recording**, not an upload. An exclusive is routinely on two
 * fuzzy sources at once — `Over The Moon` is a SoundCloud upload *and* a
 * YouTube "Anime Music Video" of the same recording — and left alone that is
 * two records for one song. Exclusives are therefore grouped across sources by
 * `songKey` before anything is proposed.
 */
import type {
  SeedChoice,
  SeedDecision,
  SeedPlan,
  SeedPlatform,
  SeedRecord,
  SeedTrack
} from '@shared/domain/seed'
import type { DiscographyRelease, ReleaseKind } from '@shared/domain/discography'
import { normaliseIsrc, normaliseUpc } from '@shared/domain/discography.constants'
import { songKey, titleKey } from './normalise'
import type { Verdict } from './adjudicate'
import type { SpotifyHarvest, SpotifyRelease } from './sources/spotify'
import type { StoreHarvest } from './sources/stores'
import type { SoundcloudHarvest } from './sources/soundcloud'
import type { YoutubeHarvest } from './sources/youtube'

export interface PlanInput {
  harvest: SpotifyHarvest
  stores: StoreHarvest
  youtube: YoutubeHarvest
  soundcloud: SoundcloudHarvest
  verdicts: Verdict[]
  /** The operator's answers, by decision key. Overrule the model's proposal. */
  overrides: Record<string, SeedChoice>
  /** Record keys the operator has ticked off. Never written. */
  excluded: readonly string[]
  /** The catalogue as it stands, so the plan can say create or update. */
  existing: readonly DiscographyRelease[]
  warnings: readonly string[]
}

/**
 * A Spotify date, widened to the app's `YYYY-MM-DD`.
 *
 * Spotify dates a back-catalogue record to the year or the month when that is
 * all the distributor filed. The first of the period is a better record than
 * null — it sorts correctly and reads correctly — and the plan says on the
 * record's own row that it was widened, so the operator can correct it.
 */
function isoDate(date: string, precision: string): { value: string | null; widened: boolean } {
  if (!date) return { value: null, widened: false }
  if (precision === 'day' || /^\d{4}-\d{2}-\d{2}$/.test(date)) return { value: date, widened: false }
  if (/^\d{4}-\d{2}$/.test(date)) return { value: `${date}-01`, widened: true }
  if (/^\d{4}$/.test(date)) return { value: `${date}-01-01`, widened: true }
  return { value: null, widened: false }
}

/**
 * The kind, proposed rather than read.
 *
 * Spotify types every short record as a `single`, including the ones carrying
 * two to four tracks — and this app refuses a single holding more than one
 * track, so a straight copy would produce records it will not save. The
 * tracklist decides instead, and the operator can correct it in review.
 */
function kindFor(release: SpotifyRelease): ReleaseKind {
  // The one type worth taking at face value. Everything else Spotify
  // calls a `single`, including records carrying six tracks.
  if (release.albumType === 'compilation') return 'compilation'

  const count = release.tracks.length
  if (count === 1) return /\bremix\b/i.test(release.title) ? 'remix' : 'single'
  if (release.albumType === 'album') return 'album'
  return count <= 6 ? 'ep' : 'album'
}

/**
 * Placeholders the stores bill a record to when nobody in particular made it.
 *
 * `Various Artists` is not a person and must not become one: the roster is
 * who the practice actually works with, and a face called Various Artists
 * sitting between two real collaborators is a worse record of that than an
 * unbilled compilation. The track's own credits still carry whoever is on
 * it, which is the part that is true.
 */
const NOT_A_PERSON = new Set(['various artists', 'va', 'unknown artist'])

function billing(names: readonly string[]): string[] {
  return names.filter((name) => !NOT_A_PERSON.has(name.trim().toLowerCase()))
}

function copyrightLines(release: SpotifyRelease): { phonographic: string; copyright: string } {
  const find = (type: string): string =>
    release.copyrights.find((line) => (line.type ?? '').toUpperCase() === type)?.text ?? ''
  return { phonographic: find('P'), copyright: find('C') }
}

/** A row per platform, deduped — the first link for a platform is the one kept. */
function distributor(): {
  add: (platform: SeedPlatform['platform'], url: string, via: SeedPlatform['via']) => void
  rows: SeedPlatform[]
} {
  const rows: SeedPlatform[] = []
  const taken = new Set<string>()
  return {
    rows,
    add: (platform, url, via) => {
      if (!url || taken.has(platform)) return
      taken.add(platform)
      rows.push({ platform, url, via })
    }
  }
}

// --------------------------------------------------------------- the builder

export function buildPlan(input: PlanInput): SeedPlan {
  const { harvest, stores, youtube, soundcloud, verdicts, overrides, excluded, existing } = input
  const artistName = harvest.artist.name
  const off = new Set(excluded)
  const warnings = [...input.warnings]

  /*
   * What each undecided upload actually resolves to, settled once up front.
   *
   * Three inputs in order of authority: the operator's override, then the
   * **SoundCloud rule** below, then the adjudicator's proposal. Computed here
   * rather than read per use because the rule is about *groups* — whether one
   * upload becomes a record depends on what the others in its group are — and
   * a function called from four places could not see that.
   */
  const effective = new Map<string, SeedChoice>()
  /** Why the rule overruled the adjudicator, for the review row to say. */
  const overruled = new Map<string, string>()

  for (const verdict of verdicts) {
    effective.set(verdict.key, overrides[verdict.key] ?? verdict.proposal)
  }

  /*
   * ## SoundCloud is the reference for what is a real track
   *
   * Everything on SoundCloud is also on YouTube; the reverse is not true.
   * YouTube carries the originals *and* everything else he posts — Shorts,
   * teasers, festival clips, "do I drop this?" — while the master of an
   * unreleased track goes up on SoundCloud. So SoundCloud is what says a
   * recording exists, and YouTube is where it is also published.
   *
   * The rule that falls out: **a group with no SoundCloud upload in it is not
   * a record.** It can still contribute a link to a record the stores or
   * SoundCloud established — that is the `merge` path and it is untouched —
   * but it cannot mint one.
   *
   * This is deterministic and it retires the adjudicator's worst questions.
   * Asking a model whether `REMIXING A BOLLYWOOD BANGER INTO TECH HOUSE
   * #BOLLYTECH` is a recording or a promo is a coin-flip it answered at 0.57;
   * asking whether the same song is on SoundCloud is a lookup. Both of those
   * became records in the first pass, and neither should have.
   *
   * An explicit override still wins. The operator saying "its own record" is
   * a fact about the catalogue that this rule does not get to contradict —
   * otherwise the review screen would show a choice that does nothing.
   */
  const candidates = new Map<string, Verdict[]>()
  for (const verdict of verdicts) {
    if (effective.get(verdict.key) !== 'exclusive') continue
    const group = songKey(verdict.title, artistName)
    const bucket = candidates.get(group)
    if (bucket) bucket.push(verdict)
    else candidates.set(group, [verdict])
  }

  for (const members of candidates.values()) {
    if (members.some((member) => member.source === 'soundcloud')) continue
    if (members.some((member) => overrides[member.key] === 'exclusive')) continue

    for (const member of members) {
      effective.set(member.key, 'drop')
      overruled.set(
        member.key,
        'Only on YouTube, with no SoundCloud master behind it — so it is not a record.'
      )
    }
  }

  const choiceOf = (verdict: Verdict): SeedChoice =>
    effective.get(verdict.key) ?? verdict.proposal

  /*
   * A compilation is somebody else's record he is one track of.
   *
   * Two signals, either of which is enough: Spotify filed it under
   * `appears_on`, or it carries more tracks than any record of his does. The
   * second catches a playlist-album that licensed one song and credited him
   * as an album artist, which `appears_on` alone misses.
   */
  const isCompilation = (release: SpotifyRelease): boolean =>
    release.groups.includes('appears_on') || release.tracks.length > 10

  const records: SeedRecord[] = []
  /** Spotify track id → the record proposing it, for merges to attach to. */
  const byTrackId = new Map<string, SeedRecord>()

  // ---------------------------------------------------------- his own records
  for (const release of harvest.releases.filter((r) => !isCompilation(r))) {
    const key = `spotify:${release.id}`
    const kind = kindFor(release)
    const date = isoDate(release.releaseDate, release.releaseDatePrecision)
    const lines = copyrightLines(release)
    const links = distributor()

    links.add('spotify', release.url, 'source')
    links.add('apple', stores.apple[release.id]?.url ?? '', 'upc')

    /*
     * Deezer and TIDAL are matched per *recording*, and a distribution row
     * belongs to a *record*. Deezer hands back the album page alongside the
     * track, so that is used where it exists; TIDAL does not, so a multi-track
     * record links at its first matched recording — which TIDAL's own track
     * page carries the album on. Noted on the record rather than silently
     * done.
     */
    const deezerHit = release.tracks.map((t) => stores.deezer[t.id]).find((hit) => hit?.found)
    const tidalHit = release.tracks.map((t) => stores.tidal[t.id]).find((hit) => hit?.found)
    links.add('deezer', deezerHit?.albumUrl || deezerHit?.url || '', 'isrc')
    links.add('tidal', tidalHit?.url ?? '', 'isrc')

    const trackIds = new Set(release.tracks.map((track) => track.id))
    const ytExact = youtube.videos.find(
      (video) => video.verdict === 'exact' && trackIds.has(video.matchTrackId)
    )
    const scExact = soundcloud.tracks.find(
      (track) => track.verdict === 'exact' && trackIds.has(track.matchTrackId)
    )
    links.add('youtube', ytExact?.url ?? '', 'title')
    links.add('soundcloud', scExact?.url ?? '', 'title')

    const notes: string[] = []
    /*
     * Only worth saying when the tracklist is the reason the kind changed.
     *
     * A one-track remix is also typed `single` by Spotify and also comes out
     * as something else here, but that is a reading of the *title* rather
     * than a disagreement about the tracklist — and "it carries 1 tracks"
     * was the note that made this obvious.
     */
    if (release.albumType === 'single' && release.tracks.length > 1) {
      notes.push(`Spotify calls this a single; it carries ${release.tracks.length} tracks.`)
    }
    if (date.widened) {
      notes.push(`Dated to ${date.value} — the store only gave "${release.releaseDate}".`)
    }
    if (tidalHit && release.tracks.length > 1) notes.push('The TIDAL link points at track one.')

    const record: SeedRecord = {
      key,
      origin: 'store',
      title: release.title,
      kind,
      status: 'released',
      releaseDate: date.value,
      upc: release.upc,
      label: release.label,
      phonographicLine: lines.phonographic,
      copyrightLine: lines.copyright,
      artworkUrl: release.artwork,
      artistNames: billing(release.artists.map((artist) => artist.name)),
      distribution: links.rows,
      tracks: release.tracks
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((track, index) => ({
          position: index + 1,
          title: track.title,
          isrc: track.isrc,
          durationMs: track.durationMs,
          artistNames: track.artists.map((artist) => artist.name),
          present: false
        })),
      match: { action: 'create', releaseId: '', title: '', matchedOn: 'none' },
      notes: '',
      include: !off.has(key),
      note: notes.join(' ')
    }

    records.push(record)
    for (const track of release.tracks) byTrackId.set(track.id, record)
  }

  // ------------------------------------------ compilations, his track only
  for (const release of harvest.releases.filter(isCompilation)) {
    const key = `spotify:${release.id}`
    const his = release.tracks.filter((track) =>
      track.artists.some((artist) => artist.id === harvest.artist.id)
    )
    if (his.length === 0) {
      warnings.push(`"${release.title}" lists him as an album artist but credits him on no track.`)
      continue
    }

    const date = isoDate(release.releaseDate, release.releaseDatePrecision)
    const links = distributor()
    links.add('spotify', his[0].url || release.url, 'source')
    const deezerHit = his.map((track) => stores.deezer[track.id]).find((hit) => hit?.found)
    const tidalHit = his.map((track) => stores.tidal[track.id]).find((hit) => hit?.found)
    links.add('deezer', deezerHit?.url ?? '', 'isrc')
    links.add('tidal', tidalHit?.url ?? '', 'isrc')

    const record: SeedRecord = {
      key,
      origin: 'compilation',
      title: release.title,
      /*
       * Filed as what it actually is.
       *
       * This was hardcoded `compilation`, which was right for one of the
       * three and wrong for the other two — a six-track remix EP and a
       * four-track release are EPs he guests on, not compilations.
       * Spotify types both as `single`, so the tracklist decides here
       * exactly as it does for his own records.
       */
      kind: kindFor(release),
      status: 'released',
      releaseDate: date.value,
      upc: release.upc,
      label: release.label,
      phonographicLine: '',
      copyrightLine: '',
      artworkUrl: release.artwork,
      /*
       * Billed to whoever released it, because that is whose record it is.
       *
       * It was billed to the artists on *his* track, which read as though
       * the record were his own. His credit is not lost by the change: it
       * sits on the track row, and `creditsForArtist` reports a track
       * credit as a track credit — the truthful shape for a guest
       * appearance, and what the operator asked for.
       */
      artistNames: release.artists.map((artist) => artist.name),
      distribution: links.rows,
      tracks: his.map((track, index) => ({
        position: index + 1,
        title: track.title,
        isrc: track.isrc,
        durationMs: track.durationMs,
        artistNames: track.artists.map((artist) => artist.name),
        present: false
      })),
      match: { action: 'create', releaseId: '', title: '', matchedOn: 'none' },
      /*
       * Stated on the record, not just on the review screen.
       *
       * The billing already says whose release it is, but a year from now
       * a line in the grid reading "Kaliyug Remix — Glitch Collective"
       * does not say *why* it is in his discography at all. This does,
       * and it survives the seeder being deleted.
       */
      notes: `External release by ${
        billing(release.artists.map((artist) => artist.name)).join(', ') || 'another artist'
      }. Not his own — he appears on ${
        his.length === 1 ? `"${his[0].title}"` : `${his.length} of its tracks`
      }.`,
      include: !off.has(key),
      note: `Somebody else's ${release.tracks.length}-track record. Only his ${
        his.length === 1 ? 'track' : `${his.length} tracks`
      } will be written.`
    }

    records.push(record)
    for (const track of his) byTrackId.set(track.id, record)
  }

  // ------------------------------------------------ merges onto those records
  let merged = 0
  for (const verdict of verdicts) {
    if (choiceOf(verdict) !== 'merge') continue
    const record = byTrackId.get(verdict.matchTrackId)
    if (!record) continue
    const before = record.distribution.length
    const links = distributor()
    for (const row of record.distribution) links.add(row.platform, row.url, row.via)
    links.add(verdict.source, verdict.url, 'title')
    record.distribution = links.rows
    if (record.distribution.length > before) merged += 1
  }

  // -------------------------------------------------------------- exclusives
  /*
   * Grouped across sources, because a record is a recording rather than an
   * upload. See the header — this is the rule the anime-music-video case
   * produced, and it turns seventeen uploads into thirteen records.
   */
  const groups = new Map<string, Verdict[]>()
  for (const verdict of verdicts) {
    if (choiceOf(verdict) !== 'exclusive') continue
    const group = songKey(verdict.title, artistName)
    const bucket = groups.get(group)
    if (bucket) bucket.push(verdict)
    else groups.set(group, [verdict])
  }

  for (const [group, members] of groups) {
    const key = `exclusive:${group}`
    const links = distributor()
    let artwork = ''
    let date: string | null = null

    for (const member of members) {
      links.add(member.source, member.url, 'title')
      if (member.source === 'soundcloud') {
        artwork ||= soundcloud.tracks.find((t) => t.url === member.url)?.artwork ?? ''
      } else {
        const video = youtube.videos.find((v) => v.url === member.url)
        // Earliest upload, which is the closest thing to a release date an
        // unreleased recording has.
        if (video?.publishedAt && (!date || video.publishedAt < date)) date = video.publishedAt
      }
    }

    /*
     * The SoundCloud title wins, and the shortest otherwise.
     *
     * SoundCloud is where the master is posted, so its title is the one he
     * gave the *track*; YouTube's is the one he gave the *upload*, prefixed
     * with his name and suffixed with the format. Falling back to the
     * shortest keeps a group the rule let through on an override readable.
     */
    const title =
      members.find((member) => member.source === 'soundcloud')?.title ??
      members.map((member) => member.title).sort((a, b) => a.length - b.length)[0]

    records.push({
      key,
      origin: 'exclusive',
      title,
      kind: /\bremix\b/i.test(title) ? 'remix' : 'single',
      status: 'released',
      releaseDate: date,
      upc: '',
      label: '',
      phonographicLine: '',
      copyrightLine: '',
      artworkUrl: artwork,
      artistNames: [artistName],
      distribution: links.rows,
      tracks: [
        {
          position: 1,
          title,
          isrc: '',
          durationMs: 0,
          artistNames: [artistName],
          present: false
        }
      ],
      match: { action: 'create', releaseId: '', title: '', matchedOn: 'none' },
      notes: '',
      include: !off.has(key),
      note:
        members.length > 1
          ? `One recording on ${members.map((m) => m.source).join(' and ')}, folded into one record.`
          : members[0].reason
    })
  }

  // ---------------------------------------- against the catalogue as it stands
  const byUpc = new Map<string, DiscographyRelease>()
  const byIsrc = new Map<string, DiscographyRelease>()
  const byUrl = new Map<string, DiscographyRelease>()
  const byTitle = new Map<string, DiscographyRelease>()

  for (const release of existing) {
    if (release.upc) byUpc.set(normaliseUpc(release.upc), release)
    for (const track of release.tracks) {
      if (track.isrc) byIsrc.set(normaliseIsrc(track.isrc), release)
    }
    for (const row of release.distribution) {
      for (const url of [row.streamUrl, row.presaveUrl]) {
        if (url.trim()) byUrl.set(url.trim(), release)
      }
    }
    byTitle.set(titleKey(release.title), release)
  }

  for (const record of records) {
    /*
     * Four keys, strongest first. **ISRC identifies a recording and UPC
     * identifies a product**, so UPC is asked first: a single and the album
     * carrying it share an ISRC and have different UPCs, and matching on the
     * ISRC alone would fold one into the other and destroy a record.
     */
    let hit: DiscographyRelease | undefined
    let matchedOn: SeedRecord['match']['matchedOn'] = 'none'

    if (record.upc) {
      hit = byUpc.get(normaliseUpc(record.upc))
      if (hit) matchedOn = 'upc'
    }
    if (!hit) {
      for (const track of record.tracks) {
        if (!track.isrc) continue
        hit = byIsrc.get(normaliseIsrc(track.isrc))
        if (hit) {
          matchedOn = 'isrc'
          break
        }
      }
    }
    if (!hit) {
      for (const row of record.distribution) {
        hit = byUrl.get(row.url)
        if (hit) {
          matchedOn = 'url'
          break
        }
      }
    }
    if (!hit) {
      const candidate = byTitle.get(titleKey(record.title))
      /*
       * A title alone is not enough. Two records can legitimately share one —
       * a single and the album named after it — so the year has to agree, and
       * a record with no date on either side is left to create rather than
       * folded into a stranger.
       */
      const sameYear =
        candidate?.releaseDate && record.releaseDate
          ? candidate.releaseDate.slice(0, 4) === record.releaseDate.slice(0, 4)
          : false
      if (candidate && sameYear) {
        hit = candidate
        matchedOn = 'title'
      }
    }

    if (!hit) continue

    const isrcs = new Set(hit.tracks.map((track) => normaliseIsrc(track.isrc)).filter(Boolean))
    const titles = new Set(hit.tracks.map((track) => titleKey(track.title)))
    for (const track of record.tracks) {
      track.present =
        (track.isrc !== '' && isrcs.has(normaliseIsrc(track.isrc))) || titles.has(titleKey(track.title))
    }

    const heldUrls = new Set(
      hit.distribution.flatMap((row) => [row.streamUrl.trim(), row.presaveUrl.trim()])
    )
    const newLinks = record.distribution.filter((row) => !heldUrls.has(row.url)).length
    const newTracks = record.tracks.filter((track) => !track.present).length

    record.match = { action: 'update', releaseId: hit.id, title: hit.title, matchedOn }
    record.note = [
      record.note,
      newLinks === 0 && newTracks === 0
        ? 'Already complete — nothing would change.'
        : `Adds ${newLinks} link${newLinks === 1 ? '' : 's'} and ${newTracks} track${
            newTracks === 1 ? '' : 's'
          }.`
    ]
      .filter(Boolean)
      .join(' ')
  }

  // -------------------------------------------------------------- decisions
  const decisions: SeedDecision[] = verdicts.map((verdict) => {
    const rule = overruled.get(verdict.key)
    return {
      key: verdict.key,
      source: verdict.source,
      title: verdict.title,
      url: verdict.url,
      against: verdict.matchTitle,
      nature: verdict.nature,
      // The rule's verdict is shown as the proposal, because it *is* what
      // will happen — showing the adjudicator's overruled guess here would
      // put a number on screen that describes nothing.
      proposal: rule ? 'drop' : verdict.proposal,
      choice: overrides[verdict.key] ?? null,
      probability: verdict.probability,
      /*
       * The rule settles it, so it is no longer a question for the operator.
       *
       * Unflagging matters: these were the noisiest rows on the review screen
       * and the ones a model was least able to help with. They are still
       * listed, still overridable, and no longer demanding attention.
       */
      flagged: rule ? false : verdict.flagged,
      reason: rule ?? verdict.reason
    }
  })

  // ---------------------------------------------------------------- summary
  const included = records.filter((record) => record.include)
  const countedTracks = (record: SeedRecord): number =>
    record.match.action === 'create'
      ? record.tracks.length
      : record.tracks.filter((track) => !track.present).length

  return {
    harvestedAt: harvest.fetchedAt,
    artist: harvest.artist,
    records,
    decisions,
    summary: {
      records: included.length,
      creating: included.filter((record) => record.match.action === 'create').length,
      updating: included.filter((record) => record.match.action === 'update').length,
      excluded: records.length - included.length,
      recordings: included.reduce((sum, record) => sum + countedTracks(record), 0),
      links: merged,
      dropped: verdicts.filter((verdict) => choiceOf(verdict) === 'drop').length,
      flagged: verdicts.filter((verdict) => verdict.flagged && !overrides[verdict.key]).length
    },
    warnings
  }
}

/** A typed convenience for the page — every seed track, flattened. */
export type { SeedTrack }
