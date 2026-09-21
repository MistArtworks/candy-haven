/**
 * Harvest one artist's whole Spotify catalogue.
 *
 * The spine of the seed. Spotify is the only source that carries **ISRC per
 * recording and UPC per product**, which are the two keys everything else is
 * matched against — so this runs first, and the rest of the harvest is
 * expressed in terms of what it returns.
 *
 * Reads four album groups, not one:
 *
 *   album, single, compilation   his own records
 *   appears_on                   other people's records he is on
 *
 * The last is there because the operator asked for everything Candy Heist is
 * involved in, features and collaborations included. It is also the noisiest —
 * `appears_on` is where a hundred-track playlist-album turns up because
 * somebody licensed one song — so the report counts it separately and the
 * review stage decides.
 *
 * ## What this API allows today, measured rather than remembered
 *
 * Two limits were found by probing, and both differ from the documentation
 * this was first written against:
 *
 *   - `/artists/{id}/albums` refuses `limit` above **10** ("Invalid limit").
 *   - `/albums?ids=` and `/tracks?ids=` answer **403 Forbidden** for an
 *     application registered now. Only the singular endpoints are open.
 *
 * So the harvest reads one record at a time, a few at a time. For a catalogue
 * of this size that is a minute, and `request` backs off on a 429.
 *
 * Run:  node scripts/seed/spotify.mjs
 */
import { cacheWrite, credentials, pool, request, spotifyArtistId } from './lib.mjs'

const API = 'https://api.spotify.com/v1'

async function token({ SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET }) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required.')
  }

  /*
   * Client credentials, not the authorisation code flow.
   *
   * Reading a public catalogue is not acting on anybody's behalf, so there is
   * no user to send to a consent screen and no refresh token to store. The
   * redirect URI the dashboard insisted on is never used.
   */
  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')

  const granted = await request('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  return granted.access_token
}

const auth = (bearer) => ({ headers: { Authorization: `Bearer ${bearer}` } })

/** Follows Spotify's `next` cursor to the end of a paged collection. */
async function all(url, bearer) {
  const items = []
  let next = url
  while (next) {
    const page = await request(next, auth(bearer))
    items.push(...page.items)
    next = page.next
  }
  return items
}

