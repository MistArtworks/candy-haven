import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { nativeImage } from 'electron'
import { ObjectId } from 'mongodb'
import {
  hoursFingerprint,
  hoursProblems,
  offeringFingerprint,
  offeringProblems,
  siteServiceOf,
  type NewOffering,
  type Offering,
  type OfferingCreated,
  type OfferingHours,
  type OfferingPhoto,
  type OfferingPhotoInput,
  type OfferingsBase,
  type OfferingsLink,
  type OfferingsPublishResult,
  type OfferingsState,
  type SaveOffering,
  type ServicesSite,
  type SiteService
} from '@shared/domain/offerings'
import {
  OFFERING_LIMITS,
  SLUG_PATTERN,
  STARTER_FACTS,
  slugify
} from '@shared/domain/offerings.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import type { DispatchService } from '@main/services/dispatch/dispatch.service'
import type { StacksService } from '@main/services/stacks/stacks.service'
import { storeMedia } from '@main/services/media/media.store'
import { hostOf, websiteFor } from '@main/services/website/website.address'
import { SiteError } from '@main/services/website/website.http'
import { OfferingsClient, conflictOf } from './offerings.client'
import { PHOTO_EXTENSIONS, photoForSite, photoSignature } from './offerings.photo'
import { OfferingsRepository } from './offerings.repository'

const logger = getLogger('offerings')

interface OfferingsEvents {
  state: OfferingsState
}

const now = (): string => new Date().toISOString()
const newId = (): string => new ObjectId().toHexString()

/** A picked photo may be large here; it's brought down before it goes. */
const MAX_PHOTO_BYTES = 40 * 1024 * 1024
/** How long fetching one of the website's photos, to show here, may take. */
const PREVIEW_TIMEOUT_MS = 15_000
/** The width a photo is shown at, in real pixels. */
const PREVIEW_WIDTH = 900

/**
 * SERVICES' OFFERINGS and HOURS: what "Book me as a music producer" offers,
 * and when its sessions can be booked, written here and published to the
 * website.
 *
 * Written on this machine, published from it, as LORE is. The services and
 * the hours are kept in the archive here and never sent anywhere until
 * Publish, which sends the whole list (the ones shown, in their order) and
 * the hours in one request, so the website never shows half of one edit
 * and half of another. A photo picked here goes to the website first, once,
 * and the publish names it by the address the website gave it.
 *
 * Both of them publish, each from their own copy, so a publish made since
 * this PC's list started from the website is not published over without
 * asking: the refusal comes back with what the website has now, to take
 * theirs or publish over it.
 *
 * Behind the DISPATCH sign-in, whole: signed out, nothing is fetched and
 * nothing kept is shown.
 */
export class OfferingsService extends TypedEmitter<OfferingsEvents> {
  private state: OfferingsState = {
    link: {
      state: 'signed-out',
      message: 'Sign in to open the services.',
      website: '',
      syncedAt: null
    },
    site: null,
    offerings: [],
    hours: null,
    base: null,
    working: null,
    revision: 0
  }

  private started = false
  private readonly unsubscribers: (() => void)[] = []

  constructor(
    private readonly archive: ArchiveService,
    private readonly settings: SettingsService,
    private readonly dispatch: DispatchService,
    private readonly stacks: StacksService
  ) {
    super()
  }

  get current(): OfferingsState {
    return this.state
  }

  get website(): string {
    return websiteFor(this.settings.snapshot)
  }

  private get signedIn(): boolean {
    return this.dispatch.current.link.identity !== null
  }

  private get configured(): boolean {
    return this.dispatch.current.link.state !== 'unconfigured'
  }

  private get repository(): OfferingsRepository {
    return new OfferingsRepository(this.archive.getDb())
  }

  private client(): OfferingsClient {
    return new OfferingsClient(this.website, () => this.dispatch.idToken())
  }

