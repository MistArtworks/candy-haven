import {
  DYNAMICS_LABEL,
  EQ_BAND_LABEL,
  EQ_BAND_READS,
  deviceTitle,
  type Chain,
  type Device,
  type EqBand
} from './params';

// Tools in words: what Candy reads before he listens, "Bell +4 dB at
// 1.5 kHz, Q 0.9". The same wording on the page, where the producer checks
// what he's about to send.

/** 80 Hz, 1.5 kHz, 16 kHz. */
export function formatHz(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  const khz = hz / 1000;
  return `${khz < 10 ? Number(khz.toFixed(1)) : Math.round(khz)} kHz`;
}

/** +4 dB, −3.5 dB, 0 dB. The minus is a real one. */
export function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  if (rounded === 0) return '0 dB';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} dB`;
}

/** 1:23, or 1:02:03 past an hour. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** 1:20, or 1:20–1:45 for a section. */
export const formatSpan = (at: number, end: number | null) =>
  end === null ? formatClock(at) : `${formatClock(at)}–${formatClock(end)}`;

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatQ = (q: number) => `Q ${Number(q.toFixed(2))}`;

export function describeBand(band: EqBand): string {
  const reads = EQ_BAND_READS[band.type];
  const name = EQ_BAND_LABEL[band.type];
  const at = formatHz(band.frequency);
  if (reads.slope) return `${name} ${at}, ${band.slope} dB/oct`;
  if (reads.gain && reads.q)
    return `${name} ${formatDb(band.gain)} at ${at}, ${formatQ(band.q)}`;
  if (reads.gain) return `${name} ${formatDb(band.gain)} at ${at}`;
  return `${name} at ${at}, ${formatQ(band.q)}`;
}

/**
 * What one device does, a line each: an EQ's points from the lowest up,
 * or the one setting the others come down to.
 */
export function describeDevice(device: Device): string[] {
  switch (device.kind) {
    case 'eq':
      return [...device.bands]
        .sort((a, b) => a.frequency - b.frequency)
        .map(describeBand);
    case 'width':
      return [`Stereo width ${percent(device.width.width)}`];
    case 'dynamics': {
      const { dynamics } = device;
      return [
        dynamics.mode === 'limiter'
          ? `${DYNAMICS_LABEL.limiter} at ${formatDb(dynamics.threshold)}, ${formatDb(dynamics.makeup)} gain`
          : `${DYNAMICS_LABEL.compressor} ${Number(dynamics.ratio.toFixed(1))}:1 at ${formatDb(dynamics.threshold)}`
      ];
    }
  }
}

/** A device in a few words, for its tile: `3 points`, `120%`, `4:1 at −18 dB`. */
export function summarizeDevice(device: Device): string {
  switch (device.kind) {
    case 'eq': {
      const count = device.bands.length;
      if (count === 0) return 'No points yet';
      if (count === 1) return describeBand(device.bands[0]);
      return `${count} points`;
    }
    case 'width':
      return percent(device.width.width);
    case 'dynamics': {
      const { dynamics } = device;
      return dynamics.mode === 'limiter'
        ? `Limit at ${formatDb(dynamics.threshold)}`
        : `${Number(dynamics.ratio.toFixed(1))}:1 at ${formatDb(dynamics.threshold)}`;
    }
  }
}

/**
 * Each device's lines, in the order they're heard. A device switched off
 * says so; where a chain has two of a kind, each line names its device.
 */
export function describeChain(chain: Chain | null): string[] {
  if (!chain) return [];
  return chain.devices.flatMap((device) => {
    const lines = describeDevice(device);
    const many =
      chain.devices.filter((other) => other.kind === device.kind).length > 1;
    const named = many
      ? lines.map((line) => `${deviceTitle(chain, device)}: ${line}`)
      : lines;
    return device.on ? named : named.map((line) => `${line} (off)`);
  });
}
