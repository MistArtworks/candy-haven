import { Notification } from 'electron'
import type {
  EnquiryStatusChange,
  InboxLink,
  InboxNote,
  InboxState,
  InboxTarget,
  MessageStatusChange,
  SiteEnquiry,
  SiteMessage
} from '@shared/domain/inbox'
import type { EnquiryStatus, InboxKind, MessageStatus } from '@shared/domain/inbox.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import type { DispatchService } from '@main/services/dispatch/dispatch.service'
import { hostOf, websiteFor } from '@main/services/website/website.address'
import { InboxRepository } from './inbox.repository'
import { SiteClient, SiteError } from './site.client'

const logger = getLogger('inbox')

interface InboxEvents {
  state: InboxState
}

/**
 * How many pages one check-in will take before leaving the rest for the
 * next. Two hundred records a page, so this is ten thousand: more than the
 * website will ever hold, and still a stop if it ever answers `more` forever.
 */
const MAX_PAGES = 50

/** Where the startup notice sends the operator when it is clicked. */
const PAGE: Record<InboxKind, string> = { message: '/contact', enquiry: '/services' }

/**
 * CONTACT and SERVICES: what the website's visitors send, kept here.
 *
 * The website files a message or a DJ enquiry in its own database and shows
 * the visitor "Sent", and that is the whole of its side. This service checks
 * in with the website when asked, and keeps a copy of what it finds in the
 * archive, so the departments open at once and still open with the network
 * down.
 *
 * **Asked, not polled.** A check-in happens when the console starts, when
 * someone signs in, when the website's address changes, and when the operator
 * presses the pages' button. Nothing runs on a timer: the operator chose to
 * see new arrivals when they look rather than to have the console ask the
 * website all day. The startup notice is the one alert, since starting is the
 * one check-in nobody is watching.
 *
 * Signed in means signed in to DISPATCH: the same two accounts, the same
 * session (`DispatchService.idToken`). While nobody is, nothing is fetched and
 * nothing already copied is shown, the rail's counts included.
 *
 * **The website holds what was sent; everything else is this machine's.**
 * Where each one stands and the operator's note are kept in the copy and
 * never sent, so both work offline and each copy of the console keeps its
 * own. Deleting is the exception, because a deletion has to reach the other
 * copy too: it is sent first and applied here only once the website has taken
 * it, since a copy that had deleted something the website still held would
 * bring it back on the next check-in.
 */
