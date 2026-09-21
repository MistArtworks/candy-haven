/**
 * Read the SoundCloud uploads, and see which of them we already know about.
 *
 * ## Why oEmbed and not the API
 *
 * A SoundCloud API application requires an Artist Pro subscription and the
 * account is on Artist. The public oEmbed endpoint needs no key at all and is
 * documented — it gives a title, a description and artwork per track, which is
 * everything except the two fields that would have made matching trivial:
 * **no ISRC and no duration**.
 *
 * So SoundCloud is the one source that cannot be matched by identifier. Every
 * other platform in this harvest is joined by UPC or ISRC and is therefore
 * exact; this one is joined by *title*, which is why the adjudicator exists.
 *
 * This script does the deterministic half and stops: it reports what matched
 * on a normalised title, what did not, and leaves the judgement calls for the
 * pass that follows. Nothing here decides a merge.
 *
 * Run:  node scripts/seed/soundcloud.mjs
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT, cacheRead, cacheWrite, credentials, pool, request } from './lib.mjs'

/**
 * Two titles compared the way a person would skim them.
 *
 * Case, punctuation and spacing only. Deliberately **not** stripping bracketed
 * suffixes: `(Radio Edit)`, `(Sped Up)` and `(Candy Heist Remix)` are the
 * difference between one recording and another, and a normaliser that threw
 * them away would merge records that must not be merged. Anything this does
 * not settle is meant to go to the adjudicator, not to a cleverer regex.
 */
function normalise(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** `…/candy-heist/for-the-record-radio-edit` → `for the record radio edit`. */
function slugWords(url) {
  return (url.split('/').pop() ?? '').replace(/-/g, ' ').trim()
}

async function main() {
  const env = await credentials()
  const listPath = join(ROOT, env.SOUNDCLOUD_TRACK_LIST || 'info/soundcloud-tracks.txt')

  const urls = (await readFile(listPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('https://soundcloud.com/'))

  if (urls.length === 0) throw new Error(`No URLs in ${listPath}`)

  console.log(`\n  Reading ${urls.length} SoundCloud tracks\n  `)

  const tracks = await pool(urls, 4, async (url) => {
    try {
      const data = await request(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
      )
      process.stdout.write('•')
      return {
        url,
        // oEmbed titles read "Title by Artist"; the artist is already known.
        title: (data.title ?? '').replace(/\s+by\s+[^,]*$/i, '').trim(),
        rawTitle: data.title ?? '',
        artwork: data.thumbnail_url ?? '',
        description: (data.description ?? '').slice(0, 400),
        found: true
      }
    } catch (error) {
      process.stdout.write('·')
      return { url, found: false, reason: error.message.split('\n')[0] }
    }
  })

  console.log('\n')

  // ------------------------------------------------- against the Spotify spine
  const harvest = await cacheRead('spotify')
  const known = []
  for (const release of harvest?.releases ?? []) {
    for (const track of release.tracks) {
      known.push({
        release: release.title,
        releaseId: release.id,
        trackId: track.id,
        title: track.title,
        isrc: track.isrc,
        key: normalise(track.title)
      })
    }
  }

  const decided = tracks.map((track) => {
    if (!track.found) return { ...track, verdict: 'unread' }

    const key = normalise(track.title)
    const exact = known.filter((entry) => entry.key === key)
    if (exact.length === 1) return { ...track, verdict: 'exact', match: exact[0] }
    if (exact.length > 1) return { ...track, verdict: 'ambiguous', candidates: exact }

    /*
     * A shortlist, not a decision.
     *
     * One title containing the other catches `For The Record` against
     * `For The Record (Radio Edit)` — which is a *different recording* of the
     * same song and must not be merged automatically. It is exactly the case
     * the adjudicator is for, so this only gathers the candidates.
     */
    const near = known.filter((entry) => entry.key.includes(key) || key.includes(entry.key))
    if (near.length > 0) return { ...track, verdict: 'near', candidates: near }

    return { ...track, verdict: 'unmatched', slug: slugWords(track.url) }
  })

  await cacheWrite('soundcloud', { fetchedAt: new Date().toISOString(), tracks: decided })

  // ---------------------------------------------------------------- report
  const count = (verdict) => decided.filter((t) => t.verdict === verdict).length

  console.log('─'.repeat(78))
  console.log(`  read                 ${decided.filter((t) => t.found).length} of ${urls.length}`)
  console.log(`  exact title match    ${count('exact')}   → same recording, safe to merge`)
  console.log(`  near match           ${count('near')}   → for the adjudicator`)
  console.log(`  no match at all      ${count('unmatched')}   → exclusives, or titled differently`)
  console.log(`  ambiguous            ${count('ambiguous')}`)
  console.log(`  unread               ${count('unread')}`)
  console.log(`  cached to            .seed-cache/soundcloud.json`)
  console.log('─'.repeat(78))

  for (const group of ['exact', 'near', 'ambiguous', 'unmatched', 'unread']) {
    const rows = decided.filter((t) => t.verdict === group)
    if (rows.length === 0) continue
    console.log(`\n  ${group.toUpperCase()}\n`)
    for (const row of rows) {
      const title = (row.title || row.url).slice(0, 44).padEnd(44)
      const against =
        row.match?.title ??
        (row.candidates ?? []).map((c) => c.title).join(' / ') ??
        ''
      console.log(`   ${title} ${against}`)
    }
  }
  console.log()
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`)
  process.exitCode = 1
})
