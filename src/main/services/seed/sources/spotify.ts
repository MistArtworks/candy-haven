/**
 * Harvest one artist's whole Spotify catalogue. The spine of the seed.
 *
 * Spotify is the only source carrying **ISRC per recording and UPC per
 * product**, which are the two keys everything else is matched against — so
 * this runs first, and the rest of the harvest is expressed in terms of what
 * it returns.
 *
 * Reads four album groups, not one:
 *
 *   album, single, compilation   his own records
 *   appears_on                   other people's records he is on
 *
 * The last is there because the operator asked for everything he is involved
 * in, features and collaborations included. It is also the noisiest, so the
 * plan counts it separately and seeds his track only.
 *
 * ## What this API allows today, measured rather than remembered
 *
 *   - `/artists/{id}/albums` refuses `limit` above **10** ("Invalid limit").
 *     The documentation says 50.
 *   - `/albums?ids=` and `/tracks?ids=` answer **403 Forbidden** for an
 *     application registered now. Only the singular endpoints are open, so
 *     the harvest reads one record at a time.
 */
import { basicAuth, pool, request } from '@main/core/net'
import { spotifyArtistId } from '../normalise'
import type { SeedCredentials } from '@shared/domain/seed'

const API = 'https://api.spotify.com/v1'
const MARKET = 'CA'

export interface SpotifyPerson {
  id: string
  name: string
}

export interface SpotifyTrack {
  id: string
  position: number
  title: string
  durationMs: number
  url: string
  isrc: string
  artists: SpotifyPerson[]
}

export interface SpotifyRelease {
  id: string
  groups: string[]
  albumType: string
  title: string
  url: string
  releaseDate: string
  releaseDatePrecision: string
  upc: string
  label: string
  copyrights: { text: string; type: string }[]
  artwork: string
  artists: SpotifyPerson[]
  tracks: SpotifyTrack[]
}

export interface SpotifyHarvest {
  fetchedAt: string
  artist: { id: string; name: string; url: string }
  releases: SpotifyRelease[]
}

interface RawAlbum {
  id: string
  album_type: string
  name: string
  release_date?: string
  release_date_precision?: string
  label?: string
  external_ids?: { upc?: string; isrc?: string }
  external_urls?: { spotify?: string }
  copyrights?: { text: string; type: string }[]
  images?: { url: string }[]
  artists: { id: string; name: string }[]
  tracks: { items: RawTrack[] }
}

interface RawTrack {
  id: string
  name: string
  track_number: number
  duration_ms: number
  external_ids?: { isrc?: string }
  external_urls?: { spotify?: string }
  artists: { id: string; name: string }[]
}

/**
 * Client credentials, not the authorisation code flow.
 *
 * Reading a public catalogue is not acting on anybody's behalf, so there is no
 * user to send to a consent screen and no refresh token to store. The redirect
 * URI the dashboard insisted on is never used.
 */
async function token(credentials: SeedCredentials): Promise<string> {
  const { spotifyClientId, spotifyClientSecret } = credentials
  if (!spotifyClientId || !spotifyClientSecret) {
    throw new Error('Spotify needs a client id and secret.')
  }

  const granted = await request<{ access_token: string }>(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth(spotifyClientId, spotifyClientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' })
    }
  )

  return granted.access_token
}

const auth = (bearer: string): RequestInit => ({ headers: { Authorization: `Bearer ${bearer}` } })

/** Follows Spotify's `next` cursor to the end of a paged collection. */
async function all<T>(url: string, bearer: string): Promise<T[]> {
  const items: T[] = []
  let next: string | null = url
  while (next) {
    const page: { items: T[]; next: string | null } = await request(next, auth(bearer))
    items.push(...page.items)
    next = page.next
  }
  return items
}

export interface SpotifyOptions {
  credentials: SeedCredentials
  /** Called as each step learns its own size, so the bar can fill honestly. */
  report: (note: string, done: number, total: number) => void
}

export async function harvestSpotify({
  credentials,
  report
}: SpotifyOptions): Promise<SpotifyHarvest> {
  const artistId = spotifyArtistId(credentials.spotifyArtistUrl)
  if (!artistId) throw new Error('The Spotify artist link is empty.')

  const bearer = await token(credentials)

  report('reading the artist', 0, 0)
  const artist = await request<{
    id: string
    name: string
    external_urls?: { spotify?: string }
  }>(`${API}/artists/${artistId}`, auth(bearer))

  /*
   * Album *groups* rather than album types: the group says how this artist
   * relates to the record, which is the distinction between "his single" and
   * "a compilation he is one track of".
   */
  const groups = ['album', 'single', 'compilation', 'appears_on']
  const seen = new Map<string, { id: string; groups: string[] }>()

  for (const group of groups) {
    report(`listing ${group}`, 0, 0)
    const found = await all<{ id: string }>(
      `${API}/artists/${artistId}/albums?include_groups=${group}&limit=10&market=${MARKET}`,
      bearer
    )
    for (const album of found) {
      // Spotify returns the same record under more than one group; the id is
      // what makes it one record.
      if (!seen.has(album.id)) seen.set(album.id, { id: album.id, groups: [] })
      seen.get(album.id)?.groups.push(group)
    }
  }

  const ids = [...seen.keys()]

  // Full records: the artist endpoint returns summaries with no UPC, no label
  // and no tracklist.
  let readRecords = 0
  const detailed = (
    await pool(ids, 5, async (id) => {
      const full = await request<RawAlbum>(`${API}/albums/${id}?market=${MARKET}`, auth(bearer))
      report('reading records', ++readRecords, ids.length)
      return full
    })
  ).filter(Boolean)

  /*
   * ISRCs come from the track endpoint, not from the album's tracklist.
   *
   * An album's `tracks.items` are simplified objects with no `external_ids`,
   * and the ISRC is the most useful field in this entire harvest — it is what
   * says two recordings on two platforms are the same recording.
   */
  const trackIds = [...new Set(detailed.flatMap((album) => album.tracks.items.map((t) => t.id)))]
  let readTracks = 0
  const tracks = new Map<string, RawTrack>()
  for (const track of await pool(trackIds, 5, async (id) => {
    const full = await request<RawTrack>(`${API}/tracks/${id}?market=${MARKET}`, auth(bearer))
    report('reading recordings', ++readTracks, trackIds.length)
    return full
  })) {
    if (track) tracks.set(track.id, track)
  }

  return {
    fetchedAt: new Date().toISOString(),
    artist: {
      id: artist.id,
      name: artist.name,
      url: artist.external_urls?.spotify ?? ''
    },
    releases: detailed.map((album) => ({
      id: album.id,
      groups: seen.get(album.id)?.groups ?? [],
      albumType: album.album_type,
      title: album.name,
      url: album.external_urls?.spotify ?? '',
      releaseDate: album.release_date ?? '',
      releaseDatePrecision: album.release_date_precision ?? '',
      upc: album.external_ids?.upc ?? '',
      label: album.label ?? '',
      copyrights: album.copyrights ?? [],
      artwork: album.images?.[0]?.url ?? '',
      artists: album.artists.map((a) => ({ id: a.id, name: a.name })),
      tracks: album.tracks.items.map((item) => ({
        id: item.id,
        position: item.track_number,
        title: item.name,
        durationMs: item.duration_ms,
        url: item.external_urls?.spotify ?? '',
        isrc: tracks.get(item.id)?.external_ids?.isrc ?? '',
        artists: item.artists.map((a) => ({ id: a.id, name: a.name }))
      }))
    }))
  }
}
