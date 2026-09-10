import { randomUUID } from 'node:crypto'
import {
  DispatchItemSchema,
  type DispatchCommentDraft,
  type DispatchDraft,
  type DispatchItem,
  type DispatchLink,
  type DispatchRuling,
  type DispatchSetup,
  type DispatchState,
  type FirebaseConfig
} from '@shared/domain/dispatch'
import { DISPATCH_ROOT_PATH, type DispatchAuthor } from '@shared/domain/dispatch.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import {
  firebaseConfigPath,
  loadFirebaseConfig,
  parseFirebaseConfig,
  saveFirebaseConfig
} from './firebase-config'
import { RtdbClient } from './rtdb.client'
import { IdentityAuth, REFRESH_MARGIN_MS, type DispatchSession } from './identity.auth'
import { DispatchTokenStore } from './dispatch.tokens'

const logger = getLogger('dispatch')

interface DispatchEvents {
  state: DispatchState
}

/** Backoff between reconnection attempts. Capped so it keeps trying all day. */
const RETRY_MIN_MS = 2_000
const RETRY_MAX_MS = 60_000

/**
 * DISPATCH — the shared suggestion board.
 *
 * The one part of this application whose state does not belong to this machine.
 * Two people use Candy Haven and both need to see the same list, so the record
 * lives in a Firebase Realtime Database and every copy of the app holds a
 * mirror of it.
 *
 * **The mirror is not authoritative and is never treated as such.** A write
 * goes to the database and the change comes back down the stream like anyone
 * else's; nothing is applied locally first. That costs a round trip on every
 * action and buys the thing that matters on a two-person board: what is on
 * screen is what the other person will see, rather than an optimistic guess
 * that has to be walked back when the server disagrees.
 *
 * Unauthenticated, deliberately. See `RtdbClient` for what that rests on and
 * when it stops being true.
 */
export class DispatchService extends TypedEmitter<DispatchEvents> {
  private state: DispatchState = {
    link: {
      state: 'unconfigured',
      message: 'No Firebase config has been supplied.',
      projectId: null,
      identity: null,
      syncedAt: null
    },
    items: [],
    revision: 0
  }

  private config: FirebaseConfig | null = null
  private auth: IdentityAuth | null = null
  private readonly tokens = new DispatchTokenStore()
  private session: DispatchSession | null = null
  /** Serialises refreshes, so five concurrent writes do not mint five tokens. */
  private refreshing: Promise<DispatchSession> | null = null
  private client: RtdbClient | null = null
  private stop: (() => void) | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private retryDelay = RETRY_MIN_MS

  get current(): DispatchState {
    return this.state
  }

  get setup(): DispatchSetup {
    return {
      configured: this.config !== null,
      projectId: this.config?.projectId || null,
      databaseUrl: this.config?.databaseURL || null,
      configPath: firebaseConfigPath()
    }
  }

  // -------------------------------------------------------------------- auth

  /**
   * Exchanges an address and a password for a session, and attaches.
   *
   * Neither is kept. They go to Firebase and come back as a pair of tokens; the
   * refresh token is what survives a restart, encrypted with the OS keystore.
   * The address is asked for rather than held in the build because neither
   * operator's belongs in a repository — the account is recognised afterwards
   * by its UID, which is opaque and already public in the database's rules.
   */
  async signIn(email: string, password: string): Promise<DispatchState> {
    const auth = this.requireAuth()

    this.session = await auth.signIn(email, password)
    await this.tokens.save({
      identity: this.session.identity,
      uid: this.session.uid,
      refreshToken: this.session.refreshToken
    })

    this.detach()
    this.attach()

    return this.state
  }

  /**
   * Drops the session and the stored token, and detaches.
   *
   * The board is emptied with it. Leaving the last-read items on screen after
   * signing out would leave one operator's board visible to whoever signs in
   * next, which is the one thing signing out is for.
   */
  async signOut(): Promise<DispatchState> {
    this.detach()
    this.session = null
    await this.tokens.clear()

    this.state = { ...this.state, items: [] }
    this.patchLink({
      state: this.config ? 'signed-out' : 'unconfigured',
      message: this.config ? 'Sign in to see the board.' : 'No Firebase config has been supplied.',
      identity: null
    })

    return this.state
  }

