import { z } from 'zod'
import { ANTECHAMBER_PALETTES } from './antechamber.constants'

/**
 * THE ANTECHAMBER — the field a broadcast waits on.
 *
 * Every field carries a `.default()`, as everywhere else: the router validates
 * handler *output*, so one field without one fails the whole channel rather
 * than one record.
 *
 * There is no live state here beyond the configuration and a revision. Nothing
 * is counted down, nobody votes, and nothing is playing — the overlay is a
 * visual and only a visual, because the countdown, the chat and the now-playing
 * are separate sources composited over it in OBS. Duplicating any of them here
 * would mean two of everything to keep in step.
 */

export const AntechamberPaletteSchema = z.enum(ANTECHAMBER_PALETTES)
export type AntechamberPalette = z.infer<typeof AntechamberPaletteSchema>

export const AntechamberConfigSchema = z.object({
  palette: AntechamberPaletteSchema.default('duotone'),
  /** How strongly everything is drawn, 0..1. Lower is a subtler backdrop. */
  intensity: z.number().min(0.2).max(1).default(0.85),
  /** Time multiplier. Below 1 the whole field slows, including the drift. */
  speed: z.number().min(0.1).max(2).default(0.7),
  /** Scales the node and ribbon counts. The one dial that costs frames. */
  density: z.number().min(0.3).max(2).default(1),

  ribbons: z.boolean().default(true),
  field: z.boolean().default(true),
  rings: z.boolean().default(true),
  /** Dithers the wash so a stream encoder does not band it. */
  grain: z.boolean().default(true),
  /** How hard the corners are pulled down, 0..1. */
  vignette: z.number().min(0).max(1).default(0.7),

  /**
   * Drop the backdrop and composite over whatever is beneath.
   *
   * Off by default, because this is the bottom of a scene rather than furniture
   * laid over one — the point is that nothing shows through.
   */
  transparent: z.boolean().default(false)
})
export type AntechamberConfig = z.infer<typeof AntechamberConfigSchema>

export const AntechamberStateSchema = z.object({
  config: AntechamberConfigSchema.prefault({}),
  revision: z.number().int().min(0).default(0)
})
export type AntechamberState = z.infer<typeof AntechamberStateSchema>

/**
 * A genuinely sparse patch.
 *
 * `.partial()` would not be: every field carries a `.default()`, and zod
 * applies those for absent keys, so a patch would arrive carrying all ten and
 * writing one option would reset the other nine. Unwrapping each default before
 * making it optional is what keeps an absent key absent. Same reasoning as
 * `NowPlayingConfigPatchSchema`.
 */
type AntechamberConfigPatchShape = {
  [K in keyof AntechamberConfig]: z.ZodOptional<z.ZodType<AntechamberConfig[K]>>
}

const antechamberConfigPatchShape = Object.fromEntries(
  Object.entries(AntechamberConfigSchema.shape).map(([key, field]) => [
    key,
    field.unwrap().optional()
  ])
) as unknown as AntechamberConfigPatchShape

export const AntechamberConfigPatchSchema = z.object(antechamberConfigPatchShape)
export type AntechamberConfigPatch = z.infer<typeof AntechamberConfigPatchSchema>
