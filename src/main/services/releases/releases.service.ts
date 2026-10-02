import {
  afterChoice,
  changedFields,
  isOutOn,
  siteFieldsOf,
  stagedCount,
  visibleOn,
  whyNot,
  type ReleaseEntry,
  type ReleasesLink,
  type ReleasesSite,
  type ReleasesState,
  type SiteMapping,
  type Staged,
  type StageInput,
  type StageResult,
  type Visibility
} from '@shared/domain/releases'
import { SHELF_SIZE, isToSend, type SendState } from '@shared/domain/releases.constants'
import type { DiscographyRelease } from '@shared/domain/discography'
import { localIsoDate } from '@shared/domain/discography.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ArtistsService } from '@main/services/artists/artists.service'
import type { DiscographyService } from '@main/services/discography/discography.service'
import type { DispatchService } from '@main/services/dispatch/dispatch.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import { hostOf, websiteFor } from '@main/services/website/website.address'
import { SiteError } from '@main/services/website/website.http'
import { ReleasesClient, type SendResult, type SiteChanges } from './releases.client'
import { coverForSite, coverSignature } from './releases.cover'
import { ReleasesRepository, type ReleaseLink } from './releases.repository'

const logger = getLogger('releases')

interface ReleasesEvents {
  state: ReleasesState
}

/** The operator's own name, for a release nobody is credited on. */
const DEFAULT_ARTIST = 'Candy Heist'

/** Nothing picked. */
const nothingStaged = (): Staged => ({ visibility: {}, shelf: null, send: [] })

/** A release picked on the page: one here, or one the other computer sent. */
interface Target {
  own: boolean
  title: string
  /** Its id on the website; null for one here never sent. */
  siteId: string | null
  entry: ReleaseEntry | null
  now: Visibility
}

/** A failure worth trying again later, rather than one the website said no to. */
const retryable = (error: unknown): boolean =>
  !(error instanceof SiteError) || error.kind === 'unreachable' || error.kind === 'failed'

/**
 * RELEASES: DISCOGRAPHY, as the website shows it.
 *
 * The whole catalogue stays in DISCOGRAPHY, on this machine. "Publish
 * everything" sends every release once and switches the website from its
 * own releases to these. After that a release goes again whenever it's
 * finished being edited (Done on its sheet, or the sheet closing while it's
 * being edited), with only the fields that changed since it was last sent,
 * so an edit made on the other computer to another field isn't undone.
 *
 * A send that can't reach the website waits, and goes with Sync now, on
 * signing in, and when the console starts. Whether a release is shown and
 * the home page shelf live on the website, so both computers agree on them.
 *
 * Show, Hide, the shelf and Send on the page are picked, not sent: they're
 * held (`staged`) until Update sends them all in one request. Show and Hide
 * on a release here that isn't out yet make it SCHEDULED or a DRAFT in
 * DISCOGRAPHY; on one that's out, or the other computer's, they hide it on
 * the website by hand or stop hiding it.
 *
 * Behind the DISPATCH sign-in, whole, like CONTACT, SERVICES and LORE.
 */
export class ReleasesService extends TypedEmitter<ReleasesEvents> {
  private state: ReleasesState = {
    link: {
      state: 'signed-out',
      message: 'Sign in to open the releases.',
      website: '',
      syncedAt: null
    },
    site: null,
    entries: [],
    remote: [],
    pending: 0,
    staged: nothingStaged(),
    working: null,
    covers: null,
    revision: 0
  }

