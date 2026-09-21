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
 * This file does the deterministic half and stops: it reports what matched on
 * a normalised title, what did not, and leaves the judgement calls for the
 * pass that follows. Nothing here decides a merge.
 */
import { pool, request } from '@main/core/net'
import { titleKey } from '../normalise'
import type { SpotifyHarvest } from './spotify'
import type { SeedReporter } from '../reporter'

export interface SoundcloudTrack {
  url: string
  title: string
  artwork: string
  description: string
  found: boolean
  verdict: 'exact' | 'near' | 'ambiguous' | 'unmatched' | 'unread'
  matchTrackId: string
  matchTitle: string
  reason: string
}

export interface SoundcloudHarvest {
  tracks: SoundcloudTrack[]
  warnings: string[]
}

export interface SoundcloudOptions {
  /** One URL per line, as pasted. Anything that is not a track URL is ignored. */
  urls: string
  harvest: SpotifyHarvest
  reporter: SeedReporter
}

export async function harvestSoundcloud({
  urls,
  harvest,
  reporter
}: SoundcloudOptions): Promise<SoundcloudHarvest> {
  const list = urls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('https://soundcloud.com/'))

  if (list.length === 0) {
    reporter.warn('soundcloud', 'skipped — no track links were given')
    return { tracks: [], warnings: ['SoundCloud was skipped — no track links were given.'] }
  }

  reporter.step(
    'soundcloud',
    `${list.length} links via oEmbed — no API key exists for an Artist account, and no ISRC comes back`
  )

  let done = 0
  const read = await pool(list, 4, async (url) => {
    const base = {
      url,
      title: '',
      artwork: '',
      description: '',
      matchTrackId: '',
      matchTitle: '',
      reason: ''
    }
    try {
      const data = await request<{ title?: string; thumbnail_url?: string; description?: string }>(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
      )
      done += 1
      if (done <= 4) reporter.response('soundcloud', `"${(data.title ?? '').slice(0, 70)}"`)
      reporter.progress('SoundCloud, by title', done, list.length)
      return {
        ...base,
        // oEmbed titles read "Title by Artist"; the artist is already known.
        title: (data.title ?? '').replace(/\s+by\s+[^,]*$/i, '').trim(),
        artwork: data.thumbnail_url ?? '',
        description: (data.description ?? '').slice(0, 400),
        found: true
      }
    } catch (error) {
      done += 1
      reporter.warn('soundcloud', `${url} — ${(error as Error).message}`)
      reporter.progress('SoundCloud, by title', done, list.length)
      return { ...base, found: false, reason: (error as Error).message }
    }
  })

  // ----------------------------------------------- against the Spotify spine
  const known = harvest.releases.flatMap((release) =>
    release.tracks.map((track) => ({ id: track.id, title: track.title, key: titleKey(track.title) }))
  )

  const tracks: SoundcloudTrack[] = read.map((track) => {
    if (!track.found) return { ...track, verdict: 'unread' }

    const key = titleKey(track.title)
    const exact = known.filter((entry) => entry.key === key)
    if (exact.length === 1) {
      return { ...track, verdict: 'exact', matchTrackId: exact[0].id, matchTitle: exact[0].title }
    }
    if (exact.length > 1) return { ...track, verdict: 'ambiguous' }

    /*
     * A shortlist, not a decision.
     *
     * One title containing the other catches `For The Record` against `For The
     * Record (Radio Edit)` — which is a *different recording* of the same song
     * and must not be merged automatically. It is exactly the case the
     * adjudicator is for, so this only marks it as near.
     */
    const near = known.filter((entry) => entry.key.includes(key) || key.includes(entry.key))
    return { ...track, verdict: near.length > 0 ? 'near' : 'unmatched' }
  })

  const exact = tracks.filter((t) => t.verdict === 'exact').length
  reporter.note(
    'soundcloud',
    `${tracks.filter((t) => t.found).length} read · ${exact} matched a released recording · ${tracks.length - exact} for the adjudicator`
  )

  return { tracks, warnings: [] }
}
