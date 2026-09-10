import { z } from 'zod'

export const UpdateStateSchema = z.enum([
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
  'unsupported'
])
export type UpdateState = z.infer<typeof UpdateStateSchema>

export const UpdateStatusSchema = z.object({
  state: UpdateStateSchema,
  /** Version offered by the update feed, when known. */
  version: z.string().nullable(),
  currentVersion: z.string(),
  /** Download completion, 0..1. */
  progress: z.number().min(0).max(1).nullable(),
  bytesPerSecond: z.number().nullable(),
  releaseNotes: z.string().nullable(),
  releaseDate: z.string().nullable(),
  message: z.string().nullable(),
  checkedAt: z.number().nullable()
})
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>

/**
 * What the running version changed, shown once after it starts.
 *
 * Distinct from `UpdateStatus`, which is about an update that has not happened
 * yet. This is the other end: the update landed, the app restarted, and the
 * operator has not been told what moved.
 *
 * `notes` may be null while `version` is not — the changelog lives on GitHub
 * and the machine may be offline. Saying "you are now on 2.0.0" without the
 * detail still beats saying nothing.
 */
export const ReleaseArrivalSchema = z.object({
  version: z.string().default(''),
  notes: z.string().nullable().default(null),
  /** ISO 8601 from the release, when it could be read. */
  releasedAt: z.string().nullable().default(null),
  /** The version this machine was on before. Null on a first install. */
  previous: z.string().nullable().default(null)
})
export type ReleaseArrival = z.infer<typeof ReleaseArrivalSchema>
