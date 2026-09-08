import { z } from 'zod'

/**
 * Turning a schema into a schema for *sparse patches* of itself.
 *
 * ### The trap this exists to close
 *
 * Every persisted schema in this project gives its fields a `.default()`,
 * because a document written by an earlier build is missing whatever has been
 * added since and the router validates handler output. That is correct and must
 * stay.
 *
 * But `.partial()` does **not** produce a patch schema for such an object. Zod
 * still applies each field's default for an absent key, so parsing
 * `{ twitchChannel: 'x' }` yields `{ spotifyClientId: '', twitchChannel: 'x' }`
 * — and since the IPC router validates *inputs*, that rewrite happens before
 * the merge ever sees the patch. A one-field write therefore arrives at the
 * merge as a whole section at its defaults and silently clobbers every sibling.
 *
 * This has bitten the project three times:
 *
 *  - the **rite config**, where writing one presentation option reset the other
 *    twelve, presenting as "none of the settings work";
 *  - **settings**, where saving a Twitch channel erased the Spotify client id,
 *    and where saving an overlay port would have erased the scanned Ableton
 *    roots;
 *  - the **rite config again**, more subtly, the moment `mechanism` gained a
 *    `.catch()`: the old fix unwrapped exactly one layer, and a catch wrapping a
 *    default leaves the default in place.
 *
 * Hence one implementation, here, rather than the trick re-derived per domain.
 *
 * ### What is peeled, and what deliberately is not
 *
 * Only the wrappers that **materialise a value for a key nobody sent**:
 * `default`, `catch` and `prefault`. They compose, so the peel is a loop — a
 * field written `.default(x).catch(x)` is a catch *wrapping* a default, and
 * removing only the outer one leaves the very thing that has to go.
 *
 * `nullable` and `optional` are left alone. They inject nothing, and peeling
 * `nullable` would be actively wrong: `releaseVaultPath` is
 * `z.string().nullable().default(null)`, and stripping the nullable would make
 * it impossible to clear a path back to null.
 */
const VALUE_WRAPPERS = new Set(['default', 'catch', 'prefault'])

/**
 * Matched on `def.type` rather than with `instanceof`, deliberately.
 *
 * Several of zod's wrapper classes are not stable public exports across minors,
 * and `x instanceof undefined` does not evaluate falsey — it throws. That throw
 * would happen at *module load*, in the file whose whole job is to stop a silent
 * data-loss bug, and would take every channel that imports it down at once.
 */
function peel(field: z.ZodType): z.ZodType {
  let current = field
  for (let guard = 0; guard < 8; guard += 1) {
    const def = (current as { def?: { type?: string; innerType?: z.ZodType } }).def
    if (!def?.type || !VALUE_WRAPPERS.has(def.type) || !def.innerType) break
    current = def.innerType
  }
  return current
}

/**
 * A shape where every field is optional and injects nothing when absent.
 *
 * Returned as a raw shape rather than a built object so the caller can assert
 * the precise key types — `Object.fromEntries` erases them, and the
 * correspondence is guaranteed by the shape coming from the source schema.
 */
export function sparseShape(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [key, peel(field as z.ZodType).optional()])
  )
}

/**
 * A schema accepting a genuinely sparse patch of `schema`.
 *
 * The runtime guarantee: an absent key stays absent, and a present one is still
 * validated exactly as the source schema validates it.
 */
export function sparsePatchOf(schema: z.ZodObject): z.ZodObject {
  return z.object(sparseShape(schema.shape))
}
