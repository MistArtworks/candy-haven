import { Notification } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { AUDIO_EXTENSIONS, audioMimeFor, type AudioPayload } from '@shared/domain/auditorium'
import type {
  Consultation,
  ConsultationDraft,
  ConsultationExpiry,
  ConsultationFeedback,
  ConsultationLink,
  ConsultationProgress,
  ConsultationState
} from '@shared/domain/consultation'
import {
  CLOSING_SOON_MS,
  MAX_LINK_DAYS,
  MAX_TRACK_BYTES,
  STORAGE_FOLDER,
  STORAGE_FREE_BYTES,
  formatLeft,
  isLinkOpen,
  latestClose,
  storedType,
  type ShareStage
} from '@shared/domain/consultation.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import type { DispatchService } from '@main/services/dispatch/dispatch.service'
import { hostOf, websiteFor } from '@main/services/website/website.address'
import { ConsultationClient, SiteError, type RemoteConsultation } from './consultation.client'
import { ConsultationRepository, type WaitingLink } from './consultation.repository'
import { StorageClient, StorageError } from './storage.client'

const logger = getLogger('consultation')

interface ConsultationEvents {
  state: ConsultationState
  /** How far the upload under way has got. */
  progress: ConsultationProgress
}

/** Pages of feedback one check-in takes, two hundred a page: a stop, not a limit. */
const MAX_PAGES = 50

/** Where a clicked notice sends the operator. */
const PAGE = '/consultation'

/**
 * How long after a link's close its track is deleted: a few seconds, so
 * the website, which decides, has closed it by then.
 */
const CLOSE_GRACE_MS = 5_000

/** The longest a timer can be set for: 2^31 - 1 ms, about 24 days. */
const LONGEST_TIMER_MS = 2 ** 31 - 1

/**
 * CONSULTATION: tracks shared for other producers' feedback.
 *
 * Sharing uploads the track to Firebase Storage, then opens a link for it
 * on the website, which stays open for the days chosen, a week at most.
 * Producers send their notes and tools there; this service checks in with
 * the website when asked and keeps a copy of what they sent in the archive,
 * so the department opens at once and plays their settings offline.
 *
 * **Asked, not polled**, as the inbox is: at startup, on signing in, on a
 * new website address, and on Check for new. The one thing that runs by
 * itself is a link closing while the console is open: a check-in at that
 * moment, which deletes the track from the bucket, since the deletion is
 * the promise made when it was shared. A link that closes while no copy is
 * open has its track deleted at the next startup, and the bucket's own
 * lifecycle rule deletes anything left after eight days.
 *
 * **The website decides when a link closes.** Either copy of the console
 * can move a link's close or end it, so a track is only deleted, and a
 * link's feedback only dropped from the copy, straight after the website
 * has said the link is closed.
 *
 * Signed in means signed in to DISPATCH, as for the inbox. While nobody is,
 * nothing is fetched and nothing in the copy is shown.
 */
export class ConsultationService extends TypedEmitter<ConsultationEvents> {
  private state: ConsultationState = {
    link: {
      state: 'signed-out',
      message: 'Sign in to check the website.',
      website: '',
      syncedAt: null
    },
    storage: { bucket: null, usedBytes: 0, limitBytes: STORAGE_FREE_BYTES },
    waiting: 0,
    revision: 0
  }

