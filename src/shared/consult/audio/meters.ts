// Meters on what's heard: loudness as ITU-R BS.1770 measures it, and the
// left and right signals for an oscilloscope and a stereo imager. They
// hang off a node after the tools, so they read the track as it sounds,
// the A/B's "as it is" included.
//
// Built from plain nodes, with no AudioWorklet (Candy Haven's page may
// not load one from a blob, and only .ts files are shared with it): a
// two-channel gain, so a mono track reads in both sides; a splitter; per
// side, an analyser for the pictures, and the standard's two K-weighting
// filters into a long analyser for loudness.
//
// Momentary loudness is the weighted mean square over the last 400 ms,
// read whenever the meter is drawn. While the track plays, it's also
// taken every 100 ms of audio: the standard's overlapping 400 ms blocks.
// Short-term is the last 3 s of those, and integrated is all of them,
// gated as the standard gates them.

/** Loudness in LUFS; -Infinity where there's nothing to measure yet. */
export interface Loudness {
  momentary: number;
  shortTerm: number;
  integrated: number;
}

export interface MeterReading {
  /** The latest samples on each side, for the scope and the imager. */
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  loudness: Loudness;
  /** -1 (out of phase) to +1 (mono); NaN in silence. */
  correlation: number;
}

export interface Meters {
  /**
   * What the meters read now. While `playing`, the 100 ms blocks that
   * short-term and integrated loudness are made of are taken too.
   */
  read(playing: boolean): MeterReading;
  /** Integrated loudness starts again. */
  reset(): void;
  /** Off the tap, and every node let go. */
  dispose(): void;
}

/** Samples the pictures are drawn from: some 46 ms at 44.1 kHz. */
const PICTURE_SAMPLES = 2048;
/** The loudness analyser's buffer: the longest an analyser keeps. */
const LOUDNESS_SAMPLES = 32768;
const BLOCK_SECONDS = 0.4;
const STEP_SECONDS = 0.1;
/** Blocks in a short-term reading: 400 ms, then every 100 ms, to 3 s. */
const SHORT_TERM_BLOCKS = 27;
/** The standard's absolute gate, in LUFS, and its relative one, in LU. */
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

export interface Biquad {
  /** Feedforward, then feedback, as IIRFilterNode takes them. */
  b: number[];
  a: number[];
}

/**
 * The standard's K-weighting at a sample rate: a shelf of about +4 dB
 * above 1.5 kHz (the head), then a high-pass at about 38 Hz (the RLB
 * curve). Worked out for the rate from the filters' own definitions, as
 * the reference meters do, rather than taken from the 48 kHz table.
 */
export function kWeighting(sampleRate: number): {
  shelf: Biquad;
  highpass: Biquad;
} {
  const f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  const q = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = 10 ** (gain / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / q + k * k;
  const shelf: Biquad = {
    b: [
      (vh + (vb * k) / q + k * k) / a0,
      (2 * (k * k - vh)) / a0,
      (vh - (vb * k) / q + k * k) / a0
    ],
    a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0]
  };

  const f1 = 38.13547087602444;
  const q1 = 0.5003270373238773;
  const k1 = Math.tan((Math.PI * f1) / sampleRate);
  const a1 = 1 + k1 / q1 + k1 * k1;
  const highpass: Biquad = {
    b: [1, -2, 1],
    a: [1, (2 * (k1 * k1 - 1)) / a1, (1 - k1 / q1 + k1 * k1) / a1]
  };
  return { shelf, highpass };
}

/** A K-weighted mean square, summed over the channels, as LUFS. */
export const lufsOf = (energy: number): number =>
  energy > 0 ? -0.691 + 10 * Math.log10(energy) : -Infinity;

