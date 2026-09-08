import { randomInt, randomUUID } from 'node:crypto'
import type {
  Petition,
  PetitionDraft,
  RiteConfigPatch,
  RiteState,
  SpinCommand
} from '@shared/domain/rite'
import {
  MAX_PETITIONS,
  RITE_HISTORY_LIMIT,
  SPIN_MAX_REVOLUTIONS,
  SPIN_MIN_REVOLUTIONS,
  SPIN_SETTLE_MS,
  clampSpinDuration,
  createEmptyRiteState,
  normalisePetitionLabel,
  petitionKey,
  totalSpinDurationMs,
  weightedIndex
} from '@shared/domain/rite.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '../archive/archive.service'
import type { OverlayServer } from './overlay-server'
import { RiteRepository } from './rite.repository'

const logger = getLogger('rite')

interface RiteEvents {
  state: RiteState
}

/**
 * The Resonance Selection — the OBSERVATORY department's first overlay.
 *
 * ### The one rule this service exists to enforce
 *
 * **The winner is decided here, once, before the animation begins.** It travels
 * to both surfaces inside the `SpinCommand`, and each surface renders a
 * deterministic function of that command. Neither the console nor the browser
 * source rolls its own result.
 *
 * The alternative — each client picking independently — eventually puts two
 * different winners on screen simultaneously, in front of an audience, and
 * there is no recovering from that on a live stream. Everything else about this
 * feature is presentation; this part is correctness.
 *
 * State is held in memory and mirrored to the archive on a best-effort basis, so
 * a crash or restart mid-broadcast does not cost the operator a roster that chat
 * spent ten minutes filling.
 */
export class RiteService extends TypedEmitter<RiteEvents> {
  private state: RiteState = createEmptyRiteState()
  private readonly repository: RiteRepository
  /** Fires when the ring comes to rest, flipping the rite to `resolved`. */
  private resolveTimer: NodeJS.Timeout | null = null

  constructor(
    archive: ArchiveService,
    /** Shared with the timers: one server serves every overlay. */
    private readonly server: OverlayServer
  ) {
    super()
    this.repository = new RiteRepository(archive)
    this.server.registerSnapshot('rite', () => this.state)
  }

  get current(): RiteState {
    return this.state
  }

  // ------------------------------------------------------------------ lifecycle

  /**
   * Restores any stored rite. The server itself is started by the container,
   * since every overlay shares it.
   */
  async initialize(): Promise<void> {
    const restored = await this.repository.load()
    if (restored) {
      // Never restore mid-spin: the stored `startedAt` is in the past, so the
      // animation would be treated as long finished and the ring would snap to
      // a result nobody watched being drawn.
      this.state =
        restored.phase === 'spinning'
          ? { ...restored, phase: 'idle', spin: null, winner: null }
          : restored
      logger.info(`Restored rite with ${this.state.petitions.length} petitions`)
    }
  }

  dispose(): void {
    if (this.resolveTimer) clearTimeout(this.resolveTimer)
    this.resolveTimer = null
    this.clear()
  }

  // ------------------------------------------------------------------ roster

