import type { Chain, Note } from './params';

// When things happen, in track time: which sections are sounding at a
// moment, and where their edges fall. The audio graph turns these into
// scheduled changes; kept here, without any audio, so the arithmetic can
// be checked on its own.

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
