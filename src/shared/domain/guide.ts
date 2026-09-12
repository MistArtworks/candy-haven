import { z } from 'zod'

/**
 * CATECHISM — what the operator has been told, and whether they have read it.
 *
 * The schema half. Runtime values live in guide.constants.ts, which the
 * renderer imports directly; this module is imported by the renderer for types
 * only. See boot.ts for the convention.
 */

export const OrientationSchema = z.object({
  /** The revision the tour is being shown *for*, recorded on acknowledgement. */
  revision: z.number().int(),
  /**
   * True when nothing had been acknowledged — a first-ever launch rather than a
   * revised tour. The carousel says "welcome" to one and "this changed" to the
   * other, off the same eight slides.
   */
  firstRun: z.boolean()
})
export type Orientation = z.infer<typeof OrientationSchema>

export { GUIDE_REVISION } from './guide.constants'
