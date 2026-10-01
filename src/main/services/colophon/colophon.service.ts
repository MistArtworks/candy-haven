import type { ArtistLink } from '@shared/domain/artists'
import { checkLinkUrl, type NameCheck } from '@shared/domain/artists.constants'
import type { Colophon, ColophonPatch } from '@shared/domain/colophon'
import {
  MAX_COLOPHON_LINKS,
  checkDiscord,
  checkEmail,
  checkPhone,
  emptyColophon
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
   */
  async update(patch: ColophonPatch): Promise<Colophon> {
    const current = await this.get()

    const email = patch.email?.trim()
    const phone = patch.phone?.trim()
    const discord = patch.discord?.trim()

    if (email !== undefined) this.require(checkEmail(email))
    if (phone !== undefined) this.require(checkPhone(phone))
    if (discord !== undefined) this.require(checkDiscord(discord))

    const links = patch.links ? this.checkLinks(patch.links) : undefined

    const next: Colophon = {
      ...current,
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(discord !== undefined ? { discord } : {}),
      ...(links !== undefined ? { links } : {}),
      updatedAt: Date.now()
    }

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
   * The links, checked and trimmed, in the order given.
   *
   * The same rule the roster applies to an artist's links, because these are
   * the same object: an address that opens, and a ceiling on how many.
   */
  private checkLinks(links: readonly ArtistLink[]): ArtistLink[] {
    if (links.length > MAX_COLOPHON_LINKS) {
      throw new AppError(`The website carries at most ${MAX_COLOPHON_LINKS} links.`, {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    return links.map((link) => {
      this.require(checkLinkUrl(link.url))
      return { ...link, url: link.url.trim(), label: link.label.trim() }
    })
  }
}
