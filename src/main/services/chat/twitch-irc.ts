import type { ChatMessage } from '@shared/domain/chat.constants'
import { MAX_CHAT_AUTHOR, MAX_CHAT_MESSAGE } from '@shared/domain/chat.constants'

/**
 * Twitch's IRC wire format, parsed.
 *
 * A protocol adapter, deliberately separate from both the socket that feeds it
 * and the domain it feeds. Everything here is pure, which is the point: this is
 * the layer that turns hostile strings from strangers into a typed record, so it
 * has to be exercisable against a table of malformed frames rather than only
 * against a live channel at the moment a poll is running.
 *
 * Sited in main rather than shared because it describes *Twitch*, not chat. The
 * normalised shape it produces is the shared vocabulary; this is one of
 * presumably several ways of arriving at it.
 */

/** A parsed IRC line. `null` fields are absent rather than empty. */
export interface IrcLine {
  tags: Record<string, string>
  /** The `nick!user@host` prefix, unparsed. */
  prefix: string | null
  /** Uppercase command or numeric, e.g. `PRIVMSG`, `PING`, `001`. */
  command: string
  /** Middle parameters, e.g. the channel. */
  params: string[]
  /** The final space-containing parameter, e.g. the message text. */
  trailing: string | null
}

/**
 * IRCv3 tag value unescaping.
 *
 * Tag values cannot contain spaces or semicolons literally, so Twitch escapes
 * them. Skipping this shows `\s` inside any display name with a space in it —
 * and, more consequentially, corrupts message text containing a semicolon.
 *
 * Written as a single pass rather than chained `replace` calls on purpose: a
 * chain would rewrite the backslashes it had just introduced, so an escaped
 * backslash followed by an `s` would decode to a space.
 */
export function unescapeTagValue(value: string): string {
  let out = ''
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char !== '\\') {
      out += char
      continue
    }

    const next = value[index + 1]
    index += 1
    switch (next) {
      case ':':
        out += ';'
        break
      case 's':
        out += ' '
        break
      case 'r':
        out += '\r'
        break
      case 'n':
        out += '\n'
        break
      case '\\':
        out += '\\'
        break
      case undefined:
        // A trailing lone backslash is dropped, per the spec.
        break
      default:
        // Unknown escapes decode to the character itself.
        out += next
        break
    }
  }
  return out
}

/**
 * Parses one line.
 *
 * Returns null for anything unrecognisable rather than throwing. A single
 * malformed frame must not be able to interrupt ingest — the connection is
 * carrying an audience's votes, and the correct response to one bad line is to
 * drop it and read the next.
 */
export function parseIrcLine(line: string): IrcLine | null {
  let rest = line.trim()
  if (rest.length === 0) return null

  const tags: Record<string, string> = {}

  // @key=value;key2=value2
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ')
    if (end === -1) return null
    const raw = rest.slice(1, end)
    rest = rest.slice(end + 1).trimStart()

    for (const pair of raw.split(';')) {
      if (pair.length === 0) continue
      const equals = pair.indexOf('=')
      if (equals === -1) {
        tags[pair] = ''
        continue
      }
      tags[pair.slice(0, equals)] = unescapeTagValue(pair.slice(equals + 1))
    }
  }

  // :nick!user@host
  let prefix: string | null = null
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ')
    if (end === -1) return null
    prefix = rest.slice(1, end)
    rest = rest.slice(end + 1).trimStart()
  }

  // The trailing parameter is split off before the middles, since it is the only
  // one allowed to contain spaces.
  let trailing: string | null = null
  const trailingAt = rest.indexOf(' :')
  if (rest.startsWith(':')) {
    trailing = rest.slice(1)
    rest = ''
  } else if (trailingAt !== -1) {
    trailing = rest.slice(trailingAt + 2)
    rest = rest.slice(0, trailingAt)
  }

  const parts = rest.length > 0 ? rest.split(/ +/) : []
  const command = parts.shift()
  if (!command) return null

  return { tags, prefix, command: command.toUpperCase(), params: parts, trailing }
}

/** The `nick` out of a `nick!user@host` prefix. */
export function nickFromPrefix(prefix: string | null): string | null {
  if (!prefix) return null
  const bang = prefix.indexOf('!')
  const nick = bang === -1 ? prefix : prefix.slice(0, bang)
  return nick.length > 0 ? nick.toLowerCase() : null
}

/**
 * Badge names out of the `badges` tag.
 *
 * The tag is `subscriber/12,moderator/1` — name/version pairs — and only the
 * names matter for any rule we would plausibly write, so the versions are
 * dropped here rather than carried to no purpose.
 */
export function badgesFromTag(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.split('/')[0]?.trim().toLowerCase() ?? '')
    .filter((entry) => entry.length > 0)
}

/**
 * A `PRIVMSG` line as a normalised chat message, or null if it is not one.
 *
 * `user-id` is required rather than defaulted. It is the identity every
 * per-person rule keys on, and a message without one cannot be counted without
 * either dropping it or inventing an identity — and inventing one would let a
 * single viewer vote repeatedly. Dropping is the only honest option, and in
 * practice the tag is always present once `twitch.tv/tags` has been requested.
 */
export function messageFromLine(line: IrcLine, at: number): ChatMessage | null {
  if (line.command !== 'PRIVMSG') return null

  const text = line.trailing
  if (text === null || text.length === 0) return null

  const userId = line.tags['user-id']?.trim()
  if (!userId) return null

  const login = nickFromPrefix(line.prefix) ?? ''
  const display = (line.tags['display-name'] || login).slice(0, MAX_CHAT_AUTHOR)

  return {
    platform: 'twitch',
    userId,
    login,
    display,
    // Bounded even though Twitch caps at 500: this is untrusted input, and the
    // bound belongs at the point of entry rather than at each consumer.
    text: text.slice(0, MAX_CHAT_MESSAGE),
    at,
    badges: badgesFromTag(line.tags['badges'])
  }
}

/**
 * Splits a socket payload into complete lines, returning any partial remainder.
 *
 * Twitch sends several IRC lines in a single WebSocket frame, and while frames
 * are message-oriented rather than streamed, nothing in the protocol promises a
 * frame ends on a line boundary. Carrying the remainder costs one string and
 * removes the possibility of a truncated line being parsed as a whole one — the
 * kind of fault that would show up as an occasional dropped vote and be
 * essentially undiagnosable after the fact.
 */
export function splitIrcFrames(chunk: string, carried = ''): { lines: string[]; rest: string } {
  const combined = carried + chunk
  const parts = combined.split(/\r?\n/)
  // The last element is either a partial line or an empty string after a
  // terminating newline; both are correct to carry forward.
  const rest = parts.pop() ?? ''
  return { lines: parts.filter((line) => line.trim().length > 0), rest }
}
