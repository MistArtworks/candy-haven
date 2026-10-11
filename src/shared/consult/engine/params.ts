// What a producer's feedback on a track is, as plain data: the notes he
// leaves on it, at a moment or over a section he marks out, and the tools
// he puts on it, either on one section or on the whole song. One
// description, read by three things: the page he leaves it on, the
// database it's filed in, and Candy Haven, which plays the track back
// through it so Candy hears what he meant.
//
// The tools are a chain of devices, as in a DAW: EQs (as many as he
// likes), stereo width and dynamics, in the order he lays them, each
// switched on or off.
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
/** Devices one chain may hold. */
export const MAX_DEVICES = 8;
/** Points one EQ may hold. */
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

// --------------------------------------------------------- width, dynamics

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

// ---------------------------------------------------------------- devices

export const DEVICE_KINDS = ['eq', 'width', 'dynamics'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_LABEL: Record<DeviceKind, string> = {
  eq: 'EQ',
  width: 'Stereo width',
  dynamics: 'Dynamics'
};

interface DeviceBase {
  /** Stable while it's edited and moved, so the page follows one device. */
  id: string;
  /** Switched off, it stays in the chain but isn't heard. */
  on: boolean;
}

export interface EqDevice extends DeviceBase {
  kind: 'eq';
  bands: EqBand[];
}

export interface WidthDevice extends DeviceBase {
  kind: 'width';
  width: Width;
}

export interface DynamicsDevice extends DeviceBase {
  kind: 'dynamics';
  dynamics: Dynamics;
}

export type Device = EqDevice | WidthDevice | DynamicsDevice;

/**
 * One set of tools: devices in the order they're heard, the first first,
 * as a DAW's chain has them. An EQ may come more than once.
 */
export interface Chain {
  devices: Device[];
}

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

/** A device as it's first put in a chain: an EQ with no points, the others at their defaults. */
export function newDevice(kind: DeviceKind, id: string): Device {
  switch (kind) {
    case 'eq':
      return { id, kind, on: true, bands: [] };
    case 'width':
      return { id, kind, on: true, width: newWidth() };
    case 'dynamics':
      return { id, kind, on: true, dynamics: newDynamics('compressor') };
  }
}

/** No tools at all. */
export const emptyChain = (): Chain => ({ devices: [] });

/** A chain as the page starts one: an EQ in it, ready for points. */
export const startingChain = (id: string): Chain => ({
  devices: [newDevice('eq', id)]
});

/**
 * Whether a device does nothing to the sound, set as it is: an EQ with
 * every point flat (or none), a width left at as it is. Dynamics always
 * does something. Whether it's switched on doesn't come into it: a device
 * switched off is still what he set.
 */
export function deviceIsNeutral(device: Device): boolean {
  switch (device.kind) {
    case 'eq':
      return !device.bands.some(
        (band) => !EQ_BAND_READS[band.type].gain || band.gain !== 0
      );
    case 'width':
      return device.width.width === 1;
    case 'dynamics':
      return false;
  }
}

/** True for no devices, or only ones that leave the sound as it is. */
export function chainIsEmpty(chain: Chain | null | undefined): boolean {
  if (!chain) return true;
  return chain.devices.every(deviceIsNeutral);
}

/** The devices a chain plays: those switched on, in order. */
export const heardDevices = (chain: Chain | null | undefined): Device[] =>
  chain ? chain.devices.filter((device) => device.on) : [];

/**
 * A device's name in its chain: `EQ`, and `EQ 2`, `EQ 3` for the ones
 * after it, so two of a kind can be told apart.
 */
export function deviceTitle(chain: Chain, device: Device): string {
  const same = chain.devices.filter((other) => other.kind === device.kind);
  const place = same.findIndex((other) => other.id === device.id);
  const label = DEVICE_LABEL[device.kind];
  return same.length > 1 && place > 0 ? `${label} ${place + 1}` : label;
}

/**
 * A chain as feedback stored it before devices: `{ eq, saturation,
 * sidechain, width, dynamics }`, a fixed order. Its EQ, width and dynamics
 * come over as devices, in that order, switched on; saturation and the
 * sidechain are left behind, since nothing plays them any more. Anything
 * else is handed back as it is, for the schema to judge.
 */
export function upgradeChain(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || 'devices' in raw) return raw;
  const old = raw as {
    eq?: unknown;
    width?: unknown;
    dynamics?: unknown;
  };
  if (!Array.isArray(old.eq)) return raw;
  const devices: unknown[] = [];
  if (old.eq.length > 0)
    devices.push({ id: 'eq', kind: 'eq', on: true, bands: old.eq });
  if (old.width)
    devices.push({ id: 'width', kind: 'width', on: true, width: old.width });
  if (old.dynamics)
    devices.push({
      id: 'dynamics',
      kind: 'dynamics',
      on: true,
      dynamics: old.dynamics
    });
  return { devices };
}

/** Whether a note marks out a section rather than a moment. */
export const isSection = (note: Pick<Note, 'end'>): boolean =>
  note.end !== null;
