import type { GradeSettings } from '@shared/domain/darkroom'
import { buildGradeTable, luminance } from '@shared/domain/darkroom'

/**
 * Applies a grade to pixels, in place.
 *
 * The one function both the preview and the export go through, so what is
 * written to disk cannot drift from what was on screen — the failure this
 * arrangement exists to prevent is an export path that quietly re-implements
 * the pipeline and gets one stage's order wrong.
 *
 * Everything expensive already happened: `buildGradeTable` collapsed exposure,
 * contrast, levels, gamma, the curve and the ramp into 768 bytes. What is left
 * per pixel is one luminance, one table read, and — only when the operator has
 * moved them off their defaults — the two controls that genuinely depend on the
 * original pixel rather than on its luminance.
 */
export function applyGrade(image: ImageData, settings: GradeSettings): void {
  const table = buildGradeTable(settings)
  const data = image.data

  const amount = settings.amount
  const saturation = settings.saturation

  // Hoisted out of the loop: on a 24-megapixel image these two branches are
  // the difference between three multiplications per pixel and none.
  const blends = amount < 1
  const desaturates = saturation !== 1

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const index = Math.round(luminance(r, g, b)) * 3
    let nr = table[index]
    let ng = table[index + 1]
    let nb = table[index + 2]

    if (desaturates) {
      // Pivot each channel about the mapped colour's own luminance, so 0 gives
      // greyscale and values above 1 push outward without shifting hue.
      const grey = luminance(nr, ng, nb)
      nr = grey + (nr - grey) * saturation
      ng = grey + (ng - grey) * saturation
      nb = grey + (nb - grey) * saturation
    }

    if (blends) {
      nr = r + (nr - r) * amount
      ng = g + (ng - g) * amount
      nb = b + (nb - b) * amount
    }

    data[i] = nr
    data[i + 1] = ng
    data[i + 2] = nb
    // Alpha is left exactly as it was. A grade decides colour, not coverage.
  }
}

/**
 * Draws a bitmap through a grade onto a canvas at the bitmap's own size.
 *
 * Used for the export. The preview draws at panel size instead — see
 * `Viewer.tsx` — because fitting is a display concern, and exporting whatever
 * the preview happened to be scaled to would silently downscale the operator's
 * image.
 */
export function renderToCanvas(
  source: ImageBitmap,
  settings: GradeSettings,
  canvas: HTMLCanvasElement
): void {
  canvas.width = source.width
  canvas.height = source.height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not get a 2D context for the export canvas.')

  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, source.width, source.height)
  applyGrade(image, settings)
  context.putImageData(image, 0, 0)
}