  /**
   * Shows what's kept here, and follows the sign-in and the website
   * address. Never asks the website: the tabs fetch when they open.
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
        signedIn = nowSignedIn
        configured = nowConfigured
        void this.restore()
      })
    )

    // Another address is another website, with its own services.
    this.unsubscribers.push(
      this.settings.on('changed', () => {
        if (this.website === website) return
        website = this.website
        void this.restore()
      })
    )

    void this.restore()
  }

  /** What there is to show without asking: everything kept here, when someone's signed in. */
  private async restore(): Promise<void> {
    const website = this.website
    const closed = { site: null, offerings: [], hours: null, base: null }
    if (!this.configured) {
      this.set({
        link: {
          state: 'unconfigured',
          message: 'No Firebase config has been supplied.',
          website,
          syncedAt: null
        },
        ...closed
      })
      return
    }
    if (!this.signedIn) {
      this.set({
        link: {
          state: 'signed-out',
          message: 'Sign in to open the services.',
          website,
          syncedAt: null
        },
        ...closed
      })
      return
    }

    let kept: { site: ServicesSite; fetchedAt: number } | null = null
    let offerings: Offering[] = []
    let hours: OfferingHours | null = null
    let base: OfferingsBase | null = null
    try {
      if (this.archive.isConnected()) {
        const repository = this.repository
        ;[kept, offerings, hours, base] = await Promise.all([
          repository.readSite(website),
          repository.offerings(),
          repository.hours(),
          repository.base(website)
        ])
      }
    } catch (error) {
      logger.warn('Could not read the services kept here', error)
    }
    this.set({
      link: {
        state: 'online',
        message: kept ? 'As last fetched.' : 'Not fetched yet.',
        website,
        syncedAt: kept?.fetchedAt ?? null
      },
      site: kept?.site ?? null,
      offerings,
      hours,
      base
    })
  }

  // ------------------------------------------------------------------ reads

  /** Fetches what the website offers. Never throws: a failure is a state the page shows. */
  async sync(): Promise<OfferingsState> {
    if (!this.configured || !this.signedIn) {
      await this.restore()
      return this.state
    }
    const website = this.website
    this.patchLink({
      state: 'syncing',
      message: `Fetching the services from ${hostOf(website)}…`,
      website
    })
    try {
      await this.adopt(await this.client().site(), website)
    } catch (error) {
      if (!(error instanceof SiteError)) logger.warn('Fetching the services failed', error)
      this.patchLink({
        state: 'offline',
        message: error instanceof SiteError ? error.message : 'The services could not be fetched.'
      })
    }
    return this.state
  }

