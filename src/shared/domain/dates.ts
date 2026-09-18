import { z } from 'zod'

/**
 * The one date schema, for every department that stores a date.
 *
 * ## Why this is its own module
 *
 * It was declared twice — once in `projects.ts`, once in `calendar.ts` — which
 * was harmless duplication right up until a third department needed it.
 * DISCOGRAPHY imported it from `projects.ts`, and `projects.ts` imports the
 * appearance schema back from `discography.ts`, which is a **runtime import
 * cycle**: whichever module the bundler evaluates second reads a binding that
 * has not been initialised yet, and the application dies at load with
 *
 *     ReferenceError: Cannot access 'IsoDateSchema' before initialization
 *
 * Type-only imports are erased at compile time and cannot cause this; value
 * imports of a `const` can, and a zod schema is a value.
 *
 * A leaf module fixes it properly rather than by copying the line a third
 * time. Nothing here imports anything but zod, so it can never participate in
 * a cycle no matter who reaches for it.
 *
 * ## Why dates are strings
 *
 * `YYYY-MM-DD`, validated by shape rather than parsed. A session booked on the
 * 14th is on the 14th regardless of where the machine thinks it is, and
 * storing an instant would drag it across a day boundary the first time the
 * operator travelled or the clocks changed. The same reasoning is recorded at
 * greater length at the top of `calendar.constants.ts`.
 */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
