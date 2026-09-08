import { randomUUID } from 'node:crypto'
import {
  BOOT_LOG_LIMIT,
  BOOT_STAGES,
  createInitialBootSnapshot
} from '@shared/domain/boot.constants'
import type { ArchiveBinaryInfo } from '@shared/domain/archive'
import type {
  BootLogEntry,
  BootLogLevel,
  BootSnapshot,
  BootStageId,
  BootStageState
} from '@shared/domain/boot'
import { AppError } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { TypedEmitter } from '@main/core/emitter'
import { ensureAppDirectories, getPaths } from '@main/core/paths'
import type { ServiceContainer } from '@main/services/container'

const logger = getLogger('boot')

interface BootEvents {
  progress: BootSnapshot
}

/** Handed to each stage so it can report fine-grained progress and detail. */
export interface StageContext {
  setProgress(value: number): void
  setDetail(detail: string): void
  log(level: BootLogLevel, message: string): void
  readonly signal: AbortSignal
}

interface StageOutcome {
  detail?: string
  /** Marks a conditional stage as not applicable for this run. */
  skipped?: boolean
}

type StageRunner = (ctx: StageContext) => Promise<StageOutcome | void>

/**
 * Executes the application's startup sequence as an observable state machine.
 *
 * Every stage performs real work — there are no artificial delays. The renderer
 * mirrors this state, so the boot screen is an honest progress display rather
 * than a fixed-length animation.
 */
export class BootSequence extends TypedEmitter<BootEvents> {
  private snapshot: BootSnapshot = createInitialBootSnapshot()
  private controller: AbortController | null = null
  private running: Promise<BootSnapshot> | null = null

  constructor(private readonly services: ServiceContainer) {
    super()
  }

  get current(): BootSnapshot {
    return this.snapshot
  }

  /** Starts the sequence, or returns the in-flight run if one is active. */
  run(): Promise<BootSnapshot> {
    if (this.running) return this.running
    this.running = this.execute().finally(() => {
      this.running = null
    })
    return this.running
  }

  /** Resets state and runs the sequence again after a failure. */
  async retry(): Promise<BootSnapshot> {
    if (this.running) return this.running

    this.controller?.abort()
    const attempt = this.snapshot.attempt + 1
    this.snapshot = { ...createInitialBootSnapshot(), attempt }
    this.publish()
    return this.run()
  }

  dispose(): void {
    this.controller?.abort()
    this.clear()
  }

  // ---------------------------------------------------------------- execution

  private async execute(): Promise<BootSnapshot> {
    this.controller = new AbortController()
    const { signal } = this.controller

    this.snapshot = {
      ...this.snapshot,
      phase: 'running',
      startedAt: Date.now(),
      failure: null
    }
    this.publish()
    this.appendLog('info', null, 'Boot sequence initiated')

    const runners = this.createRunners()

    for (const definition of BOOT_STAGES) {
      if (signal.aborted) break

      const runner = runners[definition.id]
      this.beginStage(definition.id)

      try {
        const outcome = await runner(this.createContext(definition.id, signal))

        if (outcome?.skipped) {
          this.finishStage(definition.id, 'skipped', outcome.detail ?? 'Not required')
          this.appendLog('trace', definition.id, `${definition.label}: skipped`)
        } else {
          this.finishStage(definition.id, 'complete', outcome?.detail)
          this.appendLog('info', definition.id, `${definition.label}: complete`)
        }
      } catch (error) {
        const appError = AppError.from(error)
        logger.error(`Boot stage "${definition.id}" failed`, appError)

        this.finishStage(definition.id, 'failed', appError.message)
        this.appendLog('error', definition.id, `${definition.label}: ${appError.message}`)

        this.snapshot = {
          ...this.snapshot,
          phase: 'failed',
          activeStageId: definition.id,
          completedAt: Date.now(),
          failure: {
            code: appError.code,
            message: appError.message,
            hint: appError.hint,
            recoverable: appError.recoverable
          }
        }
        this.publish()
        return this.snapshot
      }
    }

    this.snapshot = {
      ...this.snapshot,
      phase: 'ready',
      activeStageId: null,
      overall: 1,
      completedAt: Date.now()
    }
    this.publish()

    const elapsed = (this.snapshot.completedAt ?? 0) - (this.snapshot.startedAt ?? 0)
    this.appendLog('info', null, `All systems nominal — ${elapsed}ms`)
    logger.info(`Boot sequence completed in ${elapsed}ms`)

    return this.snapshot
  }

