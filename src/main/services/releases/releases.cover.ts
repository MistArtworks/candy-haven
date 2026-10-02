import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { nativeImage } from 'electron'
import type { DiscographyRelease } from '@shared/domain/discography'

/** The side the website keeps a cover at; it crops to a square of this. */
const SITE_COVER = 750
/** Over this, a cover this can't shrink is too big to send as it is. */
const MAX_AS_IS = 8 * 1024 * 1024

/**
 * Raised when the website starts making more from a cover than before, so
 * every cover goes once more and gets it. 2: the home page shelf's tape.
 */
const COVER_VERSION = 2

/**
 * Which copy of a release's cover it has, to compare with the one the
 * website was sent: its file, when it was copied in, and what the website
 * makes of it. Null for none.
 */
export const coverSignature = (release: DiscographyRelease): string | null =>
  release.artwork.copiedPath
    ? `${release.artwork.copiedPath}|${release.artwork.copiedAt ?? 0}|v${COVER_VERSION}`
    : null

/**
 * A cover as the website takes it: shrunk here to 750 on its shorter side,
 * without loss, so the website makes the one lossy step (to WebP) and a
 * 3000×3000 original never crosses the network. A WebP this can't decode
 * goes as it is when it's small enough; anything else stays here.
 */
export async function coverForSite(path: string): Promise<{ body: Buffer; type: string } | null> {
  const image = nativeImage.createFromPath(path)
  if (!image.isEmpty()) {
    const { width, height } = image.getSize()
    const scale = SITE_COVER / Math.min(width, height)
    const sized =
      scale < 1
        ? image.resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            quality: 'best'
          })
        : image
    return { body: sized.toPNG(), type: 'image/png' }
  }
  if (extname(path).slice(1).toLowerCase() !== 'webp') return null
  const body = await readFile(path)
  return body.length <= MAX_AS_IS ? { body, type: 'image/webp' } : null
}
