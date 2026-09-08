import { MongoClient, type Db } from 'mongodb'
import { createInitialArchiveStatus } from '@shared/domain/archive.constants'
import type {
  ArchiveBinaryInfo,
  ArchiveState,
  ArchiveStatus,
  ProvisionProgress
} from '@shared/domain/archive'
import { ARCHIVE_DB_NAME, APP_NAME } from '@shared/constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import { TypedEmitter } from '@main/core/emitter'
import { withTimeout } from '@main/core/async'
import { locateArchiveBinary, readBinaryVersion } from './binary-locator'
import { provisionArchiveRuntime } from './provisioner'
import { ArchiveSupervisor } from './supervisor'
import { applySchema } from './schema'

const logger = getLogger('archive')

const CONNECT_TIMEOUT_MS = 15_000

interface ArchiveEvents {
  status: ArchiveStatus
}

/**
 * Owns the embedded MongoDB instance end to end: binary discovery, first-run
 * provisioning, process supervision, the driver connection and schema
 * reconciliation.
 *
 * The boot sequence drives these steps individually so each maps to a visible
 * stage; nothing here assumes it is being called from boot, so the same methods
 * back the manual controls in the Regulation section.
 */
export class ArchiveService extends TypedEmitter<ArchiveEvents> {
  private readonly supervisor = new ArchiveSupervisor()
  private client: MongoClient | null = null
  private db: Db | null = null
  private state: ArchiveStatus = createInitialArchiveStatus()

  constructor() {
    super()
    this.wireSupervisorEvents()
  }

  get status(): ArchiveStatus {
    return this.state
  }

  /** Throws unless the archive is connected — repositories call this. */
  getDb(): Db {
    if (!this.db) {
      throw new AppError('The archive is not connected.', {
        code: ErrorCode.ArchiveConnectFailed,
        hint: 'Restart the archive from Regulation.',
        recoverable: true
      })
    }
    return this.db
  }

  isOnline(): boolean {
    return this.state.state === 'online' && this.db !== null
  }

  // ---------------------------------------------------------------- discovery

  async locate(configuredPath: string | null): Promise<ArchiveBinaryInfo | null> {
    this.patch({ state: 'locating', message: 'Locating archive runtime' })
    const binary = await locateArchiveBinary(configuredPath)
    this.patch({
      state: binary ? 'offline' : 'locating',
      binary,
      message: binary ? `Runtime found (${binary.source})` : 'Runtime not present'
    })
    return binary
  }

  // ------------------------------------------------------------- provisioning

  /**
   * Downloads and unpacks the MongoDB runtime into userData.
   *
   * This is the fallback path for when the installer's own download did not
   * complete — the app stays self-healing rather than requiring a reinstall.
   */
  async provision(signal?: AbortSignal): Promise<ArchiveBinaryInfo> {
    this.patch({ state: 'provisioning', message: 'Provisioning archive runtime' })

    const report = (progress: ProvisionProgress): void => {
      this.patch({ state: 'provisioning', provision: progress, message: progress.message })
    }

    const executablePath = await provisionArchiveRuntime(report, signal)
    const version = await readBinaryVersion(executablePath)
    const binary: ArchiveBinaryInfo = { executablePath, source: 'user-data', version }

    this.patch({
      state: 'offline',
      binary,
      provision: null,
      message: `Runtime provisioned (v${version ?? 'unknown'})`
    })

    return binary
  }

  // ------------------------------------------------------------------ daemon

  async startDaemon(binary: ArchiveBinaryInfo, preferredPort: number): Promise<number> {
    this.patch({ state: 'starting', binary, message: 'Starting archive daemon' })

    const handle = await this.supervisor.start({
      executablePath: binary.executablePath,
      preferredPort
    })

    const paths = getPaths()
    this.patch({
      state: 'starting',
      port: handle.port,
      dataPath: paths.archiveData,
      logPath: paths.archiveLogFile,
      message: `Daemon listening on port ${handle.port}`
    })

    return handle.port
  }

  // -------------------------------------------------------------- connection

