// A track's waveform, small enough to send with the page: Candy Haven
// surveys the file once (its AUDITORIUM reading, three values a column:
// trough, crest and tone), and this brings it down to a fixed number of
// columns, a byte each value. The page draws it at once, without fetching
// and decoding the whole file on a producer's phone first.
//
// The bytes travel as base64 text, which both a browser and Node read
// with atob and btoa, so nothing here needs Buffer.

/** Values a column holds: trough, crest, tone. */
export const WAVEFORM_STRIDE = 3;

/**
 * Columns a waveform is kept at: twice across the widest the page draws
 * it, so it stays sharp on a high-density screen.
 */
export const WAVEFORM_COLUMNS = 2400;

/** -1..1 as a byte, and back: 0 is -1, 255 is +1. */
export const sampleToByte = (sample: number) =>
  Math.round((Math.min(Math.max(sample, -1), 1) + 1) * 127.5);
export const byteToSample = (byte: number) => byte / 127.5 - 1;

/** 0..1 as a byte, and back. */
export const unitToByte = (unit: number) =>
  Math.round(Math.min(Math.max(unit, 0), 1) * 255);
export const byteToUnit = (byte: number) => byte / 255;

/**
 * The survey brought down to `columns`: the lowest trough, the highest
 * crest and the mean tone of every survey column inside each one. A
 * survey shorter than that is kept at its own length.
 */
export function compactPeaks(
  peaks: ArrayLike<number>,
  columns: number = WAVEFORM_COLUMNS,
  stride: number = WAVEFORM_STRIDE
): Uint8Array {
  const source = Math.floor(peaks.length / stride);
  const count = Math.max(0, Math.min(columns, source));
  const bytes = new Uint8Array(count * WAVEFORM_STRIDE);
  for (let column = 0; column < count; column++) {
    const from = Math.floor((column * source) / count);
    const to = Math.max(from + 1, Math.floor(((column + 1) * source) / count));
    let low = 0;
    let high = 0;
    let tone = 0;
    for (let i = from; i < to; i++) {
      low = Math.min(low, peaks[i * stride]);
      high = Math.max(high, peaks[i * stride + 1]);
      tone += peaks[i * stride + 2];
    }
    bytes[column * WAVEFORM_STRIDE] = sampleToByte(low);
    bytes[column * WAVEFORM_STRIDE + 1] = sampleToByte(high);
    bytes[column * WAVEFORM_STRIDE + 2] = unitToByte(tone / (to - from));
  }
  return bytes;
}

/** As text, to send. */
export function encodeWaveform(bytes: Uint8Array): string {
  let binary = '';
  // In slices: one call with every byte as an argument overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Back from text, or null when it isn't a waveform this could have made. */
export function decodeWaveform(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  if (text.length > Math.ceil((WAVEFORM_COLUMNS * WAVEFORM_STRIDE * 4) / 3) + 4)
    return null;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length % WAVEFORM_STRIDE !== 0) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