  /**
   * A currently valid ID token, refreshed if it is close to expiring.
   *
   * Handed to `RtdbClient` as a provider rather than a value, so a refresh
   * between two requests is picked up by the second without anything having to
   * be told. Concurrent callers share one refresh: five writes landing together
   * on an expired token should produce one round trip, not five, and Firebase
   * rotates the refresh token on use — five parallel exchanges would invalidate
   * four of the results.
   */
  private async token(): Promise<string | null> {
    const session = this.session
    const auth = this.auth
    if (!session || !auth) return null

    if (Date.now() < session.expiresAt - REFRESH_MARGIN_MS) return session.idToken

    this.refreshing ??= auth
      .refresh(session.refreshToken)
      .then(async (next) => {
        this.session = next
        await this.tokens.save({
          identity: next.identity,
          uid: next.uid,
          refreshToken: next.refreshToken
        })
        return next
      })
      .finally(() => {
        this.refreshing = null
      })

    try {
      return (await this.refreshing).idToken
    } catch (cause) {
      logger.warn('Could not refresh the board sign-in', cause)
      this.session = null
      await this.tokens.clear()
      this.patchLink({
        state: 'signed-out',
        message: 'The sign-in expired. Sign in again.',
        identity: null
      })
      return null
    }
  }

  private requireAuth(): IdentityAuth {
    if (!this.auth) {
      throw new AppError('The board has no Firebase config yet.', {
        code: ErrorCode.Unavailable,
        hint: 'Paste the config in the panel below first.'
      })
    }
    return this.auth
  }

  /**
   * Finds a config and attaches, if there is one.
   *
   * Never throws. This runs during boot, and an unreachable database is a
   * reason to show a disconnected board, not to refuse to start — the same rule
   * the Spotify link follows.
   */
  async initialize(): Promise<void> {
    this.config = await loadFirebaseConfig()

    if (!this.config) {
      this.patchLink({
        state: 'unconfigured',
        message: 'No Firebase config has been supplied.'
      })
      return
    }

    this.auth = new IdentityAuth(this.config.apiKey)

    /*
     * Restore the session before attaching.
     *
     * The stream carries the token in its URL, so opening one without a session
     * would be refused by the rules and then retried on a backoff — an
     * unattached board and a log full of 401s, when the honest state is simply
     * that nobody has signed in yet.
     */
    const stored = await this.tokens.load()
    if (!stored) {
      this.patchLink({ state: 'signed-out', message: 'Sign in to see the board.' })
      return
    }

    try {
      this.session = await this.auth.refresh(stored.refreshToken)
      await this.tokens.save({
        identity: this.session.identity,
        uid: this.session.uid,
        refreshToken: this.session.refreshToken
      })
      this.attach()
    } catch (cause) {
      logger.warn('The stored board sign-in is no longer valid', cause)
      await this.tokens.clear()
      this.patchLink({ state: 'signed-out', message: 'The sign-in expired. Sign in again.' })
    }
  }

  /** Accepts a pasted console snippet, saves it, and reattaches. */
  async configure(source: string): Promise<DispatchState> {
    const parsed = parseFirebaseConfig(source)
    if (!parsed) {
      throw new AppError('That does not look like a Firebase config.', {
        code: ErrorCode.Validation,
        hint: 'Paste the whole snippet the Firebase console shows under "Web app", including the databaseURL line.'
      })
    }

    await saveFirebaseConfig(parsed)
    this.config = parsed
    this.auth = new IdentityAuth(parsed.apiKey)

    this.detach()
    if (this.session) this.attach()
    else this.patchLink({ state: 'signed-out', message: 'Sign in to see the board.' })

    return this.state
  }

  // ------------------------------------------------------------------ writes

  async file(draft: DispatchDraft): Promise<DispatchState> {
    const client = this.require()
    const now = Date.now()
    const id = randomUUID()

    const item: DispatchItem = DispatchItemSchema.parse({
      id,
      title: draft.title.trim(),
      body: draft.body.trim(),
      kind: draft.kind,
      area: draft.area,
      priority: draft.priority,
      author: draft.author,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      comments: {},
      // Filing something counts as having read it. Without this the author's
      // own item would come back marked unread to them.
      seen: { mist: draft.author === 'mist' ? now : 0, candy: draft.author === 'candy' ? now : 0 }
    })

    await client.put(`${DISPATCH_ROOT_PATH}/${id}`, item)
    return this.state
  }

  async comment(draft: DispatchCommentDraft): Promise<DispatchState> {
    const client = this.require()
    const now = Date.now()
    const id = randomUUID()

    /*
     * Two writes rather than one, and in this order.
     *
     * The comment lands first so that the `updatedAt` bump — which is what the
     * other copy sorts and marks unread by — never arrives describing a comment
     * that is not there yet. The reverse order has a window, small but real, in
     * which the board says there is something new and has nothing to show.
     */
    await client.put(`${DISPATCH_ROOT_PATH}/${draft.itemId}/comments/${id}`, {
      id,
      author: draft.author,
      body: draft.body.trim(),
      createdAt: now
    })

    await client.patch(`${DISPATCH_ROOT_PATH}/${draft.itemId}`, {
      updatedAt: now,
      // Commenting is reading. The writer should not be told their own comment
      // is unread the moment they post it.
      [`seen/${draft.author}`]: now
    })

    return this.state
  }

