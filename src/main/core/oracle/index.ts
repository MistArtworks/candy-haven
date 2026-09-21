/**
 * THE ORACLE — typed questions, answered with probabilities.
 *
 * A general facility, not a feature. Three pieces:
 *
 *   `types.ts`     the vocabulary — questions, answers, bands, `describe()`
 *   `jev.ts`       one implementation, TypeSafe's System One
 *   `pipeline.ts`  running many objects through many staged questions
 *
 * ## How it is used
 *
 * ```ts
 * const oracle = jevFor(apiKey)
 * if (!oracle) return everythingFlaggedForAHuman()
 *
 * const results = await runPipeline(uploads, {
 *   oracle,
 *   initial: () => ({ match: null }),
 *   stages: [
 *     {
 *       name: 'identify',
 *       state: (upload) => describe(`An upload titled "${upload.title}".`),
 *       questions: () => ({ which: choice('Which recording is this?', catalogue) }),
 *       absorb: (answers, _upload, context) => ({
 *         ...context,
 *         match: answers.which?.choice ?? null
 *       })
 *     },
 *     {
 *       name: 'identity',
 *       when: (_upload, context) => context.match !== null,
 *       state: (upload, context) => describe(`A: ${context.match}`, `B: ${upload.title}`),
 *       questions: () => ({ same: noul('Same master?', 'Identical.', 'A different edit.') }),
 *       absorb: (answers, _upload, context) => ({ ...context, same: answers.same?.noul ?? 0 })
 *     }
 *   ]
 * })
 * ```
 *
 * Act on `result.band`: `yes` and `no` decided themselves, `unsure` is the
 * queue a person works through. That split is the point of the whole module —
 * it is what makes a few hundred judgement calls into a dozen.
 *
 * ## The second implementation
 *
 * An ordinary LLM wearing the same interface is expected, for the questions
 * Jev's closed option sets cannot express. Nothing outside `jev.ts` knows
 * which oracle it is holding, so adding it means adding a file.
 */
export {
  DEFAULT_BANDS,
  bandOf,
  choice,
  confidenceOf,
  describe,
  noul,
  score,
  type Answer,
  type Answers,
  type Band,
  type Bands,
  type ChoiceQuestion,
  type NoulQuestion,
  type Oracle,
  type Question,
  type ScoreQuestion
} from './types'

export { JevOracle, isJevKey, jevFor, type JevOptions } from './jev'

export {
  answerFrom,
  runPipeline,
  type PipelineOptions,
  type PipelineResult,
  type Stage,
  type StageResult
} from './pipeline'
