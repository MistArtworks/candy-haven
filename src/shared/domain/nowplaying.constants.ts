import type { NowPlayingConfig, NowPlayingState, NowPlayingTrack } from './nowplaying'

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

export const NOW_PLAYING_ACCENTS = ['gold', 'crimson'] as const
export type NowPlayingAccent = (typeof NOW_PLAYING_ACCENTS)[number]

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

// ------------------------------------------------------------------ factories

export function createDefaultNowPlayingConfig(): NowPlayingConfig {
  return {
    style: 'plate',
    label: 'NOW TRANSMITTING',
    accent: 'gold',
    showLabel: true,
    showCover: true,
    showAlbum: true,
    showTimeline: true,
    /** Remaining reads better on a broadcast than elapsed: it answers "how long left". */
    showRemaining: false,
    showExplicit: true,
    marquee: true,
    spinCover: true,
    hideWhenIdle: true,
    pollSeconds: POLL_DEFAULT_SECONDS
  }
}

export function createNowPlayingState(): NowPlayingState {
  return {
    link: { state: 'unconfigured', message: 'No client id has been entered.', account: null },
    track: null,
    config: createDefaultNowPlayingConfig(),
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
