import { luminance } from '@shared/domain/darkroom'

/**
 * The source image's luminance distribution, in 256 bins, normalised to 0..1.
 *
 * Drawn behind the curve editor, where it is the difference between adjusting
 * tone by feel and adjusting it against the tones the image actually contains —
 * pulling a shadow point through a band the photograph has no pixels in does
 * nothing, and the histogram is what says so before the drag rather than after.
 *
 * Computed once per loaded image, not per grade: this describes what came in,
 * and a histogram that moved as the operator worked would no longer be the
 * reference they are working against.
 *
 * Normalised against the tallest bin rather than the pixel count, because the
 * shape is what is being read. A photograph with a large flat background puts
 * most of its pixels in one bin, and scaling by total would flatten everything
 * else to invisibility.
 */
export function buildHistogram(image: ImageData): Float32Array {
  const bins = new Float32Array(256)
  const data = image.data

  for (let i = 0; i < data.length; i += 4) {
    bins[Math.round(luminance(data[i], data[i + 1], data[i + 2]))] += 1
  }

  let peak = 0
  for (let i = 0; i < 256; i += 1) if (bins[i] > peak) peak = bins[i]
  if (peak > 0) for (let i = 0; i < 256; i += 1) bins[i] /= peak

  return bins
}

/**
 * Reads a bitmap's pixels once, at a size worth measuring.
 *
 * Capped rather than full-resolution: a histogram is a shape, and sampling a
 * 24-megapixel photograph at 1024 on its long edge produces the same shape for
 * a fraction of the work. This runs on the main thread the moment an image
 * lands, so the cost is paid where the operator is waiting.
 */
export function samplePixels(source: ImageBitmap, limit = 1024): ImageData | null {
  const scale = Math.min(1, limit / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(source, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}
