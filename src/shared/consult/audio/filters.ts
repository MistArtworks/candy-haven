import type { EqBand } from '../engine/params';

// An EQ point as Web Audio filters. Most points are one biquad; a 24 dB
// cut is two, at the Q values that make the pair a Butterworth (flat up
// to the corner, then falling), which is what a producer means by a clean
// low cut. Built the same way for the sound and for the curve drawn over
// it, so the picture is the sound.

/** Q for one biquad of a 12 dB/oct cut: a second-order Butterworth. */
const BUTTERWORTH_2 = Math.SQRT1_2;
/** Q for the two biquads of a 24 dB/oct cut: a fourth-order Butterworth. */
const BUTTERWORTH_4 = [0.5411961, 1.306563] as const;

interface FilterSetting {
  type: BiquadFilterType;
  q: number;
  gain: number;
}

/** What each of a point's filters is set to, apart from its frequency. */
function settingsFor(band: EqBand): FilterSetting[] {
  switch (band.type) {
    case 'lowcut':
    case 'highcut': {
      const type: BiquadFilterType =
        band.type === 'lowcut' ? 'highpass' : 'lowpass';
      const qs: readonly number[] =
        band.slope === 24 ? BUTTERWORTH_4 : [BUTTERWORTH_2];
      return qs.map((q) => ({ type, q, gain: 0 }));
    }
    case 'bell':
      return [{ type: 'peaking', q: band.q, gain: band.gain }];
    case 'lowshelf':
      return [{ type: 'lowshelf', q: 1, gain: band.gain }];
    case 'highshelf':
      return [{ type: 'highshelf', q: 1, gain: band.gain }];
    case 'notch':
      return [{ type: 'notch', q: band.q, gain: 0 }];
    case 'bandpass':
      return [{ type: 'bandpass', q: band.q, gain: 0 }];
  }
}

/** A frequency the context can play: just under half its sample rate at most. */
const playable = (context: BaseAudioContext, hz: number) =>
  Math.min(hz, context.sampleRate / 2 - 1);

export function filtersFor(
  context: BaseAudioContext,
  band: EqBand
): BiquadFilterNode[] {
  return settingsFor(band).map(({ type, q, gain }) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = playable(context, band.frequency);
    filter.Q.value = q;
    filter.gain.value = gain;
    return filter;
  });
}

/**
 * Moves a point's filters to a point of the same kind, gliding there over a
 * few milliseconds, so dragging a point is heard as a sweep, not as clicks.
 */
export function tuneFilters(
  filters: readonly BiquadFilterNode[],
  band: EqBand,
  glide: number
) {
  const settings = settingsFor(band);
  filters.forEach((filter, i) => {
    const setting = settings[i];
    if (!setting) return;
    const at = filter.context.currentTime;
    filter.frequency.setTargetAtTime(
      playable(filter.context, band.frequency),
      at,
      glide
    );
    filter.Q.setTargetAtTime(setting.q, at, glide);
    filter.gain.setTargetAtTime(setting.gain, at, glide);
  });
}
