import type { TimerConfigPatch, TimerId, TimerSet, TimerState } from '@shared/domain/timer'
import {
  TIMER_IDS,
  clampDuration,
  clampGrace,
  consumedMs,
  createTimerState
} from '@shared/domain/timer.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import type { ArchiveService } from '../archive/archive.service'
import type { OverlayServer } from './overlay-server'
import { TimerRepository } from './timer.repository'

const logger = getLogger('timer')

interface TimerEvents {
  state: TimerState
}

/**
 * The countdown overlays.
 *
 * Two timers with independent state — a stream opening and a working interval —
 * sharing one implementation. Both are held here rather than in the rite
 * service because they have nothing to do with the selection ring beyond being
 * served by the same HTTP server.
 *
 * ### There is no tick
 *
 * Nothing in this service runs on an interval, and that is deliberate. The
 * state is declarative: a start instant, the accumulated time from earlier run
 * segments, and the durations. Both surfaces derive the remaining time from
 * that at their own frame rate, so the console and the broadcast cannot drift
 * apart and a busy main process cannot make the clock stutter on stream.
 *
 * It also means expiry needs no timer to notice it. `grace` and `elapsed` are
 * functions of the clock, computed by `timerFrameAt`, so there is no scheduled
 * callback that could fire late and be seen doing so.
 */
export class TimerService extends TypedEmitter<TimerEvents> {
  private readonly timers = new Map<TimerId, TimerState>(
    TIMER_IDS.map((id) => [id, createTimerState(id)])
  )
  private readonly repository: TimerRepository

  constructor(
    archive: ArchiveService,
    /** Shared with the rite: one server serves every overlay. */
    private readonly server: OverlayServer
  ) {
    super()
    this.repository = new TimerRepository(archive)

    // Without this a browser source that attaches to a running countdown gets
    // nothing until the next change, so it would paint the default duration
    // over a live scene and sit there until the operator touched a control.
    this.server.registerSnapshot('timer', () => this.all)
  }

  get all(): TimerSet {
    return Object.fromEntries(this.timers) as TimerSet
  }

  get(id: TimerId): TimerState {
    const state = this.timers.get(id)
    if (!state) {
      throw new AppError(`Unknown timer: ${id}`, {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }
    return state
  }

  /**
   * Restores stored timers.
   *
   * A timer that was running when the app closed is restored **paused**, with
   * its consumed time preserved. Leaving it running would have it resume
   * against a `startedAt` from before the restart and appear to have burned
   * through however long the app was shut — so the operator would open the
   * console to an expired timer they never started.
   */
  async initialize(): Promise<void> {
    for (const id of TIMER_IDS) {
      const stored = await this.repository.load(id)
      if (!stored) continue

      this.timers.set(
        id,
        stored.phase === 'running'
          ? {
              ...stored,
              phase: 'paused',
              startedAt: null,
              elapsedBeforeMs: consumedMs(stored, Date.now())
            }
          : stored
      )
    }
    logger.info(`Restored ${this.timers.size} timers`)
  }

  // ------------------------------------------------------------------ control

  /** Starts an idle timer, or resumes a paused one. Running is a no-op. */
  start(id: TimerId): TimerState {
    const state = this.get(id)
    if (state.phase === 'running') return state

    logger.info(`Timer ${id} ${state.phase === 'paused' ? 'resumed' : 'started'}`)
    return this.commit(id, { phase: 'running', startedAt: Date.now() })
  }

  pause(id: TimerId): TimerState {
    const state = this.get(id)
    if (state.phase !== 'running') return state

    // Fold the run segment into the accumulated total so resuming needs no
    // knowledge of how long the pause lasted.
    return this.commit(id, {
      phase: 'paused',
      startedAt: null,
      elapsedBeforeMs: consumedMs(state, Date.now())
    })
  }

  /** Start if not running, pause if it is — for a single console control. */
  toggle(id: TimerId): TimerState {
    return this.get(id).phase === 'running' ? this.pause(id) : this.start(id)
  }

  reset(id: TimerId): TimerState {
    logger.info(`Timer ${id} reset`)
    return this.commit(id, { phase: 'idle', startedAt: null, elapsedBeforeMs: 0 })
  }

  /** Restarts from the top, whatever the current phase. */
  restart(id: TimerId): TimerState {
    return this.commit(id, { phase: 'running', startedAt: Date.now(), elapsedBeforeMs: 0 })
  }

  /**
   * Adds or removes time without disturbing the run.
   *
   * Adjusts the duration rather than the start instant, so a running timer
   * keeps counting from where it is and the operator can hand themselves
   * another two minutes mid-break. Negative deltas are allowed and clamp at the
   * floor rather than expiring the timer outright.
   */
  extend(id: TimerId, deltaMs: number): TimerState {
    const state = this.get(id)
    const durationMs = clampDuration(state.config.durationMs + deltaMs)
    return this.commit(id, { config: { ...state.config, durationMs } })
  }

  configure(id: TimerId, patch: TimerConfigPatch): TimerState {
    const state = this.get(id)
    const config = { ...state.config, ...patch }

    if (patch.durationMs !== undefined) config.durationMs = clampDuration(patch.durationMs)
    if (patch.graceMs !== undefined) config.graceMs = clampGrace(patch.graceMs)

    return this.commit(id, { config })
  }

  dispose(): void {
    this.clear()
  }

  // ----------------------------------------------------------------- plumbing

  /**
   * Applies a change and fans it out.
   *
   * One path for every mutation, so the IPC broadcast, the browser sources and
   * the persisted copy cannot get out of step. The event stream carries the
   * whole timer set keyed by id, because a single browser source only ever
   * renders one of them and picking it out client-side is cheaper than
   * maintaining per-source subscriptions.
   */
  private commit(id: TimerId, partial: Partial<TimerState>): TimerState {
    const next: TimerState = {
      ...this.get(id),
      ...partial,
      revision: this.get(id).revision + 1
    }
    this.timers.set(id, next)

    this.emit('state', next)
    // The whole set travels, keyed by id: a browser source renders one timer
    // and picking it out client-side is cheaper than per-source subscriptions.
    this.server.broadcast('timer', this.all)

    // Best-effort, as with the rite: the archive may not be connected, and a
    // stream is not the moment to fail a control because a write did not land.
    void this.repository.save(next)

    return next
  }
}