  /** Opens the driver connection. `uri` overrides the embedded daemon. */
  async connect(port: number, uri?: string | null): Promise<void> {
    this.patch({ state: 'connecting', message: 'Establishing archive link' })

    const connectionString = uri ?? `mongodb://127.0.0.1:${port}/?directConnection=true`

    const client = new MongoClient(connectionString, {
      appName: APP_NAME,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      // A local daemon needs only a small pool; keeps idle resource use low.
      maxPoolSize: 12,
      minPoolSize: 1,
      retryWrites: true
    })

    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Archive connection timed out.')

      const db = client.db(ARCHIVE_DB_NAME)
      const startedAt = Date.now()
      const buildInfo = await db.admin().command({ buildInfo: 1 })
      const latencyMs = Date.now() - startedAt

      this.client = client
      this.db = db

      this.patch({
        state: 'connecting',
        port,
        serverVersion: typeof buildInfo.version === 'string' ? buildInfo.version : null,
        latencyMs,
        message: 'Archive link established'
      })

      logger.info(`Connected to archive v${buildInfo.version} in ${latencyMs}ms`)
    } catch (error) {
      // Never leak a half-open client if the handshake failed.
      await client.close().catch(() => undefined)
      throw new AppError('Could not connect to the archive.', {
        code: ErrorCode.ArchiveConnectFailed,
        hint: `Inspect ${getPaths().archiveLogFile} for daemon errors.`,
        recoverable: true,
        cause: error
      })
    }
  }

  // ------------------------------------------------------------------ schema

  async reconcileSchema(): Promise<void> {
    await applySchema(this.getDb())
  }

  /** Marks the archive fully operational. Called at the end of the boot sequence. */
  markOnline(): void {
    this.patch({ state: 'online', message: 'Archive online', provision: null })
  }

  // ------------------------------------------------------------------ health

  /** Pings the daemon and refreshes latency. Returns false when unreachable. */
  async ping(): Promise<boolean> {
    if (!this.db) return false
    try {
      const startedAt = Date.now()
      await this.db.admin().command({ ping: 1 })
      const latencyMs = Date.now() - startedAt
      if (this.state.state === 'online') this.patch({ latencyMs })
      return true
    } catch (error) {
      logger.warn('Archive ping failed', error)
      this.patch({ state: 'degraded', message: 'Archive not responding' })
      return false
    }
  }

  // --------------------------------------------------------------- lifecycle

  /** Full restart: closes the connection, stops the daemon and starts over. */
  async restart(preferredPort: number, configuredPath: string | null): Promise<ArchiveStatus> {
    logger.info('Restarting archive')
    await this.shutdown()

    const binary = (await this.locate(configuredPath)) ?? (await this.provision())
    const port = await this.startDaemon(binary, preferredPort)
    await this.connect(port)
    await this.reconcileSchema()
    this.markOnline()

    return this.state
  }

  /**
   * Closes the driver connection, then asks the daemon to shut down cleanly
   * before the supervisor falls back to terminating it.
   */
  async shutdown(): Promise<void> {
    const client = this.client

    await this.supervisor.stop(async () => {
      if (!client) return
      try {
        // The daemon closes the socket while replying, so an error here is expected.
        await client.db('admin').command({ shutdown: 1 })
      } catch {
        // Intentionally ignored — see above.
      }
    })

    if (client) {
      await client.close(true).catch(() => undefined)
    }

    this.client = null
    this.db = null
    this.patch({ state: 'offline', port: null, latencyMs: null, message: 'Archive offline' })
  }

  // ----------------------------------------------------------------- internal

  private wireSupervisorEvents(): void {
    this.supervisor.on('crashed', ({ code }) => {
      this.patch({
        state: 'degraded',
        restarts: this.supervisor.restartCount,
        message: `Daemon exited unexpectedly (code ${code ?? 'unknown'})`
      })
    })

    this.supervisor.on('restarting', ({ attempt }) => {
      this.patch({ state: 'starting', message: `Restarting daemon (attempt ${attempt})` })
    })

    this.supervisor.on('recovered', ({ port }) => {
      this.patch({
        state: 'online',
        port,
        restarts: this.supervisor.restartCount,
        message: 'Daemon recovered'
      })
    })

    this.supervisor.on('exhausted', ({ restarts }) => {
      this.patch({
        state: 'error',
        restarts,
        message: 'Daemon could not be restarted. Manual intervention required.'
      })
    })
  }

  private patch(
    partial: Partial<Omit<ArchiveStatus, 'updatedAt'>> & { state?: ArchiveState }
  ): void {
    this.state = { ...this.state, ...partial, updatedAt: Date.now() }
    this.emit('status', this.state)
  }
}
