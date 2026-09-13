import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  SettingsSchema,
  createDefaultSettings,
  type Settings,
  type SettingsPatch
} from '@shared/domain/settings'
import {
  BUNDLE_ENTRIES,
  SETTINGS_BUNDLE_FORMAT,
  SETTINGS_BUNDLE_KIND,
  type SettingsExportResult,
  type SettingsImportResult
} from '@shared/domain/settings-bundle'
import { mergeSettings } from '@shared/domain/settings.merge'
import { getPaths } from '@main/core/paths'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import { AppError, ErrorCode } from '@main/core/errors'
import {
  parseManifest,
  readBundle,
  readOptional,
  writeBundle,
  type BundleSource
} from './settings-bundle'

const logger = getLogger('settings')

interface SettingsEvents {
  changed: Settings
}

/**
 * File-backed settings store.
 *
 * Reads are tolerant: a missing, unreadable or schema-invalid file falls back to
 * defaults rather than blocking boot, and the bad file is preserved alongside
 * as `.corrupt` for inspection. Writes are atomic (temp file + rename) so a
 * crash mid-write cannot truncate the operator's configuration.
 */
export class SettingsService extends TypedEmitter<SettingsEvents> {
  private current: Settings = createDefaultSettings()
  private loaded = false
  /** Serialises concurrent writes so the last caller wins deterministically. */
  private writeQueue: Promise<void> = Promise.resolve()

  get snapshot(): Settings {
    return this.current
  }

  async load(): Promise<Settings> {
    const { settingsFile } = getPaths()

    try {
      const raw = await readFile(settingsFile, 'utf8')
      const parsed = SettingsSchema.safeParse(JSON.parse(raw))

      if (parsed.success) {
        this.current = parsed.data
        logger.info('Settings loaded')
      } else {
        logger.warn('Settings failed validation; falling back to defaults', parsed.error.issues)
        await this.quarantine(settingsFile, raw)
        this.current = createDefaultSettings()
        await this.persist()
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') {
        logger.info('No settings file found; writing defaults')
        this.current = createDefaultSettings()
        await this.persist()
      } else {
        logger.warn('Settings unreadable; falling back to defaults', error)
        this.current = createDefaultSettings()
      }
    }

    this.loaded = true
    return this.current
  }

  /**
   * Every directory a scan should walk, filing root first.
   *
   * Derived here rather than assembled at each call site, because there are two
   * of them — the IPC handler and the launch scan — and they must not be able
   * to disagree about what gets indexed.
   *
   * The filing root is omitted when unset rather than defaulted to anything, so
   * a scan attempted before setup reports "no roots configured" instead of
   * quietly walking somewhere arbitrary. Satellite roots are included because
   * finding stray sets is exactly what they are for; nothing is ever written to
   * them.
   */
  get scanRoots(): string[] {
    const { filingRoot, satelliteRoots } = this.snapshot.workspace
    return [...(filingRoot ? [filingRoot] : []), ...satelliteRoots]
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    this.assertLoaded()

    // mergeSettings is shared with the renderer's optimistic update, so both
    // sides apply a patch identically. Validation still runs here, since this
    // is the boundary that decides what gets written to disk.
    const next = SettingsSchema.parse(mergeSettings(this.current, patch))

    this.current = next
    await this.persist()
    this.emit('changed', next)
    return next
  }

  async reset(): Promise<Settings> {
    this.current = createDefaultSettings()
    await this.persist()
    this.emit('changed', this.current)
    logger.info('Settings reset to defaults')
    return this.current
  }

  // ----------------------------------------------------------- export / import

  /** The three files that make up "settings", wherever they live. */
  private bundlePaths(): { settings: string; board: string; spotify: string } {
    const { userData, settingsFile } = getPaths()
    return {
      settings: settingsFile,
      board: join(userData, BUNDLE_ENTRIES.board),
      spotify: join(userData, BUNDLE_ENTRIES.spotify)
    }
  }

