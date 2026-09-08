/**
 * Zod-free half of the chat domain — see boot.constants.ts for why the split
 * exists.
 *
 * Chat ingest is department infrastructure rather than one overlay's feature.
 * THE CONCORD counts votes out of it, the Resonance Selection will take filed
 * petitions from it, and THE DOCKET will take queue entries — so the normalised
 * message shape lives here, in shared, rather than inside whichever consumer
 * happened to need it first.
 *
 * Note what is *not* here: the IRC wire format. Parsing Twitch's protocol is an
 * adapter concern and lives in main/services/chat/twitch-irc.ts. This module
 * describes the shape every platform is normalised *into*, which is what keeps a
 * second platform later an ingest change rather than a domain change.
 */

/**
 * Platforms the ingest can read.
 *
 * One entry today. Declared as a set anyway because `platform` travels on every
 * message: attribution that says only "chat" would have to be migrated the day
 * a second source is added, and the field costs nothing now.
 */
export const CHAT_PLATFORMS = ['twitch'] as const
export type ChatPlatform = (typeof CHAT_PLATFORMS)[number]

export const CHAT_PLATFORM_LABEL: Record<ChatPlatform, string> = {
  twitch: 'TWITCH'
}

/**
 * Connection lifecycle.
 *
 * `idle` is not a failure — it is the state when nothing has claimed the
 * connection, which is the normal condition of an app that is not running a
 * poll. Distinguished from `failed` so the console can say "not needed" rather
 * than showing a fault the operator would try to fix.
 */
export const CHAT_STATES = ['idle', 'connecting', 'live', 'retrying', 'failed'] as const
export type ChatConnectionState = (typeof CHAT_STATES)[number]

export const CHAT_STATE_LABEL: Record<ChatConnectionState, string> = {
  idle: 'DORMANT — nothing is listening',
  connecting: 'OPENING THE CHANNEL',
  live: 'ATTENDING',
  retrying: 'REATTEMPTING',
  failed: 'SEVERED'
}

/**
 * Longest message text retained.
 *
 * Twitch caps a message at 500 characters, so this is not a truncation in
 * practice — it is a bound on untrusted input, so a malformed or hostile frame
 * cannot make the ingest hold an arbitrarily large string per message.
 */
export const MAX_CHAT_MESSAGE = 500

/** Longest display name retained, matching the rite's `filedBy` bound. */
export const MAX_CHAT_AUTHOR = 64

/**
 * One message, normalised.
 *
 * A plain interface rather than a zod schema on purpose. This never crosses the
 * IPC boundary — the renderer is told *that* chat is live and how much has
 * arrived, never the traffic itself — so there is nothing here for the router to
 * validate. `ChatStatus` is the part that crosses, and that one has a schema.
 *
 * `userId` is the platform's immutable numeric id, and it is the field that
 * matters most: display names can be changed and near-impersonated, so counting
 * one vote per person has to key on the id or a determined viewer can vote
 * twice by renaming.
 */
export interface ChatMessage {
  platform: ChatPlatform
  /** Immutable platform id. The identity every per-person rule keys on. */
  userId: string
  /** Lowercase account name. */
  login: string
  /** Name as the platform renders it, for attribution. */
  display: string
  text: string
  at: number
  /**
   * Platform badges, lowercased (`subscriber`, `moderator`, `vip`, …).
   *
   * Carried but unused. Weighted voting — a subscriber's vote counting for more
   * — is a plausible next step, and having badges already on the message means
   * it is a rule change rather than an ingest change.
   */
  badges: readonly string[]
}

// ---------------------------------------------------------------- reconnection

/**
 * Backoff schedule, in milliseconds, indexed by consecutive failure count.
 *
 * Bounded and then held at the last entry rather than growing without limit: a
 * stream can run for hours, and a connection that dropped because the operator's
 * router rebooted should still be retrying every half minute an hour later
 * rather than having backed off into next week.
 */
export const CHAT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const

/**
 * Random spread added to every retry.
 *
 * Twitch's IRC bridge serves a great many clients, and an outage ends with all
 * of them reconnecting at once. Jitter is what stops this app being part of the
 * thundering herd that follows — and, more selfishly, being rate-limited in it.
 */
export const CHAT_BACKOFF_JITTER_MS = 900

export function chatBackoffMs(failures: number, roll = Math.random()): number {
  const index = Math.min(Math.max(failures, 0), CHAT_BACKOFF_MS.length - 1)
  return CHAT_BACKOFF_MS[index] + Math.floor(roll * CHAT_BACKOFF_JITTER_MS)
}

// -------------------------------------------------------------------- channel

/**
 * Normalises whatever the operator typed into a channel name.
 *
 * They will paste a URL — that is simply what people do with a channel — so
 * `https://twitch.tv/someone`, `#someone`, ` SomeOne ` and `someone` all have to
 * resolve to the same thing. Getting this wrong fails with an empty chat and no
 * error, because joining a nonexistent channel over IRC is silently permitted.
 */
export function normaliseChatChannel(input: string): string {
  let value = input.trim().toLowerCase()

  // Strip a pasted URL down to its first path segment.
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?#]+)/)
  if (url) value = url[1]

  value = value.replace(/^#+/, '')
  // Twitch logins are alphanumerics and underscores; anything else is paste
  // debris rather than part of the name.
  value = value.replace(/[^a-z0-9_]/g, '')

  return value.slice(0, MAX_CHAT_AUTHOR)
}

/** Whether a normalised channel name could plausibly exist. */
export function isPlausibleChatChannel(channel: string): boolean {
  return /^[a-z0-9_]{3,25}$/.test(channel)
}
