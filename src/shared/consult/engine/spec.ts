import { z } from 'zod';
import {
  CUT_SLOPES,
  DYNAMICS_MODES,
  EQ_BAND_TYPES,
  MAX_CHAINED_SECTIONS,
  MAX_EQ_BANDS,
  MAX_ID,
  MAX_NAME,
  MAX_NOTE,
  MAX_NOTES,
  MAX_SECONDS,
  MIN_SECTION_SECONDS,
  RANGES,
  SIDECHAIN_RATES,
  chainIsEmpty,
  type Chain,
  type Feedback,
  type Range
} from './params';

// The check feedback passes on its way in: on the page before it's sent,
// on the server when it arrives (a Server Action is a public endpoint, so
// what reaches it may not have come from the page at all), and in Candy
// Haven when it's read back. Built from the ranges in params.ts, so a
// control and its check can't disagree.

const ranged = ({ min, max }: Range) => z.number().finite().min(min).max(max);
const id = z.string().min(1).max(MAX_ID);
const seconds = z.number().finite().min(0).max(MAX_SECONDS);

export const EqBandSchema = z.object({
  id,
  type: z.enum(EQ_BAND_TYPES),
  frequency: ranged(RANGES.frequency),
  gain: ranged(RANGES.gain),
  q: ranged(RANGES.q),
  slope: z.union([z.literal(CUT_SLOPES[0]), z.literal(CUT_SLOPES[1])])
});

export const SaturationSchema = z.object({
  drive: ranged(RANGES.drive),
  mix: ranged(RANGES.mix),
  output: ranged(RANGES.output)
});

export const SidechainSchema = z.object({
  bpm: ranged(RANGES.bpm),
  rate: z.enum(SIDECHAIN_RATES),
  depth: ranged(RANGES.depth),
  release: ranged(RANGES.release),
  offset: ranged(RANGES.offset)
});

export const WidthSchema = z.object({ width: ranged(RANGES.width) });

export const DynamicsSchema = z.object({
  mode: z.enum(DYNAMICS_MODES),
  threshold: ranged(RANGES.threshold),
  ratio: ranged(RANGES.ratio),
  knee: ranged(RANGES.knee),
  attack: ranged(RANGES.attack),
  release: ranged(RANGES.dynamicsRelease),
  makeup: ranged(RANGES.makeup)
});

export const ChainSchema = z.object({
  eq: z.array(EqBandSchema).max(MAX_EQ_BANDS),
  saturation: SaturationSchema.nullable(),
  sidechain: SidechainSchema.nullable(),
  width: WidthSchema.nullable(),
  dynamics: DynamicsSchema.nullable()
});

export const NoteSchema = z
  .object({
    id,
    at: seconds,
    end: seconds.nullable(),
    text: z.string().trim().max(MAX_NOTE),
    chain: ChainSchema.nullable()
  })
  .refine(
    (note) => note.end === null || note.end - note.at >= MIN_SECTION_SECONDS,
    { message: 'A section ends after it starts.' }
  )
  .refine((note) => note.chain === null || note.end !== null, {
    message: 'Only a section carries tools.'
  })
  .refine((note) => note.text !== '' || !chainIsEmpty(note.chain), {
    message: 'A note says something, or carries tools.'
  });

export const FeedbackSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME),
    notes: z.array(NoteSchema).max(MAX_NOTES),
    chain: ChainSchema.nullable()
  })
  .refine(
    (feedback) =>
      feedback.notes.filter((note) => note.chain !== null).length <=
      MAX_CHAINED_SECTIONS,
    { message: `Tools go on ${MAX_CHAINED_SECTIONS} sections at most.` }
  )
  .refine(
    (feedback) =>
      new Set(feedback.notes.map((note) => note.id)).size ===
      feedback.notes.length,
    { message: 'Two notes share an id.' }
  )
  .refine(
    (feedback) => feedback.notes.length > 0 || !chainIsEmpty(feedback.chain),
    { message: 'Leave a note, or put a tool on the track.' }
  );

/**
 * Feedback as it can be trusted, or null. Against the track's length too,
 * when it's known: a note past the end of the track is one no page made.
 * A second's slack for the end, since the page and the file can disagree
 * by a frame about how long it is.
 */
export function parseFeedback(
  raw: unknown,
  durationSeconds?: number
): Feedback | null {
  const parsed = FeedbackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const feedback: Feedback = parsed.data;
  if (durationSeconds !== undefined && Number.isFinite(durationSeconds)) {
    const last = durationSeconds + 1;
    const outside = feedback.notes.some(
      (note) => note.at > last || (note.end !== null && note.end > last)
    );
    if (outside) return null;
  }
  return feedback;
}

/** One set of tools as it can be trusted, or null. */
export function parseChain(raw: unknown): Chain | null {
  const parsed = ChainSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