  /** Whether the listeners are attached, so a retried boot does not double them. */
  private started = false
  private running: Promise<void> | null = null
  /** A check-in asked for while one was running: run once more after it. */
  private queued = false
  /** Whether the startup notice has been given this session. */
  private announced = false
  private readonly unsubscribers: (() => void)[] = []
  private opener: ((path: string) => void) | null = null
  /** Notifications still on screen, held so a click on one is not dropped (see InboxService). */
  private readonly shown = new Set<Notification>()
  /** The next open link to close while the console runs, whose track goes when it does. */
  private closing: NodeJS.Timeout | null = null
  /** The upload under way, so it can be cancelled. */
  private uploading: AbortController | null = null
  /**
   * Serialises what reads the website's list and writes the copy from it.
   * Without it, a check-in that listed the links a moment before a share
   * would lay that older list over the copy after the share, and drop the
   * link just opened as one removed elsewhere.
   */
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly archive: ArchiveService,
    private readonly settings: SettingsService,
    private readonly dispatch: DispatchService
  ) {
    super()
  }

  get current(): ConsultationState {
    return this.state
  }

  /** The website being read, as an origin: the inbox's, from REGULATION. */
  get website(): string {
    return websiteFor(this.settings.snapshot)
  }

  private get repository(): ConsultationRepository {
    return new ConsultationRepository(this.archive.getDb())
  }

  private get signedIn(): boolean {
    return this.dispatch.current.link.identity !== null
  }

  private client(website: string): ConsultationClient {
    return new ConsultationClient(website, () => this.dispatch.idToken())
  }

  /** The bucket, on the board's sign-in, or null when the config names none. */
  private storage(): StorageClient | null {
    const bucket = this.dispatch.storageBucket
    return bucket ? new StorageClient(bucket, () => this.dispatch.idToken()) : null
  }

  /** Where a clicked notice goes; wired by the main entry. */
  setOpener(open: (path: string) => void): void {
    this.opener = open
  }

  /**
   * Checks in once, and listens for the moments that call for another.
   * Never throws and never waits on the network: this runs during boot.
   */
  initialize(): void {
    if (this.started) {
      void this.sync()
      return
    }
    this.started = true

    let signedIn = this.signedIn
    let configured = this.dispatch.current.link.state !== 'unconfigured'
    let bucket = this.dispatch.storageBucket
    let website = this.website

    // Signing in or out on DISPATCH is signing in or out here, and a newly
    // pasted config may name a bucket where the last one named none.
    this.unsubscribers.push(
      this.dispatch.on('state', (state) => {
        const nowSignedIn = state.link.identity !== null
        const nowConfigured = state.link.state !== 'unconfigured'
        const nowBucket = this.dispatch.storageBucket
        if (nowSignedIn === signedIn && nowConfigured === configured && nowBucket === bucket) {
          return
        }
        signedIn = nowSignedIn
        configured = nowConfigured
        bucket = nowBucket
        void this.sync()
      })
    )

    this.unsubscribers.push(
      this.settings.on('changed', () => {
        if (this.website === website) return
        website = this.website
        this.patchLink({ website, syncedAt: null })
        void this.sync()
      })
    )

    void this.sync()
  }

  // -------------------------------------------------------------- check-ins

  /** Checks in now, and settles when it has. One at a time, as the inbox's are. */
  sync(): Promise<void> {
    if (this.running) {
      this.queued = true
      return this.running
    }

    this.running = (async () => {
      do {
        this.queued = false
        await this.exclusive(() => this.run()).catch((error: unknown) => {
          logger.error('The consultation check-in could not use the archive', error)
        })
      } while (this.queued)
    })().finally(() => {
      this.running = null
    })

    return this.running
  }

  private async run(): Promise<void> {
    this.disarm()
    if (!this.archive.isConnected()) return
    const website = this.website

    if (this.dispatch.current.link.state === 'unconfigured') {
      this.patchLink({
        state: 'unconfigured',
        message: 'No Firebase config has been supplied.',
        website
      })
      await this.refresh()
      return
    }

    if (!this.signedIn) {
      this.patchLink({ state: 'signed-out', message: 'Sign in to check the website.', website })
      await this.refresh()
      return
    }

    this.patchLink({ state: 'syncing', message: `Checking in with ${hostOf(website)}…`, website })
    try {
      await this.pull(this.client(website), website)
      this.patchLink({ state: 'online', message: 'Up to date.', syncedAt: Date.now() })
    } catch (error) {
      if (!(error instanceof SiteError)) logger.warn('The consultation check-in failed', error)
      this.patchLink({
        state: 'offline',
        message: error instanceof SiteError ? error.message : 'The check-in failed.'
      })
    }
    await this.refresh()
    await this.arm(website)

    if (!this.announced && this.signedIn) {
      this.announced = true
      await this.announceWaiting(website)
    }
  }

  /**
   * Brings the copy up to date: the links as the website lists them, the
   * feedback sent since the last check-in, and the tracks of links that
   * have closed deleted from the bucket.
   */
  private async pull(client: ConsultationClient, website: string): Promise<void> {
    const repository = this.repository

    const listed = await client.list()
    if (listed.unreadable) {
      logger.warn(`Left out ${listed.unreadable} unreadable shared track(s) from the website`)
    }
    await repository.applyList(website, listed.consultations)
    // The website has deleted a closed link's feedback; so does the copy.
    await repository.purgeClosed(website, Date.now())

    let cursor = await repository.cursor(website)
    for (let page = 0; page < MAX_PAGES; page++) {
      const changes = await client.feedback(cursor)
      if (changes.unreadable) {
        logger.warn(`Left out ${changes.unreadable} unreadable piece(s) of feedback`)
      }
      await repository.applyFeedback(website, changes.feedback)
      cursor = changes.cursor
      await repository.saveCursor(website, cursor)
      if (!changes.more) break
    }

    await this.sweep(client, website)
  }

  /**
   * Deletes the tracks of closed links from the bucket. One that can't be
   * deleted now is left for the next check-in; the record keeps counting
   * it on the meter until one is.
   */
  private async sweep(client: ConsultationClient, website: string): Promise<void> {
    const due = await this.repository.undeleted(website, Date.now())
    if (!due.length) return

    const storage = this.storage()
    if (!storage) {
      logger.warn(
        `${due.length} closed link(s) still have a track, and there is no bucket to delete from`
      )
      return
    }

    for (const link of due) {
      await this.deleteTrack(client, storage, website, link).catch((error: unknown) => {
        logger.warn(`Could not delete the track of ${link.id} yet`, error)
      })
    }
  }

  /**
   * Deletes one link's track from the bucket, then tells the website, so
   * the other copy doesn't try again and both meters drop. The bucket
   * first: a record that says deleted while the track is still there would
   * never be retried.
   */
  private async deleteTrack(
    client: ConsultationClient,
    storage: StorageClient,
    website: string,
    link: Pick<Consultation, 'id' | 'audio'>
  ): Promise<void> {
    // Never anything outside the folder, whatever a record says.
    const path = link.audio.path
    if (path.startsWith(STORAGE_FOLDER) && !path.includes('..')) await storage.remove(path)
    const remote = await client.change(link.id, { audioDeletedAt: new Date().toISOString() })
    await this.repository.applyOne(website, remote)
  }

  /** Sets the timer for the next open link to close, so its track goes when it does. */
  private async arm(website: string): Promise<void> {
    this.disarm()
    if (!this.signedIn || !this.archive.isConnected()) return
    const now = Date.now()
    const next = await this.repository.nextClose(website, now)
    if (next === null) return
    const wait = Math.min(Math.max(0, next - now) + CLOSE_GRACE_MS, LONGEST_TIMER_MS)
    this.closing = setTimeout(() => {
      this.closing = null
      void this.sync()
    }, wait)
  }

  private disarm(): void {
    if (!this.closing) return
    clearTimeout(this.closing)
    this.closing = null
  }

  // ------------------------------------------------------------------- reads

  /** This website's shared tracks, newest first. None while signed out. */
  async list(): Promise<Consultation[]> {
    if (!this.signedIn || !this.archive.isConnected()) return []
    return this.repository.list(this.website, Date.now())
  }

  /** One open link's feedback, in the order it was sent. None once it has closed. */
  async feedback(id: string): Promise<ConsultationFeedback[]> {
    if (!this.signedIn || !this.archive.isConnected()) return []
    return this.repository.feedbackFor(this.website, id, Date.now())
  }

  /** Opening a link's feedback reads all of it. */
  async markRead(id: string): Promise<void> {
    this.requireSignedIn()
    if (await this.repository.markRead(this.website, id, Date.now())) await this.refresh()
  }

  /**
   * A shared track's sound, to hear the feedback through: the file it was
   * shared from when it is still where it was and the same size, and
   * otherwise the copy in the bucket, while there is one.
   */
  async audio(id: string): Promise<AudioPayload> {
    this.requireSignedIn()
    const link = await this.requireHeld(id)

    if (link.sourcePath) {
      const info = await stat(link.sourcePath).catch(() => null)
      if (info?.isFile() && info.size === link.audio.bytes) {
        const contents = await readFile(link.sourcePath)
        return {
          path: link.sourcePath,
          name: basename(link.sourcePath),
          extension: extname(link.sourcePath).slice(1).toLowerCase(),
          size: info.size,
          modifiedAt: info.mtimeMs,
          // Its own ArrayBuffer, for the reason `auditorium:read` gives.
          bytes: new Uint8Array(
            contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)
          )
        }
      }
    }

    if (link.audioDeletedAt !== null || !link.audio.path) {
      throw new AppError('Its track has been deleted from storage.', {
        code: ErrorCode.NotFound,
        hint: link.sourcePath
          ? 'And the file it was shared from has moved or changed since.'
          : 'It was shared from the other copy of the console, so there is no file of it here.',
        recoverable: false
      })
    }

    const storage = this.requireStorage()
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = await storage.download(link.audio.path)
    } catch (error) {
      throw storageProblem(error, 'The track is not in storage any more.')
    }
    const extension = extname(link.audio.path).slice(1).toLowerCase()
    return {
      path: link.audio.path,
      name: `${link.title}.${extension}`,
      extension,
      size: bytes.byteLength,
      modifiedAt: link.createdAt,
      bytes
    }
  }

  // ------------------------------------------------------------------ writes

  /**
   * Shares a track: refuses it with the reason if it is too big or there is
   * no room for it, uploads it, and opens its link on the website.
   *
   * The room left is the website's own count, fetched first, since the
   * other copy's tracks take room too. If the link can't be opened, the
   * upload is deleted again rather than left taking room for nothing.
   */
  async share(draft: ConsultationDraft): Promise<Consultation> {
    this.requireSignedIn()
    if (this.uploading) {
      throw new AppError('A track is uploading already.', {
        code: ErrorCode.Validation,
        hint: 'Wait for it to finish, or cancel it, then share this one.',
        recoverable: true
      })
    }
    const storage = this.requireStorage()
    const file = await admitTrack(draft.path)
    const website = this.website
    const client = this.client(website)

    const controller = new AbortController()
    this.uploading = controller
    try {
      await this.exclusive(async () => {
        const listed = await this.onWebsite(() => client.list(), 'Connect to share a track.')
        await this.repository.applyList(website, listed.consultations)
      })
      const free = Math.max(0, STORAGE_FREE_BYTES - (await this.repository.usedBytes(website)))
      if (file.size > free) throw noRoom(free, file.size)

      const path = `${STORAGE_FOLDER}${randomUUID()}.${file.extension}`
      this.progress('uploading', 0, file.size)
      const stored = await storage
        .upload(draft.path, path, file.contentType, file.size, {
          signal: controller.signal,
          onProgress: (sent) => this.progress('uploading', sent, file.size)
        })
        .catch((error: unknown) => {
          throw storageProblem(error, `Firebase Storage has no bucket called ${storage.bucket}.`)
        })

      this.progress('opening', file.size, file.size)
      const remote = await this.exclusive(async () => {
        let opened: RemoteConsultation
        try {
          opened = await client.open({
            title: draft.title,
            message: draft.message,
            durationMs: draft.durationMs,
            bpm: draft.bpm,
            days: draft.days,
            audio: {
              path: stored.path,
              url: stored.url,
              bytes: stored.bytes,
              contentType: stored.contentType
            },
            waveform: draft.waveform
          })
        } catch (error) {
          await storage.remove(stored.path).catch((cause: unknown) => {
            logger.warn('Could not delete an upload whose link did not open', cause)
          })
          throw this.siteProblem(error, 'Connect to share a track.')
        }
        await this.repository.applyOne(website, opened, draft.path)
        return opened
      })

      await this.refresh()
      await this.arm(website)
      return this.requireHeld(remote.id)
    } finally {
      this.uploading = null
    }
  }

  /**
   * Whether a file could be shared, before anything is read or sent: the
   * share dialog asks as soon as a file is chosen, so a track too big, or
   * with no room left for it, is refused with the reason at once. Counted
   * from the copy; sharing counts again from the website's own list.
   */
  async check(path: string): Promise<{ size: number }> {
    this.requireSignedIn()
    const file = await admitTrack(path)
    const used = this.archive.isConnected() ? await this.repository.usedBytes(this.website) : 0
    const free = Math.max(0, STORAGE_FREE_BYTES - used)
    if (file.size > free) throw noRoom(free, file.size)
    return { size: file.size }
  }

  /** Stops the upload under way. Once the link is being opened, it is too late to. */
  cancelShare(): void {
    this.uploading?.abort()
  }

  /** Moves when an open link closes: any time to come, up to a week from when it was shared. */
  async changeExpiry({ id, expiresAt }: ConsultationExpiry): Promise<Consultation> {
    this.requireSignedIn()
    const link = await this.requireHeld(id)
    const now = Date.now()
    if (!isLinkOpen(link, now)) {
      throw new AppError('That link has closed already.', {
        code: ErrorCode.Validation,
        hint: 'A closed link can’t be reopened, since its feedback is gone. Share the track again for more.',
        recoverable: true
      })
    }
    if (expiresAt <= now) {
      throw new AppError('Choose a time still to come, or end the link now.', {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
    if (expiresAt > latestClose(link.createdAt)) {
      throw new AppError(
        `A link stays open ${MAX_LINK_DAYS} days at most from when it was shared.`,
        { code: ErrorCode.Validation, recoverable: true }
      )
    }

    const website = this.website
    await this.exclusive(async () => {
      const remote = await this.onWebsite(
        () => this.client(website).change(id, { expiresAt: new Date(expiresAt).toISOString() }),
        'Connect to change when a link closes.'
      )
      await this.repository.applyOne(website, remote)
    })
    await this.refresh()
    await this.arm(website)
    return this.requireHeld(id)
  }

  /**
   * Closes a link now: the website stops answering it and deletes its
   * feedback, and this copy deletes the track from the bucket and its own
   * copy of the feedback. The record stays, as an expired one does.
   */
  async end(id: string): Promise<Consultation> {
    this.requireSignedIn()
    await this.requireHeld(id)
    const website = this.website
    const client = this.client(website)

    await this.exclusive(async () => {
      const remote = await this.onWebsite(() => client.end(id), 'Connect to end a link.')
      await this.repository.applyOne(website, remote)
      await this.repository.purgeClosed(website, Date.now())
      const storage = this.storage()
      if (storage && remote.audioDeletedAt === null) {
        // Left for the next check-in if it fails: the link is closed either way.
        await this.deleteTrack(client, storage, website, { id, audio: remote.audio }).catch(
          (error: unknown) => logger.warn(`Could not delete the track of ${id} yet`, error)
        )
      }
    })
    await this.refresh()
    await this.arm(website)
    return this.requireHeld(id)
  }

  /**
   * Forgets a closed link altogether, here and on the website. Its track
   * must have gone from the bucket first: the record is what the meter
   * counts it by, and without it a track left behind would take room
   * unseen until the lifecycle rule caught it.
   */
  async remove(id: string): Promise<void> {
    this.requireSignedIn()
    const link = await this.requireHeld(id)
    if (isLinkOpen(link, Date.now())) {
      throw new AppError('End the link before removing it.', {
        code: ErrorCode.Validation,
        hint: 'Ending it closes the page and deletes its track and feedback at once.',
        recoverable: true
      })
    }

    const website = this.website
    const client = this.client(website)
    await this.exclusive(async () => {
      if (link.audioDeletedAt === null) {
        const storage = this.requireStorage()
        try {
          await this.deleteTrack(client, storage, website, link)
        } catch (error) {
          const reason =
            error instanceof StorageError || error instanceof SiteError ? error.message : null
          throw new AppError('Its track couldn’t be deleted from storage yet.', {
            code: ErrorCode.Unavailable,
            hint: `${reason ? `${reason} ` : ''}The record stays until it is, to keep count of the room it takes.`,
            recoverable: true
          })
        }
      }
      await this.onWebsite(() => client.remove(id), 'Connect to remove it.')
      await this.repository.remove(website, id)
    })
    await this.refresh()
  }

  // ----------------------------------------------------------------- private

  /** Runs `task` once everything before it has, so no two lay the website's list over the copy at once. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.lock.then(task, task)
    this.lock = next.catch(() => undefined)
    return next
  }

  /** A call to the website, its failure turned into what the page says. */
  private async onWebsite<T>(send: () => Promise<T>, offline: string): Promise<T> {
    try {
      return await send()
    } catch (error) {
      throw this.siteProblem(error, offline)
    }
  }

  private siteProblem(error: unknown, offline: string): unknown {
    if (!(error instanceof SiteError)) return error
    if (error.kind === 'unreachable') this.patchLink({ state: 'offline', message: error.message })
    return new AppError(error.kind === 'unreachable' ? offline : error.message, {
      code: error.kind === 'invalid' ? ErrorCode.Validation : ErrorCode.Unavailable,
      hint: 'The link lives on the website, so this needs the website.',
      recoverable: true
    })
  }

  private requireStorage(): StorageClient {
    const storage = this.storage()
    if (storage) return storage
    throw new AppError('The Firebase config names no Storage bucket.', {
      code: ErrorCode.Unavailable,
      hint: 'Set Storage up in the Firebase console, then paste the config again in REGULATION → BOARD (docs/CONSULTATION.md).',
      recoverable: true
    })
  }

  private async requireHeld(id: string): Promise<Consultation> {
    const link = await this.repository.get(this.website, id, Date.now())
    if (link) return link
    throw new AppError('That shared track is not here any more.', {
      code: ErrorCode.NotFound,
      hint: 'It may have been removed from the other copy of the console.',
      recoverable: true
    })
  }

  private requireSignedIn(): void {
    if (this.signedIn) return
    throw new AppError('Sign in first.', {
      code: ErrorCode.PermissionDenied,
      hint: 'CONSULTATION uses the DISPATCH sign-in.',
      recoverable: true
    })
  }

  /** Re-counts what is waiting and what the bucket holds, and tells the page the copy moved. */
  private async refresh(): Promise<void> {
    const live = this.signedIn && this.archive.isConnected()
    const website = this.website
    const [waiting, usedBytes] = live
      ? await Promise.all([
          this.repository
            .waiting(website, Date.now())
            .then((links) => links.reduce((total, link) => total + link.count, 0)),
          this.repository.usedBytes(website)
        ])
      : [0, 0]
    this.state = {
      ...this.state,
      waiting,
      storage: { bucket: this.dispatch.storageBucket, usedBytes, limitBytes: STORAGE_FREE_BYTES }
    }
    this.changed()
  }

  private progress(stage: ShareStage, sent: number, total: number): void {
    this.emit('progress', { stage, sent, total })
  }

  private changed(): void {
    this.state = { ...this.state, revision: this.state.revision + 1 }
    this.publish()
  }

  private patchLink(link: Partial<ConsultationLink>): void {
    this.state = { ...this.state, link: { ...this.state.link, ...link } }
    this.publish()
  }

  private publish(): void {
    this.emit('state', this.state)
  }

  // ------------------------------------------------------------ notifications

  /**
   * The startup notice: feedback nobody here has opened, and the link of it
   * closing soonest, if that is within a day, since its feedback goes with it.
   */
  private async announceWaiting(website: string): Promise<void> {
    if (!this.archive.isConnected()) return
    const now = Date.now()
    const links = await this.repository.waiting(website, now)
    if (!links.length) return

    const body =
      links.length === 1
        ? `${people(links[0])} sent feedback on “${links[0].title}”.`
        : `Feedback is waiting on ${links.length} tracks.`
    const soonest = [...links].sort((a, b) => a.expiresAt - b.expiresAt)[0]
    const closing =
      soonest.expiresAt - now <= CLOSING_SOON_MS
        ? ` “${soonest.title}” closes in ${formatLeft(soonest.expiresAt - now)}, and its feedback goes with it.`
        : ''
    this.notify('Feedback waiting', `${body}${closing}`)
  }

  private notify(title: string, body: string): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({ title, body })
    const release = (): void => {
      this.shown.delete(notification)
    }
    notification.on('click', () => {
      release()
      this.opener?.(PAGE)
    })
    notification.on('close', release)
    this.shown.add(notification)
    notification.show()
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
    this.disarm()
    this.uploading?.abort()
    this.shown.clear()
  }
}

/**
 * A file that can be shared, or the reason it can't: an audio format the
 * page can play, still where it was, and no bigger than a link plays.
 */
async function admitTrack(
  path: string
): Promise<{ extension: string; size: number; contentType: string }> {
  const extension = extname(path).slice(1).toLowerCase()
  if (!AUDIO_EXTENSIONS.includes(extension as (typeof AUDIO_EXTENSIONS)[number])) {
    throw new AppError(`${extension ? `.${extension}` : 'That file'} is not an audio format.`, {
      code: ErrorCode.Validation,
      hint: `Supported: ${AUDIO_EXTENSIONS.map((value) => `.${value}`).join(', ')}`,
      recoverable: false
    })
  }

  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) {
    throw new AppError('That file is no longer where it was.', {
      code: ErrorCode.NotFound,
      recoverable: false
    })
  }
  if (info.size === 0) {
    throw new AppError('That file is empty.', { code: ErrorCode.Validation, recoverable: false })
  }
  if (info.size > MAX_TRACK_BYTES) {
    throw new AppError(
      `That track is ${size(info.size)}, and a link plays ${size(MAX_TRACK_BYTES)} at most.`,
      {
        code: ErrorCode.Validation,
        hint: `Producers stream the whole file, and the free storage is ${size(STORAGE_FREE_BYTES)} in all. Bounce it at 16-bit, or as a 320 kbps MP3: either is plenty to judge a mix by.`,
        recoverable: false
      }
    )
  }

  return { extension, size: info.size, contentType: storedType(audioMimeFor(extension)) }
}

