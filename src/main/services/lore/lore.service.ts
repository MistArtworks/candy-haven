import { ObjectId } from 'mongodb'
import {
  baseFor,
  displayOrder,
  orderDiffers,
  planetLook,
  planetUsers,
  publishedOrderHere,
  rebased,
  withSiteOrder,
  type ChapterDraft,
  type DeleteChapterInput,
  type LoreCreated,
  type LoreDraft,
  type LoreLink,
  type LorePlanet,
  type LoreSite,
  type LoreState,
  type PlanetDraft,
  type PublishChapterInput,
  type PublishResult,
  type PublishedChapter,
  type SaveChapterInput,
  type SavePlanetInput
} from '@shared/domain/lore'
import { LORE_LIMITS, slugify } from '@shared/domain/lore.constants'
import { isPresetId } from '@shared/planets/engine'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { SettingsService } from '@main/services/settings/settings.service'
import type { DispatchService } from '@main/services/dispatch/dispatch.service'
import { hostOf, websiteFor } from '@main/services/website/website.address'
import { SiteError } from '@main/services/website/website.http'
import { LoreClient, conflictOf } from './lore.client'
import { LoreRepository } from './lore.repository'

const logger = getLogger('lore')

interface LoreEvents {
  state: LoreState
}

const now = (): string => new Date().toISOString()
const newId = (): string => new ObjectId().toHexString()

/**
 * LORE: the lore of Nayara, written here and published to the website.
 *
 * Written on this machine, published from it. The drafts, the planet
 * library and the chapters' order are kept in the archive here and never
 * sent anywhere: saving is local, works offline, and the other copy of the
 * console never sees what's being written. Publishing sends one chapter,
 * as it stands, with a copy of its planet, and only then does the website
 * show it. What's published is fetched when LORE opens and when the
 * operator asks, and a copy is kept so the page still opens offline.
 *
 * Both of them publish, each from their own copy, so a chapter the other
 * person published since this draft started from it is not published
 * over without asking: the refusal comes back with their version (or null,
 * when they took it down), to keep theirs or publish over it. It is the one
 * refusal returned rather than thrown, because it asks a question.
 *
 * Behind the DISPATCH sign-in, whole: signed out, nothing is fetched and
 * nothing kept is shown.
 */
export class LoreService extends TypedEmitter<LoreEvents> {
  private state: LoreState = {
    link: {
      state: 'signed-out',
      message: 'Sign in to open the lore.',
      website: '',
      syncedAt: null
    },
    site: null,
    drafts: [],
    planets: [],
    order: [],
    revision: 0
  }

  private started = false
  private readonly unsubscribers: (() => void)[] = []

  constructor(
    private readonly archive: ArchiveService,
    private readonly settings: SettingsService,
    private readonly dispatch: DispatchService
  ) {
    super()
  }

