import { z } from 'zod'
import { sparseShape } from './patch'
import { DEFAULT_ARCHIVE_PORT, DEFAULT_OVERLAY_PORT } from '../constants'

/**
 * Persisted operator settings. Every field carries a default so a missing or
 * partially corrupt settings file still yields a usable configuration.
 */

export const MotionPreferenceSchema = z.enum(['full', 'reduced', 'off'])
export type MotionPreference = z.infer<typeof MotionPreferenceSchema>

export const AccentSchema = z.enum(['crimson', 'gold'])
export type Accent = z.infer<typeof AccentSchema>

export const UpdateChannelSchema = z.enum(['latest', 'beta'])
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>

export const AppearanceSettingsSchema = z.object({
  motion: MotionPreferenceSchema.default('full'),
  accent: AccentSchema.default('crimson'),
  /**
   * How large the whole interface is drawn, 0.8–2.0. Windows' display scaling,
   * for this one window.
   *
   * Applied as Electron's zoom factor rather than as a CSS variable, and the
   * distinction matters. A first attempt scaled the root font size, which
   * reaches anything sized in `rem()` — but the two mixins that draw almost all
   * of this interface, `label()` and `readout()`, take a raw pixel size. Body
   * copy grew and every institutional label and mono readout did not, which
   * looked like the setting half working. Converting every call site was the
   * alternative; scaling the frame gets type, spacing, borders and artwork
   * together, for one line.
   */
  uiScale: z.number().min(0.8).max(2).default(1),
  /** Film grain / scanline intensity, 0..1. */
  grain: z.number().min(0).max(1).default(0.5),
  /** Skip the boot cinematic once the sequence itself has completed. */
  fastBoot: z.boolean().default(false)
})
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>

export const WorkspaceSettingsSchema = z.object({
  /**
   * The one root the ARCHIVE builds in. Required before the department opens.
   *
   * Everything the app creates lives in a single `Candy Haven` directory inside
   * this root: the genre tree, every project it provisions, and the RELEASES
   * folder. Promoted from an optional hint to the primary setting when the
   * ARCHIVE stopped discovering structure and started making it — there is no
   * sensible "first of several" answer when the question is where to write.
   */
  filingRoot: z.string().nullable().default(null),
  /**
   * The Ableton set copied into every new project.
   *
   * Required alongside the root, on the operator's instruction: a project
   * scaffolded without a set is a set of empty folders, and the point of
   * provisioning is that the work can start immediately.
   */
  projectTemplatePath: z.string().nullable().default(null),
  /**
   * Extra locations scanned for Ableton projects, outside the filing root.
   *
   * Read-only as far as the app is concerned — nothing is ever created here.
   * They exist so sets scattered across other drives can be found and then
   * *filed into* the tree, which is the only way a project leaves this list.
   *
   * Renamed from `abletonProjectRoots`, which described the old model where
   * every root was equal and the tree happened to live in whichever sorted
   * first.
   */
  satelliteRoots: z.array(z.string()).default([]),
  /**
   * Re-index the roots in the background once the console opens.
   *
   * Cheap by default: the directory walk is a few tens of milliseconds, and a
   * set whose file has not changed is served from its stored analysis rather
   * than decompressed again.
   */
  scanOnLaunch: z.boolean().default(true),
  /** Directory watched for stream overlay assets. */
  overlayAssetPath: z.string().nullable().default(null),
  /**
   * Port the overlay server listens on for OBS browser sources.
   *
   * Persisted because the operator pastes the resulting URL into OBS once and
   * expects it to keep working across restarts.
   */
  overlayPort: z.number().int().min(1024).max(65535).default(DEFAULT_OVERLAY_PORT),
  /** Start the overlay server during boot. */
  overlayAutoStart: z.boolean().default(true),
  /**
   * Lifts the configuration gates on broadcast features, and enables their
   * simulators.
   *
   * Features that need an external service refuse to run without it — THE
   * CONCORD will not open a poll with no Twitch channel set, because a poll that
   * silently counts nothing has already cost the operator the moment they asked
   * an audience to vote. Test mode is the deliberate escape hatch: it says "I
   * know nothing is connected, let me drive this anyway".
   *
   * A persisted setting rather than a build flag, so a packaged console can be
   * rehearsed against before a stream. Sited in `workspace` rather than in its
   * own section because it describes how the operator's workspace behaves, and a
   * section holding one boolean is worse than a comment saying where it lives.
   */
  testMode: z.boolean().default(false)
})
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

