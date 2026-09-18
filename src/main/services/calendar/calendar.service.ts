import { randomUUID } from 'node:crypto'
import type {
  CalendarDraft,
  CalendarEntry,
  CalendarPatch,
  CalendarRelease,
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
 * How release dates reach the register.
 *
 * Handed in by the composition root rather than imported, because the
 * discography service is built after this one — the same inversion the
 * projects service uses for its four callbacks, and for the same reason.
 *
 * Read on every snapshot rather than cached: the whole point of D20 is that
 * the calendar holds no copy of a release date, so there is nothing here that
 * can fall out of step.
 */
export type ReleaseDateReader = () => Promise<CalendarRelease[]>

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

  private readReleaseDates: ReleaseDateReader | null = null

  constructor(private readonly archive: ArchiveService) {
    super()
    this.repository = new CalendarRepository(archive)
  }

  /** Wired by the container once the discography service exists. */
  setReleaseDateReader(reader: ReleaseDateReader): void {
    this.readReleaseDates = reader
  }

  /** The register, hydrating from the archive if this is the first read. */
  async snapshot(): Promise<CalendarState> {
    await this.hydrate()
    return this.state()
  }

  /**
   * The register, including the release dates projected onto it.
   *
   * Async, and it has to be: the projection is read from the catalogue on
   * every build rather than cached, which is the whole of D20 — nothing here
   * holds a copy of a release date, so nothing here can disagree with one.
   *
   * An earlier pass kept a synchronous `state()` for `publish()` to use, on
   * the reasoning that filing an entry should not wait on the catalogue. That
   * was wrong in a way worth recording: the push it emitted carried an empty
   * `releases`, so filing any entry **erased every release marker** from the
   * page until it was reopened. The read is against a local database and
   * entry writes are deliberate acts behind a dialog; there was nothing to buy
   * and a whole projection to lose.
   */
  private async state(): Promise<CalendarState> {
    return {
      entries: [...this.entries].sort(compareEntries),
      releases: (await this.readReleaseDates?.()) ?? [],
      attached: this.archive.isOnline()
    }
  }

  /**
   * Re-emits the register, for when the *catalogue* has changed.
   *
   * Called by the discography service through a listener wired in the
   * composition root. A release date moving is not something this service can
   * see — it holds no copy of one — so it has to be told that its projection
   * is stale, which is a different thing from being told what changed.
   */
  async refresh(): Promise<void> {
    if (!this.hydrated) return
    await this.publish()
  }

  private async hydrate(): Promise<void> {
    // Once loaded from a connected archive, stay loaded. A hydration that ran
    // while the archive was down is not a load, so it is retried.
    if (this.hydrated && this.archive.isConnected()) return
    if (!this.archive.isConnected()) return

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
    await this.publish()

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
    await this.publish()

    return next
  }

  async remove(id: string): Promise<void> {
    this.assertAttached()
    await this.hydrate()

    await this.repository.remove(id)
    this.entries = this.entries.filter((entry) => entry.id !== id)
    await this.publish()
  }

  private async publish(): Promise<void> {
    this.emit('changed', await this.state())
  }

  dispose(): void {
    this.clear()
    this.entries = []
    this.hydrated = false
  }
}