const mean = (values: readonly number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

/**
 * Integrated loudness from 400 ms blocks' energies: those above the
 * absolute gate, then those within 10 LU of their own loudness.
 */
export function gatedLoudness(energies: readonly number[]): number {
  const loud = energies.filter((z) => lufsOf(z) > ABSOLUTE_GATE);
  if (loud.length === 0) return -Infinity;
  const gate = lufsOf(mean(loud)) + RELATIVE_GATE;
  const kept = loud.filter((z) => lufsOf(z) > gate);
  return lufsOf(mean(kept));
}

/** How alike the two sides are: +1 the same, 0 unrelated, -1 opposite. */
export function correlationOf(
  left: ArrayLike<number>,
  right: ArrayLike<number>
): number {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < left.length; i++) {
    lr += left[i] * right[i];
    ll += left[i] * left[i];
    rr += right[i] * right[i];
  }
  const scale = Math.sqrt(ll * rr);
  return scale > 1e-9 ? Math.min(1, Math.max(-1, lr / scale)) : NaN;
}

/** The mean square of a buffer's last `count` samples. */
function meanSquare(samples: Float32Array, count: number): number {
  let sum = 0;
  for (let i = samples.length - count; i < samples.length; i++)
    sum += samples[i] * samples[i];
  return sum / count;
}

export function createMeters(
  context: BaseAudioContext,
  tap: AudioNode
): Meters {
  const stereo = context.createGain();
  stereo.channelCount = 2;
  stereo.channelCountMode = 'explicit';
  stereo.channelInterpretation = 'speakers';
  const splitter = context.createChannelSplitter(2);
  tap.connect(stereo);
  stereo.connect(splitter);

  const { shelf, highpass } = kWeighting(context.sampleRate);
  const sides = ([0, 1] as const).map((channel) => {
    const picture = context.createAnalyser();
    picture.fftSize = PICTURE_SAMPLES;
    picture.smoothingTimeConstant = 0;
    splitter.connect(picture, channel);

    const head = context.createIIRFilter(shelf.b, shelf.a);
    const tail = context.createIIRFilter(highpass.b, highpass.a);
    const weighted = context.createAnalyser();
    weighted.fftSize = LOUDNESS_SAMPLES;
    weighted.smoothingTimeConstant = 0;
    splitter.connect(head, channel);
    head.connect(tail).connect(weighted);

    return {
      picture,
      weighted,
      nodes: [picture, head, tail, weighted],
      samples: new Float32Array(PICTURE_SAMPLES),
      loudness: new Float32Array(LOUDNESS_SAMPLES)
    };
  });

  // At 96 kHz 400 ms is more than an analyser keeps: the most it does, then.
  const span = Math.min(
    LOUDNESS_SAMPLES,
    Math.round(context.sampleRate * BLOCK_SECONDS)
  );
  let blocks: number[] = [];
  let integrated = -Infinity;
  let nextBlock = 0;

  /** The weighted energy of the last 400 ms, both sides together. */
  const energy = () =>
    sides.reduce((sum, side) => {
      side.weighted.getFloatTimeDomainData(side.loudness);
      return sum + meanSquare(side.loudness, span);
    }, 0);

  return {
    read(playing) {
      for (const side of sides)
        side.picture.getFloatTimeDomainData(side.samples);
      const now = energy();
      if (playing) {
        const time = context.currentTime;
        // Behind by more than a block (a tab in the background, a pause):
        // start the blocks again from here rather than catching up.
        if (time >= nextBlock + BLOCK_SECONDS || nextBlock === 0)
          nextBlock = time;
        if (time >= nextBlock) {
          blocks.push(now);
          nextBlock += STEP_SECONDS;
          integrated = gatedLoudness(blocks);
        }
      }
      const [left, right] = sides;
      return {
        left: left.samples,
        right: right.samples,
        loudness: {
          momentary: lufsOf(now),
          shortTerm: blocks.length
            ? lufsOf(mean(blocks.slice(-SHORT_TERM_BLOCKS)))
            : -Infinity,
          integrated
        },
        correlation: correlationOf(left.samples, right.samples)
      };
    },
    reset() {
      blocks = [];
      integrated = -Infinity;
      nextBlock = 0;
    },
    dispose() {
      tap.disconnect(stereo);
      stereo.disconnect();
      splitter.disconnect();
      for (const side of sides)
        for (const node of side.nodes) node.disconnect();
    }
  };
}
