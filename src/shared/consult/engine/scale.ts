import { RANGES } from './params';

// The EQ's picture: frequency across, logarithmically (an octave is the
// same width wherever it falls, as on every EQ a producer has used), gain
// up and down. Shared by the editor that moves the points and the code
// that draws the curve, so a point drawn under the pointer is the point
// the pointer moves.

const LOW = Math.log10(RANGES.frequency.min);
const SPAN = Math.log10(RANGES.frequency.max) - LOW;

/** Across the picture, from 0 at 20 Hz to `width` at 20 kHz. */
export const xForFrequency = (hz: number, width: number) =>
  ((Math.log10(Math.max(hz, RANGES.frequency.min)) - LOW) / SPAN) * width;

export const frequencyForX = (x: number, width: number) =>
  10 ** (LOW + (Math.min(Math.max(x, 0), width) / width) * SPAN);

/** The gain the picture's top and bottom stand for, in dB. */
export const EQ_VIEW_DB = 18;

/** Down the picture, from +range at the top to -range at the foot. */
export const yForGain = (db: number, height: number, range = EQ_VIEW_DB) =>
  ((range - Math.min(Math.max(db, -range), range)) / (2 * range)) * height;

export const gainForY = (y: number, height: number, range = EQ_VIEW_DB) =>
  range - (Math.min(Math.max(y, 0), height) / height) * 2 * range;

/** Frequencies spread evenly across the picture, for drawing a curve. */
export function viewFrequencies(count: number): Float32Array<ArrayBuffer> {
  const frequencies = new Float32Array(count);
  for (let i = 0; i < count; i++)
    frequencies[i] = 10 ** (LOW + (i / Math.max(1, count - 1)) * SPAN);
  return frequencies;
}

/** The lines a producer reads an EQ by. */
export const EQ_GRID_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;