  /**
   * Maps each stage to the work it performs. Kept in one place so the sequence
   * reads as a narrative rather than being scattered across the service layer.
   */
  private createRunners(): Record<BootStageId, StageRunner> {
    const { settings, archive, updates, rite, timers, overlayServer } = this.services

    // Carried between stages within a single run. The full binary record is
    // kept, not just its path, so the daemon stage reports the runtime's real
    // source and version rather than re-asserting them.
    let binary: ArchiveBinaryInfo | null = null
    let port = 0

    return {
      runtime: async (ctx) => {
        ctx.log('trace', 'Resolving application paths')
        await ensureAppDirectories()
        ctx.setProgress(0.6)
        const paths = getPaths()
        ctx.log('trace', `User data: ${paths.userData}`)
        return { detail: paths.userData }
      },

      configuration: async (ctx) => {
        const loaded = await settings.load()
        ctx.setProgress(0.8)
        const roots = loaded.workspace.abletonProjectRoots.length
        return { detail: `${roots} workspace root${roots === 1 ? '' : 's'} registered` }
      },

      'archive-binary': async (ctx) => {
        const configured = settings.snapshot.archive.executablePath
        const located = await archive.locate(configured)

        if (!located) {
          ctx.log('warn', 'No archive runtime present; provisioning required')
          return { detail: 'Runtime not found' }
        }

        binary = located
        ctx.log('info', `Runtime located via ${located.source}`)
        return { detail: `v${located.version ?? 'unknown'} · ${located.source}` }
      },

      'archive-provision': async (ctx) => {
        // Only runs when the previous stage found nothing — this is the
        // self-healing path for an installer download that did not complete.
        if (binary) return { skipped: true, detail: 'Runtime already present' }

        ctx.log('warn', 'Downloading archive runtime — this may take several minutes')

        const unsubscribe = archive.on('status', (status) => {
          const provision = status.provision
          if (!provision) return
          if (provision.ratio >= 0) ctx.setProgress(provision.ratio)
          ctx.setDetail(provision.message)
        })

        try {
          binary = await archive.provision(ctx.signal)
          return { detail: `v${binary.version ?? 'unknown'} provisioned` }
        } finally {
          unsubscribe()
        }
      },

      'archive-daemon': async (ctx) => {
        const config = settings.snapshot.archive

        if (!config.autoStart) {
          ctx.log('info', 'Embedded daemon disabled; using external archive')
          return { skipped: true, detail: 'External archive configured' }
        }
        if (!binary) {
          throw new AppError('No archive runtime available to start.', { recoverable: true })
        }

        ctx.setProgress(0.3)
        port = await archive.startDaemon(binary, config.port)
        ctx.setProgress(0.9)
        return { detail: `Listening on 127.0.0.1:${port}` }
      },

      'archive-link': async (ctx) => {
        const config = settings.snapshot.archive
        ctx.setProgress(0.4)
        await archive.connect(port || config.port, config.autoStart ? null : config.externalUri)
        const version = archive.status.serverVersion
        return { detail: version ? `MongoDB ${version}` : 'Connected' }
      },

      'archive-schema': async (ctx) => {
        ctx.setProgress(0.5)
        await archive.reconcileSchema()
        return { detail: 'Collections and indexes reconciled' }
      },

      services: async (ctx) => {
        const config = settings.snapshot.updates
        updates.configure({ channel: config.channel, autoDownload: config.autoDownload })
        ctx.setProgress(0.4)

        // Restores stored overlay state, then starts serving. Never throws: a
        // browser source that cannot be served reports itself through the
        // OBSERVATORY panel, and is not a reason to refuse to start the app.
        const workspace = settings.snapshot.workspace
        await rite.initialize()
        await timers.initialize()

        if (workspace.overlayAutoStart) {
          try {
            await overlayServer.start(workspace.overlayPort)
          } catch (cause) {
            ctx.log('warn', 'Overlay server did not start')
            logger.error('Overlay server did not start', cause)
          }
        }
        const overlay = overlayServer.info
        ctx.log(
          overlay.running ? 'info' : 'warn',
          overlay.running ? `Overlay server on ${overlay.url}` : 'Overlay server offline'
        )
        ctx.setProgress(0.7)

        if (config.autoCheck) {
          // Deliberately not awaited: a slow or unreachable update feed must
          // never delay the operator getting into the application.
          void updates.check()
          ctx.log('trace', 'Update check dispatched in background')
        }

        return { detail: 'Operational services online' }
      },

      harmonics: async (ctx) => {
        ctx.setProgress(0.5)
        const healthy = await archive.ping()
        if (!healthy) {
          throw new AppError('The archive did not respond to a health check.', {
            recoverable: true,
            hint: 'Restart the archive from Regulation.'
          })
        }
        archive.markOnline()
        const latency = archive.status.latencyMs
        return { detail: latency !== null ? `Archive latency ${latency}ms` : 'Synchronised' }
      }
    }
  }