  /**
   * Resolves, denies, or puts an item back to pending.
   *
   * A denial without a reason is refused here rather than only in the
   * interface: an unexplained "no" on a board two people share is the thing
   * that makes the other one stop filing, and the rule is worth keeping where
   * it cannot be bypassed.
   */
  async rule(ruling: DispatchRuling): Promise<DispatchState> {
    const client = this.require()
    const reason = ruling.reason.trim()

    if (ruling.status === 'denied' && !reason) {
      throw new AppError('A denial needs a reason.', {
        code: ErrorCode.Validation,
        hint: 'Say why, even briefly. It is the difference between a decision and a dismissal.'
      })
    }

    await client.patch(`${DISPATCH_ROOT_PATH}/${ruling.itemId}`, {
      status: ruling.status,
      statusReason: ruling.status === 'pending' ? null : reason || null,
      statusAt: ruling.status === 'pending' ? null : Date.now(),
      updatedAt: Date.now()
    })

    return this.state
  }

  /** Marks everything on an item read, for one person, as of now. */
  async markSeen(itemId: string, author: DispatchAuthor): Promise<DispatchState> {
    const client = this.require()

    /*
     * Not an `updatedAt` bump.
     *
     * Reading is not activity: bumping it would reorder RECENTLY DISCUSSED
     * every time either of them opened an item, and — worse — each copy would
     * see the other's *reading* as a reason to look again.
     */
    await client.patch(`${DISPATCH_ROOT_PATH}/${itemId}/seen`, { [author]: Date.now() })
    return this.state
  }

  /**
   * Removes an item entirely.
   *
   * Distinct from denying it, which is a ruling and stays on the board with its
   * reason. This is for something filed by mistake, and it takes the discussion
   * with it — which is why the interface asks first.
   */
  async withdraw(itemId: string): Promise<DispatchState> {
    const client = this.require()
    await client.remove(`${DISPATCH_ROOT_PATH}/${itemId}`)
    return this.state
  }

  // ----------------------------------------------------------------- plumbing

  private require(): RtdbClient {
    if (!this.client) {
      throw new AppError(this.session ? 'The board is not connected.' : 'Sign in first.', {
        code: ErrorCode.Unavailable,
        hint: this.session
          ? 'It will reattach on its own; try again in a moment.'
          : 'Enter your password at the top of the page.',
        recoverable: true
      })
    }
    return this.client
  }

  /**
   * Opens the change stream.
   *
   * The stream is the only way state enters this service — including the
   * initial load, because the first frame of a Firebase SSE stream carries the
   * whole subtree. There is no separate fetch to keep in step with it.
   */
  private attach(): void {
    if (!this.config || !this.session) return

    this.client = new RtdbClient(this.config.databaseURL, () => this.token())
    this.patchLink({
      state: 'connecting',
      message: 'Attaching to the board…',
      projectId: this.config.projectId || null,
      identity: this.session.identity
    })

    this.stop = this.client.stream(DISPATCH_ROOT_PATH, {
      onOpen: () => {
        this.retryDelay = RETRY_MIN_MS
        this.patchLink({ state: 'online', message: 'Attached.' })
      },
      onEvent: (event) => this.applyRemote(event.kind, event.path, event.data),
      /*
       * The hour is up, not a failure.
       *
       * Firebase cannot renew a stream's credential in place, so it revokes and
       * stops sending. Reconnecting immediately is right — `attach` builds a
       * fresh URL and the provider will have refreshed the token by then — and
       * going through the backoff would leave the board stale for no reason.
       */
      onAuthRevoked: () => {
        this.stop?.()
        this.stop = null
        this.attach()
      },
      onError: (error) => {
        logger.warn('The board stream dropped', error)
        this.patchLink({ state: 'error', message: error.message })
        this.scheduleRetry()
      }
    })
  }

