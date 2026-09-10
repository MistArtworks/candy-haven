import { safeStorage } from 'electron'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import type { DispatchAuthor } from '@shared/domain/dispatch.constants'

const logger = getLogger('dispatch:tokens')

export interface DispatchTokens {
  identity: DispatchAuthor
  uid: string
  refreshToken: string
}

/**
 * Encrypted store for the board's sign-in.
 *
 * The same arrangement as the Spotify token store, for the same reason: a
 * refresh token is a long-lived credential and does not belong in
 * `settings.json` next to the grain slider. `safeStorage` is DPAPI on Windows,
 * so the file is tied to the OS user account and copying it to another machine
 * yields nothing.
 *
 * **The password is never stored, here or anywhere else in the application.**
 * It is exchanged with Firebase for a token and discarded; Firebase holds it
 * hashed. Keeping a hash locally would have been worse than useless — an
 * attacker reaching the database does not go through this app, and two short
 * passwords behind an extractable hash fall to a dictionary immediately.
 *
 * If encryption is unavailable the token is **not** written in the clear. The
 * operator signs in again next launch, which is a mild annoyance; a plaintext
 * credential on disk is not.
 */
export class DispatchTokenStore {
  private cached: DispatchTokens | null = null

  private get file(): string {
    return join(getPaths().userData, 'dispatch.dat')
  }

  async load(): Promise<DispatchTokens | null> {
    if (this.cached) return this.cached

    try {
      const raw = await readFile(this.file)
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('Encryption unavailable; ignoring the stored board sign-in')
        return null
      }

      const parsed = JSON.parse(safeStorage.decryptString(raw)) as DispatchTokens
      if (typeof parsed?.refreshToken !== 'string' || parsed.refreshToken.length === 0) return null
      if (parsed.identity !== 'mist' && parsed.identity !== 'candy') return null

      this.cached = {
        identity: parsed.identity,
        uid: parsed.uid ?? '',
        refreshToken: parsed.refreshToken
      }
      return this.cached
    } catch (cause) {
      // A missing file is the normal first-run case and not worth a warning.
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not read the stored board sign-in', cause)
      }
      return null
    }
  }

  async save(tokens: DispatchTokens): Promise<void> {
    this.cached = tokens

    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('Encryption unavailable; the board sign-in will not survive a restart')
      return
    }

    try {
      await writeFile(this.file, safeStorage.encryptString(JSON.stringify(tokens)))
    } catch (cause) {
      logger.error('Could not persist the board sign-in', cause)
    }
  }

  async clear(): Promise<void> {
    this.cached = null
    try {
      await rm(this.file, { force: true })
    } catch (cause) {
      logger.warn('Could not remove the stored board sign-in', cause)
    }
  }
}
