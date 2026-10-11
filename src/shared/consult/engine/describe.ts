import {
  DYNAMICS_LABEL,
  EQ_BAND_LABEL,
  EQ_BAND_READS,
  type Chain,
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

/** Each tool on a line, in the order they're heard. */
export function describeChain(chain: Chain | null): string[] {
  if (!chain) return [];
  const lines = [...chain.eq]
    .sort((a, b) => a.frequency - b.frequency)
    .map(describeBand);
  const { saturation, sidechain, width, dynamics } = chain;
  if (saturation)
    lines.push(
      `Saturation ${formatDb(saturation.drive)} drive, ${percent(saturation.mix)} mix`
    );
  if (sidechain)
    lines.push(
      `Sidechain ${sidechain.rate} at ${Number(sidechain.bpm.toFixed(2))} BPM, ${percent(sidechain.depth)} deep`
    );
  if (width) lines.push(`Stereo width ${percent(width.width)}`);
  if (dynamics)
    lines.push(
      dynamics.mode === 'limiter'
        ? `${DYNAMICS_LABEL.limiter} at ${formatDb(dynamics.threshold)}, ${formatDb(dynamics.makeup)} gain`
        : `${DYNAMICS_LABEL.compressor} ${Number(dynamics.ratio.toFixed(1))}:1 at ${formatDb(dynamics.threshold)}`
    );
  return lines;
}
