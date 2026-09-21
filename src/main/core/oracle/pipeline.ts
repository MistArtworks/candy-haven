/**
 * Run a list of objects through a sequence of typed questions.
 *
 * ## The shape of the problem this generalises
 *
 * You have some objects. For each one you want an oracle to answer a
 * question, and the *next* question depends on the answer to the last. You
 * want that over hundreds of objects, concurrently, without one failure
 * sinking the run, with progress you can draw, and with a verdict you can act
 * on at the end.
 *
 * The discography seeder was the first case: "which released recording is
 * this upload?", and then — depending on whether that found one — either "is
 * it the same master?" or "is this even a piece of music?". It will not be the
 * last, which is why this file knows nothing about music.
 *
 * ## Stages, not one big question
 *
 * The naive version folds every branch into one option list. That list grows
 * with the product of the branches, the descriptions get longer, and the
 * probabilities get worse because the oracle is choosing between options that
 * are not comparable. Staging keeps each question about one thing.
 *
 * A stage reads the subject and everything learnt so far, decides whether it
 * applies, asks, and folds its answers into the carried context. The context
 * is yours — the pipeline never inspects it.
 *
 * ## What it guarantees
 *
 *   - **Order.** Results come back in the order of the input, whatever order
 *     they finished in.
 *   - **Isolation.** One subject throwing is recorded on that subject's
 *     result and does not stop the others. A run of four hundred that fails
 *     on three is worth having; one that throws away three hundred and
 *     ninety-seven is not.
 *   - **Nothing decided in here.** The pipeline bands probabilities and hands
 *     them back. Which band means "act" is the caller's policy, because it
 *     depends entirely on what acting costs.
 */
import { pool } from '../net'
import { getLogger } from '../logger'
import {
  DEFAULT_BANDS,
  bandOf,
  confidenceOf,
  type Answer,
  type Answers,
  type Band,
  type Bands,
  type Oracle,
  type Question
} from './types'

const logger = getLogger('oracle')

/**
 * One question, or set of simultaneous questions, about a subject.
 *
 * `T` is the object being asked about. `C` is whatever the caller carries
 * between stages — usually a partial verdict being assembled.
 */
export interface Stage<T, C> {
  /** Keys this stage's answers in the result, and names it in logs. */
  name: string
  /**
   * Whether this stage applies to this subject at all.
   *
   * The branch point. A stage that does not apply costs no call and leaves no
   * answers behind, so `absorb` on later stages must tolerate its absence.
   */
  when?: (subject: T, context: C) => boolean
  /** The situation, in prose. `describe()` in `types.ts` builds these. */
  state: (subject: T, context: C) => string
  /** What to ask about it. Several independent questions go in one call. */
  questions: (subject: T, context: C) => Record<string, Question>
  /**
   * Fold the answers into the context the next stage reads.
   *
   * Pure, and must return the next context rather than mutating: subjects run
   * concurrently, and a shared mutable context is the one way to make this
   * non-deterministic.
   */
  absorb: (answers: Answers, subject: T, context: C) => C
}

export interface PipelineOptions<T, C> {
  oracle: Oracle
  stages: readonly Stage<T, C>[]
  /** The context each subject starts with. */
  initial: (subject: T) => C
  /**
   * How many subjects to run at once.
   *
   * Three by default, which is polite to a metered service and still finishes
   * a few hundred subjects in a couple of minutes. The oracle's own transport
   * backs off on a 429, so raising this makes a run faster until it doesn't.
   */
  concurrency?: number
  bands?: Bands
  /** Called after each subject finishes, successfully or not. */
  onProgress?: (done: number, total: number) => void
}

export interface StageResult {
  name: string
  answers: Answers
  /** The highest confidence any answer in this stage came back with. */
  confidence: number
  band: Band
}

export interface PipelineResult<T, C> {
  subject: T
  /** Whatever the last stage that ran folded in. */
  context: C
  stages: StageResult[]
  /**
   * The confidence of the **last stage that ran**, which is the one whose
   * answer the caller is about to act on. Zero for a failed subject.
   */
  confidence: number
  band: Band
  /** Set when the subject threw. `context` is then whatever it reached. */
  error: string
}

/** The best-supported answer in a set, which is the one worth banding. */
function peak(answers: Answers): { answer: Answer | undefined; confidence: number } {
  let best: Answer | undefined
  let confidence = 0
  for (const answer of Object.values(answers)) {
    const value = confidenceOf(answer)
    if (value >= confidence) {
      confidence = value
      best = answer
    }
  }
  return { answer: best, confidence }
}

export async function runPipeline<T, C>(
  subjects: readonly T[],
  options: PipelineOptions<T, C>
): Promise<PipelineResult<T, C>[]> {
  const { oracle, stages, initial, concurrency = 3, bands = DEFAULT_BANDS, onProgress } = options
  let done = 0

  return pool(subjects, concurrency, async (subject): Promise<PipelineResult<T, C>> => {
    let context = initial(subject)
    const ran: StageResult[] = []

    try {
      for (const stage of stages) {
        if (stage.when && !stage.when(subject, context)) continue

        const answers = await oracle.ask(stage.state(subject, context), stage.questions(subject, context))
        const { confidence } = peak(answers)

        ran.push({ name: stage.name, answers, confidence, band: bandOf(confidence, bands) })
        context = stage.absorb(answers, subject, context)
      }

      const last = ran[ran.length - 1]
      onProgress?.(++done, subjects.length)

      return {
        subject,
        context,
        stages: ran,
        confidence: last?.confidence ?? 0,
        band: last?.band ?? 'unsure',
        error: ''
      }
    } catch (error) {
      /*
       * One subject's failure is recorded, not propagated.
       *
       * `band` is `unsure` rather than `no`, deliberately: a failure is the
       * absence of an answer, and every caller's handling of `unsure` is to
       * ask a human — which is exactly right for a question that was never
       * answered.
       */
      const reason = (error as Error).message
      logger.warn(`${oracle.name} could not finish a subject: ${reason}`)
      onProgress?.(++done, subjects.length)
      return { subject, context, stages: ran, confidence: 0, band: 'unsure', error: reason }
    }
  })
}

/** The answer a named stage gave to a named question, if it ran and answered. */
export function answerFrom<T, C>(
  result: PipelineResult<T, C>,
  stage: string,
  question: string
): Answer | undefined {
  return result.stages.find((entry) => entry.name === stage)?.answers[question]
}
