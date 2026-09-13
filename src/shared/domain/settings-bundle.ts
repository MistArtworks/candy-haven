import { z } from 'zod'
import { SettingsSchema } from './settings'

/**
 * The shape of an exported settings bundle.
 *
 * A zip rather than a single file, because "settings" is three files on disk
 * and flattening them into one document would mean inventing an encoding for
 * the two that are not JSON. The archive holds them as they actually are, plus
 * a manifest saying what it is and what wrote it.
 *
 * ## What travels, and what only travels here
 *
 * `settings.json` and `firebase.json` are portable: they are configuration the
 * operator typed, and they mean the same thing on any machine.
 *
 * `spotify.dat` is not. It is the refresh token sealed with Electron's
 * `safeStorage`, which encrypts against the current user on the current
 * machine — so it restores perfectly on a reinstall here and is undecryptable
 * anywhere else. It is included because the case this feature exists for is
 * exactly that reinstall, and because leaving it out would mean the one export
 * that should be a complete backup quietly was not. Carried across to another
 * machine it simply fails to open and the room asks to be linked again, which
 * is the correct outcome and not an error.
 */

/** Stamped into the manifest so a foreign zip is refused before it is read. */
export const SETTINGS_BUNDLE_KIND = 'candy-haven/settings-bundle'

/**
 * The bundle format, not the application version.
 *
 * Bumped only when the *layout of the archive* changes — a file added, moved
 * or renamed. The settings inside carry their own `version` and are migrated
 * by the same schema that migrates them on disk, so a bundle written by an
 * older build imports without this ever moving.
 */
export const SETTINGS_BUNDLE_FORMAT = 1

/** The manifest at the root of the archive. */
export const SettingsBundleManifestSchema = z.object({
  kind: z.literal(SETTINGS_BUNDLE_KIND),
  format: z.number().int().min(1),
  /** The application version that wrote it, for the record and for support. */
  app: z.string().default(''),
  exportedAt: z.number().default(0),
  /**
   * Which optional files are inside.
   *
   * Listed rather than discovered, so an import can say "this bundle had no
   * Spotify link" instead of silently leaving whatever was already there.
   */
  contents: z
    .object({
      settings: z.boolean().default(true),
      board: z.boolean().default(false),
      spotify: z.boolean().default(false)
    })
    .prefault({})
})
export type SettingsBundleManifest = z.infer<typeof SettingsBundleManifestSchema>

/** Entry names inside the archive. Fixed; the manifest says which are present. */
export const BUNDLE_ENTRIES = {
  manifest: 'manifest.json',
  settings: 'settings.json',
  board: 'firebase.json',
  spotify: 'spotify.dat'
} as const

/** What an import actually restored, reported back so the console can say so. */
export const SettingsImportResultSchema = z.object({
  settings: SettingsSchema,
  /** True when the bundle carried a board configuration and it was written. */
  board: z.boolean(),
  /** True when the bundle carried a Spotify token and it was written. */
  spotify: z.boolean(),
  /** The version of the application that wrote the bundle. */
  writtenBy: z.string()
})
export type SettingsImportResult = z.infer<typeof SettingsImportResultSchema>

/** What an export wrote, and where. Null path means the operator cancelled. */
export const SettingsExportResultSchema = z.object({
  path: z.string().nullable(),
  /** Files placed in the archive, for the notice. */
  entries: z.array(z.string()).default([])
})
export type SettingsExportResult = z.infer<typeof SettingsExportResultSchema>

/** The filename offered in the save dialog. */
export function bundleFilename(version: string, at: Date): string {
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0')
  ].join('-')

  return `candy-haven-settings-${version}-${stamp}.zip`
}