  addPetition(draft: PetitionDraft): RiteState {
    this.assertIdle('The roster is locked while a selection is running.')

    const label = normalisePetitionLabel(draft.label)
    if (label.length === 0) {
      throw new AppError('A petition needs a label.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (this.state.petitions.length >= MAX_PETITIONS) {
      throw new AppError(`The ring holds at most ${MAX_PETITIONS} petitions.`, {
        code: ErrorCode.Validation,
        hint: 'Clear the roster or run an elimination round to make room.',
        recoverable: false
      })
    }

    // Duplicates are folded into the existing entry's weight rather than
    // rejected. Once chat is filing these, the same suggestion arriving twice is
    // a signal about how popular it is — and silently adding a second identical
    // segment would double its odds while looking like one choice on the ring.
    const key = petitionKey(label)
    const existing = this.state.petitions.findIndex((entry) => petitionKey(entry.label) === key)
    if (existing >= 0) {
      const petitions = [...this.state.petitions]
      petitions[existing] = {
        ...petitions[existing],
        weight: Math.min(petitions[existing].weight + (draft.weight ?? 1), 999)
      }
      return this.commit({ petitions })
    }

    const petition: Petition = {
      id: randomUUID(),
      label,
      weight: draft.weight ?? 1,
      filedBy: draft.filedBy ?? null,
      filedAt: Date.now()
    }

    return this.commit({ petitions: [...this.state.petitions, petition] })
  }

  removePetition(id: string): RiteState {
    this.assertIdle('The roster is locked while a selection is running.')
    return this.commit({
      petitions: this.state.petitions.filter((petition) => petition.id !== id)
    })
  }

  setPetitionWeight(id: string, weight: number): RiteState {
    this.assertIdle('The roster is locked while a selection is running.')
    return this.commit({
      petitions: this.state.petitions.map((petition) =>
        petition.id === id ? { ...petition, weight: Math.min(Math.max(weight, 1), 999) } : petition
      )
    })
  }

  clearPetitions(): RiteState {
    this.assertIdle('The roster is locked while a selection is running.')
    return this.commit({ petitions: [], winner: null, spin: null, phase: 'idle' })
  }

  updateConfig(patch: RiteConfigPatch): RiteState {
    const config = { ...this.state.config, ...patch }
    if (patch.durationMs !== undefined) {
      config.durationMs = clampSpinDuration(patch.durationMs)
    }
    return this.commit({ config })
  }

  // -------------------------------------------------------------------- spin

  /**
   * Draws a winner and arms the animation.
   *
   * The draw uses `randomInt` from `node:crypto` rather than `Math.random`.
   * `Math.random` would be statistically fine, but this decides things in front
   * of an audience and a CSPRNG costs nothing at one call per spin — there is no
   * reason to leave room for the question.
   */
  spin(): RiteState {
    if (this.state.phase === 'spinning') {
      throw new AppError('A selection is already running.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    const petitions = this.state.petitions
    if (petitions.length === 0) {
      throw new AppError('Nothing has been filed to choose between.', {
        code: ErrorCode.Validation,
        hint: 'Add at least one petition to the roster first.',
        recoverable: false
      })
    }

    const weights = petitions.map((petition) => petition.weight)
    // randomInt gives a uniform integer; scaling it into [0,1) keeps the
    // weighted resolution itself pure and testable.
    const roll = randomInt(0, 1_000_000) / 1_000_000
    const targetIndex = weightedIndex(weights, roll)

    const durationMs = clampSpinDuration(this.state.config.durationMs)
    const spin: SpinCommand = {
      id: randomUUID(),
      targetIndex,
      segmentCount: petitions.length,
      // Randomised within a band so consecutive spins do not read as a replay.
      revolutions: randomInt(SPIN_MIN_REVOLUTIONS, SPIN_MAX_REVOLUTIONS + 1),
      durationMs,
      settleMs: SPIN_SETTLE_MS,
      startedAt: Date.now()
    }

    logger.info(
      `Rite ${spin.id} armed: "${petitions[targetIndex].label}" from ${petitions.length} petitions`
    )

    const next = this.commit({ phase: 'spinning', spin, winner: null })

    if (this.resolveTimer) clearTimeout(this.resolveTimer)
    this.resolveTimer = setTimeout(() => this.settle(spin), totalSpinDurationMs(spin))

    return next
  }

  /**
   * Records the result once the ring has come to rest.
   *
   * Both surfaces already ignite the winning segment off the spin command, so
   * this is bookkeeping rather than the reveal — which is deliberate. The visual
   * result must not depend on this timer firing punctually.
   */
  private settle(spin: SpinCommand): void {
    this.resolveTimer = null
    if (this.state.spin?.id !== spin.id) return

    const petition = this.state.petitions[spin.targetIndex]
    if (!petition) {
      this.commit({ phase: 'idle', spin: null })
      return
    }

    const winner = {
      petitionId: petition.id,
      label: petition.label,
      filedBy: petition.filedBy,
      index: spin.targetIndex,
      at: Date.now(),
      poolSize: this.state.petitions.length
    }

    // Removal happens now rather than when the spin was armed, so the ring keeps
    // its geometry — and its winning segment — for the whole animation.
    const petitions = this.state.config.removeOnSelect
      ? this.state.petitions.filter((entry) => entry.id !== petition.id)
      : this.state.petitions

    this.commit({
      phase: 'resolved',
      winner,
      petitions,
      history: [winner, ...this.state.history].slice(0, RITE_HISTORY_LIMIT)
    })

    logger.info(`Rite ${spin.id} resolved: "${petition.label}"`)
  }

  /** Clears the result and returns the ring to rest, keeping the roster. */
  reset(): RiteState {
    if (this.resolveTimer) {
      clearTimeout(this.resolveTimer)
      this.resolveTimer = null
    }
    return this.commit({ phase: 'idle', spin: null, winner: null })
  }

  clearHistory(): RiteState {
    return this.commit({ history: [] })
  }

  // ------------------------------------------------------------------ plumbing

  private assertIdle(message: string): void {
    if (this.state.phase !== 'spinning') return
    throw new AppError(message, { code: ErrorCode.Validation, recoverable: false })
  }

  /**
   * Applies a change, then fans it out to every consumer.
   *
   * One path for all mutations, so the IPC broadcast, the browser sources and
   * the persisted copy cannot get out of step with each other.
   */
  private commit(partial: Partial<RiteState>): RiteState {
    this.state = { ...this.state, ...partial, revision: this.state.revision + 1 }

    this.emit('state', this.state)
    this.server.broadcast('rite', this.state)

    // Persistence is best-effort by design: the archive may not be connected,
    // and a stream is not the moment to fail an action because a write to Mongo
    // did not land. The in-memory state stays authoritative.
    void this.repository.save(this.state)

    return this.state
  }
}
