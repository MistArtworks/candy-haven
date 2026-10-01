import type { NameCheck } from '@shared/domain/artists.constants'
import type { Colophon, ColophonPatch, ColophonProfiles } from '@shared/domain/colophon'
import {
  COLOPHON_DETAILS,
  checkDetail,
  checkProfileUrl,
  emptyColophon,
  isProfilePlatform
} from '@shared/domain/colophon.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import { ColophonRepository } from './colophon.repository'

const logger = getLogger('colophon')

/**
 * COLOPHON: the details the website carries.
 *
 * The first department of PUBLICATION, and the quietest service in the
 * console: it touches no file and no other collection. The website is meant
 * to be a projection of this console's records rather than a second place
 * they are typed (docs/PROJECT_CONTEXT.md §14), and this is the first record
 * it will project. Until something publishes it, it is kept here and read by
 * nothing but its own page.
 *
 * Every rule is checked here as well as on the page. The page checks so it can
 * say what is wrong while the field is being typed; this checks because the
 * page is not the only thing that will ever write a colophon, and a record the
 * website is built from must not hold an address that is not one.
 */
export class ColophonService {
  constructor(private readonly archive: ArchiveService) {}

  private get repository(): ColophonRepository {
    return new ColophonRepository(this.archive.getDb())
  }

  /** The record, or an empty one when nothing has been filed. */
  async get(): Promise<Colophon> {
    return (await this.repository.read()) ?? emptyColophon()
  }

  /**
   * Files what changed, and returns the record as stored.
   *
   * Text is trimmed before it is checked, so `  name@site.com ` is stored as
   * the address it plainly is rather than refused for its spaces. Nothing else
   * is normalised: a phone number is kept as it was spaced and a username as it
   * was typed, and a value that breaks a rule is refused with the rule rather
   * than quietly corrected into something the operator did not write.
   *
   * Everything is checked before anything is written, so a refusal on the
   * last field leaves the record exactly as it was.
   */
  async update(patch: ColophonPatch): Promise<Colophon> {
    const current = await this.get()
    const next: Colophon = { ...current }

    for (const detail of COLOPHON_DETAILS) {
      const raw = patch[detail]
      if (raw === undefined) continue
      const value = raw.trim()
      this.require(checkDetail(detail, value))
      next[detail] = value
    }

    if (patch.profiles) next.profiles = this.checkProfiles(current.profiles, patch.profiles)

    next.updatedAt = Date.now()
    await this.repository.write(next)
    logger.info('Filed the colophon')
    return next
  }

  // ----------------------------------------------------------------- private

  private require(check: NameCheck): void {
    if (check.ok) return
    throw new AppError(check.reason ?? 'That detail cannot be stored.', {
      code: ErrorCode.Validation,
      recoverable: false
    })
  }

  /**
   * The profiles, with the named platforms changed and checked.
   *
   * Only the platforms the patch names are touched; the rest keep what they
   * hold. A platform the colophon does not know is refused rather than
   * dropped: dropping it would file something other than what was sent and say
   * nothing. Each address is trimmed and must be on its own platform, the rule
   * `checkProfileUrl` states.
   */
  private checkProfiles(
    current: Readonly<ColophonProfiles>,
    patch: Readonly<Record<string, string>>
  ): ColophonProfiles {
    const next = { ...current }
    for (const [platform, raw] of Object.entries(patch)) {
      if (!isProfilePlatform(platform)) {
        this.require({ ok: false, reason: `The colophon has no platform called ${platform}.` })
        continue
      }
      const url = raw.trim()
      this.require(checkProfileUrl(platform, url))
      next[platform] = url
    }
    return next
  }
}