  private detach(): void {
    this.stop?.()
    this.stop = null
    this.client = null
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Reconnects, backing off.
   *
   * A dropped stream is usually the network coming and going rather than
   * anything wrong with the board, so it keeps trying — but doubling up to a
   * minute, because the other case is a database whose rules have expired, and
   * hammering that helps nobody.
   */
  private scheduleRetry(): void {
    if (this.retryTimer) return

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.stop?.()
      this.stop = null
      this.attach()
    }, this.retryDelay)

    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS)
  }

  /**
   * Folds one stream frame into the mirror.
   *
   * Firebase addresses a change by path relative to what is being watched, so
   * `/` is the whole board, `/<id>` is one item, and `/<id>/status` is one
   * field. Rather than maintaining a tree and applying each depth separately,
   * the frames that are not whole-board are turned into a re-read of the item
   * they touch — which is cheap here, because the board is small and the frames
   * are rare, and it keeps one path through validation instead of three.
   */
  private applyRemote(kind: 'put' | 'patch', path: string, data: unknown): void {
    const segments = path.split('/').filter(Boolean)

    // The whole board: the first frame, and any wholesale replacement.
    if (segments.length === 0) {
      this.state = { ...this.state, items: readBoard(data), revision: this.state.revision + 1 }
      this.touched()
      this.publish()
      return
    }

    const id = segments[0]

    // A whole item replaced or removed.
    if (segments.length === 1 && kind === 'put') {
      this.state = {
        ...this.state,
        items:
          data === null
            ? this.state.items.filter((item) => item.id !== id)
            : upsert(this.state.items, readItem(id, data)),
        revision: this.state.revision + 1
      }
      this.touched()
      this.publish()
      return
    }

    /*
     * A field inside an item.
     *
     * Rebuilt by merging the frame into the item already held, then re-parsing
     * the result. Merging into a plain object first means a `patch` carrying
     * `{ status, statusReason }` and a `put` at `/<id>/seen/mist` both end up
     * in the same shape before validation, so there is one place that can
     * reject a bad frame.
     */
    const existing = this.state.items.find((item) => item.id === id)
    if (!existing) {
      // A frame for something we have never seen. The stream will have sent the
      // item itself in a moment; ignoring it is correct and it is not an error.
      return
    }

    const merged = applyAt(
      existing as unknown as Record<string, unknown>,
      segments.slice(1),
      kind,
      data
    )
    this.state = {
      ...this.state,
      items: upsert(this.state.items, readItem(id, merged)),
      revision: this.state.revision + 1
    }
    this.touched()
    this.publish()
  }

  private patchLink(link: Partial<DispatchLink>): void {
    this.state = { ...this.state, link: { ...this.state.link, ...link } }
    this.publish()
  }

  private publish(): void {
    this.emit('state', this.state)
  }

  /** Stamps the moment a frame carrying data arrived, for the console readout. */
  private touched(): void {
    this.state = { ...this.state, link: { ...this.state.link, syncedAt: Date.now() } }
  }

  dispose(): void {
    this.detach()
  }
}

// --------------------------------------------------------------------- shapes

/**
 * The board, from whatever the stream sent.
 *
 * Items are validated one at a time and a bad one is dropped rather than taking
 * the board with it. That matters more here than anywhere else in the
 * application: this data was written by *another copy of the app*, possibly an
 * older build, and one record it wrote in a shape this one does not know must
 * not empty the list.
 */
function readBoard(data: unknown): DispatchItem[] {
  if (!data || typeof data !== 'object') return []

  return Object.entries(data as Record<string, unknown>).flatMap(([id, value]) => {
    const parsed = DispatchItemSchema.safeParse({ ...(value as object), id })
    if (parsed.success) return [parsed.data]

    logger.warn(`Skipping an unreadable board item (${id})`)
    return []
  })
}

function readItem(id: string, data: unknown): DispatchItem {
  return DispatchItemSchema.parse({ ...(data as object), id })
}

function upsert(items: readonly DispatchItem[], next: DispatchItem): DispatchItem[] {
  const index = items.findIndex((item) => item.id === next.id)
  if (index === -1) return [...items, next]

  const copy = [...items]
  copy[index] = next
  return copy
}

/**
 * Sets or merges `data` at `segments` within a copy of `target`.
 *
 * A `put` replaces what is at the path; a `patch` merges its keys into it. Both
 * copy on the way down rather than mutating, so the item currently on screen is
 * never edited underneath the renderer.
 */
function applyAt(
  target: Record<string, unknown>,
  segments: readonly string[],
  kind: 'put' | 'patch',
  data: unknown
): Record<string, unknown> {
  if (segments.length === 0) {
    if (kind === 'patch' && data && typeof data === 'object') {
      return { ...target, ...(data as Record<string, unknown>) }
    }
    return (data ?? {}) as Record<string, unknown>
  }

  const [head, ...rest] = segments
  const child = target[head]
  const base = child && typeof child === 'object' ? (child as Record<string, unknown>) : {}

  if (rest.length === 0 && kind === 'put' && data === null) {
    // A deletion: Firebase sends `put` with null, and the key must go rather
    // than becoming an explicit null the schema would then have to tolerate.
    const copy = { ...target }
    delete copy[head]
    return copy
  }

  return { ...target, [head]: applyAt(base, rest, kind, data) }
}
