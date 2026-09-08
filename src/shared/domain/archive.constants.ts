import type { ArchiveStatus } from './archive'

/**
 * Zod-free half of the archive domain. See boot.constants.ts for the rationale:
 * the renderer needs the initial value, not the validator.
 */
export function createInitialArchiveStatus(): ArchiveStatus {
  return {
    state: 'offline',
    binary: null,
    dataPath: null,
    logPath: null,
    port: null,
    serverVersion: null,
    latencyMs: null,
    restarts: 0,
    provision: null,
    message: null,
    updatedAt: Date.now()
  }
}
