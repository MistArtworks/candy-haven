import { randomInt } from 'node:crypto'
import type { ChatStatus } from '@shared/domain/chat'
import type { ChatMessage } from '@shared/domain/chat.constants'
import {
  chatBackoffMs,
  isPlausibleChatChannel,
  normaliseChatChannel
} from '@shared/domain/chat.constants'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { SettingsService } from '../settings/settings.service'
import { messageFromLine, parseIrcLine, splitIrcFrames } from './twitch-irc'

const logger = getLogger('chat:twitch')

interface ChatEvents {
  message: ChatMessage
  status: ChatStatus
}

/** Twitch's IRC-over-WebSocket endpoint. TLS; the plaintext port is not used. */
const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443'

/**
 * How long a connection attempt may hang before it is abandoned.
 *
 * A WebSocket that never opens and never errors is the failure a captive portal
 * produces, and without this the service would sit in `connecting` for as long
 * as the stream ran.
 */
const CONNECT_TIMEOUT_MS = 10_000

/**
 * How long the connection may be silent before it is assumed dead.
 *
 * Twitch sends a `PING` every few minutes, so silence well past that means the
 * socket is open against something that is no longer serving us — a state TCP
 * will not report on its own. Reconnecting on a stale read is the difference
 * between a poll that quietly counts nothing and one that recovers.
 */
const SILENCE_TIMEOUT_MS = 6 * 60_000

/**
 * How often the message counters are republished while traffic is flowing.
 *
 * See the note in `ingest`. This throttles a confidence readout, not anything
 * anyone acts on.
 */
const COUNTER_PUBLISH_MS = 1_000

/**
 * Read-only Twitch chat ingest.
 *
 * ### Anonymous, and why that is a large win
 *
 * Twitch's IRC bridge accepts an anonymous login: `NICK justinfan<random>` with
 * no `PASS`. So this needs no OAuth, no client id, no encrypted token store and
 * no redirect listener — the operator types a channel name and it works. Set
 * against the PKCE flow the Spotify integration has to carry, that is most of
 * this feature's cost removed.
 *
 * It is also read-only *at the protocol level*: an anonymous connection cannot
 * send `PRIVMSG`. The app therefore cannot post to the operator's channel even
 * if the renderer were fully compromised, which is a stronger guarantee than any
 * amount of care on our side would buy.
 *
 * **Honest caveat.** `justinfan` is long-standing de-facto behaviour of the IRC
 * bridge rather than a documented API. It has worked for many years and a great
 * deal of tooling depends on it, but if it is ever withdrawn the fallback is an
 * OAuth'd IRC connection with a `chat:read` scope — a migration, not a dead end.
 *
 * ### Claim-based lifetime
 *
 * The socket is held open only while something needs it. `acquire()` returns its
 * own release function and the connection lives while any claim is outstanding,
 * following the reference counting telemetry and the Spotify poller already use
 * so that an idle app costs nothing.
 *
 * Keyed by reason rather than a bare count, for two reasons: several consumers
 * will hold it at once (a poll, the console page, and eventually the docket),
 * and "why is chat connected right now?" becomes a question the console can
 * answer instead of a mystery.
 *
 * The console page claims it while merely *open*, not only while a poll is
 * running. That is deliberate — the operator needs to see chat attending before
 * they open a poll, because discovering the channel name was wrong after asking
 * an audience to vote is not a recoverable moment.
 */
export class TwitchChatService extends TypedEmitter<ChatEvents> {
  private socket: WebSocket | null = null
  private readonly claims = new Set<string>()

  private state: ChatStatus['state'] = 'idle'
  private channel: string | null = null
  private error: string | null = null
  private since: number | null = null
  private messages = 0
  private lastMessageAt: number | null = null
  private failures = 0
  /** When the counters were last republished. See `ingest`. */
  private lastCountersAt = 0

  /** Partial IRC line carried between socket frames. */
  private carried = ''

  private reconnectTimer: NodeJS.Timeout | null = null
  private connectTimer: NodeJS.Timeout | null = null
  private silenceTimer: NodeJS.Timeout | null = null

  /**
   * Set while a socket is being deliberately discarded.
   *
   * `close()` fires the handlers asynchronously, so without this a manual
   * teardown races its own `onclose` and schedules a reconnect for a connection
   * nobody asked for any more.
   */
  private discarding = false

