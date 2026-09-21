/**
 * The three sources joined by an identifier: Apple Music, Deezer and TIDAL.
 *
 * ## Why this is not an aggregator call
 *
 * The plan was one call per release to Odesli, which returns every platform's
 * link at once. It answers `401 PUBLIC_API_ACCESS_DEPRECATED` as of 21 Sep
 * 2026 — keyless access is gone.
 *
 * What replaced it is better. Odesli resolves a *URL* and guesses; these
 * resolve an **identifier** and cannot:
 *
 *   Apple Music   `lookup?upc=`    UPC identifies the product
 *   Deezer        `track/isrc:`    ISRC identifies the recording
 *   TIDAL         `filter[isrc]=`  the same, behind client credentials
 *
 * So a link from this file is either right or absent. Nothing here needs
 * adjudicating, and the whole module is deleted with the seeder.
 *
 * Amazon Music has no route at all: no public catalogue API exists, and Odesli
 * was the only automated way to those links. The plan says so per record
 * rather than leaving a silent gap.
 */
import { basicAuth, paced, pool, request } from '@main/core/net'
import type { SpotifyHarvest } from './spotify'
import type { SeedReporter } from '../reporter'

export interface StoreHit {
  found: boolean
  url: string
  /**
   * The *product* page, when the source gives one alongside the recording.
   *
   * Only Deezer does, and it matters: a distribution row belongs to a record,
   * so an EP linked at its first track would send anyone who followed it to
   * one song. The track link is the fallback, and for a single the two are
   * the same thing anyway.
   */
  albumUrl: string
  title: string
  reason: string
}

const miss = (reason: string): StoreHit => ({
  found: false,
  url: '',
  albumUrl: '',
  title: '',
  reason
})

export interface StoreHarvest {
  /** Keyed by Spotify release id. */
  apple: Record<string, StoreHit>
  /** Keyed by Spotify track id. */
  deezer: Record<string, StoreHit>
  /** Keyed by Spotify track id. */
  tidal: Record<string, StoreHit>
  warnings: string[]
}

// ------------------------------------------------------------ apple, by UPC

interface ItunesRow {
  wrapperType: string
  collectionName?: string
  collectionViewUrl?: string
  trackName?: string
  trackViewUrl?: string
}

async function apple(upc: string, storefront: string): Promise<StoreHit> {
  if (!upc) return miss('no UPC on the record')

  const payload = await request<{ results?: ItunesRow[] }>(
    `https://itunes.apple.com/lookup?upc=${encodeURIComponent(upc)}&entity=song&country=${storefront}`
  )

  const collection = payload.results?.find((row) => row.wrapperType === 'collection')
  const tracks = (payload.results ?? []).filter((row) => row.wrapperType === 'track')
  if (!collection && tracks.length === 0) return miss('UPC not in the store')

  return {
    found: true,
    url: collection?.collectionViewUrl ?? tracks[0]?.trackViewUrl ?? '',
    albumUrl: collection?.collectionViewUrl ?? '',
    title: collection?.collectionName ?? '',
    reason: ''
  }
}

// ---------------------------------------------------------- deezer, by ISRC

async function deezer(isrc: string): Promise<StoreHit> {
  if (!isrc) return miss('no ISRC on the recording')

  const payload = await request<{
    error?: { message?: string }
    link?: string
    title?: string
    album?: { id?: number }
  }>(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`)

  // Deezer answers 200 with an `error` object rather than a 404.
  if (payload.error) return miss(payload.error.message ?? 'not found')

  return {
    found: true,
    url: payload.link ?? '',
    albumUrl: payload.album?.id ? `https://www.deezer.com/album/${payload.album.id}` : '',
    title: payload.title ?? '',
    reason: ''
  }
}

// ----------------------------------------------------------- tidal, by ISRC

const TIDAL_AUTH = 'https://auth.tidal.com/v1/oauth2/token'
const TIDAL_API = 'https://openapi.tidal.com/v2'
const COUNTRY = 'CA'

async function tidalToken(id: string, secret: string): Promise<string> {
  const granted = await request<{ access_token: string }>(TIDAL_AUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(id, secret)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  })
  return granted.access_token
}