  /**
   * Writes every piece of configuration to one archive.
   *
   * The current state is serialised from memory rather than copied off disk, so
   * an export taken a moment after a change cannot race the write queue and
   * capture the previous file. The other two are read as they are, because
   * nothing here owns them.
   */
  async exportTo(path: string): Promise<SettingsExportResult> {
    this.assertLoaded()

    const paths = this.bundlePaths()
    // Annotated, not inferred: from the first element alone TypeScript narrows
    // `entry` to the literal 'settings.json' and the later pushes fail.
    const sources: BundleSource[] = [
      {
        entry: BUNDLE_ENTRIES.settings,
        contents: Buffer.from(
          `${JSON.stringify(this.current, null, 2)}
`,
          'utf8'
        )
      }
    ]

    const board = await readOptional(paths.board)
    if (board) sources.push({ entry: BUNDLE_ENTRIES.board, contents: board })

    const spotify = await readOptional(paths.spotify)
    if (spotify) sources.push({ entry: BUNDLE_ENTRIES.spotify, contents: spotify })

    const entries = await writeBundle(
      path,
      {
        kind: SETTINGS_BUNDLE_KIND,
        format: SETTINGS_BUNDLE_FORMAT,
        app: app.getVersion(),
        exportedAt: Date.now(),
        contents: {
          settings: true,
          board: board !== null,
          spotify: spotify !== null
        }
      },
      sources
    )

    logger.info(`Exported settings to ${path} (${entries.length} entries)`)
    return { path, entries }
  }

  /**
   * Restores an archive over the current configuration.
   *
   * Settings go through the same schema that reads them from disk, so a bundle
   * from an older build is migrated by its defaults rather than rejected — and
   * one that has been edited into nonsense is refused before anything is
   * written, which is why this parses before it touches a single file.
   *
   * The two credential files are written straight back. `spotify.dat` is sealed
   * against this machine, so restoring it on the machine that wrote it silently
   * works and restoring it elsewhere leaves a blob that fails to open and asks
   * to be linked again. That is the correct behaviour and not worth refusing
   * the import over.
   */
  async importFrom(path: string): Promise<SettingsImportResult> {
    this.assertLoaded()

    const entries = await readBundle(path)
    const manifest = parseManifest(entries)

    const rawSettings = entries.get(BUNDLE_ENTRIES.settings)
    if (!rawSettings) {
      throw new AppError('That export contains no settings.', {
        code: ErrorCode.Validation,
        hint: 'The archive has a manifest but no settings.json.'
      })
    }

    let candidate: unknown
    try {
      candidate = JSON.parse(rawSettings.toString('utf8'))
    } catch {
      throw new AppError('The settings in that export are not readable.', {
        code: ErrorCode.Validation
      })
    }

    const parsed = SettingsSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new AppError('The settings in that export did not validate.', {
        code: ErrorCode.Validation,
        hint: parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')
      })
    }

    const paths = this.bundlePaths()

    const board = entries.get(BUNDLE_ENTRIES.board)
    if (board) await writeFile(paths.board, board)

    const spotify = entries.get(BUNDLE_ENTRIES.spotify)
    if (spotify) await writeFile(paths.spotify, spotify)

    this.current = parsed.data
    await this.persist()
    this.emit('changed', this.current)

    logger.info(
      `Imported settings from ${path}` +
        ` (written by ${manifest.app || 'an unknown build'};` +
        ` board=${board !== undefined}, spotify=${spotify !== undefined})`
    )

    return {
      settings: this.current,
      board: board !== undefined,
      spotify: spotify !== undefined,
      writtenBy: manifest.app
    }
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error('SettingsService used before load()')
  }

  private persist(): Promise<void> {
    const { settingsFile } = getPaths()
    const payload = `${JSON.stringify(this.current, null, 2)}\n`

    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(dirname(settingsFile), { recursive: true })
        const temp = `${settingsFile}.${process.pid}.tmp`
        await writeFile(temp, payload, 'utf8')
        await rename(temp, settingsFile)
      })
      .catch((error) => {
        logger.error('Failed to persist settings', error)
      })

    return this.writeQueue
  }

  /** Keeps an unparseable settings file for diagnosis instead of overwriting it. */
  private async quarantine(settingsFile: string, raw: string): Promise<void> {
    try {
      const target = join(dirname(settingsFile), `settings.corrupt.${Date.now()}.json`)
      await writeFile(target, raw, 'utf8')
      logger.warn(`Corrupt settings preserved at ${target}`)
    } catch (error) {
      logger.warn('Could not preserve corrupt settings file', error)
    }
  }
}
