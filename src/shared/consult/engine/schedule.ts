import { RATE_BEATS, type Chain, type Note, type Sidechain } from './params';

// When things happen, in track time: which sections are sounding at a
// moment, where their edges fall, and where a sidechain ducks. The audio
// graph turns these into scheduled changes; kept here, without any audio,
// so the arithmetic can be checked on its own.

/** A section with tools on it, as the graph plays it. */
export interface ChainedSection {
  id: string;
  at: number;
  end: number;
  chain: Chain;
}

/**
 * The sections that carry tools, in the order their tools are applied:
 * by where they start, then by where they end. Where two overlap, both are
 * heard, one after the other.
 */
export function chainedSections(notes: readonly Note[]): ChainedSection[] {
  return notes
    .flatMap((note) =>
      note.end !== null && note.chain !== null
        ? [{ id: note.id, at: note.at, end: note.end, chain: note.chain }]
        : []
    )
    .sort((a, b) => a.at - b.at || a.end - b.end);
}

/** Whether a section is sounding at `time`: from its start, up to its end. */
export const covers = (
  section: Pick<ChainedSection, 'at' | 'end'>,
  time: number
): boolean => time >= section.at && time < section.end;

/** Where a section switches, between two times: after `from`, up to `to`. */
export function edgesBetween(
  section: Pick<ChainedSection, 'at' | 'end'>,
  from: number,
  to: number
): Array<{ time: number; on: boolean }> {
  return [
    { time: section.at, on: true },
    { time: section.end, on: false }
  ].filter((edge) => edge.time > from && edge.time <= to);
}

/** Seconds between two ducks. */
export const duckPeriod = (sidechain: Pick<Sidechain, 'bpm' | 'rate'>) =>
  (60 / sidechain.bpm) * RATE_BEATS[sidechain.rate];

/**
 * Where a sidechain ducks, in track seconds: after `from`, up to `to`.
 * The grid starts at the track's top, slid by the offset, which is how the
 * producer lines it up with the kick.
 */
export function duckTimes(
  sidechain: Pick<Sidechain, 'bpm' | 'rate' | 'offset'>,
  from: number,
  to: number
): number[] {
  const period = duckPeriod(sidechain);
  if (!(period > 0) || to <= from) return [];
  const shift = sidechain.offset / 1000;
  const times: number[] = [];
  // The first grid line after `from`, then every one up to `to`.
  for (
    let step = Math.floor((from - shift) / period) + 1;
    shift + step * period <= to;
    step++
  ) {
    const time = shift + step * period;
    if (time > from && time >= 0) times.push(time);
  }
  return times;
}

/** How long a duck dips for, in seconds, before it starts back up. */
export const DUCK_ATTACK = 0.004;

/**
 * The time constant a duck recovers on: the gain is most of the way back
 * (98%) by `release` of the step, as a compressor's release would bring it.
 */
export const duckRecovery = (
  sidechain: Pick<Sidechain, 'bpm' | 'rate' | 'release'>
) => (duckPeriod(sidechain) * sidechain.release) / 4;

/** The gain at the bottom of a duck. */
export const duckFloor = (sidechain: Pick<Sidechain, 'depth'>) =>
  1 - sidechain.depth;