  get current(): LoreState {
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

  private get repository(): LoreRepository {
    return new LoreRepository(this.archive.getDb())
  }

  private client(): LoreClient {
    return new LoreClient(this.website, () => this.dispatch.idToken())
  }

  /**
   * Shows what's kept here, and follows the sign-in and the website
   * address. Never asks the website: LORE fetches when it opens.
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

    // Another address is another website, with its own published lore.
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
    const closed = { site: null, drafts: [], planets: [], order: [] }
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
          message: 'Sign in to open the lore.',
          website,
          syncedAt: null
        },
        ...closed
      })
      return
    }

    let kept: { site: LoreSite; fetchedAt: number } | null = null
    let drafts: LoreDraft[] = []
    let planets: LorePlanet[] = []
    let order: string[] = []
    try {
      if (this.archive.isConnected()) {
        const repository = this.repository
        ;[kept, drafts, planets, order] = await Promise.all([
          repository.readSite(website),
          repository.drafts(),
          repository.planets(),
          repository.order()
        ])
      }
    } catch (error) {
      logger.warn('Could not read the lore kept here', error)
    }
    this.set({
      link: {
        state: 'online',
        message: kept ? 'As last fetched.' : 'Not fetched yet.',
        website,
        syncedAt: kept?.fetchedAt ?? null
      },
      site: kept?.site ?? null,
      drafts,
      planets,
      order
    })
  }

  // ------------------------------------------------------------------ reads

  /** Fetches what's published. Never throws: a failure is a state the page shows. */
  async sync(): Promise<LoreState> {
    if (!this.configured || !this.signedIn) {
      await this.restore()
      return this.state
    }
    const website = this.website
    this.patchLink({
      state: 'syncing',
      message: `Fetching the lore from ${hostOf(website)}…`,
      website
    })
    try {
      await this.adopt(await this.client().site(), website, { followOrder: true })
    } catch (error) {
      if (!(error instanceof SiteError)) logger.warn('Fetching the lore failed', error)
      this.patchLink({
        state: 'offline',
        message: error instanceof SiteError ? error.message : 'The lore could not be fetched.'
      })
    }
    return this.state
  }

  // ------------------------------------------------------- chapters, here

  async createChapter(draft: ChapterDraft): Promise<LoreCreated> {
    this.requireOpen()
    const id = newId()
    const slug = draft.slug ?? this.freeSlug(slugify(draft.title), id)
    this.requireFreeSlug(slug, id)
    this.requirePlanet(draft.planetId)
    const stamp = now()
    const chapter: LoreDraft = {
      id,
      slug,
      title: draft.title,
      line: draft.line,
      planetId: draft.planetId,
      body: draft.body,
      bases: [],
      createdAt: stamp,
      updatedAt: stamp
    }
    const order = [...displayOrder(this.state), id]
    const repository = this.repository
    await repository.saveDraft(chapter)
    await repository.saveOrder(order)
    this.set({ drafts: [...this.state.drafts, chapter], order })
    return { state: this.state, id }
  }

  /**
   * Saves a chapter here. A chapter only the website had (the other
   * person's, published) becomes a draft here with its first save, starting
   * from the version it was, and its planet joins the library if this
   * console hasn't got it.
   */
  async saveChapter({ id, draft }: SaveChapterInput): Promise<LoreState> {
    this.requireOpen()
    const existing = this.draftOf(id)
    const published = this.publishedOf(id)
    if (!existing && !published) {
      throw new AppError('That chapter is not here any more.', {
        code: ErrorCode.NotFound,
        recoverable: true
      })
    }
    const slug = draft.slug ?? existing?.slug ?? published?.slug ?? slugify(draft.title)
    if (published && slug !== published.slug) {
      throw new AppError('A published chapter keeps its address, so links to it keep working.', {
        code: ErrorCode.Validation,
        hint: 'Unpublish it to change the address.',
        recoverable: true
      })
    }
    this.requireFreeSlug(slug, id)

    const repository = this.repository
    const imported = this.importPlanet(draft.planetId, published)
    if (imported) await repository.savePlanet(imported)
    else this.requirePlanet(draft.planetId)

    const chapter: LoreDraft = {
      id,
      slug,
      title: draft.title,
      line: draft.line,
      planetId: draft.planetId,
      body: draft.body,
      bases:
        existing?.bases ??
        (published ? [{ website: this.website, revision: published.revision }] : []),
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    await repository.saveDraft(chapter)
    this.set({
      drafts: upsert(this.state.drafts, chapter),
      planets: imported ? [...this.state.planets, imported] : this.state.planets
    })
    return this.state
  }

  /**
   * Deletes the draft here, and with `everywhere` takes the chapter off the
   * website first. A published chapter whose draft alone goes stays where
   * it is, as the website has it: that's going back to what's published.
   */
  async deleteChapter({ id, everywhere }: DeleteChapterInput): Promise<LoreState> {
    this.requireOpen()
    if (everywhere && this.publishedOf(id)) {
      await this.siteWrite((client) => client.unpublish(id))
    }
    const repository = this.repository
    await repository.deleteDraft(id)
    const drafts = this.state.drafts.filter((draft) => draft.id !== id)
    const order = this.publishedOf(id) ? this.state.order : this.state.order.filter((x) => x !== id)
    if (order !== this.state.order) await repository.saveOrder(order)
    this.set({ drafts, order })
    return this.state
  }

  /** Puts the chapters here in this order. Nothing reaches the website until it's published. */
  async reorder(ids: string[]): Promise<LoreState> {
    this.requireOpen()
    const known = displayOrder(this.state)
    const wanted = new Set(ids)
    const order = [
      ...ids.filter((id, i) => known.includes(id) && ids.indexOf(id) === i),
      ...known.filter((id) => !wanted.has(id))
    ]
    await this.repository.saveOrder(order)
    this.set({ order })
    return this.state
  }

  // ----------------------------------------------------- the website

  /**
   * Publishes a chapter as it's saved here: its text, title, line, address
   * and a copy of its planet. The draft then starts from what it published.
   */
  async publish({ id, force }: PublishChapterInput): Promise<PublishResult> {
    this.requireOpen()
    const draft = this.draftOf(id)
    // Nothing written here: what the website has is all there is.
    if (!draft) return { status: 'done', state: this.state }
    const look = planetLook(this.state, draft.planetId)
    if (!look) {
      throw new AppError('Its planet is not in the library any more.', {
        code: ErrorCode.Validation,
        hint: 'Pick another planet for it, save, then publish.',
        recoverable: true
      })
    }

    const website = this.website
    try {
      const site = await this.client().publish(id, {
        slug: draft.slug,
        title: draft.title,
        line: draft.line,
        body: draft.body,
        planet: { id: draft.planetId, name: look.name, spec: look.spec },
        baseRevision: baseFor(draft, website),
        force
      })
      const published = site.chapters.find((chapter) => chapter.id === id)
      if (published) await this.rebase(draft, website, published.revision)
      await this.adopt(site, website)
      return { status: 'done', state: this.state }
    } catch (error) {
      if (error instanceof SiteError && error.kind === 'conflict') {
        const current = conflictOf(error)
        if (current !== undefined) {
          this.layOver(id, current)
          return { status: 'conflict', state: this.state, current }
        }
      }
      throw this.asAppError(error)
    }
  }

  /**
   * Takes a chapter off the website. Its text stays here: a chapter only
   * the website had becomes a draft first, so nothing is lost.
   */
  async unpublish(id: string): Promise<LoreState> {
    this.requireOpen()
    const published = this.publishedOf(id)
    if (!published) return this.state
    const website = this.website

    let draft = this.draftOf(id)
    if (!draft) {
      await this.saveChapter({
        id,
        draft: {
          title: published.title,
          line: published.line,
          slug: published.slug,
          planetId: published.planetId,
          body: published.body
        }
      })
      draft = this.draftOf(id)
    }
    await this.siteWrite((client) => client.unpublish(id))
    // Published again, it starts afresh rather than from a version that's gone.
    if (draft) await this.rebase(draft, website, 0)
    return this.state
  }

  /** Sends the order here to the website, for the published chapters. */
  async publishOrder(): Promise<LoreState> {
    this.requireOpen()
    const ids = publishedOrderHere(this.state)
    await this.siteWrite((client) => client.publishOrder(ids))
    return this.state
  }

  // ---------------------------------------------------------------- planets

  async createPlanet(draft: PlanetDraft): Promise<LoreCreated> {
    this.requireOpen()
    const stamp = now()
    const planet: LorePlanet = {
      id: newId(),
      name: draft.name,
      spec: draft.spec,
      createdAt: stamp,
      updatedAt: stamp
    }
    await this.repository.savePlanet(planet)
    this.set({ planets: [...this.state.planets, planet] })
    return { state: this.state, id: planet.id }
  }

  async savePlanet({ id, draft }: SavePlanetInput): Promise<LoreState> {
    this.requireOpen()
    const existing = this.state.planets.find((planet) => planet.id === id)
    if (!existing) {
      throw new AppError('That planet is not in the library any more.', {
        code: ErrorCode.NotFound,
        recoverable: true
      })
    }
    const planet: LorePlanet = { ...existing, name: draft.name, spec: draft.spec, updatedAt: now() }
    await this.repository.savePlanet(planet)
    this.set({ planets: upsert(this.state.planets, planet) })
    return this.state
  }

  /** Deletes a planet, unless a chapter here is drawn with it. Published copies are their own. */
  async deletePlanet(id: string): Promise<LoreState> {
    this.requireOpen()
    const users = planetUsers(this.state, id)
    if (users.length) {
      const titles = users.map((draft) => draft.title || 'Untitled')
      throw new AppError(`This planet is used by ${titles.join(', ')}.`, {
        code: ErrorCode.Validation,
        hint: 'Give those chapters another planet first.',
        recoverable: true
      })
    }
    await this.repository.deletePlanet(id)
    this.set({ planets: this.state.planets.filter((planet) => planet.id !== id) })
    return this.state
  }

  // ---------------------------------------------------------------- private

  private draftOf(id: string): LoreDraft | undefined {
    return this.state.drafts.find((draft) => draft.id === id)
  }

  private publishedOf(id: string): PublishedChapter | undefined {
    return this.state.site?.chapters.find((chapter) => chapter.id === id)
  }

  /** Whether another chapter, here or on the website, has an address. */
  private slugTaken(slug: string, id: string): boolean {
    return (
      this.state.drafts.some((draft) => draft.id !== id && draft.slug === slug) ||
      (this.state.site?.chapters ?? []).some(
        (chapter) => chapter.id !== id && chapter.slug === slug
      )
    )
  }

  /** An address made from a title, numbered when the title's taken. */
  private freeSlug(base: string, id: string): string {
    for (let n = 1; n <= 99; n++) {
      const slug = n === 1 ? base : `${base.slice(0, LORE_LIMITS.slug - 3)}-${n}`
      if (!this.slugTaken(slug, id)) return slug
    }
    return `${base.slice(0, LORE_LIMITS.slug - 25)}-${id}`
  }

  private requireFreeSlug(slug: string, id: string): void {
    if (!this.slugTaken(slug, id)) return
    throw new AppError(`Another chapter already lives at /lore/${slug}.`, {
      code: ErrorCode.Validation,
      hint: 'Give this one another address.',
      recoverable: true
    })
  }

  private requirePlanet(planetId: string): void {
    if (planetLook(this.state, planetId)) return
    throw new AppError('That planet is not in the library any more.', {
      code: ErrorCode.Validation,
      hint: 'Pick another planet.',
      recoverable: true
    })
  }

  /**
   * The planet a published chapter brought, when the chapter's draft here
   * is drawn with it and the library here hasn't got it. Kept under the
   * same id, so a second chapter drawn with it finds it already here.
   */
  private importPlanet(
    planetId: string,
    published: PublishedChapter | undefined
  ): LorePlanet | null {
    if (isPresetId(planetId) || this.state.planets.some((p) => p.id === planetId)) return null
    if (!published || published.planetId !== planetId) return null
    const stamp = now()
    return {
      id: planetId,
      name: published.planetName || 'From the website',
      spec: published.planet,
      createdAt: stamp,
      updatedAt: stamp
    }
  }

  private async rebase(draft: LoreDraft, website: string, revision: number): Promise<void> {
    const current = this.draftOf(draft.id) ?? draft
    const next: LoreDraft = { ...current, bases: rebased(current, website, revision) }
    await this.repository.saveDraft(next)
    this.set({ drafts: upsert(this.state.drafts, next) })
  }

  /** One call to the website: its answer becomes what's published. */
  private async siteWrite(run: (client: LoreClient) => Promise<LoreSite>): Promise<void> {
    this.requireSignedIn()
    const website = this.website
    try {
      await this.adopt(await run(this.client()), website)
    } catch (error) {
      throw this.asAppError(error)
    }
  }

  private asAppError(error: unknown): unknown {
    if (!(error instanceof SiteError)) return error
    const body = (error.body ?? {}) as { error?: unknown }

    if (error.kind === 'unreachable') {
      this.patchLink({ state: 'offline', message: error.message })
      return new AppError('The website could not be reached.', {
        code: ErrorCode.Unavailable,
        hint: 'Nothing is lost: the drafts are kept here. Try again once you are connected.',
        recoverable: true
      })
    }
    if (error.kind === 'missing') {
      void this.sync()
      return new AppError('That is no longer on the website.', {
        code: ErrorCode.NotFound,
        hint: 'It may have been taken down from the other copy of the console. What is published has been fetched again.',
        recoverable: true
      })
    }
    if (body.error === 'out_of_date') {
      void this.sync()
      return new AppError('The published chapters changed in the other copy of the console.', {
        code: ErrorCode.Validation,
        hint: 'They have been fetched again. Publish the order once more.',
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
    this.requireSignedIn()
    if (this.archive.isConnected()) return
    throw new AppError('The archive is not connected.', {
      code: ErrorCode.ArchiveConnectFailed,
      hint: 'LORE keeps its drafts in the archive. Restart it from REGULATION.',
      recoverable: true
    })
  }

  private requireSignedIn(): void {
    if (this.configured && this.signedIn) return
    throw new AppError('Sign in first.', {
      code: ErrorCode.PermissionDenied,
      hint: 'LORE uses the DISPATCH sign-in.',
      recoverable: true
    })
  }

  /**
   * What the website answered becomes what's published here. On a fetch,
   * the order here follows the website's when nothing moved here is waiting
   * to be published, so the other person's "Publish order" arrives too.
   */
  private async adopt(
    site: LoreSite,
    website: string,
    { followOrder = false }: { followOrder?: boolean } = {}
  ): Promise<void> {
    // Signed out, or the address changed, while the answer was on its way:
    // it belongs to a lore this console is no longer showing.
    if (!this.signedIn || website !== this.website) return

    const before = this.state.order
    const order =
      followOrder && this.state.site && !orderDiffers(this.state)
        ? withSiteOrder(displayOrder(this.state), site)
        : before
    this.set({
      link: { state: 'online', message: 'Up to date.', website, syncedAt: Date.now() },
      site,
      order
    })
    try {
      if (!this.archive.isConnected()) return
      const repository = this.repository
      await repository.writeSite(website, site)
      if (order !== before) await repository.saveOrder(order)
    } catch (error) {
      logger.warn('Could not keep a copy of what is published', error)
    }
  }

  /** Lays the version a conflict brought over what's held: theirs, or gone. */
  private layOver(id: string, current: PublishedChapter | null): void {
    const site = this.state.site
    if (!site) return
    const others = site.chapters.filter((chapter) => chapter.id !== id)
    const chapters = current
      ? site.chapters.some((chapter) => chapter.id === id)
        ? site.chapters.map((chapter) => (chapter.id === id ? current : chapter))
        : [...others, current]
      : others
    this.set({ site: { ...site, chapters } })
  }

  private set(partial: Partial<Omit<LoreState, 'revision'>>): void {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }
    this.emit('state', this.state)
  }

  private patchLink(link: Partial<LoreLink>): void {
    this.set({ link: { ...this.state.link, ...link } })
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
  }
}

/** A list with one record put in place of its namesake, or added. */
function upsert<T extends { id: string }>(list: readonly T[], record: T): T[] {
  return list.some((item) => item.id === record.id)
    ? list.map((item) => (item.id === record.id ? record : item))
    : [...list, record]
}