async function main() {
  const env = await credentials()
  const artistId = spotifyArtistId(env.SPOTIFY_ARTIST_URL)
  if (!artistId) throw new Error('SPOTIFY_ARTIST_URL is empty.')

  const bearer = await token(env)

  const artist = await request(`${API}/artists/${artistId}`, auth(bearer))
  console.log(`\nArtist   ${artist.name}  (${artist.followers?.total ?? 0} followers)`)
  console.log(`         ${artist.external_urls?.spotify}\n`)

  // Album *groups* rather than album types: the group says how this artist
  // relates to the record, which is the distinction between "his single" and
  // "a compilation he is one track of".
  const groups = ['album', 'single', 'compilation', 'appears_on']
  const seen = new Map()

  for (const group of groups) {
    const found = await all(
      `${API}/artists/${artistId}/albums?include_groups=${group}&limit=10&market=CA`,
      bearer
    )
    console.log(`  ${group.padEnd(12)} ${String(found.length).padStart(3)}`)
    for (const album of found) {
      // Spotify returns the same record under more than one group; the id is
      // what makes it one record.
      if (!seen.has(album.id)) seen.set(album.id, { ...album, groups: [] })
      seen.get(album.id).groups.push(group)
    }
  }

  const albums = [...seen.values()]
  console.log(`  ${'distinct'.padEnd(12)} ${String(albums.length).padStart(3)}\n`)

  // Full records: the artist endpoint returns summaries with no UPC, no label
  // and no tracklist.
  process.stdout.write(`  reading ${albums.length} records `)
  const detailed = (
    await pool(albums, 5, async (album) => {
      const full = await request(`${API}/albums/${album.id}?market=CA`, auth(bearer))
      process.stdout.write('.')
      return full
    })
  ).filter(Boolean)
  console.log('')

  /*
   * ISRCs come from the track endpoint, not from the album's tracklist.
   *
   * An album's `tracks.items` are simplified objects with no `external_ids`,
   * and the ISRC is the most useful field in this entire harvest — it is what
   * says two recordings on two platforms are the same recording.
   */
  const trackIds = [...new Set(detailed.flatMap((album) => album.tracks.items.map((t) => t.id)))]
  process.stdout.write(`  reading ${trackIds.length} recordings `)
  const tracks = new Map()
  for (const track of await pool(trackIds, 5, async (id) => {
    const full = await request(`${API}/tracks/${id}?market=CA`, auth(bearer))
    process.stdout.write('.')
    return full
  })) {
    if (track) tracks.set(track.id, track)
  }
  console.log('\n')

  const harvest = {
    fetchedAt: new Date().toISOString(),
    artist: { id: artist.id, name: artist.name, url: artist.external_urls?.spotify },
    releases: detailed.map((album) => ({
      id: album.id,
      groups: seen.get(album.id)?.groups ?? [],
      albumType: album.album_type,
      title: album.name,
      url: album.external_urls?.spotify,
      releaseDate: album.release_date,
      releaseDatePrecision: album.release_date_precision,
      upc: album.external_ids?.upc ?? '',
      label: album.label ?? '',
      copyrights: album.copyrights ?? [],
      artwork: album.images?.[0]?.url ?? '',
      artists: album.artists.map((a) => ({ id: a.id, name: a.name })),
      tracks: album.tracks.items.map((item) => {
        const full = tracks.get(item.id)
        return {
          id: item.id,
          position: item.track_number,
          title: item.name,
          durationMs: item.duration_ms,
          url: item.external_urls?.spotify,
          isrc: full?.external_ids?.isrc ?? '',
          artists: item.artists.map((a) => ({ id: a.id, name: a.name }))
        }
      })
    }))
  }

  await cacheWrite('spotify', harvest)

  // ---------------------------------------------------------------- report
  const mine = harvest.releases.filter((r) => !r.groups.includes('appears_on'))
  const guest = harvest.releases.filter((r) => r.groups.includes('appears_on'))
  const allTracks = harvest.releases.flatMap((r) => r.tracks)
  const withIsrc = allTracks.filter((t) => t.isrc)
  const others = new Map()
  for (const release of harvest.releases) {
    for (const person of [...release.artists, ...release.tracks.flatMap((t) => t.artists)]) {
      if (person.id !== artist.id) others.set(person.id, person.name)
    }
  }

  console.log('─'.repeat(70))
  console.log(`  his own records      ${mine.length}`)
  for (const type of ['album', 'single', 'compilation']) {
    const n = mine.filter((r) => r.albumType === type).length
    if (n) console.log(`    ${type.padEnd(18)} ${n}`)
  }
  console.log(`  appears on           ${guest.length}`)
  console.log(`  recordings           ${allTracks.length}  (${withIsrc.length} with an ISRC)`)
  console.log(`  other artists met    ${others.size}`)
  console.log(`  with UPC             ${harvest.releases.filter((r) => r.upc).length}`)
  console.log(`  labels               ${[...new Set(harvest.releases.map((r) => r.label).filter(Boolean))].join(', ') || '—'}`)
  console.log(`  cached to            .seed-cache/spotify.json`)
  console.log('─'.repeat(70))

  console.log('\n  Earliest → latest\n')
  for (const release of [...harvest.releases].sort((a, b) =>
    (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '')
  )) {
    const mark = release.groups.includes('appears_on') ? 'guest' : release.albumType
    const title = release.title.length > 44 ? `${release.title.slice(0, 43)}…` : release.title
    console.log(
      `   ${(release.releaseDate ?? '').padEnd(10)}  ${mark.padEnd(11)} ${title.padEnd(44)} ${String(release.tracks.length).padStart(2)} trk`
    )
  }

  console.log('\n  Other artists met\n')
  console.log(`   ${[...others.values()].sort().join(', ') || '—'}\n`)
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`)
  process.exitCode = 1
})
