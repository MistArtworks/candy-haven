import { z } from 'zod'

/**
 * Schema half of the colophon domain: the details the website carries.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. The field rules live in colophon.constants.ts, which is also where
 * what this record *is* is written down.
 *
 * **Every field carries a `.default()`**, as everywhere else here.
 */

export type { ColophonProfiles, ProfilePlatform } from './colophon.constants'

export {
  CORE_PROFILE_PLATFORMS,
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_PHONE,
  NAVBAR_PROFILE_PLATFORMS,
  PROFILE_PLATFORMS,
  PROFILE_PLATFORM_LABEL,
  checkDiscord,
  checkEmail,
  checkPhone,
  checkProfileUrl,
  dialString,
  emptyColophon,
  emptyProfiles,
  isCoreProfile,
  isNavbarProfile,
  isProfilePlatform,
  listedPlatforms,
  profilePlatformOf,
  profilesFromLinks,
  readProfiles
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
 * ## Why the profiles are a map
 *
 * Keyed by platform, a profile on each, because the website draws each
 * platform behind its own mark and has nowhere to put a second Spotify. The
 * keys are not an enum here, for the same reason as the missing `.max()`: a
 * platform retired from `PROFILE_PLATFORMS` should drop off the page, not make
 * the record unreadable. `readProfiles` is what gives the map its shape.
 *
 * They are not the operator's own roster card, and that is a choice. The card
 * is every address somebody can be found at, kept for credits; these are the
 * ones the website points people to.
 */
export const ColophonSchema = z.object({
  /** Where bookings and questions are written to. */
  email: z.string().default(''),
  /** As it reads on the page. What it dials is derived: see `dialString`. */
  phone: z.string().default(''),
  /** The username people message after a booking. */
  discord: z.string().default(''),
  /** The artist's profile on each platform, keyed by platform. */
  profiles: z.record(z.string(), z.string()).default({}),
  /** When the record was last filed. Zero means never. */
  updatedAt: z.number().default(0)
})
export type Colophon = z.infer<typeof ColophonSchema>

/** What one filing changes. Absent means unchanged. */
export const ColophonPatchSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  discord: z.string().optional(),
  /**
   * The whole set, as it should stand: a platform left out is taken off the
   * page. Whole rather than per platform, because removing one is a change a
   * per-platform patch could only say with a sentinel value.
   */
  profiles: z.record(z.string(), z.string()).optional()
})
export type ColophonPatch = z.infer<typeof ColophonPatchSchema>