export const ArchiveSettingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(DEFAULT_ARCHIVE_PORT),
  /** Start the embedded daemon during boot. Disable to attach to an external instance. */
  autoStart: z.boolean().default(true),
  /** Explicit mongod path; overrides discovery when set. */
  executablePath: z.string().nullable().default(null),
  /** Connection string used when autoStart is false. */
  externalUri: z.string().nullable().default(null)
})
export type ArchiveSettings = z.infer<typeof ArchiveSettingsSchema>

export const UpdateSettingsSchema = z.object({
  channel: UpdateChannelSchema.default('latest'),
  autoCheck: z.boolean().default(true),
  /**
   * Fetch an available update without asking.
   *
   * On by default, which is the unusual choice and a deliberate one: this ships
   * continuously from GitHub Releases and is expected to keep itself current
   * unattended. Left off, the app notices a new version and then waits at a
   * prompt nobody is looking at, which is the same as not updating.
   *
   * The cost is a ~110 MB download the operator did not initiate. Acceptable
   * here because updates are frequent and the machine is the operator's own;
   * it would not be acceptable in something distributed widely.
   */
  autoDownload: z.boolean().default(true)
})
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>

/**
 * Third-party identities the operator supplies.
 *
 * Nothing secret lives here. A PKCE public client id is designed to be visible
 * and a channel name is public by definition; the Spotify refresh token that the
 * client id earns is a real credential and is kept encrypted outside this file
 * entirely — see services/overlay/spotify.tokens.ts.
 *
 * The Twitch channel needs no counterpart, because chat is read anonymously:
 * there is no token to protect. See services/chat/twitch-chat.service.ts.
 */
export const IntegrationSettingsSchema = z.object({
  spotifyClientId: z.string().max(128).default(''),
  /**
   * Channel whose chat is read for votes and, later, filed petitions.
   *
   * Stored as the operator typed it and normalised on use rather than on write,
   * so a pasted URL still shows in the field as what they pasted instead of
   * being silently rewritten under the cursor.
   */
  twitchChannel: z.string().max(128).default('')
})
export type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>

export const SettingsSchema = z.object({
  version: z.number().int().default(1),
  appearance: AppearanceSettingsSchema.prefault({}),
  workspace: WorkspaceSettingsSchema.prefault({}),
  archive: ArchiveSettingsSchema.prefault({}),
  updates: UpdateSettingsSchema.prefault({}),
  integrations: IntegrationSettingsSchema.prefault({})
})
export type Settings = z.infer<typeof SettingsSchema>

/**
 * Sparse patch accepted by `settings:update`.
 *
 * **Not `.partial()`** — see patch.ts for why that is a data-loss bug rather
 * than a style preference. Every field here carries a `.default()`, so
 * `.partial()` re-materialises the whole section for a one-field write and the
 * merge then writes those defaults over the operator's values. It cost a saved
 * Spotify client id before it was caught, and would have taken the scanned
 * Ableton roots with the next overlay-port change.
 */
export const SettingsPatchSchema = z.object({
  appearance: z.object(sparseShape(AppearanceSettingsSchema.shape)).optional(),
  workspace: z.object(sparseShape(WorkspaceSettingsSchema.shape)).optional(),
  archive: z.object(sparseShape(ArchiveSettingsSchema.shape)).optional(),
  updates: z.object(sparseShape(UpdateSettingsSchema.shape)).optional(),
  integrations: z.object(sparseShape(IntegrationSettingsSchema.shape)).optional()
})

/**
 * Declared rather than inferred.
 *
 * `sparseShape` erases key types through `Object.fromEntries`, so the inferred
 * type would be a record of unknowns. This states the intent directly and stays
 * tied to `Settings`, which is what every consumer — `mergeSettings`,
 * `diffSettings`, `ApplySettings` — actually reasons about.
 */
export type SettingsPatch = {
  [K in Exclude<keyof Settings, 'version'>]?: Partial<Settings[K]>
}

export function createDefaultSettings(): Settings {
  return SettingsSchema.parse({})
}
