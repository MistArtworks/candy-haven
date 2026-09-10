/**
 * Offline analysis of an admitted file.
 *
 * Only the envelope is surveyed. WAVEFORM shows the operator what is *coming*
 * as well as what has gone — the playhead sits at the centre of the stage and
 * the material slides through it — which a live analyser cannot do, since by
 * definition it only knows the past. SPECTRAL is drawn live and scrolls from
 * the right, and wants nothing from here.
 *
 * Pure, and takes an `AudioBuffer`. It runs on the main thread because channel
 * data cannot reach a worker without being copied first, and a copy of the
 * decoded audio is the one allocation worth avoiding.
 */

// ------------------------------------------------------------------- envelope

/** Values held per column of the envelope: trough, crest, tone. */
export const PEAK_STRIDE = 3

/**
 * Envelope resolution, in columns per second of audio.
 *
 * Fixed against *time* rather than against the file, because the overview is
 * zoomable: a fixed number of columns spread over the whole file gives a
 * four-minute track fine detail and an hour-long set almost none, and the
 * zoomed view would then be a handful of blocks stretched across the stage. At
 * 160 a column is about six milliseconds, which is a little finer than one
 * pixel at the tightest zoom on a wide stage — past that there is nothing
 * further to see, and the render aggregates it back down anyway.
 */
export const BUCKETS_PER_SECOND = 160

/** Ceiling on the envelope, so a pathologically long file cannot exhaust memory. */
const MAX_BUCKETS = 600_000

/**
 * The largest number of frames read per column when surveying.
 *
 * Without a stride, surveying is O(frames × channels). Sampling at most this
 * many frames per column bounds the work whatever the length, and costs nothing
 * visible: a column is a pixel or two wide, and its true peak and the peak of
 * 256 frames spread across it are the same to the eye.
 */
const MAX_FRAMES_PER_BUCKET = 256

/**
 * The frequency band the colour ramp spans, in Hz.
 *
 * Read logarithmically, so an octave occupies the same amount of the ramp
 * wherever it falls. 80 Hz is about where a kick stops being a thump and 6 kHz
 * is where a hi-hat lives, which puts the two ends of the palette on the two
 * things an operator is actually looking for in an overview.
 */
const TONE_FLOOR_HZ = 80
const TONE_CEIL_HZ = 6000

/**
 * Peak amplitude and tone per column, as `[min, max, tone]` triples.
 *
 * Trough and crest are kept separately rather than reduced to one magnitude, so
 * the envelope can be drawn as the signal actually is — asymmetric where the
 * material is — instead of mirrored from a single number, which is the
 * shortcut that makes every overview look like the same sausage.
 *
 * `tone` is 0 for a column that is all bottom end and 1 for one that is all
 * top, and it is what colours the overview: crimson where the low end is
 * carrying, gold where it is not. It comes from the ratio between the signal
 * and its own first difference, which is a one-line high-pass — for a sine at
 * frequency f the RMS of `x[n] - x[n-1]` is `2·sin(πf/fs)` times the RMS of
 * `x`, so inverting that gives the frequency the column centres on. It is a
 * spectral centroid by another route, at one multiply-add per sample rather
 * than an FFT per column.
 */
export function surveyPeaks(buffer: AudioBuffer): Float32Array {
  const buckets = Math.max(
    1,
    Math.min(MAX_BUCKETS, Math.ceil(buffer.duration * BUCKETS_PER_SECOND))
  )
  const peaks = new Float32Array(buckets * PEAK_STRIDE)

  const channels: Float32Array[] = []
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel))
  }

  const framesPerBucket = buffer.length / buckets
  const stride = Math.max(1, Math.ceil(framesPerBucket / MAX_FRAMES_PER_BUCKET))

  const floor = Math.log2(TONE_FLOOR_HZ)
  const span = Math.log2(TONE_CEIL_HZ) - floor

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = Math.floor(bucket * framesPerBucket)
    const to = Math.min(buffer.length - 1, Math.floor((bucket + 1) * framesPerBucket))

    let low = 0
    let high = 0
    let energy = 0
    let edge = 0

    for (const data of channels) {
      for (let frame = from; frame < to; frame += stride) {
        const sample = data[frame]
        if (sample < low) low = sample
        else if (sample > high) high = sample

        energy += sample * sample
        // Deliberately the *adjacent* frame, not the next strided one: the
        // difference has to be taken at the sample rate or it measures a
        // different filter at every stride, and the colour would then depend on
        // how long the file is.
        const slope = data[frame + 1] - sample
        edge += slope * slope
      }
    }

    let tone = 0
    if (energy > 1e-9) {
      // ratio = 2·sin(πf/fs) for a sine at f, so asin recovers the frequency.
      const ratio = Math.min(Math.sqrt(edge / energy), 2)
      const hertz = (buffer.sampleRate / Math.PI) * Math.asin(ratio / 2)
      tone = Math.min(Math.max((Math.log2(Math.max(hertz, 1)) - floor) / span, 0), 1)
    }

    peaks[bucket * PEAK_STRIDE] = low
    peaks[bucket * PEAK_STRIDE + 1] = high
    peaks[bucket * PEAK_STRIDE + 2] = tone
  }

  return peaks
}