/** No room left in the free allowance for a track of `bytes`. */
function noRoom(free: number, bytes: number): AppError {
  return new AppError(
    `There isn’t room for this track: ${size(free)} of the free ${size(STORAGE_FREE_BYTES)} is left, and it is ${size(bytes)}.`,
    {
      code: ErrorCode.Validation,
      hint: 'End a link you no longer need, which deletes its track at once, or share a smaller bounce.',
      recoverable: true
    }
  )
}

/** A Storage failure as the page states it. `missing` reads as `whenMissing`. */
function storageProblem(error: unknown, whenMissing: string): unknown {
  if (!(error instanceof StorageError)) return error
  switch (error.kind) {
    case 'cancelled':
      return new AppError('The upload was cancelled.', {
        code: ErrorCode.Cancelled,
        recoverable: true
      })
    case 'missing':
      return new AppError(whenMissing, {
        code: ErrorCode.NotFound,
        hint: 'Storage is set up once, in the Firebase console (docs/CONSULTATION.md).',
        recoverable: true
      })
    case 'forbidden':
      return new AppError(error.message, {
        code: ErrorCode.PermissionDenied,
        hint: 'Publish storage.rules in the Firebase console (docs/CONSULTATION.md).',
        recoverable: true
      })
    case 'billing':
      return new AppError(error.message, {
        code: ErrorCode.Unavailable,
        hint: 'Move the project to Blaze in the Firebase console. It stays free within the free allowance (docs/CONSULTATION.md).',
        recoverable: true
      })
    case 'unreachable':
    case 'busy':
      return new AppError(error.message, {
        code: ErrorCode.Unavailable,
        hint: 'Check the connection, then try again.',
        recoverable: true
      })
    default:
      return new AppError(error.message, { code: ErrorCode.Unavailable, recoverable: true })
  }
}

/** `Nasko`, `Nasko and Lil Dre`, `Nasko, Lil Dre and 2 others`. */
function people(link: WaitingLink): string {
  const names = link.names.length ? link.names : ['Someone']
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length === 3 ? '' : 's'}`
}

/** Bytes in the units `formatBytes` uses: `312 MB`, `4.1 GB`. */
function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  // A sliver still reads as some room, not none.
  return `${bytes > 0 ? Math.max(1, Math.round(bytes / 1024 ** 2)) : 0} MB`
}
