import { z } from 'zod'
import { readProfiles, type ColophonDetail } from './colophon.constants'

/**
 * Schema half of the colophon domain: the details the website carries.
 *
 * Imported by the main process to validate IPC payloads, and type-only by the
 * renderer. The field rules live in colophon.constants.ts, which is also where
 * what this record *is* is written down.
 *
 * **Every field carries a `.default()`**, as everywhere else here.
 */

export type {
  ColophonDetail,
  ColophonProfiles,
  ProfileGroup,
  ProfilePlatform
} from './colophon.constants'

export {
  COLOPHON_DETAILS,
  MAX_BASED_IN,
  MAX_DISCORD,
  MAX_EMAIL,
  MAX_NAME,
  MAX_PHONE,
  MAX_TELEGRAM,
  MAX_TIME_ZONE,
  NAVBAR_PROFILE_PLATFORMS,
  PROFILE_GROUPS,
  PROFILE_GROUP_SPEC,
  PROFILE_PLATFORMS,
  PROFILE_PLATFORM_LABEL,
  checkDetail,
  checkDiscord,
  checkEmail,
  checkName,
  checkPhone,
  checkProfileUrl,
  checkTelegram,
  checkTimeZone,
  checkWhatsApp,
  dialString,
  emptyColophon,
  emptyProfiles,
  isNavbarProfile,
  isProfilePlatform,
  localTimeZone,
  platformsIn,
  profileExample,
  profilePlatformOf,
  profilesFromLinks,
  readProfiles,
  telegramLink,
  whatsappLink
} from './colophon.constants'

/**
 * One string per detail, written out rather than built from
 * `COLOPHON_DETAILS` so the type stays exact, and checked against it with
 * `satisfies`: a detail added to the table and not here, or here and not
 * there, fails to compile.
 */
const detailShape = {
  /** Where bookings and questions are written to. */
  email: z.string().default(''),
  /** Where management is written to. */
  managementEmail: z.string().default(''),
  /** Where press and interview requests are written to. */
  pressEmail: z.string().default(''),
  /** As it reads on the page. What it dials is derived: see `dialString`. */
  phone: z.string().default(''),
  /** With its country code. The chat link is derived: see `whatsappLink`. */
  whatsapp: z.string().default(''),
  /** The username people message after a booking. */
  discord: z.string().default(''),
  /** A Telegram username. The link is derived: see `telegramLink`. */
  telegram: z.string().default(''),
  /** City and country, as the website prints them. */
  basedIn: z.string().default(''),
  /** An IANA zone, so the website can say what time it is there. */
  timeZone: z.string().default(''),
  /** Who manages the artist: a person or a company. */
  management: z.string().default(''),
  /** The booking agency, when there is one. */
  agency: z.string().default(''),
  /** The label the records are released on, when there is one. */
  label: z.string().default(''),
  /** The electronic press kit: any address that opens. */
  pressKit: z.string().default('')
} satisfies Record<ColophonDetail, z.ZodDefault<z.ZodString>>

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
 * the record unreadable. `readProfiles` gives the map its shape as it is read,
 * with every platform present and every unknown key dropped.
 *
 * They are not the operator's own roster card, and that is a choice. The card
 * is every address somebody can be found at, kept for credits; these are the
 * ones the website points people to.
 */
export const ColophonSchema = z.object({
  ...detailShape,
  /** The artist's profile on each platform, keyed by platform. */
  profiles: z
    .record(z.string(), z.string())
    .default({})
    .transform((raw) => readProfiles(raw)),
  /** When the record was last filed. Zero means never. */
  updatedAt: z.number().default(0)
})
export type Colophon = z.infer<typeof ColophonSchema>

const detailPatchShape = Object.fromEntries(
  Object.keys(detailShape).map((detail) => [detail, z.string().optional()])
) as { [K in ColophonDetail]: z.ZodOptional<z.ZodString> }

/** What one filing changes. Absent means unchanged. */
export const ColophonPatchSchema = z.object({
  ...detailPatchShape,
  /** Only the platforms named change; the rest keep what they hold. */
  profiles: z.record(z.string(), z.string()).optional()
})
export type ColophonPatch = z.infer<typeof ColophonPatchSchema>
