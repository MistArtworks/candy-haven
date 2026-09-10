import { randomUUID } from 'node:crypto'
import type {
  CalendarDraft,
  CalendarEntry,
  CalendarPatch,
  CalendarState
} from '@shared/domain/calendar'
import { compareEntries } from '@shared/domain/calendar.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '../archive/archive.service'
import { CalendarRepository } from './calendar.repository'

const logger = getLogger('calendar')

interface CalendarEvents {
  changed: CalendarState
}

/**
 * CALENDAR — the dated register.
 *
 * Holds the whole register in memory and mirrors every change to the archive.
 * That is affordable here in a way it would not be for the project register: a
 * personal calendar is hundreds of rows, not tens of thousands, and every view
 * the department draws — month, week, day, agenda — wants a different slice of
 * the same small set. Querying per view would mean four round trips per
 * navigation to assemble what one array already answers.
 *
 * Hydration is lazy and re-attempted. The archive can come online after boot —
 * it is provisioned on first run, and it can be restarted from REGULATION — so
 * a department that read once at startup would show an empty calendar for the
 * rest of the session. `attached` reports which of the two "nothing here"
 * states the operator is looking at.
 */
export class CalendarService extends TypedEmitter<CalendarEvents> {
  private readonly repository: CalendarRepository
  private entries: CalendarEntry[] = []
  private hydrated = false
  /** Serialises concurrent hydrations so a burst of reads does one query. */
  private hydrating: Promise<void> | null = null

  constructor(private readonly archive: ArchiveService) {
    super()
    this.repository = new CalendarRepository(archive)
  }

  /** The register, hydrating from the archive if this is the first read. */
  async snapshot(): Promise<CalendarState> {
    await this.hydrate()
    return this.state()
  }

  private state(): CalendarState {
    return {
      entries: [...this.entries].sort(compareEntries),
      attached: this.archive.isOnline()
    }
  }

  private async hydrate(): Promise<void> {
    // Once loaded from a connected archive, stay loaded. A hydration that ran
    // while the archive was down is not a load, so it is retried.
    if (this.hydrated && this.archive.isOnline()) return
    if (!this.archive.isOnline()) return

    if (this.hydrating) return this.hydrating

    this.hydrating = (async () => {
      this.entries = await this.repository.list()
      this.hydrated = true
      logger.info(`Calendar hydrated: ${this.entries.length} entries`)
    })().finally(() => {
      this.hydrating = null
    })

    return this.hydrating
  }

  private assertAttached(): void {
    if (this.repository.attached) return
    throw new AppError('The archive is not connected, so the calendar cannot be written to.', {
      code: ErrorCode.Unavailable,
      hint: 'Check the archive in REGULATION, then try again.',
      recoverable: true
    })
  }

  async create(draft: CalendarDraft): Promise<CalendarEntry> {
    this.assertAttached()
    await this.hydrate()

    const now = Date.now()
    const entry: CalendarEntry = {
      id: randomUUID(),
      title: draft.title.trim(),
      kind: draft.kind,
      date: draft.date,
      startMinute: draft.startMinute,
      durationMinutes: draft.durationMinutes,
      notes: draft.notes.trim(),
      done: false,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.put(entry)
    this.entries.push(entry)
    this.publish()

    logger.info(`Filed ${entry.kind} "${entry.title}" on ${entry.date}`)
    return entry
  }

  async patch(id: string, patch: CalendarPatch): Promise<CalendarEntry> {
    this.assertAttached()
    await this.hydrate()

    const index = this.entries.findIndex((entry) => entry.id === id)
    if (index === -1) {
      throw new AppError('That entry is no longer in the register.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    const next: CalendarEntry = {
      ...this.entries[index],
      ...patch,
      // Trimmed on the way in rather than at the field, so a title of spaces
      // cannot reach storage from any caller.
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}),
      updatedAt: Date.now()
    }

    await this.repository.put(next)
    this.entries[index] = next
    this.publish()

    return next
  }

  async remove(id: string): Promise<void> {
    this.assertAttached()
    await this.hydrate()

    await this.repository.remove(id)
    this.entries = this.entries.filter((entry) => entry.id !== id)
    this.publish()
  }

  private publish(): void {
    this.emit('changed', this.state())
  }

  dispose(): void {
    this.clear()
    this.entries = []
    this.hydrated = false
  }
}
