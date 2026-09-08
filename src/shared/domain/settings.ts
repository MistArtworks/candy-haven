import { z } from 'zod'
import { DEFAULT_ARCHIVE_PORT } from '../constants'

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
  /** Film grain / scanline intensity, 0..1. */
  grain: z.number().min(0).max(1).default(0.5),
  /** Skip the boot cinematic once the sequence itself has completed. */
  fastBoot: z.boolean().default(false)
})
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>

export const WorkspaceSettingsSchema = z.object({
  /** Directories scanned for Ableton project folders. */
  abletonProjectRoots: z.array(z.string()).default([]),
  /**
   * Re-index the roots in the background once the console opens.
   *
   * Cheap by default: the directory walk is a few tens of milliseconds, and a
   * set whose file has not changed is served from its stored analysis rather
   * than decompressed again.
   */
  scanOnLaunch: z.boolean().default(true),
  /** Destination vault for mastered release deliverables. */
  releaseVaultPath: z.string().nullable().default(null),
  /** Directory watched for stream overlay assets. */
  overlayAssetPath: z.string().nullable().default(null)
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
  autoDownload: z.boolean().default(false)
})
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>

export const SettingsSchema = z.object({
  version: z.number().int().default(1),
  appearance: AppearanceSettingsSchema.prefault({}),
  workspace: WorkspaceSettingsSchema.prefault({}),
  archive: ArchiveSettingsSchema.prefault({}),
  updates: UpdateSettingsSchema.prefault({})
})
export type Settings = z.infer<typeof SettingsSchema>

/** Deep-partial patch accepted by `settings:update`. */
export const SettingsPatchSchema = z.object({
  appearance: AppearanceSettingsSchema.partial().optional(),
  workspace: WorkspaceSettingsSchema.partial().optional(),
  archive: ArchiveSettingsSchema.partial().optional(),
  updates: UpdateSettingsSchema.partial().optional()
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export function createDefaultSettings(): Settings {
  return SettingsSchema.parse({})
}