export class InboxService extends TypedEmitter<InboxEvents> {
  private state: InboxState = {
    link: {
      state: 'signed-out',
      message: 'Sign in to check the website.',
      website: '',
      syncedAt: null
    },
    waiting: { messages: 0, enquiries: 0 },
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
  /**
   * Notifications still on screen. Held so they are not collected before
   * they are clicked, which on Windows quietly drops the click.
   */
  private readonly shown = new Set<Notification>()

  constructor(
    private readonly archive: ArchiveService,
    private readonly settings: SettingsService,
    private readonly dispatch: DispatchService
  ) {
    super()
  }

  get current(): InboxState {
    return this.state
  }

  /**
   * The website being read, as an origin.
   *
   * REGULATION's address when one is set; otherwise the live site when
   * installed, and the development server on this machine when run from
   * source, so a development copy never writes to the live site's records.
   */
  get website(): string {
    return websiteFor(this.settings.snapshot)
  }

  private get repository(): InboxRepository {
    return new InboxRepository(this.archive.getDb())
  }

  private get signedIn(): boolean {
    return this.dispatch.current.link.identity !== null
  }

  /** Where a clicked startup notice goes; wired by the main entry. */
  setOpener(open: (path: string) => void): void {
    this.opener = open
  }

  /**
   * Checks in once, and listens for the moments that call for another. Never
   * throws and never waits on the network: this runs during boot, and an
   * unreachable website is a state the pages show.
   */
  initialize(): void {
    // A boot retried after a failure runs its stages again. Listening twice
    // would check in twice on every sign-in; checking in once more is enough.
    if (this.started) {
      void this.sync()
      return
    }
    this.started = true

    let signedIn = this.signedIn
    let configured = this.dispatch.current.link.state !== 'unconfigured'
    let website = this.website

    // Signing in or out on DISPATCH is signing in or out here.
    this.unsubscribers.push(
      this.dispatch.on('state', (state) => {
        const nowSignedIn = state.link.identity !== null
        const nowConfigured = state.link.state !== 'unconfigured'
        if (nowSignedIn === signedIn && nowConfigured === configured) return
        signedIn = nowSignedIn
        configured = nowConfigured
        void this.sync()
      })
    )

    // A new address in REGULATION is a different website, and its own copy.
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

  /**
   * Checks in now, and settles when it has.
   *
   * One at a time. A request that lands while one is running is folded into a
   * single further run rather than started beside it, so two check-ins never
   * write the same cursor.
   */
  sync(): Promise<void> {
    if (this.running) {
      this.queued = true
      return this.running
    }

    this.running = (async () => {
      do {
        this.queued = false
        // The website's failures are states, handled inside. This is the
        // archive failing under it, which the archive reports for itself.
        await this.run().catch((error: unknown) => {
          logger.error('The website check-in could not use the archive', error)
        })
      } while (this.queued)
    })().finally(() => {
      this.running = null
    })

    return this.running
  }

  private async run(): Promise<void> {
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
    const client = new SiteClient(website, () => this.dispatch.idToken())

    try {
      await this.pull(client, website)
      this.patchLink({ state: 'online', message: 'Up to date.', syncedAt: Date.now() })
      await this.refresh()
    } catch (error) {
      if (!(error instanceof SiteError)) logger.warn('The website check-in failed', error)
      this.patchLink({
        state: 'offline',
        message: error instanceof SiteError ? error.message : 'The check-in failed.'
      })
      await this.refresh()
    }

    // After the first check-in of the session, however it went: the copy is
    // what there is to report either way.
    if (!this.announced && this.signedIn) {
      this.announced = true
      this.announceWaiting()
    }
  }

  /** Brings the copy up to date with what was sent and deleted. */
  private async pull(client: SiteClient, website: string): Promise<void> {
    const repository = this.repository
    let cursor = await repository.cursor(website)

    for (let page = 0; page < MAX_PAGES; page++) {
      const changes = await client.changes(cursor)
      if (changes.unreadable) {
        logger.warn(`Left out ${changes.unreadable} unreadable record(s) from the website`)
      }

      await repository.applyMessages(website, changes.messages)
      await repository.applyEnquiries(website, changes.enquiries)
      await repository.applyDeletions(changes.deletions)

      cursor = changes.cursor
      await repository.saveCursor(website, cursor)
      if (!changes.more) break
    }
  }

  // ------------------------------------------------------------------- reads

  /** This website's messages, newest first. None while signed out. */
  async messages(): Promise<SiteMessage[]> {
    if (!this.signedIn) return []
    return this.repository.listMessages(this.website)
  }

  /** This website's DJ enquiries, newest first. None while signed out. */
  async enquiries(): Promise<SiteEnquiry[]> {
    if (!this.signedIn) return []
    return this.repository.listEnquiries(this.website)
  }

  // ------------------------------------------------------------------ writes

  /**
   * Opening a message reads it.
   *
   * Only a new one moves; opening one already replied to leaves it replied.
   */
  async read(id: string): Promise<SiteMessage> {
    const message = await this.requireMessage(id)
    if (message.status !== 'new') return message
    return this.setMessageStatus({ id, status: 'read' })
  }

  async setMessageStatus({ id, status }: MessageStatusChange): Promise<SiteMessage> {
    await this.setStatus('message', id, status)
    return this.requireMessage(id)
  }

  async setEnquiryStatus({ id, status }: EnquiryStatusChange): Promise<SiteEnquiry> {
    await this.setStatus('enquiry', id, status)
    return this.requireEnquiry(id)
  }

  /** Files a note against one. Kept here only; the website never sees it. */
  async setNote({ kind, id, note }: InboxNote): Promise<void> {
    this.requireSignedIn()
    const held = await this.repository.setNote(kind, this.website, id, note.trim())
    if (!held) throw notHeld(kind)
    this.changed()
  }

  /**
   * Deletes one from the website, and then from here.
   *
   * Online only, and the page says so before it is tried. The other copy of
   * the console hears of it on its next check-in.
   */
  async remove({ kind, id }: InboxTarget): Promise<void> {
    this.requireSignedIn()
    const client = new SiteClient(this.website, () => this.dispatch.idToken())

    try {
      await client.remove(kind, id)
    } catch (error) {
      if (!(error instanceof SiteError)) throw error
      if (error.kind === 'unreachable') {
        this.patchLink({ state: 'offline', message: error.message })
      }
      throw new AppError(error.kind === 'unreachable' ? 'Connect to delete.' : error.message, {
        code: ErrorCode.Unavailable,
        hint: 'Deleting removes it from the website as well, so it needs the website.',
        recoverable: true
      })
    }

    await this.repository.remove(kind, id)
    await this.refresh()
  }

  // ----------------------------------------------------------------- private

  private async setStatus(
    kind: InboxKind,
    id: string,
    status: MessageStatus | EnquiryStatus
  ): Promise<void> {
    this.requireSignedIn()
    const held = await this.repository.setStatus(kind, this.website, id, status)
    if (!held) throw notHeld(kind)
    await this.refresh()
  }

  private async requireMessage(id: string): Promise<SiteMessage> {
    this.requireSignedIn()
    const message = await this.repository.message(this.website, id)
    if (!message) throw notHeld('message')
    return message
  }

  private async requireEnquiry(id: string): Promise<SiteEnquiry> {
    this.requireSignedIn()
    const enquiry = await this.repository.enquiry(this.website, id)
    if (!enquiry) throw notHeld('enquiry')
    return enquiry
  }

  private requireSignedIn(): void {
    if (this.signedIn) return
    throw new AppError('Sign in first.', {
      code: ErrorCode.PermissionDenied,
      hint: 'CONTACT and SERVICES use the DISPATCH sign-in.',
      recoverable: true
    })
  }

  /** Re-counts what is waiting, and tells the pages the copy moved. */
  private async refresh(): Promise<void> {
    const waiting =
      this.signedIn && this.archive.isConnected()
        ? await this.repository.waiting(this.website)
        : { messages: 0, enquiries: 0 }
    this.state = { ...this.state, waiting }
    this.changed()
  }

  private changed(): void {
    this.state = { ...this.state, revision: this.state.revision + 1 }
    this.publish()
  }

  private patchLink(link: Partial<InboxLink>): void {
    this.state = { ...this.state, link: { ...this.state.link, ...link } }
    this.publish()
  }

  private publish(): void {
    this.emit('state', this.state)
  }

  // ------------------------------------------------------------ notifications

  /** The startup notice: what is waiting, if anything is. */
  private announceWaiting(): void {
    const { messages, enquiries } = this.state.waiting
    if (!messages && !enquiries) return
    const total = messages + enquiries
    this.notify(
      'Waiting on the website',
      `${countWords(messages, enquiries)} ${total === 1 ? 'is' : 'are'} waiting.`,
      messages ? 'message' : 'enquiry'
    )
  }

  private notify(title: string, body: string, kind: InboxKind): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({ title, body })
    const release = (): void => {
      this.shown.delete(notification)
    }
    notification.on('click', () => {
      release()
      this.opener?.(PAGE[kind])
    })
    notification.on('close', release)
    this.shown.add(notification)
    notification.show()
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
    this.shown.clear()
  }
}

function notHeld(kind: InboxKind): AppError {
  return new AppError(
    kind === 'message'
      ? 'That message is not here any more.'
      : 'That enquiry is not here any more.',
    {
      code: ErrorCode.NotFound,
      hint: 'It may have been deleted from the other copy of the console.',
      recoverable: true
    }
  )
}

/** `2 messages and 1 DJ enquiry`. */
function countWords(messages: number, enquiries: number): string {
  const parts = [
    messages ? `${messages} message${messages === 1 ? '' : 's'}` : '',
    enquiries ? `${enquiries} DJ enquir${enquiries === 1 ? 'y' : 'ies'}` : ''
  ].filter(Boolean)
  return parts.join(' and ')
}
