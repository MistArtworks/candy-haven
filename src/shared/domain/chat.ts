import { z } from 'zod'
import { CHAT_PLATFORMS, CHAT_STATES } from './chat.constants'

/**
 * Schema half of the chat domain.
 *
 * Small on purpose. The only thing that crosses the IPC boundary is the
 * *connection's* state — whether chat is being read, from where, and how much
 * has arrived. The traffic itself never does: the renderer has no use for it,
 * and not sending it means untrusted text from strangers never reaches the
 * console's DOM at all.
 *
 * As with the rite: every field carries a default, because the router validates
 * handler output and a missing field would fail the channel rather than degrade.
 */

export const ChatPlatformSchema = z.enum(CHAT_PLATFORMS)
export type ChatPlatform = z.infer<typeof ChatPlatformSchema>

export const ChatConnectionStateSchema = z.enum(CHAT_STATES)
export type ChatConnectionState = z.infer<typeof ChatConnectionStateSchema>

export const ChatStatusSchema = z.object({
  platform: ChatPlatformSchema.default('twitch'),
  state: ChatConnectionStateSchema.default('idle'),
  /** Channel being read. Null until the operator has configured one. */
  channel: z.string().nullable().default(null),
  /**
   * Why the connection is not live, when it is not.
   *
   * Operator-facing text rather than an exception message — a poll that is not
   * counting votes is the kind of problem that has to be diagnosable at a glance
   * mid-broadcast.
   */
  error: z.string().nullable().default(null),
  /** When the current state was entered, for the console's uptime readout. */
  since: z.number().nullable().default(null),
  /**
   * Messages seen since the connection opened.
   *
   * The console's proof that chat is genuinely flowing. A `live` connection to a
   * quiet channel and a `live` connection that is silently receiving nothing look
   * identical without it, and the difference matters a great deal in the minute
   * before a poll opens.
   */
  messages: z.number().int().min(0).default(0),
  /** When the last message arrived, for the same reason. */
  lastMessageAt: z.number().nullable().default(null),
  /**
   * Consecutive failed attempts, surfaced so a retry loop is visible rather
   * than looking like a hang.
   */
  failures: z.number().int().min(0).default(0),
  /**
   * What is currently holding the connection open.
   *
   * The ingest is claim-based, so an idle app holds no socket. Listing the
   * claimants turns "why is chat connected right now?" into something the
   * console can answer instead of a mystery.
   */
  claims: z.array(z.string()).default([])
})
export type ChatStatus = z.infer<typeof ChatStatusSchema>
