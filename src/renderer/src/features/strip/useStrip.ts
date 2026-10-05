import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { CalendarEntry, CalendarRelease } from '@shared/domain/calendar'
import { localIsoDate } from '@shared/domain/discography.constants'
import type { Pin, StripAnchor, StripPin, StripSettings } from '@shared/domain/strip'
import { StripSettingsSchema, baseName, normalizeAddress, siteNameOf } from '@shared/domain/strip'
import { selectSettings, useSystemStore } from '@renderer/app/store/system.store'
import { useCalendar } from '@renderer/hooks/useCalendar'
import {
  anniversariesBetween,
  type CalendarAnniversary
} from '@renderer/features/calendar/anniversaries'

/** The strip's settings, following REGULATION as it changes in the console. */
export function useStripSettings(): StripSettings {
  // Kept current by SystemBridge, which takes in every change from main.
  const settings = useSystemStore(selectSettings)
  return useMemo(() => settings?.strip ?? StripSettingsSchema.parse({}), [settings])
}

/** Writes the strip's settings: the pins after a drop, a rename, a removal. */
export async function saveStrip(patch: Partial<StripSettings>): Promise<void> {
  await window.candy.settings.update({ strip: patch })
}

export async function savePins(pins: StripPin[]): Promise<void> {
  await saveStrip({ pins })
}

/** Whether a drag carries what a drop makes pins of: files and folders, or links. */
export function carriesPins(data: DataTransfer): boolean {
  return data.types.includes('Files') || data.types.includes('text/uri-list')
}

/**
 * Pins for what was dropped: files and folders from Explorer, or links from
 * a browser (its address bar, or a link on a page). Anything else is left out.
 */
export async function pinsFromDrop(data: DataTransfer): Promise<Pin[]> {
  const pins: Pin[] = []
  for (const file of Array.from(data.files)) {
    const path = window.candy.strip.pathOf(file)
    if (!path) continue
    const kind = await window.candy.strip.inspect(path)
    if (!kind) continue
    pins.push({
      id: crypto.randomUUID(),
      label: baseName(path).slice(0, 80),
      target: { kind, path }
    })
  }
  if (pins.length) return pins
  // A uri-list is one address a line; lines starting with # are comments.
  const links = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
  for (const line of links) {
    const url = normalizeAddress(line)
    if (url)
      pins.push({ id: crypto.randomUUID(), label: siteNameOf(url), target: { kind: 'link', url } })
  }
  return pins
}

/**
 * Where an icon is in this window, in the window's own pixels (the page is
 * zoomed by `scale`): what a group's popup drops down from.
 */
export function anchorOf(element: Element, scale: number): StripAnchor {
  const box = element.getBoundingClientRect()
  return {
    x: Math.round(box.left * scale),
    y: Math.round(box.top * scale),
    width: Math.round(box.width * scale),
    height: Math.round(box.height * scale)
  }
}

/**
 * Sizes this window to what it draws. The window is transparent and
 * frameless, so it is exactly as large as its content, at the scale the
 * document is zoomed to.
 */
export function useFit(
  ref: RefObject<HTMLElement | null>,
  scale: number,
  active = true,
  /** Changes each time the content is asked for again, so it is measured again. */
  turn = 0
): void {
  useEffect(() => {
    const element = ref.current
    if (!element || !active) return
    const send = (): void => {
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) void window.candy.strip.fit(width * scale, height * scale)
    }
    const observer = new ResizeObserver(send)
    observer.observe(element)
    send()
    return () => observer.disconnect()
  }, [ref, scale, active, turn])
}

/** Minutes since midnight, now; ticking once a minute. */
export function useNowMinute(): { today: string; minute: number } {
  const read = (): { today: string; minute: number } => {
    const now = new Date()
    return { today: localIsoDate(now), minute: now.getHours() * 60 + now.getMinutes() }
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const timer = setInterval(() => setNow(read()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export interface Today {
  ready: boolean
  /** Today's entries: the whole-day ones first, then by time. */
  entries: CalendarEntry[]
  /** Earlier entries never ticked off, in the last month, oldest first. */
  overdue: CalendarEntry[]
  releases: CalendarRelease[]
  anniversaries: CalendarAnniversary[]
  /** What's next: the first timed entry not done that hasn't ended, else an all-day one. */
  next: CalendarEntry | null
  /** Not done today, overdue included. */
  open: number
}

const MONTH_AGO = 31

/** Today, as the strip shows it. */
export function useToday(): Today {
  const { state, ready } = useCalendar()
  const { today, minute } = useNowMinute()
  return useMemo(() => {
    const since = shiftDays(today, -MONTH_AGO)
    const entries = state.entries
      .filter((entry) => entry.date === today)
      .sort((a, b) => (a.startMinute ?? -1) - (b.startMinute ?? -1))
    const overdue = state.entries
      .filter((entry) => !entry.done && entry.date < today && entry.date >= since)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startMinute ?? -1) - (b.startMinute ?? -1))
    // The next timed thing still to come or under way; else the day's first
    // all-day one not done.
    const next =
      entries.find(
        (entry) =>
          !entry.done &&
          entry.startMinute !== null &&
          entry.startMinute + entry.durationMinutes > minute
      ) ??
      entries.find((entry) => !entry.done && entry.startMinute === null) ??
      null
    return {
      ready,
      entries,
      overdue,
      releases: state.releases.filter((release) => release.date === today),
      anniversaries: anniversariesBetween(state.releases, today, today),
      next,
      open: entries.filter((entry) => !entry.done).length + overdue.length
    }
  }, [state, ready, today, minute])
}

/** `14:30`, from minutes since midnight. */
export function clock(minute: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localIsoDate(date)
}

/** The page scale this window was made at. */
export function documentScale(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('scale'))
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

export function documentRole(): 'strip' | 'popup' {
  return new URLSearchParams(window.location.search).get('role') === 'popup' ? 'popup' : 'strip'
}

/** Says why something didn't work, for a few seconds. */
export function useNotice(): [string | null, (message: string) => void] {
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])
  const say = useCallback((message: string) => setNotice(message), [])
  return [notice, say]
}
