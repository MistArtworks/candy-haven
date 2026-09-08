import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createServer, connect } from 'node:net'
import type { Readable } from 'node:stream'
import { mkdir } from 'node:fs/promises'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import { TypedEmitter } from '@main/core/emitter'
import { delay } from '@main/core/async'

const logger = getLogger('archive:supervisor')

/** Matches the stdio shape used in `spawn` below: no stdin, piped stdout/stderr. */
type ArchiveProcess = ChildProcessByStdio<null, Readable, Readable>

const READY_TIMEOUT_MS = 45_000
const READY_POLL_INTERVAL_MS = 250
const MAX_PORT_SCAN = 32
const MAX_AUTO_RESTARTS = 3

interface SupervisorEvents {
  /** The daemon exited without being asked to. */
  crashed: { code: number | null; signal: NodeJS.Signals | null; restarts: number }
  /** A restart attempt is starting. */
  restarting: { attempt: number }
  /** The daemon is accepting connections again after a restart. */
  recovered: { port: number }
  /** Auto-restart budget exhausted; manual intervention required. */
  exhausted: { restarts: number }
}

/** True when nothing is listening on 127.0.0.1:port. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

/** True when something accepts a TCP connection on 127.0.0.1:port. */
function isPortAccepting(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    const done = (value: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1_000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function claimPort(preferred: number): Promise<number> {
  for (let offset = 0; offset < MAX_PORT_SCAN; offset += 1) {
    const port = preferred + offset
    if (port > 65535) break
    if (await isPortFree(port)) return port
  }

  throw new AppError(
    `No free port available in range ${preferred}-${preferred + MAX_PORT_SCAN - 1}.`,
    {
      code: ErrorCode.ArchivePortUnavailable,
      hint: 'Another application may be occupying the port range. Change it in Regulation.',
      recoverable: true
    }
  )
}

export interface SupervisorStartOptions {
  executablePath: string
  preferredPort: number
}

export interface SupervisorHandle {
  port: number
  pid: number | undefined
}

/**
 * Owns the embedded mongod process.
 *
 * Responsibilities: claim a free loopback port, launch the daemon bound to
 * localhost only, wait for it to accept connections, and restart it a bounded
 * number of times if it dies unexpectedly. It deliberately knows nothing about
 * the MongoDB wire protocol — health checks at that level live in ArchiveService.
 */
export class ArchiveSupervisor extends TypedEmitter<SupervisorEvents> {
  private child: ArchiveProcess | null = null
  private currentPort: number | null = null
  private executablePath: string | null = null
  private restarts = 0
  /** Set while stop() is running so the exit handler does not treat it as a crash. */
  private stopping = false

  get port(): number | null {
    return this.currentPort
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  get restartCount(): number {
    return this.restarts
  }

  get isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  async start(options: SupervisorStartOptions): Promise<SupervisorHandle> {
    if (this.isRunning && this.currentPort) {
      return { port: this.currentPort, pid: this.child?.pid }
    }

    const paths = getPaths()
    await mkdir(paths.archiveData, { recursive: true })
    await mkdir(paths.archiveLogs, { recursive: true })

    const port = await claimPort(options.preferredPort)
    this.executablePath = options.executablePath

    // Bound to loopback with no auth: the daemon is a private, app-owned store
    // that is never reachable from outside this machine.
    const args = [
      '--dbpath',
      paths.archiveData,
      '--port',
      String(port),
      '--bind_ip',
      '127.0.0.1',
      '--logpath',
      paths.archiveLogFile,
      '--logappend',
      '--wiredTigerCacheSizeGB',
      '0.25',
      '--quiet'
    ]

    logger.info(`Starting archive daemon on port ${port}`)

    const child = spawn(options.executablePath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.child = child
    this.currentPort = port
    this.stopping = false

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) logger.warn(`mongod: ${text}`)
    })

    child.on('error', (error) => {
      logger.error('Archive daemon process error', error)
    })

    child.on('exit', (code, signal) => {
      const wasStopping = this.stopping
      this.child = null
      logger.info(`Archive daemon exited (code=${code} signal=${signal})`)
      if (!wasStopping) void this.handleUnexpectedExit(code, signal)
    })

    await this.waitUntilAccepting(port, child)

    return { port, pid: child.pid }
  }

  /** Polls the port until the daemon accepts connections, or the process dies. */
  private async waitUntilAccepting(port: number, child: ArchiveProcess): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS

    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new AppError(`The archive daemon exited during startup (code ${child.exitCode}).`, {
          code: ErrorCode.ArchiveStartFailed,
          hint: `Inspect ${getPaths().archiveLogFile} for details.`,
          recoverable: true
        })
      }

      if (await isPortAccepting(port)) {
        logger.info(`Archive daemon accepting connections on port ${port}`)
        return
      }

      await delay(READY_POLL_INTERVAL_MS)
    }

    throw new AppError('The archive daemon did not become ready in time.', {
      code: ErrorCode.ArchiveStartFailed,
      hint: `Inspect ${getPaths().archiveLogFile} for details.`,
      recoverable: true
    })
  }

  private async handleUnexpectedExit(
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    this.emit('crashed', { code, signal, restarts: this.restarts })

    if (this.restarts >= MAX_AUTO_RESTARTS || !this.executablePath || !this.currentPort) {
      logger.error(`Archive daemon will not be restarted (restarts=${this.restarts})`)
      this.emit('exhausted', { restarts: this.restarts })
      return
    }

    this.restarts += 1
    const attempt = this.restarts
    // Linear backoff: a daemon that dies immediately is usually misconfigured,
    // so give the filesystem and port a moment to settle between attempts.
    const backoff = attempt * 1_500
    logger.warn(`Restarting archive daemon in ${backoff}ms (attempt ${attempt})`)
    this.emit('restarting', { attempt })

    await delay(backoff)

    try {
      const handle = await this.start({
        executablePath: this.executablePath,
        preferredPort: this.currentPort
      })
      logger.info('Archive daemon recovered')
      this.emit('recovered', { port: handle.port })
    } catch (error) {
      logger.error('Archive daemon restart failed', error)
      this.emit('exhausted', { restarts: this.restarts })
    }
  }

  /**
   * Stops the daemon.
   *
   * `beforeKill` lets the caller attempt a protocol-level shutdown first, which
   * lets WiredTiger close its files cleanly. If the process is still alive
   * afterwards it is terminated.
   */
  async stop(beforeKill?: () => Promise<void>): Promise<void> {
    const child = this.child
    this.stopping = true

    if (!child || child.exitCode !== null) {
      this.child = null
      return
    }

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))

    if (beforeKill) {
      try {
        await beforeKill()
      } catch (error) {
        logger.warn('Graceful archive shutdown failed; terminating process', error)
      }
    }

    const settled = await Promise.race([exited.then(() => true), delay(8_000).then(() => false)])

    if (!settled) {
      logger.warn('Archive daemon did not exit gracefully; terminating')
      child.kill()
      await Promise.race([exited, delay(3_000)])
    }

    this.child = null
    logger.info('Archive daemon stopped')
  }
}
