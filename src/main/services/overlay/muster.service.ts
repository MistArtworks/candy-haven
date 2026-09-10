import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import {
  MusterStateSchema,
  type MusterConfig,
  type MusterConfigPatch,
  type MusterEntry,
  type MusterEntryDraft,
  type MusterHandoff,
  type MusterState
} from '@shared/domain/muster'
import {
  clampDuration,
  clampLinger,
  clampPerCitizen,
  createEmptyMusterState,
  parseEntry,
  tidyEntry
} from '@shared/domain/muster.constants'
import { MAX_OPTIONS, MAX_OPTION_LABEL } from '@shared/domain/concord.constants'
import { MAX_PETITIONS } from '@shared/domain/rite.constants'
import type { ChatMessage } from '@shared/domain/chat.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'
import type { TwitchChatService } from '../chat/twitch-chat.service'
import type { SettingsService } from '../settings/settings.service'
import type { OverlayServer } from './overlay-server'
import type { RiteService } from './rite.service'
import type { ConcordService } from './concord.service'

const logger = getLogger('muster')

const DOCUMENT_ID = 'overlay:muster'

/** How often a running call republishes, so the clock on the overlay moves. */
const TICK_MS = 500

interface MusterEvents {
  state: MusterState
}

type MusterDocument = {
  _id: string
  kind: 'muster'
  name: string
  active: boolean
  state: MusterState
}

/**
 * THE MUSTER — the open call.
 *
 * The operator puts a question to the chamber; citizens file entries against
 * it with a chat command; the roll fills live on the broadcast. When the call
 * closes the roll is handed on — to the ring to be drawn from, to the chamber
 * to be voted on, or both.
 *
 * The brief's Processing Floor, more or less exactly: entries arrive as people
 * and leave as options.
 *
 * ## What is held where
 *
 * The roll is state and is published. The *ledger* of who has filed how many
 * times is a `Map` held here and never serialised — the same arrangement the
 * concord's vote ledger uses, for the same two reasons. It is what makes the
 * per-citizen limit enforceable, and it would grow an event frame from a few
 * hundred bytes to something worth worrying about on a busy call.
 *
 * A consequence, and the right one: a restart mid-call cannot resume it as
 * open, because the ledger is gone and the limit could no longer be enforced.
 * The roll survives; the call does not.
 */
export class MusterService extends TypedEmitter<MusterEvents> {
  private state: MusterState = createEmptyMusterState()

  /** Chat user id to filings made. Never published; see the class note. */
  private readonly ledger = new Map<string, number>()