async function tidal(isrc: string, bearer: string): Promise<StoreHit> {
  if (!isrc) return miss('no ISRC on the recording')

  /*
   * JSON:API, so the payload is `{ data: [...] }` with attributes nested — and
   * the `Accept` header is not optional: without it the service answers 406.
   */
  const payload = await request<{ data?: { id: string; attributes?: { title?: string } }[] }>(
    `${TIDAL_API}/tracks?countryCode=${COUNTRY}&filter%5Bisrc%5D=${encodeURIComponent(isrc)}`,
    { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/vnd.api+json' } }
  )

  const hit = payload.data?.[0]
  if (!hit) return miss('ISRC not in the catalogue')

  return {
    found: true,
    url: `https://tidal.com/browse/track/${hit.id}`,
    albumUrl: '',
    title: hit.attributes?.title ?? '',
    reason: ''
  }
}

// ---------------------------------------------------------------- the sweep

export interface StoreOptions {
  harvest: SpotifyHarvest
  storefront: string
  tidalClientId: string
  tidalClientSecret: string
  reporter: SeedReporter
}

export async function harvestStores({
  harvest,
  storefront,
  tidalClientId,
  tidalClientSecret,
  reporter
}: StoreOptions): Promise<StoreHarvest> {
  const warnings: string[] = []
  const recordings = harvest.releases.flatMap((release) => release.tracks)

  reporter.step(
    'stores',
    'Three sources joined by an identifier — a link here is either right or absent'
  )

  /*
   * Apple is paced to twenty a minute.
   *
   * Apple publishes about that for the unauthenticated lookup service and
   * answers 403 for a while if you go past it. Eighteen records is under a
   * minute either way, and being throttled mid-harvest costs more than the
   * pacing does.
   */
  reporter.step(
    'apple',
    `${harvest.releases.length} records by UPC, paced to 20/min — past that it answers 403`
  )
  const appleByRelease: Record<string, StoreHit> = {}
  let appleDone = 0
  await paced(harvest.releases, 20, async (release) => {
    reporter.request('apple', `itunes.apple.com/lookup?upc=${release.upc || '(none)'}&country=${storefront}`)
    const hit = await apple(release.upc, storefront).catch((error: Error) => miss(error.message))
    appleByRelease[release.id] = hit
    reporter.response('apple', hit.found ? `"${release.title}" found` : `"${release.title}" — ${hit.reason}`)
    reporter.progress('Apple Music, by UPC', ++appleDone, harvest.releases.length)
  })
  reporter.note(
    'apple',
    `${Object.values(appleByRelease).filter((h) => h.found).length} of ${harvest.releases.length} records`
  )

  reporter.step('deezer', `${recordings.length} recordings by ISRC, keyless, 5 in flight`)
  const deezerByTrack: Record<string, StoreHit> = {}
  let deezerDone = 0
  await pool(recordings, 5, async (track) => {
    const hit = await deezer(track.isrc).catch((error: Error) => miss(error.message))
    deezerByTrack[track.id] = hit
    deezerDone += 1
    if (deezerDone <= 4) {
      reporter.request('deezer', `api.deezer.com/track/isrc:${track.isrc || '(none)'}`)
      reporter.response('deezer', hit.found ? `"${hit.title}"` : hit.reason)
    }
    reporter.progress('Deezer, by ISRC', deezerDone, recordings.length)
  })
  reporter.note(
    'deezer',
    `${Object.values(deezerByTrack).filter((h) => h.found).length} of ${recordings.length} recordings`
  )

  const tidalByTrack: Record<string, StoreHit> = {}
  if (tidalClientId && tidalClientSecret) {
    try {
      reporter.step('tidal', `${recordings.length} recordings by ISRC — rate-limits hard, 4 in flight`)
      reporter.request('tidal', 'POST auth.tidal.com/v1/oauth2/token (client credentials)')
      const bearer = await tidalToken(tidalClientId, tidalClientSecret)
      reporter.response('tidal', 'authenticated')

      let tidalDone = 0
      // Four in flight rather than five: TIDAL rate-limits harder than the
      // others and answers 429 in bursts. `request` backs off either way.
      await pool(recordings, 4, async (track) => {
        const hit = await tidal(track.isrc, bearer).catch((error: Error) => miss(error.message))
        tidalByTrack[track.id] = hit
        tidalDone += 1
        if (tidalDone <= 4) {
          reporter.request('tidal', `openapi.tidal.com/v2/tracks?filter[isrc]=${track.isrc || '(none)'}`)
          reporter.response('tidal', hit.found ? `"${hit.title}"` : hit.reason)
        }
        reporter.progress('TIDAL, by ISRC', tidalDone, recordings.length)
      })
      reporter.note(
        'tidal',
        `${Object.values(tidalByTrack).filter((h) => h.found).length} of ${recordings.length} recordings`
      )
    } catch (error) {
      const reason = (error as Error).message
      reporter.warn('tidal', `skipped — ${reason}`)
      warnings.push(`TIDAL was skipped — ${reason}`)
    }
  } else {
    reporter.warn('tidal', 'skipped — no client id and secret were given')
    warnings.push('TIDAL was skipped — no client id and secret were given.')
  }

  reporter.warn('amazon', 'no public catalogue API exists, and Odesli is no longer keyless')
  warnings.push('Amazon Music has no public route, so no record will carry an Amazon link.')

  return { apple: appleByRelease, deezer: deezerByTrack, tidal: tidalByTrack, warnings }
}
