/**
 * Read both YouTube channels, and see which uploads we already know.
 *
 * ## Two channels, and they are not the same thing
 *
 * The main channel is the one he posts to — videos, promo clips, whatever he
 * decided to put up. The Topic channel is the one YouTube generates for a
 * distributed artist, and it holds an **Art Track** per released recording:
 * auto-created, one per song, mirroring what went to the stores.
 *
 * The Topic channel is therefore the one that lines up with the Spotify spine,
 * and the main channel is where the YouTube-only material lives. Reading both
 * and labelling which is which is what lets the plan tell an exclusive from a
 * duplicate.
 *
 * ## YouTube never creates a record on its own say-so
 *
 * It contributes **links to records Spotify already proved**, and candidates
 * for the adjudicator. The channel's Releases tab was found listing a record
 * belonging to a different act of the same name, so YouTube's own attribution
 * is not reliable enough to mint a discography entry from — and neither is a
 * title.
 */
import { request } from '@main/core/net'
import { titleKey } from '../normalise'
import type { SpotifyHarvest } from './spotify'

const API = 'https://www.googleapis.com/youtube/v3'

export interface YoutubeVideo {
  videoId: string
  title: string
  publishedAt: string
  url: string
  /** `main` or `topic` — see the header. */
  channel: string
  verdict: 'exact' | 'near' | 'unmatched'
  /** The Spotify track id an exact match resolved to. */
  matchTrackId: string
  matchTitle: string
}

export interface YoutubeHarvest {
  videos: YoutubeVideo[]
  channels: { kind: string; title: string; count: number }[]
  warnings: string[]
}

/**
 * A channel reference in any of the forms YouTube hands out, resolved to an id.
 *
 * `/channel/UC…` carries the id already. `@handle` needs `forHandle`, which is
 * one unit of quota and exact — a search would cost a hundred and could return
 * somebody else's channel.
 */
async function resolveChannel(
  url: string,
  key: string
): Promise<{ id: string; title: string; uploads: string }> {
  const direct = /\/channel\/(UC[\w-]+)/.exec(url || '')
  const handle = (/@([\w.-]+)/.exec(url || '')?.[1] ?? '').trim()
  const query = direct ? `id=${direct[1]}` : `forHandle=${encodeURIComponent(handle)}`

  const payload = await request<{
    items?: {
      id: string
      snippet?: { title?: string }
      contentDetails?: { relatedPlaylists?: { uploads?: string } }
    }[]
  }>(`${API}/channels?part=snippet,contentDetails&${query}&key=${key}`)

  const channel = payload.items?.[0]
  if (!channel) throw new Error(`no channel at ${url}`)

  return {
    id: channel.id,
    title: channel.snippet?.title ?? '',
    uploads: channel.contentDetails?.relatedPlaylists?.uploads ?? ''
  }
}

/** Every video on a channel's uploads playlist, fifty at a time. */
async function uploads(
  playlistId: string,
  key: string
): Promise<{ videoId: string; title: string; publishedAt: string; url: string }[]> {
  const items: { videoId: string; title: string; publishedAt: string; url: string }[] = []
  let pageToken = ''

  do {
    const payload = await request<{
      items?: {
        snippet?: { title?: string }
        contentDetails?: { videoId?: string; videoPublishedAt?: string }
      }[]
      nextPageToken?: string
    }>(
      `${API}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${key}${
        pageToken ? `&pageToken=${pageToken}` : ''
      }`
    )

    for (const item of payload.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? ''
      items.push({
        videoId,
        title: item.snippet?.title ?? '',
        publishedAt: (item.contentDetails?.videoPublishedAt ?? '').slice(0, 10),
        url: `https://www.youtube.com/watch?v=${videoId}`
      })
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)

  return items
}

export interface YoutubeOptions {
  apiKey: string
  channelUrl: string
  topicChannelUrl: string
  harvest: SpotifyHarvest
  report: (note: string, done: number, total: number) => void
}

export async function harvestYoutube({
  apiKey,
  channelUrl,
  topicChannelUrl,
  harvest,
  report
}: YoutubeOptions): Promise<YoutubeHarvest> {
  const warnings: string[] = []
  if (!apiKey) return { videos: [], channels: [], warnings: ['YouTube was skipped — no API key.'] }

  const wanted = [
    { kind: 'main', url: channelUrl },
    { kind: 'topic', url: topicChannelUrl }
  ].filter((source) => source.url.trim())

  const gathered: { kind: string; title: string; count: number }[] = []
  const seenChannels = new Set<string>()
  const all: { videoId: string; title: string; publishedAt: string; url: string; channel: string }[] =
    []

  for (const source of wanted) {
    report(`resolving the ${source.kind} channel`, 0, 0)
    try {
      const channel = await resolveChannel(source.url, apiKey)

      /*
       * The same channel twice is the trap this guards.
       *
       * `<Artist> - Topic` is a *different* channel from the one the artist
       * posts to, and the two are easy to confuse — the first run had the main
       * channel's id in both fields, read its promo uploads twice, and found
       * no music at all. Skipping the duplicate is quieter than reporting
       * forty-six videos that are twenty-three.
       */
      if (seenChannels.has(channel.id)) {
        warnings.push(
          `The ${source.kind} channel is the same channel as the other one, so it was read once.`
        )
        continue
      }
      seenChannels.add(channel.id)

      const videos = channel.uploads ? await uploads(channel.uploads, apiKey) : []
      for (const video of videos) all.push({ ...video, channel: source.kind })
      gathered.push({ kind: source.kind, title: channel.title, count: videos.length })
      report(`read ${channel.title}`, all.length, all.length)
    } catch (error) {
      warnings.push(`The ${source.kind} YouTube channel was skipped — ${(error as Error).message}`)
    }
  }

  // ----------------------------------------------- against the Spotify spine
  const known = harvest.releases.flatMap((release) =>
    release.tracks.map((track) => ({ id: track.id, title: track.title, key: titleKey(track.title) }))
  )

  const videos: YoutubeVideo[] = all.map((video) => {
    /*
     * Topic channels title an Art Track as the song and nothing else, so an
     * exact match is the norm there. The main channel titles things the way a
     * person does — "Candy Heist - Song (Official Video)" — so the same
     * normalisation is applied to both and the leftovers go to the adjudicator
     * rather than to a longer list of suffixes to strip.
     */
    const key = titleKey(video.title)
    const exact = known.filter((entry) => entry.key === key)
    if (exact.length === 1) {
      return {
        ...video,
        verdict: 'exact',
        matchTrackId: exact[0].id,
        matchTitle: exact[0].title
      }
    }

    const near = known.filter((entry) => entry.key.includes(key) || key.includes(entry.key))
    return {
      ...video,
      verdict: near.length > 0 ? 'near' : 'unmatched',
      matchTrackId: '',
      matchTitle: ''
    }
  })

  return { videos, channels: gathered, warnings }
}
