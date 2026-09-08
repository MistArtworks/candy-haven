import type { BootSnapshot, BootStageDefinition } from './boot'

/**
 * Zod-free half of the boot domain.
 *
 * The renderer needs the stage table and an initial snapshot, but never needs
 * to *validate* anything — validation happens once, at the IPC boundary in the
 * main process. Keeping these values in a module with no zod import means the
 * renderer bundle does not carry a schema library it cannot use. Types are
 * imported above with `import type`, which is erased at compile time, so this
 * module stays runtime-free of the schema graph.
 */

/**
 * The boot sequence is a real, observable state machine — every stage below
 * corresponds to actual work performed in the main process, not a timed
 * animation. The renderer subscribes to stage transitions and renders them.
 */
export const BOOT_STAGE_IDS = [
  'runtime',
  'configuration',
  'archive-binary',
  'archive-provision',
  'archive-daemon',
  'archive-link',
  'archive-schema',
  'services',
  'harmonics'
] as const

export type BootStageId = (typeof BOOT_STAGE_IDS)[number]

/** Maximum boot log entries retained and shipped with each snapshot. */
export const BOOT_LOG_LIMIT = 200

export const BOOT_STAGES: readonly BootStageDefinition[] = [
  {
    id: 'runtime',
    label: 'RUNTIME',
    description: 'Verifying process integrity and resolving application paths',
    weight: 1
  },
  {
    id: 'configuration',
    label: 'CONFIGURATION',
    description: 'Reading operator settings and workspace registry',
    weight: 1
  },
  {
    id: 'archive-binary',
    label: 'ARCHIVE BINARY',
    description: 'Locating the resonance archive daemon',
    weight: 1
  },
  {
    id: 'archive-provision',
    label: 'PROVISIONING',
    description: 'Retrieving archive runtime from the distribution node',
    weight: 6,
    conditional: true
  },
  {
    id: 'archive-daemon',
    label: 'ARCHIVE DAEMON',
    description: 'Starting the archive process and claiming a local port',
    weight: 3
  },
  {
    id: 'archive-link',
    label: 'ARCHIVE LINK',
    description: 'Establishing an authenticated connection to the archive',
    weight: 2
  },
  {
    id: 'archive-schema',
    label: 'SCHEMA',
    description: 'Reconciling collections and indexes',
    weight: 1
  },
  {
    id: 'services',
    label: 'SERVICES',
    description: 'Bringing operational services online',
    weight: 1
  },
  {
    id: 'harmonics',
    label: 'HARMONICS',
    description: 'Final synchronisation checks',
    weight: 1
  }
] as const

export function createInitialBootSnapshot(): BootSnapshot {
  return {
    phase: 'idle',
    overall: 0,
    activeStageId: null,
    stages: BOOT_STAGES.map((stage) => ({
      id: stage.id,
      status: 'pending' as const,
      progress: 0,
      detail: null,
      startedAt: null,
      completedAt: null
    })),
    startedAt: null,
    completedAt: null,
    failure: null,
    attempt: 0,
    logs: []
  }
}