  private detachChat: (() => void) | null = null
  private releaseChat: (() => void) | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly archive: ArchiveService,
    private readonly server: OverlayServer,
    private readonly chat: TwitchChatService,
    private readonly settings: SettingsService,
    private readonly rite: RiteService,
    private readonly concord: ConcordService
  ) {
    super()
  }

  get current(): MusterState {
    return this.state
  }

  /**
   * Restores the stored roll and configuration. Never throws.
   *
   * A call that was open when the app closed comes back **closed**, holding
   * its roll. See the class note: the ledger did not survive, so the limit
   * could not be honoured and reopening would let everyone file again.
   */
  async initialize(): Promise<void> {
    const stored = await this.load()
    if (!stored) return

    this.state =
      stored.phase === 'open'
        ? { ...stored, phase: 'closed', closesAt: null, closedAt: Date.now() }
        : stored
  }

  dispose(): void {
    this.stopTicking()
    this.detachChat?.()
    this.releaseChat?.()
  }

  // ------------------------------------------------------------------ the call

  /**
   * Opens the call.
   *
   * Refused without a chat channel unless test mode is on, and refused *here*
   * rather than only in the console — an open call nobody can file against
   * looks identical to a call nobody wants to answer, and the operator would
   * find out several minutes in.
   */
  open(prompt: string): MusterState {
    const workspace = this.settings.snapshot.workspace
    const channel = (this.settings.snapshot.integrations.twitchChannel ?? '').trim()

    if (!channel && !workspace.testMode) {
      throw new AppError('No chat channel is set.', {
        code: ErrorCode.Validation,
        hint: 'Set a channel in REGULATION, or enable test mode there to run a call without chat.'
      })
    }

    this.ledger.clear()
    this.releaseChat ??= this.chat.acquire('muster')
    this.detachChat ??= this.chat.on('message', (message) => this.onMessage(message))

    const duration = clampDuration(this.state.config.durationMs)
    const now = Date.now()

    this.commit({
      phase: 'open',
      // Captured now, so editing the standing question mid-call does not
      // rewrite the one the audience is answering.
      prompt: (prompt.trim() || this.state.config.prompt).slice(0, 90),
      entries: [],
      citizens: 0,
      turnedAway: 0,
      openedAt: now,
      closesAt: duration > 0 ? now + duration : null,
      closedAt: null
    })

    this.startTicking()
    return this.state
  }

  /** Closes the call, keeping the roll. */
  close(): MusterState {
    if (this.state.phase !== 'open') return this.state

    this.stopTicking()
    this.detachChat?.()
    this.detachChat = null
    this.releaseChat?.()
    this.releaseChat = null

    return this.commit({ phase: 'closed', closesAt: null, closedAt: Date.now() })
  }

  /** Clears the roll and returns to rest. */
  reset(): MusterState {
    this.close()
    this.ledger.clear()

    return this.commit({
      phase: 'idle',
      prompt: '',
      entries: [],
      citizens: 0,
      turnedAway: 0,
      openedAt: null,
      closesAt: null,
      closedAt: null
    })
  }

  updateConfig(patch: MusterConfigPatch): MusterState {
    const config: MusterConfig = { ...this.state.config, ...patch }
    if (patch.durationMs !== undefined) config.durationMs = clampDuration(patch.durationMs)
    if (patch.lingerMs !== undefined) config.lingerMs = clampLinger(patch.lingerMs)
    if (patch.perCitizen !== undefined) config.perCitizen = clampPerCitizen(patch.perCitizen)

    return this.commit({ config })
  }

  // ----------------------------------------------------------------- the roll

  /** The operator filing directly — seeding a roll, or adding for someone. */
  add(draft: MusterEntryDraft): MusterState {
    const text = tidyEntry(draft.text)
    if (!text) throw new AppError('That entry is empty.', { code: ErrorCode.Validation })

    if (this.state.entries.length >= this.state.config.maxEntries) {
      throw new AppError('The roll is full.', {
        code: ErrorCode.Validation,
        hint: 'Remove an entry, or raise the ceiling in the panel.'
      })
    }

    return this.commit({
      entries: [...this.state.entries, this.makeEntry(text, draft.author.trim() || 'OPERATOR', '')]
    })
  }

  remove(id: string): MusterState {
    const entry = this.state.entries.find((candidate) => candidate.id === id)
    if (!entry) return this.state

    /*
     * The filer gets their slot back.
     *
     * Removing an entry is moderation — something unrepeatable, or a duplicate
     * — and leaving the ledger untouched would silently spend the citizen's
     * one filing on something the operator threw away.
     */
    if (entry.authorId) {
      const used = this.ledger.get(entry.authorId) ?? 0
      if (used <= 1) this.ledger.delete(entry.authorId)
      else this.ledger.set(entry.authorId, used - 1)
    }

    const entries = this.state.entries.filter((candidate) => candidate.id !== id)
    return this.commit({ entries, citizens: this.ledger.size })
  }

  /**
   * Hands the roll on.
   *
   * The concord takes at most ten options and the ring rather more, so a roll
   * longer than the destination allows is **truncated rather than refused** —
   * the operator has a closed roll and an audience waiting, and failing at
   * this point would be the worst possible moment to be strict. The count that
   * went is reported back.
   */
  handoff(request: MusterHandoff): { sent: number; dropped: number } {
    if (this.state.entries.length === 0) {
      throw new AppError('The roll is empty.', { code: ErrorCode.Validation })
    }

    const texts = this.state.entries.map((entry) => entry.text)
    let sent = 0

    if (request.destination === 'selection' || request.destination === 'both') {
      const take = this.state.entries.slice(0, MAX_PETITIONS)
      for (const entry of take) {
        // Credited, so the ring can show who asked for what — the rite already
        // carries `filedBy` for exactly this and the roll knows the answer.
        this.rite.addPetition({ label: entry.text, weight: 1, filedBy: entry.author || null })
      }
      sent = Math.max(sent, take.length)
    }

    if (request.destination === 'concord' || request.destination === 'both') {
      // The ballot is *replaced* rather than appended to: a roll is a complete
      // answer to a question, and merging it into whatever was left over from
      // the last poll would produce a ballot nobody chose.
      const take = texts.slice(0, MAX_OPTIONS).map((text) => text.slice(0, MAX_OPTION_LABEL))
      this.concord.setBallot(take)
      sent = Math.max(sent, take.length)
    }

    const dropped = texts.length - sent
    if (dropped > 0) {
      logger.info(`Handed on ${sent} of ${texts.length} entries; ${dropped} did not fit`)
    }

    if (request.clear) this.reset()
    return { sent, dropped }
  }

  // ----------------------------------------------------------------- the chat

  /**
   * A filing arrives.
   *
   * Runs synchronously per message and touches one map, because it is on the
   * hot path — a call put to a busy chat delivers a great many of these, most
   * of which are not filings at all.
   */
  private onMessage(message: ChatMessage): void {
    if (this.state.phase !== 'open') return

    const text = parseEntry(message.text, this.state.config.command)
    if (!text) return

    if (this.state.entries.length >= this.state.config.maxEntries) {
      this.commit({ turnedAway: this.state.turnedAway + 1 })
      return
    }

    const used = this.ledger.get(message.userId) ?? 0
    if (used >= this.state.config.perCitizen) return

    /*
     * The same entry twice is not two entries.
     *
     * People double-send, and chat clients resend on reconnect. Compared
     * case-insensitively because "Lean On" and "lean on" are one song, and a
     * wheel with both on it gives that song two slices.
     */
    const lowered = text.toLowerCase()
    if (this.state.entries.some((entry) => entry.text.toLowerCase() === lowered)) return

    this.ledger.set(message.userId, used + 1)

    this.commit({
      entries: [...this.state.entries, this.makeEntry(text, message.display, message.userId)],
      citizens: this.ledger.size
    })
  }

  private makeEntry(text: string, author: string, authorId: string): MusterEntry {
    return { id: randomUUID(), text, author, authorId, at: Date.now() }
  }

  // ---------------------------------------------------------------- the clock

  /**
   * Republishes while a call runs.
   *
   * Only so the overlay's clock moves and a timed call closes itself. The
   * remaining time is *derived* on both surfaces from `closesAt`, so this is a
   * heartbeat rather than the source of the countdown — which is why half a
   * second is plenty and why a dropped tick costs nothing.
   */
  private startTicking(): void {
    this.stopTicking()
    this.timer = setInterval(() => {
      if (this.state.phase !== 'open') {
        this.stopTicking()
        return
      }

      if (this.state.closesAt !== null && Date.now() >= this.state.closesAt) {
        this.close()
        return
      }

      this.publish()
    }, TICK_MS)
  }

  private stopTicking(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  // ---------------------------------------------------------------- plumbing

  private commit(partial: Partial<MusterState>): MusterState {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }
    this.publish()
    void this.save()
    return this.state
  }

  private publish(): void {
    this.emit('state', this.state)
    this.server.broadcast('muster', this.state)
  }

  // ------------------------------------------------------------- persistence

  private collection(): Collection<MusterDocument> | null {
    if (!this.archive.isOnline()) return null
    try {
      return this.archive.getDb().collection<MusterDocument>(Collections.Overlays)
    } catch {
      return null
    }
  }

  private async load(): Promise<MusterState | null> {
    const collection = this.collection()
    if (!collection) return null

    try {
      const document = await collection.findOne({ _id: DOCUMENT_ID })
      if (!document) return null

      // Parsed rather than cast: a document written by an earlier build is
      // missing whatever has been added since, and the defaults fill it in.
      const parsed = MusterStateSchema.safeParse(document.state)
      if (!parsed.success) {
        logger.warn(
          'Discarding an unreadable stored muster',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
        return null
      }

      return parsed.data
    } catch (cause) {
      logger.warn('Could not read the stored muster', cause)
      return null
    }
  }

  /** Best-effort, as everywhere in the kit: the in-memory state is the truth. */
  private async save(): Promise<void> {
    const collection = this.collection()
    if (!collection) return

    try {
      await collection.updateOne(
        { _id: DOCUMENT_ID },
        {
          $set: {
            kind: 'muster',
            // The collection carries a unique index on `name`.
            name: 'overlay:muster',
            active: this.state.phase === 'open',
            state: this.state
          },
          $setOnInsert: { _id: DOCUMENT_ID }
        },
        { upsert: true }
      )
    } catch (cause) {
      logger.warn('Could not persist the muster', cause)
    }
  }
}
