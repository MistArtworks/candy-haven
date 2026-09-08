import type { SerializedError } from '@shared/ipc/contract'

/**
 * Stable, machine-readable error codes. The renderer branches on these rather
 * than on message text, so wording can change without breaking the UI.
 */
export const ErrorCode = {
  Unknown: 'E_UNKNOWN',
  Validation: 'E_VALIDATION',
  NotFound: 'E_NOT_FOUND',
  Cancelled: 'E_CANCELLED',
  Timeout: 'E_TIMEOUT',
  PermissionDenied: 'E_PERMISSION_DENIED',

  ArchiveBinaryMissing: 'E_ARCHIVE_BINARY_MISSING',
  ArchiveProvisionFailed: 'E_ARCHIVE_PROVISION_FAILED',
  ArchiveStartFailed: 'E_ARCHIVE_START_FAILED',
  ArchiveConnectFailed: 'E_ARCHIVE_CONNECT_FAILED',
  ArchivePortUnavailable: 'E_ARCHIVE_PORT_UNAVAILABLE',

  SettingsCorrupt: 'E_SETTINGS_CORRUPT',
  UpdateUnsupported: 'E_UPDATE_UNSUPPORTED',
  UpdateFailed: 'E_UPDATE_FAILED'
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface AppErrorOptions {
  code?: ErrorCodeValue
  /** Operator-facing remediation hint. */
  hint?: string | null
  /** Whether retrying the operation is expected to help. */
  recoverable?: boolean
  cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCodeValue
  readonly hint: string | null
  readonly recoverable: boolean

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = options.code ?? ErrorCode.Unknown
    this.hint = options.hint ?? null
    this.recoverable = options.recoverable ?? false
  }

  static from(value: unknown, fallback: AppErrorOptions = {}): AppError {
    if (value instanceof AppError) return value
    if (value instanceof Error) {
      return new AppError(value.message, { ...fallback, cause: value })
    }
    return new AppError(String(value), fallback)
  }
}

export function serializeError(value: unknown, includeStack: boolean): SerializedError {
  const error = AppError.from(value)
  return {
    name: error.name,
    code: error.code,
    message: error.message,
    hint: error.hint,
    recoverable: error.recoverable,
    ...(includeStack && error.stack ? { stack: error.stack } : {})
  }
}
