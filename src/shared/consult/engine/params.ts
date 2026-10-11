// What a producer's feedback on a track is, as plain data: the notes he
// leaves on it, at a moment or over a section he marks out, and the tools
// he puts on it, either on one section or on the whole song. One
// description, read by three things: the page he leaves it on, the
// database it's filed in, and Candy Haven, which plays the track back
// through it so Candy hears what he meant.
//
// Every control's range and default lives here, once. The page builds its
// sliders from it, the schema (spec.ts) checks against it, and Haven reads
// it too, which is why this file carries no zod: Haven's console takes the
// ranges as plain values.
//
// Shared with Candy Haven: this folder is copied there as it is (Haven's
// `npm run sync:consult`), so it imports nothing outside itself except
// zod, and only in spec.ts. Edit it here.

/** How long a producer's name may be. */
export const MAX_NAME = 60;
/** How long one note may be. */
export const MAX_NOTE = 1000;
/** Notes one piece of feedback may hold. */
export const MAX_NOTES = 60;
/** Sections one piece of feedback may put tools on. */
export const MAX_CHAINED_SECTIONS = 12;
/** EQ points one set of tools may hold. */
export const MAX_EQ_BANDS = 8;
/** Ids are made by the page; this only bounds them. */
export const MAX_ID = 40;
/** The shortest section, in seconds: anything shorter is a moment. */
export const MIN_SECTION_SECONDS = 0.5;
/** The longest track anything here is checked against, in seconds. */
export const MAX_SECONDS = 4 * 60 * 60;

// ------------------------------------------------------------------- the EQ

export const EQ_BAND_TYPES = [
  'lowcut',
  'lowshelf',
  'bell',
  'notch',
  'bandpass',
  'highshelf',
  'highcut'
] as const;
export type EqBandType = (typeof EQ_BAND_TYPES)[number];

export const EQ_BAND_LABEL: Record<EqBandType, string> = {
  lowcut: 'Low cut',
  lowshelf: 'Low shelf',
  bell: 'Bell',
  notch: 'Notch',
  bandpass: 'Band pass',
  highshelf: 'High shelf',
  highcut: 'High cut'
};

/** Where a new point of each kind starts, in Hz. */
export const EQ_BAND_FREQUENCY: Record<EqBandType, number> = {
  lowcut: 40,
  lowshelf: 120,
  bell: 1000,
  notch: 3000,
  bandpass: 1000,
  highshelf: 8000,
  highcut: 16000
};

/** Which of a point's values its kind reads. */
export const EQ_BAND_READS: Record<
  EqBandType,
  { gain: boolean; q: boolean; slope: boolean }
> = {
  lowcut: { gain: false, q: false, slope: true },
  lowshelf: { gain: true, q: false, slope: false },
  bell: { gain: true, q: true, slope: false },
  notch: { gain: false, q: true, slope: false },
  bandpass: { gain: false, q: true, slope: false },
  highshelf: { gain: true, q: false, slope: false },
  highcut: { gain: false, q: false, slope: true }
};

/** How steep a cut falls, in dB per octave. */
export const CUT_SLOPES = [12, 24] as const;
export type CutSlope = (typeof CUT_SLOPES)[number];

export interface EqBand {
  /** Stable while it's edited, so the editor follows one point. */
  id: string;
  type: EqBandType;
  /** In Hz. */
  frequency: number;
  /** In dB. Read by bells and shelves; the rest ignore it. */
  gain: number;
  /** Read by bells, notches and band passes. */
  q: number;
  /** Read by cuts. */
  slope: CutSlope;
}

// --------------------------------------------------------- the other tools

export interface Saturation {
  /** In dB: how hard it's pushed into the curve. */
  drive: number;
  /** 0 to 1: how much of the pushed sound is heard against the clean. */
  mix: number;
  /** In dB, after it. */
  output: number;
}

/** How often the sidechain ducks: a whole bar, half, a beat, half a beat. */
export const SIDECHAIN_RATES = ['1/1', '1/2', '1/4', '1/8'] as const;
export type SidechainRate = (typeof SIDECHAIN_RATES)[number];

/** Beats between ducks, at each rate. */
export const RATE_BEATS: Record<SidechainRate, number> = {
  '1/1': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 0.5
};

/**
 * Ducking on the beat: what a sidechain from the kick sounds like, without
 * the kick. The producer can't route Candy's kick from a web page, so he
 * shows the movement instead.
 */
export interface Sidechain {
  bpm: number;
  rate: SidechainRate;
  /** 0 to 1: how far down each duck goes. */
  depth: number;
  /** 0 to 1: how much of the step it takes to come back up. */
  release: number;
  /** In ms: slides the ducks against the track, so they land on the kick. */
  offset: number;
}

export interface Width {
  /** 0 is mono, 1 as it is, 2 twice as wide. */
  width: number;
}

export const DYNAMICS_MODES = ['compressor', 'limiter'] as const;
export type DynamicsMode = (typeof DYNAMICS_MODES)[number];

export const DYNAMICS_LABEL: Record<DynamicsMode, string> = {
  compressor: 'Compressor',
  limiter: 'Limiter'
};

export interface Dynamics {
  mode: DynamicsMode;
  /** In dB. */
  threshold: number;
  /** n to 1. */
  ratio: number;
  /** In dB. */
  knee: number;
  /** In seconds. */
  attack: number;
  /** In seconds. */
  release: number;
  /** In dB, after it. */
  makeup: number;
}

/**
 * One set of tools, in the order they're heard: the EQ, then saturation,
 * the sidechain, the width and the dynamics last, as a master bus would
 * have them. Each is there or isn't; the EQ is there with no points.
 */
