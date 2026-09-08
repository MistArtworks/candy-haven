import { z } from 'zod'
import {
  NOW_PLAYING_ACCENTS,
  NOW_PLAYING_STYLES,
  POLL_DEFAULT_SECONDS,
  POLL_MAX_SECONDS,
  POLL_MIN_SECONDS
} from './nowplaying.constants'

/**
 * Schema half of the now-playing domain — live Spotify playback, served to OBS.
 *
 * As with the rite and the timers: **every field carries a default**, because
 * the config is persisted. And the patch schema below is built by unwrapping
 * those defaults rather than with `.partial()`, which is not sparse when the
 * fields have defaults — see `NowPlayingConfigPatchSchema`.
 */

export const NowPlayingStyleSchema = z.enum(NOW_PLAYING_STYLES)
export type NowPlayingStyle = z.infer<typeof NowPlayingStyleSchema>

export const NowPlayingAccentSchema = z.enum(NOW_PLAYING_ACCENTS)
export type NowPlayingAccent = z.infer<typeof NowPlayingAccentSchema>

/**
 * One sample of what Spotify says is playing.
 *
 * `progressMs` and `sampledAt` travel together on purpose: the pair is what
 * lets both surfaces interpolate a smooth playhead between polls instead of
 * stepping the timeline every few seconds.
 */
export const NowPlayingTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.array(z.string()).default([]),
  album: z.string().default(''),
  durationMs: z.number().int().min(0).default(0),
  /** Playhead at the moment the sample was taken. */
  progressMs: z.number().int().min(0).default(0),
  /** Epoch ms of the sample. Host and overlay share a clock. */
  sampledAt: z.number().default(0),
  isPlaying: z.boolean().default(false),
  /**
   * Cover art as a data URL, fetched and inlined by the main process.
   *
   * Not the Spotify CDN URL. The overlay's CSP is `img-src 'self' data:` and
   * `connect-src 'self'`, and it stays that way: a browser source sitting in a
   * scene has no business reaching out to the internet, and inlining also means
   * the art is already in hand when the frame is drawn rather than popping in a
   * few hundred milliseconds late.
   */
  coverDataUrl: z.string().nullable().default(null),
  explicit: z.boolean().default(false),
  /** Operator-facing link. Never rendered on the overlay. */
  url: z.string().nullable().default(null)
})
export type NowPlayingTrack = z.infer<typeof NowPlayingTrackSchema>

export const SpotifyLinkStateSchema = z.enum([
  /** No client id entered yet. */
  'unconfigured',
  'disconnected',
  /** Waiting for the operator to authorise in their browser. */
  'linking',
  'connected',
  'error'
])
export type SpotifyLinkState = z.infer<typeof SpotifyLinkStateSchema>

export const SpotifyLinkSchema = z.object({
  state: SpotifyLinkStateSchema.default('unconfigured'),
  /** Operator-facing description of the current state. */
  message: z.string().default(''),
  /** Display name of the linked account, once known. */
  account: z.string().nullable().default(null)
})
export type SpotifyLink = z.infer<typeof SpotifyLinkSchema>

export const NowPlayingConfigSchema = z.object({
  style: NowPlayingStyleSchema.default('plate'),
  label: z.string().max(48).default('NOW TRANSMITTING'),
  /** Which material carries the timeline and the label. */
  accent: NowPlayingAccentSchema.default('gold'),
  showLabel: z.boolean().default(true),
  showCover: z.boolean().default(true),
  showAlbum: z.boolean().default(true),
  showTimeline: z.boolean().default(true),
  /** Count down to the end of the track rather than up from its start. */
  showRemaining: z.boolean().default(false),
  showExplicit: z.boolean().default(true),
  /** Scroll a title too long for its cell instead of truncating it. */
  marquee: z.boolean().default(true),
  /** Turn the cover on the DISC style. */
  spinCover: z.boolean().default(true),
  /** Fade the overlay out entirely when nothing is playing. */
  hideWhenIdle: z.boolean().default(true),
  pollSeconds: z
    .number()
    .int()
    .min(POLL_MIN_SECONDS)
    .max(POLL_MAX_SECONDS)
    .default(POLL_DEFAULT_SECONDS)
})
export type NowPlayingConfig = z.infer<typeof NowPlayingConfigSchema>

export const NowPlayingStateSchema = z.object({
  link: SpotifyLinkSchema.prefault({}),
  track: NowPlayingTrackSchema.nullable().default(null),
  config: NowPlayingConfigSchema.prefault({}),
  revision: z.number().int().min(0).default(0)
})
export type NowPlayingState = z.infer<typeof NowPlayingStateSchema>

// -------------------------------------------------------------------- patches

/**
 * A genuinely sparse patch.
 *
 * `.partial()` would not be: every field carries a `.default()`, and zod
 * applies those for absent keys through `.partial()`, so a patch would arrive
 * carrying all thirteen fields and writing one option would reset the other
 * twelve. Unwrapping each default before making it optional is what keeps an
 * absent key absent.
 */
type NowPlayingConfigPatchShape = {
  [K in keyof NowPlayingConfig]: z.ZodOptional<z.ZodType<NowPlayingConfig[K]>>
}

const nowPlayingConfigPatchShape = Object.fromEntries(
  Object.entries(NowPlayingConfigSchema.shape).map(([key, field]) => [
    key,
    field.unwrap().optional()
  ])
) as unknown as NowPlayingConfigPatchShape

export const NowPlayingConfigPatchSchema = z.object(nowPlayingConfigPatchShape)
export type NowPlayingConfigPatch = z.infer<typeof NowPlayingConfigPatchSchema>

/** What the console needs to walk the operator through linking an account. */
export const SpotifySetupSchema = z.object({
  /** Whether a client id has been saved. The id itself is not sent back. */
  hasClientId: z.boolean(),
  /** Exact string to register in the Spotify dashboard. Null if not serving. */
  redirectUri: z.string().nullable()
})
export type SpotifySetup = z.infer<typeof SpotifySetupSchema>