  // ------------------------------------------------------------ state helpers

  private createContext(stageId: BootStageId, signal: AbortSignal): StageContext {
    return {
      signal,
      setProgress: (value) => this.updateStage(stageId, { progress: clamp(value) }),
      setDetail: (detail) => this.updateStage(stageId, { detail }),
      log: (level, message) => this.appendLog(level, stageId, message)
    }
  }

  private beginStage(stageId: BootStageId): void {
    this.updateStage(stageId, { status: 'active', progress: 0, startedAt: Date.now() })
    this.snapshot = { ...this.snapshot, activeStageId: stageId }
    this.publish()
  }

  private finishStage(
    stageId: BootStageId,
    status: BootStageState['status'],
    detail?: string
  ): void {
    this.updateStage(stageId, {
      status,
      progress: 1,
      completedAt: Date.now(),
      ...(detail !== undefined ? { detail } : {})
    })
  }

  private updateStage(stageId: BootStageId, patch: Partial<BootStageState>): void {
    const stages = this.snapshot.stages.map((stage) =>
      stage.id === stageId ? { ...stage, ...patch } : stage
    )
    this.snapshot = { ...this.snapshot, stages, overall: computeOverall(stages) }
    this.publish()
  }

  private appendLog(level: BootLogLevel, stageId: BootStageId | null, message: string): void {
    const entry: BootLogEntry = {
      id: randomUUID(),
      level,
      message,
      stageId,
      timestamp: Date.now()
    }
    // Bounded so a pathological provisioning run cannot grow the snapshot without limit.
    const logs = [...this.snapshot.logs, entry].slice(-BOOT_LOG_LIMIT)
    this.snapshot = { ...this.snapshot, logs }
    this.publish()
  }

  private publish(): void {
    this.emit('progress', this.snapshot)
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/**
 * Weighted completion across stages that actually apply to this run. Skipped
 * stages are removed from the denominator so progress reflects real remaining
 * work rather than jumping to a fixed proportion.
 */
function computeOverall(stages: BootStageState[]): number {
  const weightById = new Map(BOOT_STAGES.map((stage) => [stage.id, stage.weight]))

  let done = 0
  let total = 0

  for (const stage of stages) {
    if (stage.status === 'skipped') continue
    const weight = weightById.get(stage.id) ?? 1
    total += weight
    done += weight * (stage.status === 'complete' ? 1 : stage.progress)
  }

  return total === 0 ? 0 : clamp(done / total)
}
