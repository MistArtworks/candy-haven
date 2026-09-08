import { safeStorage } from 'electron'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'

const logger = getLogger('spotify:tokens')

export interface SpotifyTokens {
  refreshToken: string
  /** Display name of the linked account, cached so the console can name it. */
  account: string | null
}

/**
 * Encrypted store for the Spotify refresh token.
 *
 * A refresh token is a long-lived credential to the operator's account, so it
 * does not go in `settings.json` next to the grain slider. It is encrypted with
 * Electron's `safeStorage`, which is backed by DPAPI on Windows and therefore
 * tied to the OS user account — copying the file to another machine yields
 * nothing.
 *
 * If encryption is unavailable the token is **not** written in the clear. The
 * operator re-links on next launch, which is a mild annoyance; a plaintext
 * credential on disk is not.
 */
export class SpotifyTokenStore {
  private cached: SpotifyTokens | null = null

  private get file(): string {
    return join(getPaths().userData, 'spotify.dat')
  }

  async load(): Promise<SpotifyTokens | null> {
    if (this.cached) return this.cached

    try {
      const raw = await readFile(this.file)
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('Encryption unavailable; ignoring the stored Spotify token')
        return null
      }

      const parsed = JSON.parse(safeStorage.decryptString(raw)) as SpotifyTokens
      if (typeof parsed?.refreshToken !== 'string' || parsed.refreshToken.length === 0) return null

      this.cached = { refreshToken: parsed.refreshToken, account: parsed.account ?? null }
      return this.cached
    } catch (cause) {
      // A missing file is the normal first-run case and not worth a warning.
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not read the stored Spotify token', cause)
      }
      return null
    }
  }

  async save(tokens: SpotifyTokens): Promise<void> {
    this.cached = tokens

    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('Encryption unavailable; the Spotify link will not survive a restart')
      return
    }

    try {
      await writeFile(this.file, safeStorage.encryptString(JSON.stringify(tokens)))
    } catch (cause) {
      logger.error('Could not persist the Spotify token', cause)
    }
  }

  async clear(): Promise<void> {
    this.cached = null
    try {
      await rm(this.file, { force: true })
    } catch (cause) {
      logger.warn('Could not remove the stored Spotify token', cause)
    }
  }
}
