import type {
  NowPlayingConfig,
  NowPlayingSource,
  NowPlayingState,
  NowPlayingTrack
} from './nowplaying'

/**
 * Zod-free half of the now-playing domain — see boot.constants.ts for the split.
 *
 * The important piece here is `trackProgressAt`. Spotify is polled every few
 * seconds, but the timeline has to move smoothly on a broadcast, so the sample
 * carries the instant it was taken and both surfaces interpolate forward from
 * it locally. Same approach as the countdown timers: state is declarative and
 * nothing is pushed per frame.
 */

// -------------------------------------------------------------------- styles

/**
 * The four presentations.
 *
 * All four are the same information in the same five materials; they differ in
 * shape, so one can be dropped into a corner, a lower third, a sidebar or a
 * full plate without re-laying anything out.
 */
export const NOW_PLAYING_STYLES = ['plate', 'monolith', 'strip', 'disc'] as const
export type NowPlayingStyle = (typeof NOW_PLAYING_STYLES)[number]

export const NOW_PLAYING_STYLE_LABEL: Record<NowPlayingStyle, string> = {
  plate: 'PLATE — cover slab left, record right, timeline beneath',
  monolith: 'MONOLITH — portrait column, cover above the record',
  strip: 'STRIP — thin lower third, hairline timeline',
  disc: 'DISC — cover as a turning record inside a timeline ring'
}

/**
 * What carries the timeline and the label.
 *
 * Two house materials and an escape hatch. `custom` reads `accentHex`, stored
 * exactly as picked — see the field's own note for why that licence exists.
 */
export const NOW_PLAYING_ACCENTS = ['gold', 'crimson', 'custom'] as const
export type NowPlayingAccent = (typeof NOW_PLAYING_ACCENTS)[number]

export const NOW_PLAYING_ACCENT_LABEL: Record<NowPlayingAccent, string> = {
  gold: 'GOLD',
  crimson: 'CRIMSON',
  custom: 'CUSTOM'
}

/** Recommended source dimensions per style, quoted in the console. */
export const NOW_PLAYING_CANVAS: Record<NowPlayingStyle, { width: number; height: number }> = {
  plate: { width: 900, height: 260 },
  monolith: { width: 420, height: 640 },
  strip: { width: 1100, height: 120 },
  disc: { width: 520, height: 520 }
}

// -------------------------------------------------------------------- polling

export const POLL_MIN_SECONDS = 2
export const POLL_MAX_SECONDS = 15
export const POLL_DEFAULT_SECONDS = 3

/**
 * How long a track sample stays trustworthy without a refresh.
 *
 * If polling stalls — network drop, token trouble — the interpolated timeline
 * would otherwise keep gliding along a track that may have ended minutes ago.
 * Past this the surfaces treat the sample as stale rather than confidently
 * animating fiction.
 */
export const SAMPLE_STALE_MS = 30_000

// ------------------------------------------------------------------ progress

/**
 * Where the playhead is now, interpolated from the last sample.
 *
 * Advances only while the sample said playback was running: a paused track
 * holds its position, which is what makes pausing in Spotify visibly pause the
 * overlay rather than letting the bar drift on. Clamped to the track length so
 * a late poll cannot overshoot the end.
 */
export function trackProgressAt(track: NowPlayingTrack, now: number): number {
  const drift = track.isPlaying ? Math.max(now - track.sampledAt, 0) : 0
  return Math.min(track.progressMs + drift, track.durationMs)
}

export function trackProgressRatio(track: NowPlayingTrack, now: number): number {
  if (track.durationMs <= 0) return 0
  return Math.min(Math.max(trackProgressAt(track, now) / track.durationMs, 0), 1)
}

/** True when polling has stalled and the sample can no longer be trusted. */
export function isSampleStale(track: NowPlayingTrack, now: number): boolean {
  return now - track.sampledAt > SAMPLE_STALE_MS
}

