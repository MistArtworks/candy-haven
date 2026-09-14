import { z } from 'zod'

/**
 * The knobs every overlay carries, and what they mean.
 *
 * Deliberately multipliers rather than measurements. Each overlay already has a
 * tuned layout — the four NOW TRANSMITTING styles, the muster's two — and those
 * layouts are the reason the department is usable. Absolute sizes would collapse
 * them into identical starting points the operator then has to rebuild by hand;
 * a multiplier nudges a preset without dissolving it.
 *
 * Everything defaults to 1, so a scene cut against any existing overlay renders
 * exactly as it did before this existed. That is the property that made this
 * safe to ship without asking anybody to re-cut their sources.
 *
 * Free of Node and DOM imports: read by the main process, the console and the
 * standalone overlay pages alike.
 */

/** Bounds, shared by the schema and the console's sliders so they cannot drift. */
export const PRESENTATION_LIMITS = {
  scale: { min: 0.5, max: 2, step: 0.05 },
  typeScale: { min: 0.5, max: 2, step: 0.05 },
  opacity: { min: 0.1, max: 1, step: 0.05 }
} as const

const scaleField = (): z.ZodDefault<z.ZodNumber> =>
  z.number().min(PRESENTATION_LIMITS.scale.min).max(PRESENTATION_LIMITS.scale.max).default(1)

const typeScaleField = (): z.ZodDefault<z.ZodNumber> =>
  z
    .number()
    .min(PRESENTATION_LIMITS.typeScale.min)
    .max(PRESENTATION_LIMITS.typeScale.max)
    .default(1)

const opacityField = (): z.ZodDefault<z.ZodNumber> =>
  z.number().min(PRESENTATION_LIMITS.opacity.min).max(PRESENTATION_LIMITS.opacity.max).default(1)

/**
 * The three knobs, as a shape to spread into an overlay's own config.
 *
 * Spread flat rather than nested under a `presentation` key, and that is a
 * correctness decision rather than a stylistic one. Every overlay builds its
 * patch schema by unwrapping each field's default and making it optional — see
 * patch.ts for the data-loss bug that machinery exists to close. Unwrapping a
 * *nested object* peels its prefault and leaves the inner schema, which then
 * re-applies its own defaults: writing `scale` alone would silently reset
 * `typeScale` and `opacity`, reintroducing the exact bug one level down.
 *
 * Flat fields go through that machinery correctly with no special case, and the
 * definitions still live here, so the bounds cannot drift between overlays.
 */
export function presentationShape(): {
  scale: z.ZodDefault<z.ZodNumber>
  typeScale: z.ZodDefault<z.ZodNumber>
  opacity: z.ZodDefault<z.ZodNumber>
} {
  return { scale: scaleField(), typeScale: typeScaleField(), opacity: opacityField() }
}

/**
 * The knobs on their own.
 *
 * Every overlay config satisfies this structurally by spreading
 * `presentationShape()`, so the helpers below take any of them without each
 * renderer having to pick the three fields out by hand.
 */
export const PresentationSchema = z.object(presentationShape())
export type Presentation = z.infer<typeof PresentationSchema>

export function createDefaultPresentation(): Presentation {
  return PresentationSchema.parse({})
}

/** True when nothing has been moved, so the console can hide its Reset. */
export function isDefaultPresentation(presentation: Presentation): boolean {
  return presentation.scale === 1 && presentation.typeScale === 1 && presentation.opacity === 1
}

// ---------------------------------------------------------------- arithmetic

/**
 * The layout unit a renderer should actually use.
 *
 * Called once per frame at the top of a draw, so the multiplier is applied in
 * exactly one place per surface rather than at each of the dozens of sites that
 * derive a size from the unit.
 */
export function scaledUnit(presentation: Presentation, unit: number): number {
  return unit * presentation.scale
}

/**
 * A type size, given a unit that has *already* been scaled.
 *
 * Takes the scaled unit rather than the raw one on purpose: text should follow
 * the layout by default and then take its own adjustment, so raising `scale`
 * alone keeps the composition intact instead of leaving the type behind.
 */
export function scaledType(presentation: Presentation, size: number): number {
  return size * presentation.typeScale
}

/**
 * Folds the operator's opacity into whatever alpha the renderer already wanted.
 *
 * Multiplied rather than assigned, and that is the whole point of this helper
 * existing instead of a bare `ctx.globalAlpha = opacity`. NOW TRANSMITTING
 * fades itself out when nothing is playing; assigning would make a source at
 * full opacity ignore that fade, and a source at half opacity snap to half
 * while resting. They are different questions and both have to hold.
 */
export function composeAlpha(presentation: Presentation, alpha: number): number {
  return alpha * presentation.opacity
}