  constructor(private readonly settings: SettingsService) {
    super()

    // A channel change has to take effect without a restart: the operator will
    // fix a typo in REGULATION while looking at a chat panel that says SEVERED.
    this.settings.on('changed', () => {
      const next = this.configuredChannel()
      if (next === this.channel) return
      logger.info(`Chat channel changed to ${next ?? '(none)'}`)
      this.reconnect()
    })
  }

  get status(): ChatStatus {
    return {
      platform: 'twitch',
      state: this.state,
      channel: this.channel,
      error: this.error,
      since: this.since,
      messages: this.messages,
      lastMessageAt: this.lastMessageAt,
      failures: this.failures,
      claims: [...this.claims]
    }
  }

  // ----------------------------------------------------------------- claims

  /**
   * Registers interest in chat, returning the release.
   *
   * Idempotent per reason: a consumer that acquires twice and releases once has
   * not leaked the connection, because the claim is a set membership rather than
   * a count. That matters because React effects in development mount twice.
   */
  acquire(reason: string): () => void {
    const had = this.claims.has(reason)
    this.claims.add(reason)
    if (!had) {
      logger.info(`Chat claimed by ${reason}`)
      this.evaluate()
    }

    let released = false
    return () => {
      if (released) return
      released = true
      this.claims.delete(reason)
      logger.info(`Chat released by ${reason}`)
      this.evaluate()
    }
  }

  // -------------------------------------------------------------- lifecycle

  /** Drops the current socket and starts again, if anything still wants one. */
  reconnect(): ChatStatus {
    this.teardown()
    this.failures = 0
    this.evaluate()
    return this.status
  }

  dispose(): void {
    this.claims.clear()
    this.teardown()
    this.publish('idle', { error: null })
    this.clear()
  }

  private configuredChannel(): string | null {
    const raw = this.settings.snapshot.integrations.twitchChannel
    const normalised = normaliseChatChannel(raw ?? '')
    return normalised.length > 0 ? normalised : null
  }

  /** Opens or closes the socket to match the current claims and settings. */
  private evaluate(): void {
    const wanted = this.claims.size > 0
    const channel = this.configuredChannel()

    if (!wanted) {
      if (this.socket || this.reconnectTimer) this.teardown()
      // Not a fault: nothing needs chat. The console says so rather than
      // presenting an error the operator would try to fix.
      if (this.state !== 'idle') this.publish('idle', { error: null, channel: null })
      return
    }

    if (!channel) {
      this.teardown()
      this.publish('failed', {
        error: 'No Twitch channel is configured. Set one in REGULATION.',
        channel: null
      })
      return
    }

    if (!isPlausibleChatChannel(channel)) {
      this.teardown()
      this.publish('failed', {
        error: `"${channel}" is not a valid Twitch channel name.`,
        channel
      })
      return
    }

    // Already attending the right channel, or on the way there.
    if (this.socket && this.channel === channel) return
    if (this.reconnectTimer && this.channel === channel) return

    this.open(channel)
  }

  private open(channel: string): void {
    this.teardown()
    this.channel = channel
    this.publish('connecting', { error: null, channel })

    let socket: WebSocket
    try {
      socket = new WebSocket(IRC_URL)
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : String(cause))
      return
    }

