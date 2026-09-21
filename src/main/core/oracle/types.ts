/**
 * The vocabulary an oracle answers in.
 *
 * ## What an oracle is, and what it is not
 *
 * An **oracle** answers *typed questions about a state* and returns a
 * probability distribution. It is not a chat model and this is not a prompt
 * library: there is no conversation, no system message, no output to parse.
 * You describe a situation, you name the answers that would be valid, and you
 * get back which one plus how sure the service is.
 *
 * That constraint is the whole value. A caller can act on `0.93` and escalate
 * `0.51` to a human, which is impossible when the answer is a paragraph.
 *
 * ## Why this is an interface and not a class
 *
 * Today there is one implementation, `JevOracle`, speaking TypeSafe's System
 * One. A second — an ordinary LLM coaxed into the same shape, with the
 * probabilities derived rather than reported — is expected, and everything
 * downstream of this file is written against the interface so that arriving
 * costs nothing. `ObjectPipeline` never learns which one it is holding.
 */

/** A closed set of answers, each described so the oracle can choose between them. */
export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  /** Option key to a description of when that option is the right answer. */
  criteria: Record<string, string>
}

/**
 * A yes/no answered as a probability rather than a boolean.
 *
 * `noul` is TypeSafe's name for it. The answer is the probability of `true`,
 * so `0.97` is a confident yes, `0.03` a confident no, and `0.5` is the
 * service saying it genuinely cannot tell — which is information a boolean
 * would have thrown away.
 */
export interface NoulQuestion {
  type: 'noul'
  instructions: string
  criteria: { true: string; false: string }
}

/** A graded judgement, where the options are points on a scale. */
export interface ScoreQuestion {
  type: 'score'
  instructions: string
  criteria: Record<string, string>
}

export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion

export interface Answer {
  /** Set for `choice` and `score`. The key the oracle picked. */
  choice?: string
  /** Set for `noul`. The probability that the answer is `true`. */
  noul?: number
  /** Per-option probability, when the service reports one. */
  probabilities?: Record<string, number>
}

export type Answers = Record<string, Answer>

/**
 * Anything that can answer typed questions.
 *
 * `ask` is deliberately the only method. Authentication, model selection,
 * retries and rate limits are the implementation's business, because a caller
 * that had to know about them could not be written against the interface.
 */
export interface Oracle {
  /** For logs and for the reason attached to a flagged answer. */
  readonly name: string
  ask(state: string, questions: Record<string, Question>): Promise<Answers>
}

// ------------------------------------------------------------------- bands

/**
 * Where a probability falls, and therefore who acts on it.
 *
 * The two thresholds are the reason a probability is worth having at all: the
 * confident ends of the distribution resolve themselves, and only the middle
 * costs somebody's attention.
 */
export type Band = 'yes' | 'unsure' | 'no'

export interface Bands {
  /** At or above this, `yes` is taken as decided. */
  certain: number
  /** At or below this, `no` is taken as decided. */
  rejected: number
}

export const DEFAULT_BANDS: Bands = { certain: 0.85, rejected: 0.15 }

export function bandOf(probability: number, bands: Bands = DEFAULT_BANDS): Band {
  if (probability >= bands.certain) return 'yes'
  if (probability <= bands.rejected) return 'no'
  return 'unsure'
}

/**
 * The probability behind whatever the oracle actually answered.
 *
 * A `noul` reports its own number directly; a `choice` reports a distribution
 * and the confidence is the mass on the option it picked. Zero when the
 * service returned neither, which reads as "no confidence" everywhere it is
 * banded — the safe direction, since it lands in `unsure` or `no`.
 */
export function confidenceOf(answer: Answer | undefined): number {
  if (!answer) return 0
  if (typeof answer.noul === 'number') return answer.noul
  if (answer.choice) return answer.probabilities?.[answer.choice] ?? 0
  return 0
}

// ---------------------------------------------------------------- builders

/**
 * Three tiny constructors, and they earn their place.
 *
 * Questions are written inline at call sites, and an object literal typed as
 * `Question` gives no help until it is complete and wrong in a way the
 * compiler can see. These narrow immediately, so a `criteria` key typo in a
 * `noul` is an error where it is written rather than a silent 400.
 */
export function choice(instructions: string, criteria: Record<string, string>): ChoiceQuestion {
  return { type: 'choice', instructions, criteria }
}

export function noul(instructions: string, whenTrue: string, whenFalse: string): NoulQuestion {
  return { type: 'noul', instructions, criteria: { true: whenTrue, false: whenFalse } }
}

export function score(instructions: string, criteria: Record<string, string>): ScoreQuestion {
  return { type: 'score', instructions, criteria }
}

/**
 * A multi-line state, written as an array and joined.
 *
 * Every caller was building one with a template literal full of `\n`, and
 * template literals full of newlines are the single most reliably mangled
 * thing in this codebase's history. Falsy lines are dropped, so an optional
 * piece of context is `condition ? line : ''` rather than a conditional spread.
 */
export function describe(...lines: (string | false | null | undefined)[]): string {
  return lines.filter(Boolean).join('\n')
}