/** `M:SS`, the convention every music player uses. Not zero-padded on minutes. */
export function formatTrackTime(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** `Artist A, Artist B` — Spotify returns them ordered by billing. */
export function formatArtists(artists: readonly string[]): string {
  return artists.join(', ')
}

// -------------------------------------------------------------------- presets

/**
 * One preset per presentation, and that is the whole list.
 *
 * The four styles are the same information in four shapes — a plate for a lower
 * band, a monolith for a sidebar, a strip for a thin third, a disc for a corner
 * — and the operator wants all four *at once*, as four browser sources, so a
 * scene can be built around whichever shape fits its layout. Before this there
 * was one source and a style dropdown, which meant choosing a shape for every
 * scene at the same time.
 *
 * So the kit ships the four made, and a preset is only a starting point:
 * nothing downstream remembers which one a source came from, so editing one or
 * adding a fifth costs nothing.
 */
export interface NowPlayingPreset {
  id: string
  /** As it appears in the console. */
  label: string
  /** What the shape is for, in a line. */
  note: string
  config: Partial<NowPlayingConfig>
}

export const NOW_PLAYING_PRESETS: readonly NowPlayingPreset[] = [
  {
    id: 'plate',
    label: 'Plate',
    note: 'Cover slab left, record right, timeline beneath. The lower band.',
    config: { style: 'plate' }
  },
  {
    id: 'monolith',
    label: 'Monolith',
    note: 'Portrait column, cover above the record. For a sidebar.',
    config: { style: 'monolith' }
  },
  {
    id: 'strip',
    label: 'Strip',
    note: 'Thin lower third on a hairline timeline. Takes almost no height.',
    config: { style: 'strip', showAlbum: false }
  },
  {
    id: 'disc',
    label: 'Disc',
    note: 'Cover as a turning record inside a timeline ring. For a corner.',
    config: { style: 'disc', spinCover: true }
  }
] as const

export function findNowPlayingPreset(id: string): NowPlayingPreset | undefined {
  return NOW_PLAYING_PRESETS.find((preset) => preset.id === id)
}

// -------------------------------------------------------------------- sources

/**
 * A URL segment from a name.
 *
 * Lowercase, alphanumerics and single hyphens. Not reversible and not meant to
 * be — the slug is an address, and the name is what the operator reads.
 */
export function slugifySourceName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug || 'source'
}

/** `slug`, or `slug-2`, `slug-3`… until it is not taken. */
export function uniqueSourceSlug(taken: readonly string[], desired: string): string {
  const base = slugifySourceName(desired)
  if (!taken.includes(base)) return base

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.includes(candidate)) return candidate
  }

  // Unreachable in practice; a timestamp beats throwing mid-broadcast.
  return `${base}-${Date.now()}`
}

/** A source seeded from a preset, ready to be added to the list. */
export function sourceFromPreset(preset: NowPlayingPreset): NowPlayingSource {
  return {
    id: `nowplaying:${preset.id}`,
    slug: preset.id,
    name: preset.label,
    note: preset.note,
    config: { ...createDefaultNowPlayingConfig(), ...preset.config }
  }
}

/**
 * The source a browser page loaded at `?source=<slug>` should draw.
 *
 * Falls back to the first rather than to nothing: a source pointed at the bare
 * document, or at a slug that has since been renamed away, should render
 * something recognisable instead of a blank scene mid-broadcast.
 */
export function pickNowPlayingSource(
  sources: readonly NowPlayingSource[],
  slug: string | null
): NowPlayingSource | null {
  if (sources.length === 0) return null
  if (!slug) return sources[0]

  return sources.find((source) => source.slug === slug) ?? sources[0]
}

/** The address to paste into OBS for one source. */
export function nowPlayingSourceUrl(root: string, slug: string): string {
  const base = root.endsWith('/') ? root.slice(0, -1) : root
  return `${base}/transmission?source=${encodeURIComponent(slug)}`
}

// ------------------------------------------------------------------ factories

export function createDefaultNowPlayingConfig(): NowPlayingConfig {
  return {
    style: 'plate',
    label: 'NOW TRANSMITTING',
    accent: 'gold',
    accentHex: '#c8963c',
    showLabel: true,
    showCover: true,
    showAlbum: true,
    showTimeline: true,
    /** Remaining reads better on a broadcast than elapsed: it answers "how long left". */
    showRemaining: false,
    showExplicit: true,
    marquee: true,
    spinCover: true,
    hideWhenIdle: true
  }
}

/**
 * The four shipped sources: one per presentation.
 *
 * PLATE is first, and therefore what the bare `/transmission` resolves to — a
 * scene built before sources existed keeps drawing what it drew.
 */
export function createDefaultNowPlayingSources(): NowPlayingSource[] {
  return NOW_PLAYING_PRESETS.map(sourceFromPreset)
}

export function createNowPlayingState(): NowPlayingState {
  return {
    link: { state: 'unconfigured', message: 'No client id has been entered.', account: null },
    track: null,
    sources: createDefaultNowPlayingSources(),
    pollSeconds: POLL_DEFAULT_SECONDS,
    revision: 0
  }
}

export function clampPollSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return POLL_DEFAULT_SECONDS
  return Math.min(Math.max(Math.round(seconds), POLL_MIN_SECONDS), POLL_MAX_SECONDS)
}

// --------------------------------------------------------------------- oauth

/** Read-only scopes. Nothing here can alter the operator's playback. */
export const SPOTIFY_SCOPES = ['user-read-currently-playing', 'user-read-playback-state'] as const

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

/** Path the overlay server answers the OAuth redirect on. */
export const SPOTIFY_CALLBACK_PATH = '/spotify/callback'

/**
 * The redirect URI the operator must register in their Spotify dashboard.
 *
 * Built from the live server port rather than assumed, because the overlay
 * server scans upward when its configured port is taken — and a redirect URI
 * that does not match the registered one to the character fails the exchange
 * with an unhelpful error. The console shows this string for copying.
 */
export function spotifyRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}${SPOTIFY_CALLBACK_PATH}`
}
