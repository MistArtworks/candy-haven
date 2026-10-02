import {
  afterChoice,
  isOutOn,
  visibleOn,
  type ReleaseEntry,
  type ReleasesState,
  type Visibility
} from '@shared/domain/releases'
import type { ReleaseChoice, SendState } from '@shared/domain/releases.constants'
import {
  RELEASE_KIND_LABEL,
  localIsoDate,
  type ReleaseStatus
} from '@shared/domain/discography.constants'

/** KIND · date · tracks: what a release is, in one line. */
export function metaOf(kind: ReleaseEntry['kind'], date: string | null, tracks?: number): string {
  return [
    RELEASE_KIND_LABEL[kind],
    date ?? 'No date',
    tracks === undefined ? null : `${tracks} track${tracks === 1 ? '' : 's'}`
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Out: RELEASED, or its day has come. */
export const isOut = (release: Pick<ReleaseEntry, 'status' | 'date'>): boolean =>
  isOutOn({ ...release, shown: null }, localIsoDate())

/** The website's host, for sentences: `candy-heist.vercel.app`. */
export function hostOfWebsite(origin: string): string {
  try {
    return new URL(origin).host || origin
  } catch {
    return origin || 'The website'
  }
}

/** A release's page on the website. */
export const releaseUrl = (website: string, slug: string): string =>
  `${website.replace(/\/+$/, '')}/discography/${slug}`

/** Where a release stands on one side of Update. */
export interface Standing {
  status: ReleaseStatus
  /** Whether visitors see it; null when it isn't on the website. */
  visible: boolean | null
  /** Its place on the shelf, from 0; null when it isn't on it. */
  shelf: number | null
}

/**
 * One row of the list: a release here, or one the other computer sent, as
 * it stands now and as it'll stand once Update sends what's picked.
 */
export interface Row {
  /** Its DISCOGRAPHY id here; its website id for the other computer's. */
  key: string
  own: boolean
  title: string
  kind: ReleaseEntry['kind']
  date: string | null
  artworkPath: string | null
  /** Null for the other computer's, whose tracks this one doesn't hold. */
  trackCount: number | null
  siteId: string | null
  slug: string | null
  /** Null for the other computer's: it sends them, not this one. */
  send: SendState | null
  problem: string | null
  omitted: string[]
  now: Standing
  next: Standing
  /** Show or Hide, picked and not sent yet. */
  picked: ReleaseChoice | null
  /** Picked to send with Update. */
  queued: boolean
}

/** Whether anything about a row changes with Update. */
export const changes = (row: Row): boolean =>
  row.queued ||
  row.now.status !== row.next.status ||
  row.now.visible !== row.next.visible ||
  row.now.shelf !== row.next.shelf

/** Every row, here and the other computer's, as now and after Update. */
export function rowsOf(state: ReleasesState): { own: Row[]; remote: Row[] } {
  const today = localIsoDate()
  const shelfNow = state.site?.shelf ?? []
  const shelfNext = state.staged.shelf ?? shelfNow
  const place = (shelf: string[], siteId: string | null): number | null => {
    const at = siteId ? shelf.indexOf(siteId) : -1
    return at >= 0 ? at : null
  }

  const standings = (
    key: string,
    own: boolean,
    shape: Visibility,
    siteId: string | null,
    visibleNow: boolean | null,
    queued: boolean
  ): Pick<Row, 'now' | 'next' | 'picked'> => {
    const picked = state.staged.visibility[key] ?? null
    const after = (picked && afterChoice(shape, picked, own, today)) || shape
    // Not on the website yet, it shows up there only once sent.
    const goes = siteId !== null || queued || (own && picked === 'show')
    return {
      picked,
      now: { status: shape.status, visible: visibleNow, shelf: place(shelfNow, siteId) },
      next: {
        status: after.status,
        visible: goes ? visibleOn(after, today) : null,
        shelf: place(shelfNext, siteId)
      }
    }
  }

  const own = state.entries.map((entry): Row => {
    const queued = state.staged.send.includes(entry.id)
    return {
      key: entry.id,
      own: true,
      title: entry.title || 'Untitled',
      kind: entry.kind,
      date: entry.date,
      artworkPath: entry.artworkPath,
      trackCount: entry.trackCount,
      siteId: entry.siteId,
      slug: entry.slug,
      send: entry.send,
      problem: entry.problem,
      omitted: entry.omitted,
      queued,
      ...standings(
        entry.id,
        true,
        { status: entry.status, date: entry.date, shown: entry.shown },
        entry.siteId,
        entry.visible,
        queued
      )
    }
  })

  const remote = state.remote.map((release): Row => ({
    key: release.id,
    own: false,
    title: release.title || 'Untitled',
    kind: release.kind,
    date: release.date,
    artworkPath: null,
    trackCount: null,
    siteId: release.id,
    slug: release.slug,
    send: null,
    problem: null,
    omitted: [],
    queued: false,
    ...standings(
      release.id,
      false,
      { status: release.status, date: release.date, shown: release.shown },
      release.id,
      release.visible,
      false
    )
  }))

  return { own, remote }
}
