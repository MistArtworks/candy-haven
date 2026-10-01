import { z } from 'zod'
import { ArtistLinkSchema } from './artists'

/**
 * Schema half of the colophon domain: the details the website carries.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. The field rules live in colophon.constants.ts, which is also where
 * what this record *is* is written down.
 *
 * **Every field carries a `.default()`**, as everywhere else here.
 */

export {
  MAX_COLOPHON_LINKS,
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_PHONE,
  checkDiscord,
  checkEmail,
  checkPhone,
  dialString,
  emptyColophon
} from './colophon.constants'

/**
 * The stored record.
 *
 * ## Permissive on purpose
 *
 * No `.max()` on any field, the arrangement `ReleaseDistributionSchema`
 * records: this is read with `safeParse`, and a strict field would make the
 * whole record unreadable over one long value rather than refuse the next
 * write. The rules are enforced where they belong, in `ColophonService.update`.
 *
 * ## Why the links are an artist's links
 *
 * A place to follow somebody is a platform and an address, which is exactly
 * what `ArtistLinkSchema` already is, platform table and all. A second shape
 * would be a second list of platforms to keep in step with the first.
 *
 * They are **not** the operator's own roster card, though, and that is a
 * choice rather than an oversight. The card is every address somebody can be
 * found at, kept for credits; these are the ones the website points people to,
 * a selection and an order of their own. Tying the two together would mean a
 * Beatport page added for the credits appeared in the footer too.
 */
export const ColophonSchema = z.object({
  /** Where bookings and questions are written to. */
  email: z.string().default(''),
  /** As it reads on the page. What it dials is derived: see `dialString`. */
  phone: z.string().default(''),
  /** The username people message after a booking. */
  discord: z.string().default(''),
  /** Where the website points people to follow, in the order it lists them. */
  links: z.array(ArtistLinkSchema).default([]),
  /** When the record was last filed. Zero means never. */
  updatedAt: z.number().default(0)
})
export type Colophon = z.infer<typeof ColophonSchema>

/** What one filing changes. Absent means unchanged; every field replaces. */
export const ColophonPatchSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  discord: z.string().optional(),
  /** Replaces the whole list, as every list in a patch here does. */
  links: z.array(ArtistLinkSchema).optional()
})
export type ColophonPatch = z.infer<typeof ColophonPatchSchema>
