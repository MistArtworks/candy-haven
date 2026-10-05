import { randomUUID } from 'node:crypto'
import type {
  CalendarDraft,
  CalendarEntry,
  CalendarFollowUp,
  CalendarPatch,
  CalendarRelease,
  CalendarState
} from '@shared/domain/calendar'
import { compareEntries } from '@shared/domain/calendar.constants'
import { relocatedPin } from '@shared/domain/strip'
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
 * How follow-ups reach the register.
 *
 * The same inversion as `ReleaseDateReader`, for the same reason: the tasks
 * live on ARTISTS' leads and opportunities, and the service that holds them is
 * built after this one.
 *
 * Read on every snapshot rather than cached, so completing a follow-up in its
 * lead, or moving its due time, cannot leave a stale marker on the calendar:
 * there is no copy here for it to disagree with.
 */
export type FollowUpReader = () => Promise<CalendarFollowUp[]>

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
  private readFollowUps: FollowUpReader | null = null

  constructor(private readonly archive: ArchiveService) {
    super()
    this.repository = new CalendarRepository(archive)
  }

  /** Wired by the container once the discography service exists. */
  setReleaseDateReader(reader: ReleaseDateReader): void {
    this.readReleaseDates = reader
  }

  /** Wired by the container once the leads service exists. */
  setFollowUpReader(reader: FollowUpReader): void {
    this.readFollowUps = reader
  }

  /** The register, hydrating from the archive if this is the first read. */
  async snapshot(): Promise<CalendarState> {
    await this.hydrate()
    return this.state()
  }

  /**
   * The register, including the release dates and follow-ups projected onto
   * it.
   *
   * Async, and it has to be: the projection is read from the catalogue on
   * every build rather than cached, which is the whole of D20 — nothing here
   * holds a copy of a release date, so nothing here can disagree with one.
   * Follow-ups are read from ARTISTS on the same terms.
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
      followUps: (await this.readFollowUps?.()) ?? [],
      attached: this.archive.isOnline()
    }
  }

  /**
   * Re-emits the register, for when the *catalogue* has changed.
   *
   * Called by the discography service through a listener wired in the
   * composition root. A release date moving is not something this service can
   * see — it holds no copy of one — so it has to be told that its projection
   * is stale, which is a different thing from being told what changed. A
   * follow-up added, moved or completed in ARTISTS arrives the same way.
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
      attachments: draft.attachments,
      checklist: draft.checklist,
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

  /**
   * Re-points attachments at files and folders that moved: a project renamed
   * or filed elsewhere takes the sets and folders attached to entries with
   * it. Says how many entries changed.
   */
  async relocate(move: (path: string) => string): Promise<number> {
    if (!this.repository.attached) return 0
    await this.hydrate()

    let changed = 0
    for (const [index, entry] of this.entries.entries()) {
      let moved = false
      const attachments = entry.attachments.map((pin) => {
        const next = relocatedPin(pin, move)
        if (next) moved = true
        return next ?? pin
      })
      if (!moved) continue
      const next: CalendarEntry = { ...entry, attachments, updatedAt: Date.now() }
      await this.repository.put(next)
      this.entries[index] = next
      changed += 1
    }

    if (changed) await this.publish()
    return changed
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
