/**
 * Fill the credential form from an environment file the operator already has.
 *
 * Ten fields typed by hand is ten chances to paste a secret one character
 * short, and the person running this already keeps them in a `.env.seed` —
 * that file is how the terminal half of the seeder was driven before the
 * in-app one existed. Reading it is strictly less error-prone than
 * retyping it.
 *
 * ## The path never comes from the renderer
 *
 * The file is chosen in an OS dialog opened by the **main process**, and only
 * the resulting path reaches this function. A channel that took a path from
 * the renderer would be a "read any file on this machine and parse it into
 * key/value pairs" endpoint, which is not a thing to build for the sake of
 * saving ten paste operations.
 *
 * ## Values do reach the renderer
 *
 * They land in the form, which is the entire point — the operator wants to
 * see what was loaded and correct it. That is no different from typing them:
 * the secret fields are masked inputs, nothing is written to settings, and
 * the values are gone when the window closes. It is worth stating plainly
 * rather than leaving the reader to infer it from a comment elsewhere that
 * says credentials only ever travel inbound.
 *
 * Deleted with the seeder. See `docs/DISCOGRAPHY_SEEDER.md` §7.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import type { SeedCredentials, SeedEnvImport } from '@shared/domain/seed'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'

const logger = getLogger('seed:env')

/** An env file is a few hundred bytes. Anything larger is the wrong file. */
const MAX_ENV_BYTES = 256 * 1024
/** A track list is one URL per line; a thousand of them is 64 KB. */
const MAX_LIST_BYTES = 1024 * 1024

/**
 * Which key fills which field.
 *
 * Named after the variables the operator's file already uses, rather than
 * after this application's field names — the whole value of the feature is
 * that their existing file works unchanged.
 */
const FIELDS: Record<string, keyof SeedCredentials> = {
  SPOTIFY_CLIENT_ID: 'spotifyClientId',
  SPOTIFY_CLIENT_SECRET: 'spotifyClientSecret',
  SPOTIFY_ARTIST_URL: 'spotifyArtistUrl',
  TIDAL_CLIENT_ID: 'tidalClientId',
  TIDAL_CLIENT_SECRET: 'tidalClientSecret',
  YOUTUBE_API_KEY: 'youtubeApiKey',
  YOUTUBE_CHANNEL_URL: 'youtubeChannelUrl',
  YOUTUBE_TOPIC_CHANNEL_URL: 'youtubeTopicChannelUrl',
  JEV_API_KEY: 'jevApiKey',
  APPLE_STOREFRONT: 'appleStorefront'
}

/**
 * `KEY=value`, in the dialects an env file is actually written in.
 *
 * Handles `export KEY=`, surrounding quotes, inline `#` comments on unquoted
 * values, and CRLF. Deliberately not a dependency: this parses one file of
 * one known shape, once, and `dotenv` would be a package in the bundle
 * forever for a feature marked for deletion.
 */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>()

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue

    let value = match[2].trim()
    const quoted = /^(['"])(.*)\1$/.exec(value)
    if (quoted) {
      value = quoted[2]
    } else {
      // An unquoted value ends at a ` #`. Quoted ones may contain one, and
      // a URL's fragment is not a comment — hence the required space.
      const comment = value.indexOf(' #')
      if (comment !== -1) value = value.slice(0, comment).trim()
    }

    out.set(match[1], value)
  }

  return out
}

const BLANK: SeedCredentials = {
  spotifyClientId: '',
  spotifyClientSecret: '',
  spotifyArtistUrl: '',
  tidalClientId: '',
  tidalClientSecret: '',
  youtubeApiKey: '',
  youtubeChannelUrl: '',
  youtubeTopicChannelUrl: '',
  soundcloudTrackUrls: '',
  jevApiKey: '',
  appleStorefront: 'ca'
}

export async function readEnvFile(path: string): Promise<SeedEnvImport> {
  if (!existsSync(path)) {
    throw new AppError('That file is no longer there.', {
      code: ErrorCode.NotFound,
      recoverable: true
    })
  }

  const text = await readFile(path, 'utf8')
  if (Buffer.byteLength(text) > MAX_ENV_BYTES) {
    throw new AppError('That file is far too large to be an environment file.', {
      code: ErrorCode.Validation,
      hint: 'Point this at a .env file, not at a database or an archive.',
      recoverable: true
    })
  }

  const entries = parseEnv(text)
  const credentials: SeedCredentials = { ...BLANK }
  const filled: string[] = []
  const ignored: string[] = []

  for (const [key, value] of entries) {
    if (!value) continue

    // Consumed below rather than mapped to a field, so it is neither
    // "filled" nor "ignored" — reporting it as ignored would say the
    // opposite of what happens to it.
    if (key === 'SOUNDCLOUD_TRACK_LIST') continue

    const field = FIELDS[key]
    if (!field) {
      // Only non-empty unknowns are worth reporting. A file full of blank
      // placeholders for services this seeder does not use is the normal
      // state of the operator's own file, and listing those as "ignored"
      // would be a wall of noise about nothing.
      ignored.push(key)
      continue
    }

    credentials[field] = value
    filled.push(key)
  }

  /*
   * The SoundCloud links, which are the reason this is worth building.
   *
   * They cannot live in an environment variable — there are nineteen of them
   * and an env value is one line — so the file names a list instead, and
   * `.env.seed` names it relatively. Resolved against the env file's own
   * directory, which is what the terminal scripts did and what anyone
   * writing the path meant.
   */
  let soundcloudFrom = ''
  let soundcloudCount = 0
  const listPath = entries.get('SOUNDCLOUD_TRACK_LIST')

  if (listPath) {
    const full = isAbsolute(listPath) ? listPath : resolve(dirname(path), listPath)
    if (existsSync(full)) {
      const list = await readFile(full, 'utf8')
      if (Buffer.byteLength(list) <= MAX_LIST_BYTES) {
        const urls = list
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('https://soundcloud.com/'))

        credentials.soundcloudTrackUrls = urls.join('\n')
        soundcloudCount = urls.length
        soundcloudFrom = basename(full)
      }
    } else {
      // Named but missing is worth saying: the operator will otherwise
      // wonder why SoundCloud contributed nothing to a harvest they
      // believed they had configured.
      soundcloudFrom = `${listPath} — not found beside the env file`
    }
  }

  logger.info(`Read ${filled.length} seeder fields from ${basename(path)}`)

  return {
    fileName: basename(path),
    credentials,
    filled,
    ignored,
    soundcloudFrom,
    soundcloudCount
  }
}
