import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { nativeImage } from 'electron'
import type { ManagedImage } from '@shared/domain/artists'
import { PHOTO_MIN } from '@shared/domain/offerings.constants'
import { AppError, ErrorCode } from '@main/core/errors'

/**
 * A service's photo, on its way to the website.
 *
 * The website makes both shapes it shows (the card and the banner) from one
 * picture, so a picture goes once per website and is used from there. Most
 * go as they are: the website reads a phone photo's turn (its EXIF
 * orientation) itself, and makes the one lossy step. One too large for the
 * request is brought down here first, and since Electron's decoder doesn't
 * turn a picture the way its camera said, the pixels are turned here.
 */

/** Raised when the website starts making more from a photo, so every photo goes again. */
const PHOTO_VERSION = 1

/** Sent as it is up to this; a host may refuse a larger request (Vercel takes about 4.5 MB). */
const AS_IS_BYTES = 4 * 1024 * 1024

/** Brought down to this on its long side: enough for the 1600 wide banner and the card. */
const LONG_SIDE = 2400
const JPEG_QUALITY = 92

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

/** The extensions a photo can be picked as. */
export const PHOTO_EXTENSIONS = Object.keys(TYPES)

/** Which copy of a picture a website was sent, to tell a new pick from the old. */
export const photoSignature = (file: ManagedImage | null): string | null =>
  file?.copiedPath ? `${file.copiedPath}|${file.copiedAt ?? 0}|v${PHOTO_VERSION}` : null

const unusable = (message: string, hint: string): AppError =>
  new AppError(message, { code: ErrorCode.Validation, hint, recoverable: true })

/**
 * The photo as the website takes it. Refuses one this console can read and
 * that is too small for the banner, before anything is sent.
 */
export async function photoForSite(path: string): Promise<{ body: Buffer; type: string }> {
  const extension = extname(path).slice(1).toLowerCase()
  const type = TYPES[extension]
  if (!type) throw unusable('A photo is a JPEG, a PNG or a WebP.', 'Pick another file.')
  const bytes = await readFile(path).catch(() => {
    throw unusable('That photo is not where it was.', 'Pick it again.')
  })

  const image = nativeImage.createFromPath(path)
  const orientation = type === 'image/jpeg' ? jpegOrientation(bytes) : 1
  if (!image.isEmpty()) {
    const stored = image.getSize()
    const turned = orientation >= 5
    const width = turned ? stored.height : stored.width
    const height = turned ? stored.width : stored.height
    if (width < PHOTO_MIN.width || height < PHOTO_MIN.height) {
      throw unusable(
        `A service's photo needs to be at least ${PHOTO_MIN.width} pixels wide and ${PHOTO_MIN.height} tall; that one is ${width}×${height}.`,
        'Pick a larger one.'
      )
    }
    if (bytes.length <= AS_IS_BYTES) return { body: bytes, type }

    const scale = Math.min(1, LONG_SIDE / Math.max(stored.width, stored.height))
    const sized = image.resize({
      width: Math.round(stored.width * scale),
      height: Math.round(stored.height * scale),
      quality: 'best'
    })
    const size = sized.getSize()
    const upright = orient(sized.toBitmap(), size.width, size.height, orientation)
    const out = nativeImage.createFromBitmap(upright.data, {
      width: upright.width,
      height: upright.height
    })
    return { body: out.toJPEG(JPEG_QUALITY), type: 'image/jpeg' }
  }

  // A WebP Electron can't decode goes as it is, if it's small enough; the
  // website checks its size itself.
  if (type === 'image/webp' && bytes.length <= AS_IS_BYTES) return { body: bytes, type }
  throw unusable('That photo can’t be read here.', 'Save it as a JPEG and pick it again.')
}

/**
 * A JPEG's EXIF orientation, 1 to 8; 1 (as stored) when it has none or it
 * can't be read. Only the first IFD is looked at, which is where cameras
 * put it.
 */
export function jpegOrientation(bytes: Buffer): number {
  try {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1
    let offset = 2
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) return 1
      const marker = bytes[offset + 1]
      // The image data begins: there's no EXIF before it.
      if (marker === 0xda) return 1
      const length = bytes.readUInt16BE(offset + 2)
      if (marker === 0xe1 && bytes.toString('latin1', offset + 4, offset + 10) === 'Exif\0\0') {
        const tiff = offset + 10
        const little = bytes.toString('latin1', tiff, tiff + 2) === 'II'
        const read16 = (at: number): number =>
          little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at)
        const read32 = (at: number): number =>
          little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at)
        const ifd = tiff + read32(tiff + 4)
        const entries = read16(ifd)
        for (let i = 0; i < entries; i++) {
          const entry = ifd + 2 + i * 12
          if (read16(entry) === 0x0112) {
            const value = read16(entry + 8)
            return value >= 1 && value <= 8 ? value : 1
          }
        }
        return 1
      }
      offset += 2 + length
    }
    return 1
  } catch {
    return 1
  }
}

/**
 * Raw pixels (four bytes each) turned and flipped the way an EXIF
 * orientation says the picture is meant to stand.
 */
export function orient(
  pixels: Buffer,
  width: number,
  height: number,
  orientation: number
): { data: Buffer; width: number; height: number } {
  if (orientation <= 1 || orientation > 8) return { data: pixels, width, height }
  const turned = orientation >= 5
  const outWidth = turned ? height : width
  const outHeight = turned ? width : height
  const source = new Uint32Array(pixels.buffer, pixels.byteOffset, width * height)
  const out = new Uint32Array(outWidth * outHeight)
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let sx: number
      let sy: number
      switch (orientation) {
        case 2:
          sx = width - 1 - x
          sy = y
          break
        case 3:
          sx = width - 1 - x
          sy = height - 1 - y
          break
        case 4:
          sx = x
          sy = height - 1 - y
          break
        case 5:
          sx = y
          sy = x
          break
        case 6:
          sx = y
          sy = height - 1 - x
          break
        case 7:
          sx = width - 1 - y
          sy = height - 1 - x
          break
        default:
          sx = width - 1 - y
          sy = x
      }
      out[y * outWidth + x] = source[sy * width + sx]
    }
  }
  return { data: Buffer.from(out.buffer), width: outWidth, height: outHeight }
}