export interface Chain {
  eq: EqBand[];
  saturation: Saturation | null;
  sidechain: Sidechain | null;
  width: Width | null;
  dynamics: Dynamics | null;
}

export const TOOL_KINDS = [
  'eq',
  'saturation',
  'sidechain',
  'width',
  'dynamics'
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_LABEL: Record<ToolKind, string> = {
  eq: 'EQ',
  saturation: 'Saturation',
  sidechain: 'Sidechain',
  width: 'Stereo width',
  dynamics: 'Dynamics'
};

// ------------------------------------------------------------- the feedback

/**
 * Something said about the track: at one moment (`end` null), or over a
 * section. Only a section carries tools, since a moment has no length to
 * hear them over.
 */
export interface Note {
  id: string;
  /** Seconds into the track. */
  at: number;
  /** A section's end, in seconds; null for a moment. */
  end: number | null;
  text: string;
  chain: Chain | null;
}

/** One producer's feedback, as he submits it. */
export interface Feedback {
  name: string;
  notes: Note[];
  /** Tools for the whole song. */
  chain: Chain | null;
}

// ------------------------------------------------------------------ ranges

/** A control's limits, its default, how it steps and what it reads in. */
export interface Range {
  min: number;
  max: number;
  step: number;
  initial: number;
  unit: string;
}

export const RANGES = {
  frequency: { min: 20, max: 20000, step: 1, initial: 1000, unit: 'Hz' },
  gain: { min: -18, max: 18, step: 0.1, initial: 0, unit: 'dB' },
  q: { min: 0.1, max: 18, step: 0.01, initial: 0.9, unit: '' },
  drive: { min: 0, max: 24, step: 0.1, initial: 6, unit: 'dB' },
  mix: { min: 0, max: 1, step: 0.01, initial: 0.5, unit: '' },
  output: { min: -18, max: 6, step: 0.1, initial: 0, unit: 'dB' },
  bpm: { min: 60, max: 200, step: 0.01, initial: 124, unit: 'BPM' },
  depth: { min: 0, max: 1, step: 0.01, initial: 0.6, unit: '' },
  release: { min: 0.1, max: 0.95, step: 0.01, initial: 0.6, unit: '' },
  offset: { min: -250, max: 250, step: 1, initial: 0, unit: 'ms' },
  width: { min: 0, max: 2, step: 0.01, initial: 1.2, unit: '' },
  threshold: { min: -60, max: 0, step: 0.1, initial: -18, unit: 'dB' },
  ratio: { min: 1, max: 20, step: 0.1, initial: 4, unit: ':1' },
  knee: { min: 0, max: 40, step: 0.1, initial: 6, unit: 'dB' },
  attack: { min: 0.001, max: 0.3, step: 0.001, initial: 0.01, unit: 's' },
  dynamicsRelease: { min: 0.01, max: 1, step: 0.01, initial: 0.2, unit: 's' },
  makeup: { min: 0, max: 24, step: 0.1, initial: 0, unit: 'dB' }
} as const satisfies Record<string, Range>;

export type RangeName = keyof typeof RANGES;

/** A value brought inside its range, and onto its step. */
export function clampTo(range: Range, value: number): number {
  if (!Number.isFinite(value)) return range.initial;
  const stepped = Math.round(value / range.step) * range.step;
  // Rounding to the step can land a hair outside it in floating point.
  const fixed = Number(stepped.toFixed(6));
  return Math.min(range.max, Math.max(range.min, fixed));
}

// ------------------------------------------------------------- new things

export function newBand(
  id: string,
  type: EqBandType,
  frequency?: number
): EqBand {
  return {
    id,
    type,
    frequency: clampTo(RANGES.frequency, frequency ?? EQ_BAND_FREQUENCY[type]),
    gain: 0,
    q: type === 'notch' ? 6 : RANGES.q.initial,
    slope: 24
  };
}

export const newSaturation = (): Saturation => ({
  drive: RANGES.drive.initial,
  mix: RANGES.mix.initial,
  output: RANGES.output.initial
});

export const newSidechain = (bpm?: number | null): Sidechain => ({
  bpm: clampTo(RANGES.bpm, bpm ?? RANGES.bpm.initial),
  rate: '1/4',
  depth: RANGES.depth.initial,
  release: RANGES.release.initial,
  offset: RANGES.offset.initial
});

export const newWidth = (): Width => ({ width: RANGES.width.initial });

/** A compressor as the controls start, or the limiter's own settings. */
export function newDynamics(mode: DynamicsMode): Dynamics {
  return mode === 'limiter'
    ? {
        mode,
        threshold: -6,
        ratio: 20,
        knee: 0,
        attack: 0.002,
        release: 0.1,
        makeup: 3
      }
    : {
        mode,
        threshold: RANGES.threshold.initial,
        ratio: RANGES.ratio.initial,
        knee: RANGES.knee.initial,
        attack: RANGES.attack.initial,
        release: RANGES.dynamicsRelease.initial,
        makeup: RANGES.makeup.initial
      };
}

export const emptyChain = (): Chain => ({
  eq: [],
  saturation: null,
  sidechain: null,
  width: null,
  dynamics: null
});

/** True for no tools at all, or an EQ with every point flat and no others. */
export function chainIsEmpty(chain: Chain | null | undefined): boolean {
  if (!chain) return true;
  const shaping = chain.eq.some(
    (band) => !EQ_BAND_READS[band.type].gain || band.gain !== 0
  );
  return (
    !shaping &&
    !chain.saturation &&
    !chain.sidechain &&
    !chain.width &&
    !chain.dynamics
  );
}

/** Whether a note marks out a section rather than a moment. */
export const isSection = (note: Pick<Note, 'end'>): boolean =>
  note.end !== null;
