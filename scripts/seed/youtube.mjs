/**
 * Read both of his YouTube channels, and see which uploads we already know.
 *
 * ## Two channels, and they are not the same thing
 *
 * `YOUTUBE_CHANNEL_URL` is the one he posts to — videos, promo mixes, whatever
 * he decided to put up. `YOUTUBE_TOPIC_CHANNEL_URL` is the "Topic" channel
 * YouTube generates for a distributed artist, and it holds an **Art Track**
 * per released recording: auto-created, one per song, mirroring what went to
 * the stores.
 *
 * The Topic channel is therefore the one that lines up with the Spotify spine,
 * and the main channel is where the YouTube-only material lives. Reading both
 * and labelling which is which is what lets the report tell an exclusive from
 * a duplicate.
 *
 * ## YouTube never creates a record
 *
 * It contributes **links to records Spotify already proved**, and nothing
 * else. The channel's Releases tab was found listing a record belonging to a
 * different act of the same name, so YouTube's own attribution is not
 * reliable enough to mint a discography entry from — and neither is a title.
 *
 * ## Matching here is by title, like SoundCloud
 *
 * YouTube carries no ISRC, so this is the second of the two fuzzy sources.
 * The same rule applies: this script gathers and shortlists, and decides
 * nothing that is not an exact title match.
 *
 * Run:  node scripts/seed/youtube.mjs
 */
import { cacheRead, cacheWrite, credentials, request } from './lib.mjs'

const API = 'https://www.googleapis.com/youtube/v3'

function normalise(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * A channel reference in any of the forms YouTube hands out, resolved to an id.
 *
 * `/channel/UC…` carries the id already. `@handle` needs `forHandle`, which is
 * one unit of quota and exact — a search would cost a hundred and could return
 * somebody else's channel.
 */
async function resolveChannel(url, key) {
  const direct = /\/channel\/(UC[\w-]+)/.exec(url || '')
  const query = direct
    ? `id=${direct[1]}`
    : `forHandle=${encodeURIComponent((/@([\w.-]+)/.exec(url || '')?.[1] ?? '').trim())}`

  const payload = await request(`${API}/channels?part=snippet,contentDetails&${query}&key=${key}`)
  const channel = payload.items?.[0]
  if (!channel) throw new Error(`no channel for ${url}`)

  return {
    id: channel.id,
    title: channel.snippet?.title ?? '',
    uploads: channel.contentDetails?.relatedPlaylists?.uploads ?? ''
  }
}

/** Every video on a channel's uploads playlist, fifty at a time. */
async function uploads(playlistId, key) {
  const items = []
  let pageToken = ''
  do {
    const payload = await request(
      `${API}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`
    )
    for (const item of payload.items ?? []) {
      items.push({
        videoId: item.contentDetails?.videoId ?? '',
        title: item.snippet?.title ?? '',
        publishedAt: (item.contentDetails?.videoPublishedAt ?? '').slice(0, 10),
        url: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId ?? ''}`
      })
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)
  return items
}

async function main() {
  const env = await credentials()
  const key = env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY is empty.')

  const sources = [
    { kind: 'main', url: env.YOUTUBE_CHANNEL_URL },
    { kind: 'topic', url: env.YOUTUBE_TOPIC_CHANNEL_URL }
  ].filter((source) => source.url)

  const channels = []
  for (const source of sources) {
    const channel = await resolveChannel(source.url, key)

    /*
     * The same channel twice is the trap this guards.
     *
     * `<Artist> - Topic` is a *different* channel from the one the artist
     * posts to, and the two are easy to confuse — the first run had the main
     * channel's id in both fields, read its 23 promo uploads twice, and found
     * no music at all. Skipping the duplicate is quieter than reporting 46
     * videos that are 23.
     */
    if (channels.some((existing) => existing.id === channel.id)) {
      console.log(`
  ${source.kind.padEnd(6)} ${channel.title} is the same channel — skipped`)
      continue
    }
    const videos = channel.uploads ? await uploads(channel.uploads, key) : []
    console.log(`\n  ${source.kind.padEnd(6)} ${channel.title.padEnd(28)} ${String(videos.length).padStart(3)} uploads`)
    channels.push({ ...source, ...channel, videos })
  }

  // ------------------------------------------------- against the Spotify spine
  const harvest = await cacheRead('spotify')
  const known = []
  for (const release of harvest?.releases ?? []) {
    for (const track of release.tracks) {
      known.push({ title: track.title, isrc: track.isrc, key: normalise(track.title) })
    }
  }

  const decided = channels.flatMap((channel) =>
    channel.videos.map((video) => {
      /*
       * Topic channels title an Art Track as the song and nothing else, so an
       * exact match is the norm there. The main channel titles things the way
       * a person does — "Candy Heist - Song (Official Video)" — so the same
       * normalisation is applied to both and the leftovers go to the
       * adjudicator rather than to a longer list of suffixes to strip.
       */
      const videoKey = normalise(video.title)
      const exact = known.filter((entry) => entry.key === videoKey)
      if (exact.length === 1) return { ...video, channel: channel.kind, verdict: 'exact', match: exact[0] }

      const near = known.filter((entry) => entry.key.includes(videoKey) || videoKey.includes(entry.key))
      if (near.length > 0) return { ...video, channel: channel.kind, verdict: 'near', candidates: near }

      return { ...video, channel: channel.kind, verdict: 'unmatched' }
    })
  )

  await cacheWrite('youtube', {
    fetchedAt: new Date().toISOString(),
    channels: channels.map(({ videos, ...rest }) => ({ ...rest, count: videos.length })),
    videos: decided
  })

  const count = (verdict, kind) =>
    decided.filter((v) => v.verdict === verdict && (!kind || v.channel === kind)).length

  console.log(`\n${'─'.repeat(78)}`)
  console.log(`  videos               ${decided.length}`)
  console.log(`  exact title match    ${count('exact')}   (topic ${count('exact', 'topic')} · main ${count('exact', 'main')})`)
  console.log(`  near match           ${count('near')}`)
  console.log(`  no match at all      ${count('unmatched')}`)
  console.log(`  cached to            .seed-cache/youtube.json`)
  console.log('─'.repeat(78))

  for (const group of ['near', 'unmatched']) {
    const rows = decided.filter((v) => v.verdict === group)
    if (rows.length === 0) continue
    console.log(`\n  ${group.toUpperCase()}\n`)
    for (const row of rows.slice(0, 30)) {
      const title = row.title.length > 46 ? `${row.title.slice(0, 45)}…` : row.title
      console.log(
        `   ${row.channel.padEnd(6)} ${title.padEnd(46)} ${(row.candidates ?? []).map((c) => c.title).join(' / ')}`
      )
    }
    if (rows.length > 30) console.log(`   … and ${rows.length - 30} more`)
  }
  console.log()
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`)
  process.exitCode = 1
})