    this.socket = socket
    this.discarding = false

    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket) return
      this.fail('Timed out opening the chat connection.')
    }, CONNECT_TIMEOUT_MS)

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.clearTimer('connect')

      // Tags carry `user-id`, which is the identity one-vote-per-person keys on.
      // Without this capability the ingest would be counting display names, and
      // a display name can be changed.
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      socket.send(`NICK justinfan${randomInt(10_000, 99_999)}`)
      socket.send(`JOIN #${channel}`)

      this.messages = 0
      this.lastMessageAt = null
      this.failures = 0
      this.publish('live', { error: null })
      this.armSilence()
      logger.info(`Attending #${channel}`)
    })

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return
      this.armSilence()
      const data = typeof event.data === 'string' ? event.data : String(event.data)
      this.ingest(data, socket)
    })

    socket.addEventListener('error', () => {
      if (this.socket !== socket || this.discarding) return
      // The event carries no useful detail by design; `close` follows with more.
      logger.warn('Chat socket error')
    })

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket || this.discarding) return
      const reason = event.reason?.trim()
      this.fail(reason && reason.length > 0 ? reason : 'The chat connection closed.')
    })
  }

  private ingest(chunk: string, socket: WebSocket): void {
    const { lines, rest } = splitIrcFrames(chunk, this.carried)
    this.carried = rest.length > 4_096 ? '' : rest

    const now = Date.now()
    let seen = 0

    for (const raw of lines) {
      const line = parseIrcLine(raw)
      if (!line) continue

      // Answering PING is not optional. Miss it and Twitch drops the connection
      // after a few minutes — the single most common way this integration breaks,
      // and it presents as a poll that counts votes for two minutes and stops.
      if (line.command === 'PING') {
        socket.send(`PONG :${line.trailing ?? 'tmi.twitch.tv'}`)
        continue
      }

      // Twitch asks clients to migrate off a server about to go down. Treating
      // it as a clean restart costs a second and avoids the drop that follows.
      if (line.command === 'RECONNECT') {
        logger.info('Chat server asked us to reconnect')
        this.teardown()
        this.scheduleReconnect(0)
        return
      }

      if (line.command === 'NOTICE' && line.trailing) {
        logger.warn(`Chat notice: ${line.trailing}`)
        continue
      }

      const message = messageFromLine(line, now)
      if (!message) continue

      seen += 1
      this.messages += 1
      this.lastMessageAt = now
      this.emit('message', message)
    }

    /*
     * The status carries counters, so it has to be republished as traffic
     * arrives — but not per message, and not even per socket frame.
     *
     * A busy channel delivers frames many times a second, and this status is
     * consumed by a React hook that calls `setState`: republishing per frame
     * would re-render the console page at chat's message rate, which is exactly
     * the churn the Concord's flush exists to avoid. The counters are a
     * confidence readout rather than data anyone acts on per message, so once a
     * second is ample. State *changes* still publish immediately, through
     * `publish` itself.
     */
    if (seen > 0 && now - this.lastCountersAt >= COUNTER_PUBLISH_MS) {
      this.lastCountersAt = now
      this.publish(this.state, {})
    }
  }

  private fail(message: string): void {
    this.teardown()
    this.failures += 1
    this.publish('retrying', { error: message })
    this.scheduleReconnect(chatBackoffMs(this.failures - 1))
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.claims.size === 0) {
      this.publish('idle', { error: null })
      return
    }

    this.clearTimer('reconnect')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.evaluate()
    }, delayMs)

    logger.info(`Reattempting chat in ${delayMs}ms (attempt ${this.failures + 1})`)
  }

  /**
   * Restarts the silence watchdog.
   *
   * Rearmed on every frame rather than run as an interval, so a healthy
   * connection never trips it and a dead one trips it exactly once.
   */
  private armSilence(): void {
    this.clearTimer('silence')
    this.silenceTimer = setTimeout(() => {
      if (!this.socket) return
      logger.warn('Chat connection went silent; reconnecting')
      this.fail('The chat connection went silent.')
    }, SILENCE_TIMEOUT_MS)
  }

  private teardown(): void {
    this.clearTimer('reconnect')
    this.clearTimer('connect')
    this.clearTimer('silence')
    this.carried = ''

    const socket = this.socket
    this.socket = null
    if (!socket) return

    this.discarding = true
    try {
      socket.close()
    } catch {
      // Closing an already-dead socket is not a problem worth reporting.
    }
  }

  private clearTimer(which: 'reconnect' | 'connect' | 'silence'): void {
    const timer =
      which === 'reconnect'
        ? this.reconnectTimer
        : which === 'connect'
          ? this.connectTimer
          : this.silenceTimer
    if (timer) clearTimeout(timer)
    if (which === 'reconnect') this.reconnectTimer = null
    else if (which === 'connect') this.connectTimer = null
    else this.silenceTimer = null
  }

  /** Applies a state change and fans it out. One path, as with the rite. */
  private publish(
    state: ChatStatus['state'],
    patch: { error?: string | null; channel?: string | null }
  ): void {
    const changedState = this.state !== state
    this.state = state
    if (patch.error !== undefined) this.error = patch.error
    if (patch.channel !== undefined) this.channel = patch.channel
    if (changedState) this.since = Date.now()

    this.emit('status', this.status)
  }
}
