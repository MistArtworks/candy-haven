/**
 * How much of the file the scrolling renders show at once.
 *
 * `0` means the whole file, which is a different render rather than an extreme
 * zoom: at that setting the playhead travels across a fixed picture, and at
 * every other setting the picture travels under a fixed playhead. Both are
 * wanted — the first reads the arrangement, the second reads the moment.
 */
export const ZOOM_LEVELS = [4, 8, 16, 30, 0] as const

export type ZoomLevel = (typeof ZOOM_LEVELS)[number]

/** The label a zoom step carries in the transport. */
export function zoomLabel(seconds: ZoomLevel): string {
  return seconds === 0 ? 'ALL' : `${seconds}S`
}

/**
 * The instant under a point on the stage, as a fraction across it.
 *
 * Shared by every caller that turns a click into a seek, so the console page
 * and the detached player cannot disagree with the render about where a given
 * pixel is in the file.
 */
export function timeAtFraction(
  fraction: number,
  position: number,
  duration: number,
  zoom: ZoomLevel
): number {
  if (zoom === 0) return fraction * duration
  return position + (fraction - 0.5) * zoom
}
