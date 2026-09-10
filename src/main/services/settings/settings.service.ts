import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  SettingsSchema,
  createDefaultSettings,
  type Settings,
  type SettingsPatch
} from '@shared/domain/settings'
import { mergeSettings } from '@shared/domain/settings.merge'
import { getPaths } from '@main/core/paths'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'

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
