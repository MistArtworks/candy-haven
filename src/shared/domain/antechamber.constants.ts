import type { AntechamberConfig, AntechamberState } from './antechamber'

/**
 * Zod-free half of the antechamber domain — see boot.constants.ts for the split.
 */

/**
 * Which two materials the field is drawn in.
 *
 * Two rather than a free colour, and always from the house set. Everything else
 * in the kit is furniture laid over a scene where a stray hue would read as a
 * mistake; this *is* the scene, and it is the one place the palette has to
 * carry a whole frame on its own. Five materials will do that. A colour picker
 * would produce a purple stream-starting screen in front of a crimson-and-gold
 * broadcast, which is the failure worth designing out.
 */
export const ANTECHAMBER_PALETTES = ['duotone', 'crimson', 'gold', 'ash'] as const
export type AntechamberPalette = (typeof ANTECHAMBER_PALETTES)[number]

export const ANTECHAMBER_PALETTE_LABEL: Record<AntechamberPalette, string> = {
  duotone: 'DUOTONE — crimson against gold',
  crimson: 'CRIMSON — the accent alone',
  gold: 'GOLD — warm, and quieter',
  ash: 'ASH — alabaster over gold, coolest of the four'
}

/**
 * Recommended source size.
 *
 * The full canvas, because this is the bottom of a scene rather than a widget
 * dropped into a corner of one. Everything scales off the smaller dimension, so
 * an ultrawide or a vertical frame composes rather than stretches.
 */
export const ANTECHAMBER_CANVAS = { width: 1920, height: 1080 }

export function createDefaultAntechamberConfig(): AntechamberConfig {
  return {
    palette: 'duotone',
    intensity: 0.85,
    speed: 0.7,
    density: 1,
    ribbons: true,
    field: true,
    rings: true,
    grain: true,
    vignette: 0.7,
    transparent: false
  }
}

export function createAntechamberState(): AntechamberState {
  return { config: createDefaultAntechamberConfig(), revision: 0 }
}
