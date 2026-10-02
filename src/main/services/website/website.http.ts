/**
 * Calling the website's private API: what CONTACT, SERVICES and LORE share.
 *
 * Every call carries the board's sign-in as a bearer token, which the
 * website checks against Google's keys and the two accounts' ids before it
 * touches its database. The database itself is never reached from here, and
 * its password is on no machine this console runs on: the repository and
 * the installer are public, and a password in either would be a password
 * for anyone. See docs/INBOX.md.
 *
 * Plain `fetch` rather than `core/net`'s retrying `request`. Everything here
 * is something the operator asked for and is waiting on, and can ask again;
 * backing off inside one call would leave them watching nothing happen.
 * What a caller needs from a failure is its kind, so the page can say which
 * it was, and for the website's own refusals, what it said.
 */

/** How long one call may take before it counts as unreachable. */
const TIMEOUT_MS = 15_000

/**
 * Why a call to the website failed, in the terms the page states it in.
 *
 * `unreachable` is the network or the website being down. The rest are the
 * website answering, and each needs something different done about it.
 */
export type SiteFailureKind =
  | 'unreachable'
  /** The token was refused: expired between refresh and use, or not real. */
  | 'refused'
  /** A real sign-in for an account that is not one of the two. */
  | 'forbidden'
  /** Too many refused attempts from here; the website is waiting an hour. */
  | 'limited'
  /** The website has no database or sign-in settings yet. */
  | 'unconfigured'
  /** The thing is gone: deleted from the other copy. */
  | 'missing'
  /** The website refused what was sent, and said why (in `message`). */
  | 'invalid'
  /** Someone else got there first; `body` holds what the website has now. */
  | 'conflict'
  | 'failed'

export class SiteError extends Error {
  constructor(
    readonly kind: SiteFailureKind,
    message: string,
    /** The HTTP status, when the website answered at all. */
    readonly status: number | null = null,
    /** The website's own answer, when it gave one. */
    readonly body: unknown = null
  ) {
    super(message)
    this.name = 'SiteError'
  }
}

/** The website's answer as JSON, or a SiteError saying it wasn't. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new SiteError('failed', 'The website answered with something that is not JSON.')
  }
}

/**
 * One call, signed in. Resolves with the response when the website said
 * yes; throws a SiteError for everything else.
 */
export async function callWebsite(
  origin: string,
  token: () => Promise<string | null>,
  path: string,
  init: RequestInit
): Promise<Response> {
  const bearer = await token()
  if (!bearer) throw new SiteError('refused', 'Sign in to reach the website.')

  let response: Response
  try {
    response = await fetch(`${origin}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The website marks these no-store; saying so here as well keeps a
      // cached answer from passing for a fresh one.
      cache: 'no-store'
    })
  } catch {
    throw new SiteError('unreachable', `Could not reach ${origin}.`)
  }

  if (response.ok) return response

  // The website names its refusals (`not_configured`, `database_unavailable`,
  // `conflict`) as well as numbering them, and some share a number.
  const body: unknown = await response.json().catch(() => null)
  throw failure(response.status, body, origin)
}

/** JSON to send: the method, the body, and the header saying what it is. */
export function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }
}

function failure(status: number, body: unknown, origin: string): SiteError {
  const said = (body ?? {}) as { error?: unknown; message?: unknown }
  const code = typeof said.error === 'string' ? said.error : ''
  const message = typeof said.message === 'string' ? said.message : ''

  if (status === 503 && code === 'database_unavailable') {
    return new SiteError(
      'unreachable',
      `${origin} cannot reach its database right now.`,
      status,
      body
    )
  }

  switch (status) {
    case 400:
      return new SiteError('invalid', message || 'The website could not accept that.', status, body)
    case 401:
      return new SiteError('refused', 'The website did not accept the sign-in.', status, body)
    case 403:
      return new SiteError('forbidden', 'The website does not let this account in.', status, body)
    case 404:
      // The website names what it can't find; a bare 404 is the address
      // itself missing: a website older than this console, or one started
      // before the address was added.
      return code === 'not_found'
        ? new SiteError('missing', 'The website no longer has it.', status, body)
        : new SiteError(
            'failed',
            `${origin} does not know this request yet. Restart or update it, then try again.`,
            status,
            body
          )
    case 409:
      return new SiteError(
        code === 'conflict' ? 'conflict' : 'invalid',
        message ||
          (code === 'out_of_date'
            ? 'The website changed since it was last fetched. Check for new, then try again.'
            : 'Someone else changed this first.'),
        status,
        body
      )
    case 429:
      return new SiteError(
        'limited',
        'The website is refusing this machine for an hour after too many failed sign-ins.',
        status,
        body
      )
    case 503:
      return new SiteError(
        'unconfigured',
        `${origin} is not set up for the console yet.`,
        status,
        body
      )
    default:
      return new SiteError(
        status >= 500 ? 'unreachable' : 'failed',
        `The website answered ${status}.`,
        status,
        body
      )
  }
}
