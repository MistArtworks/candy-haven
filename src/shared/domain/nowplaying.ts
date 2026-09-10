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
  /**
   * The colour `accent: 'custom'` means.
   *
   * Stored exactly as picked, with no clamping toward the house palette — the
   * same licence the ARCHIVE's folder colours were granted, and for a related
   * reason: a source tuned to a genre is the operator's own index of their
   * scenes, and forcing every one of them into crimson-and-gold would make
   * twenty sources look like one.
   *
   * Ignored unless `accent` is `custom`, so switching back to a house material
   * and switching away again does not lose the colour.
   */
  accentHex: z.string().default('#c8963c'),
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
  hideWhenIdle: z.boolean().default(true)
})
export type NowPlayingConfig = z.infer<typeof NowPlayingConfigSchema>

/**
 * One browser source: a name, an address, and the settings drawn at it.
 *
 * There used to be a single config with a style dropdown, which meant the four
 * presentations were mutually exclusive: choosing PLATE for one scene chose it
 * for every scene. The operator wants all four available at once, so a scene
 * can be built around whichever shape fits its layout — so a source is now a
 * first-class thing with its own URL, and the four ship already made.
 *
 * They all render the *same* playback. There is one Spotify poller and one
 * `track` on the state; a source decides only how it is drawn. That is why
 * `pollSeconds` moved up to the state: four sources must not mean four
 * different opinions about how often to ask Spotify what is playing.
 */
export const NowPlayingSourceSchema = z.object({
  id: z.string().default(''),
  /**
   * URL segment, and the source's identity to OBS.
   *
   * Separate from `id` because it is what the operator pasted into a browser
   * source, and renaming must not silently repoint a scene at nothing. The
   * service keeps it stable across renames for exactly that reason.
   */
  slug: z.string().default(''),
  name: z.string().max(48).default('Source'),
  /** What this source is for — the vibe it was tuned to. Console only. */
  note: z.string().max(120).default(''),
  config: NowPlayingConfigSchema.prefault({})
})
export type NowPlayingSource = z.infer<typeof NowPlayingSourceSchema>

export const NowPlayingStateSchema = z.object({
  link: SpotifyLinkSchema.prefault({}),
  track: NowPlayingTrackSchema.nullable().default(null),
  /** Every configured browser source. Never empty — see `createNowPlayingState`. */
  sources: z.array(NowPlayingSourceSchema).default([]),
  /** How often Spotify is asked. One poller, so one setting, held here. */
  pollSeconds: z
    .number()
    .int()
    .min(POLL_MIN_SECONDS)
    .max(POLL_MAX_SECONDS)
    .default(POLL_DEFAULT_SECONDS),
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

/**
 * Adding a source.
 *
 * A preset is a starting point, not a type: what it seeds is a plain config the
 * operator edits afterwards, so nothing downstream has to know which preset a
 * source came from. Absent means the house default.
 */
export const NowPlayingSourceDraftSchema = z.object({
  presetId: z.string().nullable().default(null),
  name: z.string().max(48).default('')
})
export type NowPlayingSourceDraft = z.infer<typeof NowPlayingSourceDraftSchema>

/** Renaming, and the note beside it. Both together: one edit, one publish. */
export const NowPlayingSourceRenameSchema = z.object({
  id: z.string(),
  name: z.string().max(48),
  note: z.string().max(120).default('')
})
export type NowPlayingSourceRename = z.infer<typeof NowPlayingSourceRenameSchema>

/** A config patch, addressed to one source. */
export const NowPlayingSourceConfigSchema = z.object({
  id: z.string(),
  patch: NowPlayingConfigPatchSchema
})
export type NowPlayingSourceConfig = z.infer<typeof NowPlayingSourceConfigSchema>

/** What the console needs to walk the operator through linking an account. */
export const SpotifySetupSchema = z.object({
  /** Whether a client id has been saved. The id itself is not sent back. */
  hasClientId: z.boolean(),
  /** Exact string to register in the Spotify dashboard. Null if not serving. */
  redirectUri: z.string().nullable()
})
export type SpotifySetup = z.infer<typeof SpotifySetupSchema>
