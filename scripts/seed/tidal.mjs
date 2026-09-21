/**
 * Find each recording on TIDAL, by ISRC.
 *
 * The third of the exact sources. Like Deezer this joins on the **ISRC**, so a
 * link is either the same recording or absent — there is nothing here for the
 * adjudicator to weigh in on.
 *
 * Client credentials, as Spotify: reading a public catalogue acts on nobody's
 * behalf, so there is no user to send to a consent screen.
 *
 * Run:  node scripts/seed/tidal.mjs
 */
import { cacheRead, cacheWrite, credentials, pool, request } from './lib.mjs'

const AUTH = 'https://auth.tidal.com/v1/oauth2/token'
const API = 'https://openapi.tidal.com/v2'
const COUNTRY = 'CA'

async function token({ TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET }) {
  if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
    throw new Error('TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET are required.')
  }

  const basic = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64')
  const granted = await request(AUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  })

  return granted.access_token
}

async function byIsrc(isrc, bearer) {
  if (!isrc) return { found: false, reason: 'no ISRC on the recording' }

  /*
   * JSON:API, so the payload is `{ data: [...] }` with attributes nested — and
   * the `Accept` header is not optional: without it the service answers 406.
   */
  const payload = await request(
    `${API}/tracks?countryCode=${COUNTRY}&filter%5Bisrc%5D=${encodeURIComponent(isrc)}`,
    { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/vnd.api+json' } }
  )

  const hit = payload.data?.[0]
  if (!hit) return { found: false, reason: 'ISRC not in the catalogue' }

  const attributes = hit.attributes ?? {}
  return {
    found: true,
    id: hit.id,
    title: attributes.title ?? '',
    url: `https://tidal.com/browse/track/${hit.id}`,
    // ISO 8601 duration, `PT3M42S`. Kept raw: nothing downstream needs it in
    // milliseconds, and parsing a format for one report is a bug waiting.
    duration: attributes.duration ?? ''
  }
}

async function main() {
  const env = await credentials()
  const harvest = await cacheRead('spotify')
  if (!harvest) throw new Error('Run scripts/seed/spotify.mjs first.')

  const bearer = await token(env)

  const recordings = harvest.releases.flatMap((release) =>
    release.tracks.map((track) => ({ release, track }))
  )

  process.stdout.write(`\n  TIDAL (by ISRC)  `)
  const results = new Map()
  await pool(recordings, 4, async ({ track }) => {
    const result = await byIsrc(track.isrc, bearer).catch((error) => ({
      found: false,
      reason: error.message.split('\n')[0]
    }))
    results.set(track.id, result)
    process.stdout.write(result.found ? '•' : '·')
  })
  console.log('\n')

  await cacheWrite('tidal', {
    fetchedAt: new Date().toISOString(),
    country: COUNTRY,
    tracks: Object.fromEntries(results)
  })

  const hits = [...results.values()].filter((r) => r.found).length
  console.log('─'.repeat(78))
  console.log(`  TIDAL          ${hits} of ${recordings.length} recordings`)
  console.log(`  cached to      .seed-cache/tidal.json`)
  console.log('─'.repeat(78))

  console.log('\n  Per record\n')
  for (const release of harvest.releases) {
    const found = release.tracks.filter((t) => results.get(t.id)?.found).length
    const title = release.title.length > 44 ? `${release.title.slice(0, 43)}…` : release.title
    console.log(`   ${title.padEnd(46)} ${found}/${release.tracks.length}`)
  }

  const reasons = new Map()
  for (const result of results.values()) {
    if (!result.found) reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1)
  }
  if (reasons.size > 0) {
    console.log('\n  Misses\n')
    for (const [reason, n] of reasons) console.log(`   ${String(n).padStart(3)} × ${reason}`)
  }
  console.log()
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`)
  process.exitCode = 1
})
