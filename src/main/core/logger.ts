import log from 'electron-log/main'
import { is } from '@electron-toolkit/utils'

/**
 * Structured, scoped logging backed by electron-log.
 *
 * File transport is rotated by electron-log and lives in the OS log directory,
 * which is also surfaced to the operator through `runtime:info`.
 */
let initialized = false

export function initializeLogging(): void {
  if (initialized) return
  initialized = true

  log.initialize()
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.console.level = is.dev ? 'silly' : 'warn'
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

  // Surface anything that escapes a handler rather than failing silently.
  log.errorHandler.startCatching({ showDialog: false })
}

export interface Logger {
  trace(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  child(scope: string): Logger
}

function createLogger(scope: string): Logger {
  const scoped = log.scope(scope)
  return {
    trace: (message, ...args) => scoped.debug(message, ...args),
    info: (message, ...args) => scoped.info(message, ...args),
    warn: (message, ...args) => scoped.warn(message, ...args),
    error: (message, ...args) => scoped.error(message, ...args),
    child: (childScope) => createLogger(`${scope}:${childScope}`)
  }
}

export function getLogger(scope: string): Logger {
  return createLogger(scope)
}

/** Absolute path of the current log file, for operator diagnostics. */
export function getLogFilePath(): string {
  return log.transports.file.getFile().path
}
