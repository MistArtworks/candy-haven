import { Notification } from 'electron'
import type { CalendarEntry } from '@shared/domain/calendar'
import { CALENDAR_KIND } from '@shared/domain/calendar.constants'
import { localIsoDate } from '@shared/domain/discography.constants'
import { getLogger } from '@main/core/logger'

const logger = getLogger('reminders')

/** How often the day is looked at. */
const EVERY_MS = 30_000

export interface ReminderHost {
  /** Every entry held now. */
  entries(): Promise<CalendarEntry[]>
  /** Minutes ahead of a timed entry its reminder comes; 0 is none. */
  lead(): number
  /** The reminder was clicked: show the entry on the strip. */
  open(entryId: string): void
}

/**
 * CALENDAR's reminders: a Windows notification a few minutes before a timed
 * entry starts, saying what it is and what it has attached. Clicked, the
 * entry opens on the quick strip, where its attachments open in one click.
 *
 * Kept in memory, not stored: each reminder fires once per sitting, keyed by
 * the entry and its time, so moving an entry later reminds again at its new
 * time, and a restart after the time has passed doesn't remind late.
 */
export class Reminders {
  private timer: NodeJS.Timeout | null = null
  private readonly fired = new Set<string>()
  private readonly shown = new Set<Notification>()

  constructor(private readonly host: ReminderHost) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.check(), EVERY_MS)
    void this.check()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.shown.clear()
  }

  private async check(): Promise<void> {
    const lead = this.host.lead()
    if (lead <= 0 || !Notification.isSupported()) return
    let entries: CalendarEntry[]
    try {
      entries = await this.host.entries()
    } catch {
      return
    }
    const now = new Date()
    const today = localIsoDate(now)
    const minute = now.getHours() * 60 + now.getMinutes()
    for (const entry of entries) {
      if (entry.done || entry.date !== today || entry.startMinute === null) continue
      const key = `${entry.id}|${entry.date}|${entry.startMinute}`
      if (this.fired.has(key)) continue
      // Due from `lead` minutes before, until it starts; not after.
      if (minute < entry.startMinute - lead || minute >= entry.startMinute) continue
      this.fired.add(key)
      this.show(entry, entry.startMinute - minute)
    }
  }

  private show(entry: CalendarEntry, inMinutes: number): void {
    const time = clock(entry.startMinute ?? 0)
    const what = [
      `${time}, in ${inMinutes} min`,
      CALENDAR_KIND[entry.kind].label,
      entry.attachments[0] ? `Opens ${entry.attachments[0].label}` : null
    ]
      .filter(Boolean)
      .join(' · ')
    const notification = new Notification({ title: entry.title, body: what })
    const release = (): void => {
      this.shown.delete(notification)
    }
    notification.on('click', () => {
      release()
      this.host.open(entry.id)
    })
    notification.on('close', release)
    this.shown.add(notification)
    notification.show()
    logger.info(`Reminded of "${entry.title}" at ${time}`)
  }
}

function clock(minute: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}