  /**
   * A service's photo to show here, as a data URL. Electron's decoder can't
   * read a WebP, which is what the website keeps, so one it can't read goes
   * to the page as it is, for the page's own decoder.
   */
  async photoPreview(id: string): Promise<string | null> {
    const path = this.state.offerings.find((offering) => offering.id === id)?.photo.file?.copiedPath
    if (!path) return null
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) {
      const { width } = image.getSize()
      const sized =
        width > PREVIEW_WIDTH ? image.resize({ width: PREVIEW_WIDTH, quality: 'good' }) : image
      return `data:image/jpeg;base64,${sized.toJPEG(85).toString('base64')}`
    }
    try {
      const bytes = await readFile(path)
      const type = extname(path).toLowerCase() === '.webp' ? 'image/webp' : 'image/png'
      return `data:${type};base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  }

  // ------------------------------------------------------- services, here

  async create({ kind, name }: NewOffering): Promise<OfferingCreated> {
    this.requireOpen()
    const id = newId()
    const stamp = now()
    const offering: Offering = {
      id,
      slug: this.freeSlug(slugify(name), id),
      kind,
      name: name.trim(),
      icon: kind === 'session' ? 'dj' : 'mix',
      summary: '',
      price: null,
      durationMinutes: kind === 'session' ? 60 : null,
      facts: STARTER_FACTS[kind].map((fact) => ({ ...fact })),
      body: '',
      photo: {
        source: 'none',
        site: null,
        siteWebsite: '',
        file: null,
        sent: [],
        alt: ''
      },
      shown: true,
      createdAt: stamp,
      updatedAt: stamp
    }
    const offerings = [...this.state.offerings, offering]
    await this.repository.saveOffering(offering, offerings.length - 1)
    this.set({ offerings })
    return { state: this.state, id }
  }

  /**
   * Saves what was typed for a service. Its address can change until it's
   * published; after that it stays, so links to it (and the home page's
   * list) keep working.
   */
  async save({ id, draft }: SaveOffering): Promise<OfferingsState> {
    this.requireOpen()
    const index = this.state.offerings.findIndex((offering) => offering.id === id)
    const existing = this.state.offerings[index]
    if (!existing) throw notHere()

    const slug = draft.slug.trim() || existing.slug
    if (!SLUG_PATTERN.test(slug)) {
      throw new AppError('An address is lowercase words joined by dashes.', {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
    if (slug !== existing.slug && this.published(existing)) {
      throw new AppError('A published service keeps its address, so links to it keep working.', {
        code: ErrorCode.Validation,
        hint: 'The home page lists services by their address too.',
        recoverable: true
      })
    }
    this.requireFreeSlug(slug, id)

    const offering: Offering = {
      ...existing,
      slug,
      kind: draft.kind,
      name: draft.name.trim(),
      icon: draft.icon,
      summary: draft.summary.trim(),
      price: draft.price,
      durationMinutes: draft.kind === 'session' ? draft.durationMinutes : null,
      facts: draft.facts.map((fact) => ({ label: fact.label.trim(), value: fact.value.trim() })),
      body: draft.body,
      photo: { ...existing.photo, alt: draft.alt.trim() },
      shown: draft.shown,
      updatedAt: now()
    }
    await this.repository.saveOffering(offering, index)
    this.set({ offerings: this.state.offerings.map((o) => (o.id === id ? offering : o)) })
    return this.state
  }

  /** Deletes a service here. One on the website comes off it with the next publish. */
  async remove(id: string): Promise<OfferingsState> {
    this.requireOpen()
    if (!this.state.offerings.some((offering) => offering.id === id)) throw notHere()
    const repository = this.repository
    await repository.deleteOffering(id)
    const offerings = this.state.offerings.filter((offering) => offering.id !== id)
    await repository.saveOrder(offerings.map((offering) => offering.id))
    this.set({ offerings })
    return this.state
  }

  /** Puts the services in this order here. The website's follows with the next publish. */
  async reorder(ids: string[]): Promise<OfferingsState> {
    this.requireOpen()
    const byId = new Map(this.state.offerings.map((offering) => [offering.id, offering]))
    const wanted = ids.filter((id, i) => byId.has(id) && ids.indexOf(id) === i)
    const offerings = [
      ...wanted.map((id) => byId.get(id) as Offering),
      ...this.state.offerings.filter((offering) => !wanted.includes(offering.id))
    ]
    await this.repository.saveOrder(offerings.map((offering) => offering.id))
    this.set({ offerings })
    return this.state
  }

  /** Copies a picture in as a service's photo. It goes to the website with the next publish. */
  async setPhoto({ id, path }: OfferingPhotoInput): Promise<OfferingsState> {
    this.requireOpen()
    const index = this.state.offerings.findIndex((offering) => offering.id === id)
    const existing = this.state.offerings[index]
    if (!existing) throw notHere()
    // Checked now rather than at publish, so a photo too small is said at once.
    await photoForSite(path)
    const file = await storeMedia({
      wrapperPath: await this.stacks.requireWrapperPath(),
      bucket: 'services',
      key: id,
      sourcePath: path,
      allowed: PHOTO_EXTENSIONS,
      maxBytes: MAX_PHOTO_BYTES
    })
    const offering: Offering = {
      ...existing,
      photo: { ...existing.photo, source: 'file', file, site: null, siteWebsite: '', sent: [] },
      updatedAt: now()
    }
    await this.repository.saveOffering(offering, index)
    this.set({ offerings: this.state.offerings.map((o) => (o.id === id ? offering : o)) })
    return this.state
  }

  /** Saves the hours here. They go to the website with the next publish. */
  async saveHours(hours: OfferingHours): Promise<OfferingsState> {
    this.requireOpen()
    const problems = hoursProblems(hours)
    if (problems.length) {
      throw new AppError(problems[0], { code: ErrorCode.Validation, recoverable: true })
    }
    const tidy: OfferingHours = {
      ...hours,
      weekly: Object.fromEntries(
        Object.entries(hours.weekly).map(([day, times]) => [day, [...times].sort()])
      ) as OfferingHours['weekly'],
      closed: [...new Set(hours.closed)].sort()
    }
    await this.repository.saveHours(tidy)
    this.set({ hours: tidy })
    return this.state
  }

  // ----------------------------------------------------- the website

  /**
   * Starts the list here from what the website offers now: its own list
   * before the first publish, or what was published since. Every service
   * keeps its address and its photos, and the hours come too. Only while
   * there's nothing here yet, so nothing written here is lost.
   */
  async importFromSite(): Promise<OfferingsState> {
    this.requireOpen()
    if (this.state.offerings.length) {
      throw new AppError('There are services here already.', {
        code: ErrorCode.Validation,
        hint: 'Copying the website’s list is for starting out.',
        recoverable: true
      })
    }
    return this.replaceWithSite()
  }

  /**
   * After a refused publish: drops the list and the hours here for what
   * the website has now, the other person's.
   */
  async takeTheirs(): Promise<OfferingsState> {
    this.requireOpen()
    return this.replaceWithSite()
  }

  /**
   * Publishes the list (the services shown, in their order) and the hours,
   * whole. Photos picked here go first, each once per website.
   */
  async publish({ force }: { force: boolean }): Promise<OfferingsPublishResult> {
    this.requireOpen()
    const website = this.website
    const shown = this.state.offerings.filter((offering) => offering.shown)
    if (!shown.length) {
      throw new AppError('Show at least one service on the website.', {
        code: ErrorCode.Validation,
        hint: 'The website needs something to offer.',
        recoverable: true
      })
    }
    if (shown.length > OFFERING_LIMITS.items) {
      throw new AppError(`The website shows up to ${OFFERING_LIMITS.items} services.`, {
        code: ErrorCode.Validation,
        hint: 'Keep some here instead.',
        recoverable: true
      })
    }
    for (const offering of shown) {
      const [problem] = offeringProblems(offering)
      if (problem) {
        throw new AppError(`${offering.name.trim() || 'A service'}: ${problem}`, {
          code: ErrorCode.Validation,
          recoverable: true
        })
      }
    }

    this.set({ working: 'publishing' })
    try {
      // The hours here, or the website's as they stand when none are set here.
      const site = this.state.site ?? (await this.client().site())
      const hours = this.state.hours ?? site.hours
      const [problem] = hoursProblems(hours)
      if (problem) throw new AppError(problem, { code: ErrorCode.Validation, recoverable: true })

      const items: SiteService[] = []
      for (const offering of shown) {
        items.push(siteServiceOf(offering, await this.photosOn(offering, website)))
      }
      const published = await this.client().publish({
        items,
        hours,
        baseRevision: this.state.base?.revision ?? 0,
        force
      })
      const base: OfferingsBase = {
        revision: published.revision,
        sent: Object.fromEntries(
          this.state.offerings
            .filter((offering) => offering.shown)
            .map((offering) => [offering.id, offeringFingerprint(offering)])
        ),
        hours: hoursFingerprint(hours),
        order: shown.map((offering) => offering.id),
        at: Date.now()
      }
      await this.repository.saveBase(website, base)
      this.set({ base })
      await this.adopt(published, website)
      return { status: 'done', state: this.state }
    } catch (error) {
      if (error instanceof SiteError && error.kind === 'conflict') {
        const current = conflictOf(error)
        if (current) {
          await this.adopt(current, website)
          return { status: 'conflict', state: this.state, current }
        }
      }
      throw this.asAppError(error)
    } finally {
      this.set({ working: null })
    }
  }

  // ---------------------------------------------------------------- private

  /** The addresses a service's photos have on a website, sending a picked one first. */
  private async photosOn(
    offering: Offering,
    website: string
  ): Promise<{ card: string; wide: string }> {
    const { photo } = offering
    if (photo.source === 'site' && photo.site) {
      if (photo.siteWebsite && photo.siteWebsite !== website) {
        throw new AppError(`${offering.name}: its photo is on another website.`, {
          code: ErrorCode.Validation,
          hint: 'Pick its photo again here, and it goes to this one.',
          recoverable: true
        })
      }
      return photo.site
    }
    const signature = photoSignature(photo.file)
    if (photo.source !== 'file' || !photo.file?.copiedPath || !signature) {
      throw new AppError(`${offering.name}: pick its photo.`, {
        code: ErrorCode.Validation,
        recoverable: true
      })
    }
    const sent = photo.sent.find(
      (entry) => entry.website === website && entry.signature === signature
    )
    if (sent) return { card: sent.card, wide: sent.wide }

    const { body, type } = await photoForSite(photo.file.copiedPath)
    const stored = await this.client().photo(body, type)
    const next: OfferingPhoto = {
      ...photo,
      sent: [
        ...photo.sent.filter((entry) => entry.website !== website),
        { website, signature, card: stored.card, wide: stored.wide }
      ]
    }
    await this.keepPhoto(offering.id, next)
    return stored
  }

  /** A service's photo record changed underneath its other fields (a send landed). */
  private async keepPhoto(id: string, photo: OfferingPhoto): Promise<void> {
    const index = this.state.offerings.findIndex((offering) => offering.id === id)
    const current = this.state.offerings[index]
    if (!current) return
    const offering = { ...current, photo }
    await this.repository.saveOffering(offering, index)
    this.set({ offerings: this.state.offerings.map((o) => (o.id === id ? offering : o)) })
  }

  /** The list and the hours here replaced by the website's, as it has them now. */
  private async replaceWithSite(): Promise<OfferingsState> {
    const website = this.website
    this.set({ working: 'importing' })
    try {
      const site = await this.client().site()
      const wrapperPath = await this.stacks.wrapperPathOrNull()
      const stamp = now()
      const offerings: Offering[] = []
      for (const item of site.items) {
        const id = newId()
        const file = wrapperPath ? await this.fetchPreview(item.photos.card, id, wrapperPath) : null
        offerings.push({
          id,
          slug: item.id,
          kind: item.kind,
          name: item.name,
          icon: item.icon,
          summary: item.summary,
          price: item.price ?? null,
          durationMinutes: item.kind === 'session' ? (item.durationMinutes ?? 60) : null,
          facts: item.facts,
          body: item.body,
          photo: {
            source: item.photos.card && item.photos.wide ? 'site' : 'none',
            site:
              item.photos.card && item.photos.wide
                ? { card: item.photos.card, wide: item.photos.wide }
                : null,
            // The website's own files are on every copy of it; stored ones on this one.
            siteWebsite: item.photos.card.startsWith('/') ? '' : website,
            file,
            sent: [],
            alt: item.photos.alt
          },
          shown: true,
          createdAt: stamp,
          updatedAt: stamp
        })
      }
      const repository = this.repository
      await repository.replaceAll(offerings)
      await repository.saveHours(site.hours)
      // What came from the website is what it has: nothing to publish but
      // the switch, before its first publish.
      const base: OfferingsBase = {
        revision: site.revision,
        sent: Object.fromEntries(offerings.map((o) => [o.id, offeringFingerprint(o)])),
        hours: hoursFingerprint(site.hours),
        order: offerings.map((offering) => offering.id),
        at: site.live ? Date.now() : null
      }
      await repository.saveBase(website, base)
      this.set({ offerings, hours: site.hours, base })
      await this.adopt(site, website)
      return this.state
    } catch (error) {
      throw this.asAppError(error)
    } finally {
      this.set({ working: null })
    }
  }

  /**
   * One of the website's photos, fetched and copied in to show here. Null
   * when it can't be: the service still has it on the website.
   */
  private async fetchPreview(
    address: string,
    id: string,
    wrapperPath: string
  ): Promise<Offering['photo']['file']> {
    if (!address) return null
    let directory: string | null = null
    try {
      const url = address.startsWith('/') ? `${this.website}${address}` : address
      const response = await fetch(url, { signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS) })
      if (!response.ok) return null
      const extension = (extname(new URL(url).pathname).slice(1) || 'jpg').toLowerCase()
      if (!PHOTO_EXTENSIONS.includes(extension)) return null
      directory = await mkdtemp(join(tmpdir(), 'candy-haven-photo-'))
      const path = join(directory, `photo.${extension}`)
      await writeFile(path, Buffer.from(await response.arrayBuffer()))
      return await storeMedia({
        wrapperPath,
        bucket: 'services',
        key: id,
        sourcePath: path,
        allowed: PHOTO_EXTENSIONS,
        maxBytes: MAX_PHOTO_BYTES
      })
    } catch (error) {
      logger.warn(`Could not fetch a service's photo to show (${address})`, error)
      return null
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /** Whether this service has gone to this website from here. */
  private published(offering: Offering): boolean {
    return Boolean(this.state.base?.sent[offering.id])
  }

  private slugTaken(slug: string, id: string): boolean {
    return this.state.offerings.some((offering) => offering.id !== id && offering.slug === slug)
  }

  /** An address made from a name, numbered when it's taken. */
  private freeSlug(base: string, id: string): string {
    for (let n = 1; n <= 99; n++) {
      const slug = n === 1 ? base : `${base.slice(0, OFFERING_LIMITS.slug - 3)}-${n}`
      if (!this.slugTaken(slug, id)) return slug
    }
    return `${base.slice(0, OFFERING_LIMITS.slug - 25)}-${id}`
  }

  private requireFreeSlug(slug: string, id: string): void {
    if (!this.slugTaken(slug, id)) return
    throw new AppError(`Another service already has the address ${slug}.`, {
      code: ErrorCode.Validation,
      hint: 'Give this one another.',
      recoverable: true
    })
  }

  private asAppError(error: unknown): unknown {
    if (!(error instanceof SiteError)) return error
    const body = (error.body ?? {}) as { error?: unknown; message?: unknown }

    if (error.kind === 'unreachable') {
      this.patchLink({ state: 'offline', message: error.message })
      return new AppError('The website could not be reached.', {
        code: ErrorCode.Unavailable,
        hint: 'Nothing is lost: the services are kept here. Try again once you are connected.',
        recoverable: true
      })
    }
    if (body.error === 'storage_unconfigured') {
      return new AppError('The website has no photo storage set up yet.', {
        code: ErrorCode.Unavailable,
        hint: 'Its Supabase settings are missing; the photos go there.',
        recoverable: true
      })
    }
    return new AppError(error.message, {
      code: error.kind === 'invalid' ? ErrorCode.Validation : ErrorCode.Unavailable,
      recoverable: true
    })
  }

  /** Signed in, with the archive to keep things in. */
  private requireOpen(): void {
    if (!this.configured || !this.signedIn) {
      throw new AppError('Sign in first.', {
        code: ErrorCode.PermissionDenied,
        hint: 'SERVICES uses the DISPATCH sign-in.',
        recoverable: true
      })
    }
    if (this.archive.isConnected()) return
    throw new AppError('The archive is not connected.', {
      code: ErrorCode.ArchiveConnectFailed,
      hint: 'SERVICES keeps its services in the archive. Restart it from REGULATION.',
      recoverable: true
    })
  }

  /** What the website answered becomes what it offers, here. */
  private async adopt(site: ServicesSite, website: string): Promise<void> {
    // Signed out, or the address changed, while the answer was on its way.
    if (!this.signedIn || website !== this.website) return
    this.set({
      link: { state: 'online', message: 'Up to date.', website, syncedAt: Date.now() },
      site
    })
    try {
      if (this.archive.isConnected()) await this.repository.writeSite(website, site)
    } catch (error) {
      logger.warn('Could not keep a copy of what the website offers', error)
    }
  }

  private set(partial: Partial<Omit<OfferingsState, 'revision'>>): void {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }
    this.emit('state', this.state)
  }

  private patchLink(link: Partial<OfferingsLink>): void {
    this.set({ link: { ...this.state.link, ...link } })
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
  }
}

function notHere(): AppError {
  return new AppError('That service is not here any more.', {
    code: ErrorCode.NotFound,
    recoverable: true
  })
}