  private started = false
  /** The covers' round is running; another is wanted when it ends. */
  private coversRunning = false
  private coversAgain = false
  private readonly unsubscribers: (() => void)[] = []
  /** Writes go one at a time, so two sends can't race for the same release. */
  private writing: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly archive: ArchiveService,
    private readonly settings: SettingsService,
    private readonly dispatch: DispatchService,
    private readonly discography: DiscographyService,
    private readonly artists: ArtistsService
  ) {
    super()
  }

  get current(): ReleasesState {
    return this.state
  }

  private get website(): string {
    return websiteFor(this.settings.snapshot)
  }

  private get signedIn(): boolean {
    return this.dispatch.current.link.identity !== null
  }

  private get configured(): boolean {
    return this.dispatch.current.link.state !== 'unconfigured'
  }

  private get repository(): ReleasesRepository {
    return new ReleasesRepository(this.archive.getDb())
  }

  private client(): ReleasesClient {
    return new ReleasesClient(this.website, () => this.dispatch.idToken())
  }

  /**
   * Shows what's kept here, follows the sign-in and the website address,
   * and sends anything left waiting once someone's signed in.
   */
  initialize(): void {
    if (this.started) {
      void this.restore()
      return
    }
    this.started = true

    let signedIn = this.signedIn
    let configured = this.configured
    let website = this.website

    this.unsubscribers.push(
      this.dispatch.on('state', (state) => {
        const nowSignedIn = state.link.identity !== null
        const nowConfigured = state.link.state !== 'unconfigured'
        if (nowSignedIn === signedIn && nowConfigured === configured) return
        const cameIn = nowSignedIn && !signedIn
        signedIn = nowSignedIn
        configured = nowConfigured
        void this.restore().then(() => (cameIn ? this.flushWaiting() : undefined))
      })
    )

    // Another address is another website, with its own releases.
    this.unsubscribers.push(
      this.settings.on('changed', () => {
        if (this.website === website) return
        website = this.website
        this.set({ staged: nothingStaged() })
        void this.restore()
      })
    )

    void this.restore().then(() => this.flushWaiting())
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
  }

  // ------------------------------------------------------------------ reads

  /** What there is to show without asking: DISCOGRAPHY, and what's kept of the website. */
  async restore(): Promise<ReleasesState> {
    const website = this.website
    if (!this.configured || !this.signedIn) {
      this.set({
        link: {
          state: this.configured ? 'signed-out' : 'unconfigured',
          message: this.configured
            ? 'Sign in to open the releases.'
            : 'No Firebase config has been supplied.',
          website,
          syncedAt: null
        },
        site: null,
        entries: [],
        remote: [],
        pending: 0,
        staged: nothingStaged()
      })
      return this.state
    }
    let kept: { site: ReleasesSite; fetchedAt: number } | null = null
    try {
      if (this.archive.isConnected()) kept = await this.repository.readSite(website)
    } catch (error) {
      logger.warn('Could not read the releases kept here', error)
    }
    await this.compose(kept?.site ?? null, {
      state: 'online',
      message: kept ? 'As last fetched.' : 'Not fetched yet.',
      website,
      syncedAt: kept?.fetchedAt ?? null
    })
    return this.state
  }

  /** Fetches what the website has. Never throws: a failure is a state the page shows. */
  async sync(): Promise<ReleasesState> {
    if (!this.configured || !this.signedIn) return this.restore()
    const website = this.website
    this.patchLink({
      state: 'syncing',
      message: `Fetching the releases from ${hostOf(website)}…`,
      website
    })
    try {
      await this.adopt(await this.client().site(), website)
    } catch (error) {
      if (!(error instanceof SiteError)) logger.warn('Fetching the releases failed', error)
      this.patchLink({
        state: 'offline',
        message: error instanceof SiteError ? error.message : 'The releases could not be fetched.'
      })
    }
    return this.state
  }

  // ----------------------------------------------------------------- writes

  /**
   * "Publish everything": every release the website can show, at once, and
   * the website switched over to them. Releases it can't show yet are left
   * here, each saying why.
   */
  publishEverything(): Promise<ReleasesState> {
    return this.doing('Publishing everything', 'Sending every release, in one request', () =>
      this.write(async () => {
        this.requireOpen()
        const website = this.website
        const { releases, mapping } = await this.catalogue()
        const sendable = releases.flatMap((release) => {
          const mapped = mapping.get(release.id)
          return mapped?.ok ? [{ ref: release.id, fields: mapped.fields }] : []
        })
        if (!sendable.length) {
          throw new AppError('There is nothing the website can show yet.', {
            code: ErrorCode.Validation,
            hint: 'A release needs a title and at least one track.',
            recoverable: true
          })
        }
        const result = await this.siteCall(() => this.client().everything(sendable))
        const at = Date.now()
        const repository = this.repository
        for (const { ref, fields } of sendable) {
          const siteId = result.ids[ref]
          if (!siteId) continue
          await repository.saveLink({
            website,
            releaseId: ref,
            siteId,
            sent: fields,
            sentAt: at,
            pending: false,
            removed: false
          })
        }
        await this.adopt(result.site, website)
        this.queueCovers()
        return this.state
      })
    )
  }

  /**
   * A release finished being edited. Sent, if the website shows these
   * releases yet; held to send later if it can't be reached. Never throws:
   * the sheet that calls it has already closed.
   */
  async edited(releaseId: string): Promise<ReleasesState> {
    if (!this.configured || !this.signedIn || !this.state.site?.live) return this.restore()
    const title = this.state.entries.find((entry) => entry.id === releaseId)?.title || 'A release'
    try {
      await this.doing('Sending an edit', title, () => this.write(() => this.sendOne(releaseId)))
    } catch (error) {
      logger.warn(`Could not send release ${releaseId}`, error)
    }
    return this.restore()
  }

  /**
   * Sync now: fetches what the website has, then sends every release here
   * that's new, changed or waiting in one request, and every removal
   * waiting to be told.
   */
  syncNow(): Promise<ReleasesState> {
    return this.doing('Syncing', 'Fetching the website, then sending what’s waiting', () =>
      this.write(async () => {
        this.requireOpen()
        await this.sync()
        if (!this.state.site?.live) return this.state
        await this.sendRemovals()
        const due = this.state.entries.filter((entry) => isToSend(entry.send))
        if (due.length) await this.sendTogether(new Set(due.map((entry) => entry.id)), [])
        return this.restore()
      })
    )
  }

  /** A release left DISCOGRAPHY: it leaves the website too, now or when it can be reached. */
  async removed(releaseId: string): Promise<void> {
    if (!this.configured || !this.signedIn) {
      await this.markRemoved(releaseId)
      return
    }
    try {
      await this.write(async () => {
        const link = await this.linkOf(releaseId)
        if (!link) return
        try {
          const site = await this.client().remove(link.siteId)
          await this.repository.deleteLink(this.website, releaseId)
          await this.adopt(site, this.website)
        } catch (error) {
          if (error instanceof SiteError && error.kind === 'missing') {
            await this.repository.deleteLink(this.website, releaseId)
          } else {
            await this.repository.saveLink({ ...link, removed: true, pending: true })
          }
        }
      })
    } catch (error) {
      logger.warn(`Could not take release ${releaseId} off the website`, error)
    }
    await this.restore()
  }

  // ----------------------------------------------------------------- picks

  /**
   * Picks Show, Hide, the shelf or Send for the releases picked on the
   * page. Nothing reaches the website until Update. Releases a pick can't
   * apply to are left out, each with why.
   */
  stage({ action, ids }: StageInput): Promise<StageResult> {
    return this.write(async () => {
      this.requireLive()
      const today = localIsoDate()
      const staged: Staged = {
        visibility: { ...this.state.staged.visibility },
        shelf: this.state.staged.shelf,
        send: [...this.state.staged.send]
      }
      const onSite = this.state.site?.shelf ?? []
      let shelf = staged.shelf ?? [...onSite]
      const skipped: StageResult['skipped'] = []
      const skip = (target: Target, why: string): void => {
        skipped.push({ title: target.title, why })
      }

      for (const id of ids) {
        const target = this.targetOf(id)
        if (!target) continue
        if (action === 'show' || action === 'hide') {
          const why = whyNot(target.now, action, target.own, today)
          if (why) {
            skip(target, why)
            continue
          }
          if (!target.siteId && isOutOn(target.now, today)) {
            skip(target, 'It isn’t on the website yet: send it first.')
            continue
          }
          const after = afterChoice(target.now, action, target.own, today) ?? target.now
          const same =
            after.status === target.now.status &&
            (after.shown === false) === (target.now.shown === false)
          if (same) delete staged.visibility[id]
          else staged.visibility[id] = action
          // Hidden, it comes off the shelf, as the website would take it off.
          if (target.siteId && !visibleOn(after, today)) {
            shelf = shelf.filter((siteId) => siteId !== target.siteId)
          }
        } else if (action === 'shelf-add') {
          if (!target.siteId) {
            skip(target, 'It isn’t on the website yet: send it first.')
          } else if (shelf.includes(target.siteId)) {
            continue
          } else if (!visibleOn(this.predicted(target, staged, today), today)) {
            skip(target, 'Hidden releases can’t go on the shelf.')
          } else if (shelf.length >= SHELF_SIZE) {
            skip(target, `The shelf holds ${SHELF_SIZE}.`)
          } else {
            shelf.push(target.siteId)
          }
        } else if (action === 'shelf-remove') {
          shelf = shelf.filter((siteId) => siteId !== target.siteId)
        } else if (!target.entry) {
          skip(target, 'Sent from the other computer, so it’s sent from there.')
        } else if (target.entry.send === 'problem') {
          skip(target, target.entry.problem ?? 'It can’t go on the website yet.')
        } else if (target.entry.send === 'sent') {
          skip(target, 'The website already has it as it is.')
        } else if (!staged.send.includes(id)) {
          staged.send.push(id)
        }
      }

      staged.shelf = sameOrder(shelf, onSite) ? null : shelf
      this.set({ staged })
      return { state: this.state, skipped }
    })
  }

  /** The shelf as moved in its panel: held for Update like any other pick. */
  stageShelf(siteIds: string[]): Promise<ReleasesState> {
    return this.write(async () => {
      this.requireLive()
      if (siteIds.length > SHELF_SIZE) {
        throw new AppError(`The shelf holds ${SHELF_SIZE}.`, {
          code: ErrorCode.Validation,
          recoverable: true
        })
      }
      const onSite = this.state.site?.shelf ?? []
      this.set({
        staged: { ...this.state.staged, shelf: sameOrder(siteIds, onSite) ? null : siteIds }
      })
      return this.state
    })
  }

  /** Drops everything picked. */
  discard(): Promise<ReleasesState> {
    return this.write(async () => {
      this.set({ staged: nothingStaged() })
      return this.state
    })
  }

  /**
   * Update: everything picked, in one request. Releases here not out yet
   * become SCHEDULED or drafts in DISCOGRAPHY first, then go with the rest.
   * If the website says no, nothing there changed and the picks stay, to
   * try again.
   */
  commit(): Promise<ReleasesState> {
    const count = stagedCount(this.state.staged)
    const detail = `${count} change${count === 1 ? '' : 's'}, in one request`
    return this.doing('Updating the website', detail, () =>
      this.write(async () => {
        this.requireLive()
        const staged = this.state.staged
        if (!stagedCount(staged)) return this.state
        const today = localIsoDate()

        const send = new Set(staged.send)
        const visibility: SiteChanges['visibility'] = []
        for (const [id, choice] of Object.entries(staged.visibility)) {
          const target = this.targetOf(id)
          if (!target) continue
          const after = afterChoice(target.now, choice, target.own, today)
          if (!after) continue
          if (target.own && after.status !== target.now.status) {
            await this.discography.update(id, { status: after.status })
            // On the website already, or to be shown: it goes with its new status.
            if (target.siteId || choice === 'show') send.add(id)
          }
          const hidden = after.shown === false
          if (target.siteId && hidden !== (target.now.shown === false)) {
            visibility.push({ id: target.siteId, shown: hidden ? false : null })
          }
        }

        await this.sendTogether(send, visibility, staged.shelf)
        this.set({ staged: nothingStaged() })
        return this.restore()
      })
    )
  }

  // ---------------------------------------------------------------- private

  /**
   * Releases here, shown or hidden, and the shelf, in one request: each
   * release new to the website whole, each one sent before with only what
   * changed since.
   */
  private async sendTogether(
    ids: Set<string>,
    visibility: SiteChanges['visibility'],
    shelf: string[] | null = null
  ): Promise<void> {
    const website = this.website
    const repository = this.repository
    const { mapping } = await this.catalogue()
    const links = new Map(
      (await repository.linksFor(website)).map((link) => [link.releaseId, link])
    )

    const add: SiteChanges['add'] = []
    const update: SiteChanges['update'] = []
    for (const id of ids) {
      const mapped = mapping.get(id)
      if (!mapped?.ok) continue
      const link = links.get(id)
      if (!link) {
        add.push({ ref: id, fields: mapped.fields })
        continue
      }
      const fields = link.sent ? changedFields(link.sent, mapped.fields) : mapped.fields
      if (Object.keys(fields).length) update.push({ id: link.siteId, fields })
    }
    if (!add.length && !update.length && !visibility.length && !shelf) {
      this.queueCovers()
      return
    }

    const result = await this.siteCall(() =>
      this.client().changes({ add, update, visibility, ...(shelf ? { shelf } : {}) })
    )
    const at = Date.now()
    for (const { ref, fields } of add) {
      const siteId = result.ids[ref]
      if (!siteId) continue
      await repository.saveLink({
        website,
        releaseId: ref,
        siteId,
        sent: fields,
        sentAt: at,
        pending: false,
        removed: false
      })
    }
    for (const id of ids) {
      const link = links.get(id)
      const mapped = mapping.get(id)
      if (link && mapped?.ok) {
        await repository.saveLink({ ...link, sent: mapped.fields, sentAt: at, pending: false })
      }
    }
    await this.adopt(result.site, website)
    this.queueCovers()
  }

  /**
   * Starts sending the covers that changed, in the background, or asks the
   * round already running for another when it ends.
   */
  private queueCovers(): void {
    if (this.coversRunning) {
      this.coversAgain = true
      return
    }
    this.coversRunning = true
    void this.sendCovers()
      .catch((error) => logger.warn('Sending the covers stopped', error))
      .finally(() => {
        this.coversRunning = false
        this.set({ covers: null })
      })
  }

  /**
   * Covers that changed since they were last sent, one request each (an
   * image can't ride in the JSON), each in its own turn at writing, so an
   * Update waits for one cover, not all of them. A cover that can't go is
   * logged and tried with the next round; a website with no cover storage
   * yet ends the round, and its releases keep the placeholder.
   */
  private async sendCovers(): Promise<void> {
    do {
      this.coversAgain = false
      if (!this.configured || !this.signedIn || !this.archive.isConnected()) return
      const due = await this.dueCovers()
      for (let i = 0; i < due.length; i++) {
        this.set({ covers: { done: i, total: due.length, current: due[i].title } })
        if ((await this.write(() => this.sendCover(due[i].releaseId))) === 'stop') return
      }
    } while (this.coversAgain)
  }

  /** The releases on the website whose cover here isn't the one it has. */
  private async dueCovers(): Promise<{ releaseId: string; title: string }[]> {
    const releases = new Map((await this.discography.listAll()).map((r) => [r.id, r]))
    return (await this.repository.linksFor(this.website)).flatMap((link) => {
      const release = releases.get(link.releaseId)
      if (link.removed || !release) return []
      if (coverSignature(release) === (link.cover ?? null)) return []
      return [{ releaseId: release.id, title: release.title || 'Untitled' }]
    })
  }

  /** One cover, read afresh: sent, cleared, or left for the next round. */
  private async sendCover(releaseId: string): Promise<'sent' | 'skipped' | 'stop'> {
    const website = this.website
    const repository = this.repository
    const link = await this.linkOf(releaseId)
    let release: DiscographyRelease
    try {
      release = await this.discography.get(releaseId)
    } catch {
      return 'skipped'
    }
    const signature = coverSignature(release)
    if (!link || link.removed || signature === (link.cover ?? null)) return 'skipped'
    try {
      let site: ReleasesSite
      if (signature && release.artwork.copiedPath) {
        const cover = await coverForSite(release.artwork.copiedPath)
        if (!cover) {
          logger.warn(`The cover of ${release.title} is in a format that can't be sent`)
          return 'skipped'
        }
        site = await this.client().cover(link.siteId, cover.body, cover.type)
      } else {
        site = await this.client().clearCover(link.siteId)
      }
      await repository.saveLink({ ...link, cover: signature })
      await this.adopt(site, website)
      return 'sent'
    } catch (error) {
      if (error instanceof SiteError && error.status === 503) {
        logger.info('The website has no cover storage yet; covers wait for it')
        return 'stop'
      }
      logger.warn(`Could not send the cover of ${release.title}`, error)
      return 'skipped'
    }
  }

  /** Says what's being done for as long as it takes, waiting its turn included. */
  private async doing<T>(label: string, detail: string, work: () => Promise<T>): Promise<T> {
    this.set({ working: { label, detail } })
    try {
      return await work()
    } finally {
      this.set({ working: null })
    }
  }

  /** A release picked on the page, here or the other computer's, as things stand. */
  private targetOf(id: string): Target | null {
    const entry = this.state.entries.find((candidate) => candidate.id === id)
    if (entry) {
      return {
        own: true,
        title: entry.title || 'Untitled',
        siteId: entry.siteId,
        entry,
        now: { status: entry.status, date: entry.date, shown: entry.shown }
      }
    }
    const remote = this.state.remote.find((candidate) => candidate.id === id)
    if (!remote) return null
    return {
      own: false,
      title: remote.title || 'Untitled',
      siteId: remote.id,
      entry: null,
      now: { status: remote.status, date: remote.date, shown: remote.shown }
    }
  }

  /** How a release will stand once what's picked for it is sent. */
  private predicted(target: Target, staged: Staged, today: string): Visibility {
    const choice = staged.visibility[target.entry?.id ?? target.siteId ?? '']
    return (choice && afterChoice(target.now, choice, target.own, today)) || target.now
  }

  private async sendOne(releaseId: string, options: { surface?: boolean } = {}): Promise<void> {
    const website = this.website
    const repository = this.repository
    let release: DiscographyRelease
    try {
      release = await this.discography.get(releaseId)
    } catch {
      return
    }
    const mapped = (await this.mapAll([release])).get(releaseId)
    if (!mapped?.ok) {
      if (options.surface && mapped) {
        throw new AppError(`It can't go on the website yet. ${mapped.problem}`, {
          code: ErrorCode.Validation,
          recoverable: true
        })
      }
      return
    }
    const fields = mapped.fields
    const link = await this.linkOf(releaseId)
    const client = this.client()

    const add = async (): Promise<void> => {
      const result: SendResult = await client.add(releaseId, fields)
      const siteId = result.ids[releaseId]
      if (siteId) {
        await repository.saveLink({
          website,
          releaseId,
          siteId,
          sent: fields,
          sentAt: Date.now(),
          pending: false,
          removed: false
        })
      }
      await this.adopt(result.site, website)
    }

    try {
      if (!link) {
        await add()
        this.queueCovers()
        return
      }
      const changes = link.sent ? changedFields(link.sent, fields) : fields
      if (!Object.keys(changes).length) {
        if (link.pending) await repository.saveLink({ ...link, pending: false })
        this.queueCovers()
        return
      }
      try {
        const site = await client.update(link.siteId, changes)
        await repository.saveLink({ ...link, sent: fields, sentAt: Date.now(), pending: false })
        await this.adopt(site, website)
        this.queueCovers()
      } catch (error) {
        // Taken off the website from the other computer: put back as new.
        if (error instanceof SiteError && error.kind === 'missing') {
          await repository.deleteLink(website, releaseId)
          await add()
          return
        }
        throw error
      }
    } catch (error) {
      // A release never sent stays "not sent", and Sync now sends it as it
      // does any new one; one sent before is marked waiting.
      if (link && retryable(error)) await repository.saveLink({ ...link, pending: true })
      if (options.surface || !retryable(error)) throw this.asAppError(error)
      logger.warn(`Release ${releaseId} is waiting to be sent`, error)
    }
  }

  private async sendRemovals(): Promise<void> {
    const website = this.website
    const repository = this.repository
    for (const link of await repository.linksFor(website)) {
      if (!link.removed) continue
      try {
        await this.client().remove(link.siteId)
        await repository.deleteLink(website, link.releaseId)
      } catch (error) {
        if (error instanceof SiteError && error.kind === 'missing') {
          await repository.deleteLink(website, link.releaseId)
        } else {
          logger.warn(`Release ${link.releaseId} is still waiting to come off the website`, error)
        }
      }
    }
  }

  /** Sends what's waiting, quietly: on signing in, and when the console starts. */
  private async flushWaiting(): Promise<void> {
    if (!this.configured || !this.signedIn || !this.archive.isConnected()) return
    try {
      const links = await this.repository.linksFor(this.website)
      if (!links.some((link) => link.pending)) return
      await this.write(async () => {
        await this.sync()
        if (!this.state.site?.live) return
        await this.sendRemovals()
        for (const link of links) {
          if (link.pending && !link.removed) await this.sendOne(link.releaseId)
        }
        await this.restore()
      })
    } catch (error) {
      logger.warn('Could not send the releases waiting', error)
    }
  }

  private async markRemoved(releaseId: string): Promise<void> {
    if (!this.archive.isConnected()) return
    const link = await this.linkOf(releaseId)
    if (link) await this.repository.saveLink({ ...link, removed: true, pending: true })
  }

  private async linkOf(releaseId: string): Promise<ReleaseLink | null> {
    const links = await this.repository.linksFor(this.website)
    return links.find((link) => link.releaseId === releaseId) ?? null
  }

  /** Every release in DISCOGRAPHY, and each as the website would take it. */
  private async catalogue(): Promise<{
    releases: DiscographyRelease[]
    mapping: Map<string, SiteMapping>
  }> {
    const releases = await this.discography.listAll()
    return { releases, mapping: await this.mapAll(releases) }
  }

  private async mapAll(releases: DiscographyRelease[]): Promise<Map<string, SiteMapping>> {
    const roster = await this.artists.listPlain()
    const names = new Map(roster.map((artist) => [artist.id, artist.name]))
    const operator = roster.find((artist) => artist.isOperator)?.name || DEFAULT_ARTIST
    return new Map(releases.map((release) => [release.id, siteFieldsOf(release, names, operator)]))
  }

  /** Keeps what the website sent, and shows it. */
  private async adopt(site: ReleasesSite, website: string): Promise<void> {
    const fetchedAt = Date.now()
    if (this.archive.isConnected()) await this.repository.saveSite(website, site, fetchedAt)
    await this.compose(site, {
      state: 'online',
      message: `Fetched from ${hostOf(website)}.`,
      website,
      syncedAt: fetchedAt
    })
  }

  /** The page's state: every release here against what the website has. */
  private async compose(site: ReleasesSite | null, link: ReleasesLink): Promise<void> {
    let entries: ReleaseEntry[] = []
    let remote: ReleasesSite['releases'] = []
    let pending = 0
    try {
      if (this.archive.isConnected()) {
        const [{ releases, mapping }, links] = await Promise.all([
          this.catalogue(),
          this.repository.linksFor(link.website)
        ])
        const byRelease = new Map(links.map((l) => [l.releaseId, l]))
        const onSite = new Map((site?.releases ?? []).map((r) => [r.id, r]))
        const linkedSiteIds = new Set(links.map((l) => l.siteId))
        pending = links.filter((l) => l.pending).length
        entries = releases
          .map((release) => {
            const mapped = mapping.get(release.id)
            const own = byRelease.get(release.id)
            const there = own ? onSite.get(own.siteId) : undefined
            return {
              id: release.id,
              title: release.title,
              kind: release.kind,
              status: release.status,
              date: release.releaseDate,
              artworkPath: release.artwork.copiedPath,
              trackCount: release.tracks.length,
              siteId: there?.id ?? null,
              slug: there?.slug ?? null,
              shown: there?.shown ?? null,
              visible: there ? there.visible : null,
              shelf: there ? (site?.shelf.indexOf(there.id) ?? -1) : -1,
              send: sendStateOf(mapped, own, coverSignature(release)),
              problem: mapped && !mapped.ok ? mapped.problem : null,
              omitted: mapped?.omitted ?? [],
              updatedBy: there?.updatedBy ?? ''
            }
          })
          .map((entry) => ({ ...entry, shelf: entry.shelf >= 0 ? entry.shelf : null }))
          .sort(
            (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title)
          )
        remote = (site?.releases ?? []).filter((r) => !linkedSiteIds.has(r.id))
      }
    } catch (error) {
      logger.warn('Could not read DISCOGRAPHY for RELEASES', error)
    }
    this.set({ link, site, entries, remote, pending })
  }

  private async siteCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw this.asAppError(error)
    }
  }

  private asAppError(error: unknown): AppError {
    if (error instanceof AppError) return error
    if (error instanceof SiteError) {
      return new AppError(error.message, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
    return AppError.from(error)
  }

  private write<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writing.then(work, work)
    this.writing = next.catch(() => undefined)
    return next
  }

  private requireOpen(): void {
    if (!this.configured || !this.signedIn) {
      throw new AppError('Sign in to reach the website.', {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
    if (!this.archive.isConnected()) {
      throw new AppError('The archive is not online.', {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
  }

  private requireLive(): void {
    this.requireOpen()
    if (!this.state.site?.live) {
      throw new AppError('Publish everything first.', {
        code: ErrorCode.Validation,
        hint: 'Until then the website shows its own releases.',
        recoverable: true
      })
    }
  }

  private patchLink(patch: Partial<ReleasesLink>): void {
    this.set({ link: { ...this.state.link, ...patch } })
  }

  private set(patch: Partial<Omit<ReleasesState, 'revision'>>): void {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    this.emit('state', this.state)
  }
}

/** Two shelves in the same order. */
const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i])

/** Where a release here stands, from how it maps and what was last sent of it. */
function sendStateOf(
  mapped: SiteMapping | undefined,
  link: ReleaseLink | undefined,
  cover: string | null
): SendState {
  if (!mapped || !mapped.ok) return 'problem'
  if (!link) return 'unsent'
  if (link.pending) return 'waiting'
  if (!link.sent || Object.keys(changedFields(link.sent, mapped.fields)).length) return 'changed'
  return cover !== (link.cover ?? null) ? 'cover' : 'sent'
}
