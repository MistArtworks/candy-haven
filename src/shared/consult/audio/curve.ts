import type { EqBand } from '../engine/params';
import { filtersFor } from './filters';

// The EQ's curve, asked of the very filters that make the sound: built the
// same way (filters.ts) on a silent context of their own, and each asked
// for its response at the frequencies drawn. What the producer sees is
// what he hears, Butterworth pairs and all.

let probe: OfflineAudioContext | null = null;

/** A context that never plays, kept only to make filters to ask. */
function probeContext(): OfflineAudioContext {
  probe ??= new OfflineAudioContext(1, 1, 48000);
  return probe;
}

/** How one point shapes the sound, in dB, at each frequency. */
export function bandResponse(
  band: EqBand,
  frequencies: Float32Array<ArrayBuffer>
): Float32Array<ArrayBuffer> {
  return eqResponse([band], frequencies);
}

/** How every point together shapes it, in dB, at each frequency. */
export function eqResponse(
  bands: readonly EqBand[],
  frequencies: Float32Array<ArrayBuffer>
): Float32Array<ArrayBuffer> {
  const total = new Float32Array(frequencies.length);
  const magnitude = new Float32Array(frequencies.length);
  const phase = new Float32Array(frequencies.length);
  for (const band of bands)
    for (const filter of filtersFor(probeContext(), band)) {
      filter.getFrequencyResponse(frequencies, magnitude, phase);
      for (let i = 0; i < total.length; i++)
        total[i] += 20 * Math.log10(Math.max(magnitude[i], 1e-6));
    }
  return total;
}
