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
