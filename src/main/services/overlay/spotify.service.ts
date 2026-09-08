import { createHash, randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { shell } from 'electron'
import type {
  NowPlayingConfigPatch,
  NowPlayingState,
  NowPlayingTrack,
  SpotifyLink
} from '@shared/domain/nowplaying'
import {
  SPOTIFY_API_BASE,
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_CALLBACK_PATH,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_URL,
  clampPollSeconds,
  createNowPlayingState,
  spotifyRedirectUri
} from '@shared/domain/nowplaying.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '../archive/archive.service'
import type { OverlayServer } from './overlay-server'
import { SpotifyTokenStore } from './spotify.tokens'
import { NowPlayingRepository } from './nowplaying.repository'

const logger = getLogger('spotify')

interface SpotifyEvents {
  state: NowPlayingState
}

/** Largest cover we ask Spotify for. 300px is the middle image in every album. */
const COVER_EDGE = 300

/** Requests give up rather than hanging a poll cycle. */
const REQUEST_TIMEOUT_MS = 8_000

/**
 * Live Spotify playback for the NOW TRANSMITTING overlay.
 *
 * ### Authorisation
 *
 * Authorization Code with PKCE, not the client-credentials or implicit flows.
 * A desktop application cannot keep a client secret — anything shipped in the
 * bundle is readable — so PKCE is the only correct choice here, and it means
 * the operator supplies a client id and nothing else.
 *
 * The redirect lands on the overlay server we already run, which avoids
 * standing up a second listener and means the whole flow stays on loopback.
 * The port can shift if the configured one is taken, so the redirect URI is
 * built from the live port and surfaced in the console for copying rather than
 * assumed — a URI that differs from the registered one by a character fails the
 * exchange with a famously unhelpful error.
 *
 * ### Scopes
 *
 * Read-only: `user-read-currently-playing` and `user-read-playback-state`.
 * Nothing here can alter what the operator is listening to.
 *
 * ### Polling
 *
 * Reference-counted, like telemetry. Spotify is polled only while the console
 * page is open or a browser source is attached, so an idle app costs nothing
 * and the operator's rate limit is not spent on nobody watching. The timeline
 * is interpolated between polls by both surfaces, so a three-second interval
 * still renders a smoothly moving playhead.
 */
export class SpotifyService extends TypedEmitter<SpotifyEvents> {
  private state: NowPlayingState = createNowPlayingState()
  private readonly tokens = new SpotifyTokenStore()
  private readonly repository: NowPlayingRepository

  private clientId: string | null = null
  private accessToken: string | null = null
  private accessExpiresAt = 0

  /** In-flight authorisation attempt, keyed by its `state` parameter. */
  private pending: { verifier: string; stateKey: string } | null = null

  private timer: NodeJS.Timeout | null = null
  private consoleSubscribers = 0
  private attachedSources = 0
  /** Guards against a slow poll outlasting its interval. */
  private polling = false

  /** Cover art cache, keyed by the Spotify image URL. */
  private readonly covers = new Map<string, string>()

  constructor(
    archive: ArchiveService,
    /** Shared with the rite and the timers: one server serves every overlay. */
    private readonly server: OverlayServer
  ) {
    super()
    this.repository = new NowPlayingRepository(archive)
    this.server.registerSnapshot('nowplaying', () => this.state)
    this.server.registerRoute(SPOTIFY_CALLBACK_PATH, (url, res) => this.handleCallback(url, res))

    // A browser source attaching is as good a reason to poll as the console
    // being open, so the server's client count feeds the same reference count.
    this.server.on('info', (info) => {
      this.attachedSources = info.clients
      this.updatePolling()
    })
  }

  get current(): NowPlayingState {
    return this.state
  }

  get setup(): { hasClientId: boolean; redirectUri: string | null } {
    const port = this.server.info.port
    return {
      hasClientId: (this.clientId ?? '').length > 0,
      redirectUri: port === null ? null : spotifyRedirectUri(port)
    }
  }

  // ----------------------------------------------------------------- lifecycle

  /**
   * Restores the stored config and re-links if a refresh token survives.
   *
   * Never throws: this runs during boot, and an expired Spotify grant is a
   * reason to show a disconnected panel, not to refuse to start.
   */
  async initialize(clientId: string | null): Promise<void> {
    this.clientId = clientId?.trim() || null

    const stored = await this.repository.load()
    if (stored) this.state = { ...this.state, config: stored.config }

    if (!this.clientId) {
      this.patchLink({ state: 'unconfigured', message: 'No client id has been entered.' })
      return
    }

    const tokens = await this.tokens.load()
    if (!tokens) {
      this.patchLink({ state: 'disconnected', message: 'Not linked to a Spotify account.' })
      return
    }

    this.patchLink({ state: 'connected', message: 'Linked.', account: tokens.account })
    logger.info('Spotify link restored')
  }

  /** Applies a client id changed in Regulation, dropping any stale link. */
  async setClientId(clientId: string | null): Promise<void> {
    const next = clientId?.trim() || null
    if (next === this.clientId) return

    this.clientId = next
    this.accessToken = null

    if (!next) {
      this.patchLink({ state: 'unconfigured', message: 'No client id has been entered.' })
      return
    }

    const tokens = await this.tokens.load()
    this.patchLink(
      tokens
        ? { state: 'connected', message: 'Linked.', account: tokens.account }
        : { state: 'disconnected', message: 'Not linked to a Spotify account.' }
    )
  }

  dispose(): void {
    this.stopPolling()
    this.clear()
  }

  // ---------------------------------------------------------------------- auth

  /**
   * Opens the authorisation page in the operator's own browser.
   *
   * Deliberately not an in-app window: the operator should be entering Spotify
   * credentials somewhere they can see the address bar and their password
   * manager, not into a frame this application controls.
   */
  async link(): Promise<NowPlayingState> {
    if (!this.clientId) {
      throw new AppError('No Spotify client id has been entered.', {
        code: ErrorCode.Validation,
        hint: 'Add one in REGULATION, then link the account.',
        recoverable: false
      })
    }

    const port = this.server.info.port
    if (port === null) {
      throw new AppError('The overlay server is not listening.', {
        code: ErrorCode.Validation,
        hint: 'The redirect lands on the local server, so it has to be running.',
        recoverable: true
      })
    }

    // PKCE: the verifier never leaves this process; only its hash is sent.
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const stateKey = randomBytes(16).toString('base64url')
    this.pending = { verifier, stateKey }

    const url = new URL(SPOTIFY_AUTHORIZE_URL)
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', spotifyRedirectUri(port))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('state', stateKey)
    url.searchParams.set('scope', SPOTIFY_SCOPES.join(' '))

    this.patchLink({ state: 'linking', message: 'Waiting for authorisation in the browser…' })
    await shell.openExternal(url.toString())
    return this.state
  }

  async unlink(): Promise<NowPlayingState> {
    this.stopPolling()
    this.accessToken = null
    this.pending = null
    await this.tokens.clear()

    return this.commit({
      track: null,
      link: {
        state: this.clientId ? 'disconnected' : 'unconfigured',
        message: this.clientId
          ? 'Not linked to a Spotify account.'
          : 'No client id has been entered.',
        account: null
      }
    })
  }

  /**
   * Handles the OAuth redirect on the overlay server.
   *
   * Replies with a plain page rather than closing the tab: a browser will not
   * let a page it did not open close itself, so telling the operator they can
   * close it is more honest than a script that silently fails.
   */
  private handleCallback(url: URL, res: ServerResponse): void {
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const denied = url.searchParams.get('error')

    const reply = (title: string, detail: string): void => {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Candy Haven</title>` +
          `<style>body{background:#0c0c0c;color:#ddcfb2;font:14px ui-monospace,monospace;` +
          `display:grid;place-items:center;height:100vh;margin:0;text-align:center}` +
          `h1{font-size:12px;letter-spacing:.24em;color:#d2a961;font-weight:400}` +
          `p{color:#8a8071}</style>` +
          `<div><h1>${title}</h1><p>${detail}</p></div>`
      )
    }

    if (denied) {
      this.patchLink({ state: 'disconnected', message: `Authorisation was declined (${denied}).` })
      reply('AUTHORISATION DECLINED', 'You can close this tab and try again from the console.')
      return
    }

    // The state parameter is what makes this callback un-forgeable by any other
    // page that happens to know the loopback address.
    if (!code || !returnedState || returnedState !== this.pending?.stateKey) {
      this.patchLink({ state: 'error', message: 'The authorisation response did not match.' })
      reply(
        'RESPONSE REJECTED',
        'The authorisation state did not match. Start again from the console.'
      )
      return
    }

    reply('AUTHORISED', 'Candy Haven is linked. You can close this tab.')
    void this.exchange(code)
  }

  private async exchange(code: string): Promise<void> {
    const port = this.server.info.port
    if (!this.clientId || port === null || !this.pending) return

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: spotifyRedirectUri(port),
        client_id: this.clientId,
        code_verifier: this.pending.verifier
      })
      this.pending = null

      const tokens = await this.postToken(body)
      if (!tokens.refresh_token) {
        throw new Error('Spotify did not return a refresh token.')
      }

      const account = await this.readAccountName(tokens.access_token)
      await this.tokens.save({ refreshToken: tokens.refresh_token, account })

      this.accessToken = tokens.access_token
      this.accessExpiresAt = Date.now() + tokens.expires_in * 1000

      this.patchLink({ state: 'connected', message: 'Linked.', account })
      logger.info(`Spotify linked${account ? ` as ${account}` : ''}`)
      this.updatePolling()
      void this.poll()
    } catch (cause) {
      logger.error('Spotify token exchange failed', cause)
      this.patchLink({
        state: 'error',
        message: cause instanceof Error ? cause.message : 'The token exchange failed.'
      })
    }
  }

  private async postToken(body: URLSearchParams): Promise<{
    access_token: string
    refresh_token?: string
    expires_in: number
  }> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Spotify token endpoint returned ${response.status}. ${detail}`.trim())
    }
    return (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
  }

  /** Refreshes the access token, or throws so the caller can mark the link broken. */
  private async accessTokenValue(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessExpiresAt - 30_000) return this.accessToken

    const stored = await this.tokens.load()
    if (!stored || !this.clientId) throw new Error('Not linked.')

    const tokens = await this.postToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
        client_id: this.clientId
      })
    )

    this.accessToken = tokens.access_token
    this.accessExpiresAt = Date.now() + tokens.expires_in * 1000

    // Spotify may hand back a rotated refresh token; persisting it keeps the
    // link alive past the old one's expiry.
    if (tokens.refresh_token && tokens.refresh_token !== stored.refreshToken) {
      await this.tokens.save({ refreshToken: tokens.refresh_token, account: stored.account })
    }

    return this.accessToken
  }

  private async readAccountName(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (!response.ok) return null
      const body = (await response.json()) as { display_name?: string; id?: string }
      return body.display_name ?? body.id ?? null
    } catch {
      return null
    }
  }

  // ------------------------------------------------------------------ polling

  subscribe(): NowPlayingState {
    this.consoleSubscribers += 1
    this.updatePolling()
    if (this.state.link.state === 'connected') void this.poll()
    return this.state
  }

  unsubscribe(): void {
    this.consoleSubscribers = Math.max(this.consoleSubscribers - 1, 0)
    this.updatePolling()
  }

  /** Starts or stops the poll loop to match interest and link state. */
  private updatePolling(): void {
    const wanted =
      this.state.link.state === 'connected' && this.consoleSubscribers + this.attachedSources > 0

    if (!wanted) {
      this.stopPolling()
      return
    }

    const interval = clampPollSeconds(this.state.config.pollSeconds) * 1000
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.poll(), interval)
  }

  private stopPolling(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true

    try {
      const token = await this.accessTokenValue()
      const response = await fetch(
        `${SPOTIFY_API_BASE}/me/player/currently-playing?additional_types=track`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      )

      // 204 is Spotify's "nothing is playing", and is not an error.
      if (response.status === 204) {
        if (this.state.track !== null) this.commit({ track: null })
        return
      }

      if (response.status === 401) {
        // The access token was rejected; drop it so the next poll refreshes.
        this.accessToken = null
        return
      }

      if (response.status === 429) {
        logger.warn('Spotify rate limited the poll; backing off one cycle')
        return
      }

      if (!response.ok) {
        logger.warn(`Spotify currently-playing returned ${response.status}`)
        return
      }

      const track = await this.readTrack(response)
      if (track) this.commit({ track })
    } catch (cause) {
      logger.warn('Spotify poll failed', cause)
      if (this.state.link.state === 'connected') {
        this.patchLink({
          state: 'error',
          message: cause instanceof Error ? cause.message : 'The Spotify poll failed.'
        })
      }
    } finally {
      this.polling = false
    }
  }

  private async readTrack(response: Response): Promise<NowPlayingTrack | null> {
    const body = (await response.json()) as {
      is_playing?: boolean
      progress_ms?: number | null
      item?: {
        id?: string
        name?: string
        duration_ms?: number
        explicit?: boolean
        external_urls?: { spotify?: string }
        artists?: { name?: string }[]
        album?: { name?: string; images?: { url: string; width: number }[] }
      } | null
    }

    const item = body.item
    if (!item?.id || !item.name) return null

    const images = item.album?.images ?? []
    // Closest to the target rather than the largest: the overlay draws it at a
    // few hundred pixels, and a 640px cover is four times the bytes for nothing.
    const chosen = [...images].sort(
      (a, b) => Math.abs(a.width - COVER_EDGE) - Math.abs(b.width - COVER_EDGE)
    )[0]

    return {
      id: item.id,
      title: item.name,
      artists: (item.artists ?? []).map((artist) => artist.name ?? '').filter(Boolean),
      album: item.album?.name ?? '',
      durationMs: item.duration_ms ?? 0,
      progressMs: body.progress_ms ?? 0,
      sampledAt: Date.now(),
      isPlaying: body.is_playing ?? false,
      coverDataUrl: chosen ? await this.cover(chosen.url) : null,
      explicit: item.explicit ?? false,
      url: item.external_urls?.spotify ?? null
    }
  }

  /**
   * Fetches cover art and inlines it as a data URL.
   *
   * Cached by image URL: album art does not change, and refetching it on every
   * three-second poll would be absurd. Bounded so a long session cannot grow
   * the cache without limit.
   */
  private async cover(url: string): Promise<string | null> {
    const cached = this.covers.get(url)
    if (cached) return cached

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!response.ok) return null

      const buffer = Buffer.from(await response.arrayBuffer())
      const mime = response.headers.get('content-type') ?? 'image/jpeg'
      const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`

      if (this.covers.size > 48) {
        this.covers.delete([...this.covers.keys()][0])
      }
      this.covers.set(url, dataUrl)
      return dataUrl
    } catch (cause) {
      logger.warn('Could not fetch cover art', cause)
      return null
    }
  }

  // ----------------------------------------------------------------- plumbing

  configure(patch: NowPlayingConfigPatch): NowPlayingState {
    const config = { ...this.state.config, ...patch }
    if (patch.pollSeconds !== undefined) config.pollSeconds = clampPollSeconds(patch.pollSeconds)

    const next = this.commit({ config })
    // A changed interval has to take effect now rather than at the next start.
    if (patch.pollSeconds !== undefined) this.updatePolling()
    return next
  }

  private patchLink(link: Partial<SpotifyLink>): void {
    this.commit({ link: { ...this.state.link, ...link } })
    this.updatePolling()
  }

  private commit(partial: Partial<NowPlayingState>): NowPlayingState {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }

    this.emit('state', this.state)
    this.server.broadcast('nowplaying', this.state)
    // Only the config is persisted; a track sample is worthless after a restart.
    void this.repository.save(this.state)

    return this.state
  }
}
