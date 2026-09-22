import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  SeedChoice,
  SeedCredentials,
  SeedJournal,
  SeedLogEntry,
  SeedOutcome,
  SeedPlan,
  SeedProgress,
  SeedState,
  SeedUndoResult
} from '@shared/domain/seed'

/**
 * Data access for THE SEEDER — temporary. Deleted with the feature.
 *
 * Deliberately **not** TanStack Query, which every other surface here uses.
 * Three reasons, and the last is the real one:
 *
 *   - The plan is not a cacheable resource. It exists in one main-process
 *     object for the length of one session and has no meaningful staleness.
 *   - A harvest is minutes long. Query's retry, refetch-on-focus and
 *     background revalidation are all actively wrong for a call that hits six
 *     metered APIs.
 *   - Every mutation here *returns the new plan*. There is nothing to
 *     invalidate and nothing to refetch — the answer is the response.
 *
 * The one thing it does invalidate is the discography, and only after a
 * write, because that is somebody else's cache.
 */

const IDLE: SeedProgress = { phase: 'idle', note: '', done: 0, total: 0, error: '' }

/** The phases during which the harvest is still reading somebody's API. */
const HARVESTING = ['spotify', 'stores', 'youtube', 'soundcloud', 'adjudicating', 'planning']

export function isHarvesting(phase: SeedProgress['phase']): boolean {
  return HARVESTING.includes(phase)
}

export interface SeedController {
  progress: SeedProgress
  plan: SeedPlan | null
  outcome: SeedOutcome | null
  /** The last run, if it is still on record and can therefore be undone. */
  journal: SeedJournal | null
  undone: SeedUndoResult | null
  /** Everything the run has said about itself, oldest first. */
  log: SeedLogEntry[]
  /**
   * Whether the narration modal is up.
   *
   * Opened by `run`, and on mount when a harvest is already in flight —
   * which is what makes walking off the page and back not lose the account
   * of a run that takes two minutes. Closed only by `dismissLog`, so a
   * finished harvest waits on the operator rather than dropping them into
   * the proposal.
   */
  showLog: boolean
  dismissLog: () => void
  /** True while the harvest or the write is in flight. */
  working: boolean
  /** The last refusal, in the operator's language. */
  error: string
  run: (credentials: SeedCredentials) => Promise<void>
  decide: (key: string, choice: SeedChoice) => Promise<void>
  include: (key: string, include: boolean) => Promise<void>
  apply: () => Promise<void>
  reset: () => Promise<void>
  /** Leave a harvest that is still reading. Enabled while it runs. */
  abandon: () => Promise<void>
  undo: () => Promise<void>
  accept: () => Promise<void>
}

export function useSeed(): SeedController {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<SeedProgress>(IDLE)
  const [plan, setPlan] = useState<SeedPlan | null>(null)
  const [outcome, setOutcome] = useState<SeedOutcome | null>(null)
  const [journal, setJournal] = useState<SeedJournal | null>(null)
  const [log, setLog] = useState<SeedLogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [undone, setUndone] = useState<SeedUndoResult | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  /*
   * Read the state back on mount, and subscribe.
   *
   * The seeder's state lives in the main process, so walking away from the
   * page and returning must not lose a harvest that took four minutes. This
   * is the only thing that makes the page re-enterable.
   */
  useEffect(() => {
    let live = true

    void window.candy.seed.state().then((state: SeedState) => {
      if (!live) return
      setProgress(state.progress)
      setPlan(state.plan)
      setOutcome(state.outcome)
      setJournal(state.journal)
      setLog(state.log)
      /*
       * Re-open the modal only for a run still in flight.
       *
       * A finished harvest found at mount means the operator has already
       * been through this and walked away, so dropping them straight into
       * the proposal is right. One still running is the case where the
       * account of it is the whole reason to be on the page.
       */
      setShowLog(isHarvesting(state.progress.phase))
    })

    const stopProgress = window.candy.seed.onProgress((next) => {
      setProgress(next)
      if (next.phase === 'failed' && next.error) setError(next.error)
    })

    const stopLog = window.candy.seed.onLog((batch) => {
      setLog((current) => [...current, ...batch.entries])
    })

    return () => {
      live = false
      stopProgress()
      stopLog()
    }
  }, [])

  /** One wrapper, because all five calls fail the same way and should read so. */
  const attempt = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setError('')
    setWorking(true)
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setWorking(false)
    }
  }, [])

  const run = useCallback(
    (credentials: SeedCredentials) =>
      attempt(async () => {
        setOutcome(null)
        setLog([])
        setShowLog(true)
        setPlan(await window.candy.seed.run(credentials))
      }),
    [attempt]
  )

  /** Press Continue. The plan is already loaded; this only closes the modal. */
  const dismissLog = useCallback(() => setShowLog(false), [])

  const decide = useCallback(
    (key: string, choice: SeedChoice) =>
      attempt(async () => {
        setPlan(await window.candy.seed.decide(key, choice))
      }),
    [attempt]
  )

  const include = useCallback(
    (key: string, included: boolean) =>
      attempt(async () => {
        setPlan(await window.candy.seed.include(key, included))
      }),
    [attempt]
  )

  const apply = useCallback(
    () =>
      attempt(async () => {
        setUndone(null)
        setOutcome(await window.candy.seed.apply())
        // The catalogue moved, and so did the roster: a seeded record credits
        // artists the seeder may have just created.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['discography'] }),
          queryClient.invalidateQueries({ queryKey: ['artists'] }),
          queryClient.invalidateQueries({ queryKey: ['projects'] })
        ])
        const state = await window.candy.seed.state()
        setPlan(state.plan)
        setJournal(state.journal)
      }),
    [attempt, queryClient]
  )

  /**
   * Take the last run back.
   *
   * The catalogue and roster both move, so both caches are dropped — and so
   * is the register, which draws which release a project is a track on.
   */
  const undo = useCallback(
    () =>
      attempt(async () => {
        setUndone(await window.candy.seed.undo())
        setOutcome(null)
        setJournal(null)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['discography'] }),
          queryClient.invalidateQueries({ queryKey: ['artists'] }),
          queryClient.invalidateQueries({ queryKey: ['projects'] })
        ])
        setPlan(await window.candy.seed.state().then((state) => state.plan))
      }),
    [attempt, queryClient]
  )

  const accept = useCallback(
    () =>
      attempt(async () => {
        await window.candy.seed.accept()
        setJournal(null)
      }),
    [attempt]
  )

  const abandon = useCallback(
    () =>
      attempt(async () => {
        await window.candy.seed.abandon()
        setPlan(null)
        setOutcome(null)
        setUndone(null)
        setLog([])
        setShowLog(false)
        setProgress(IDLE)
      }),
    [attempt]
  )

  const reset = useCallback(
    () =>
      attempt(async () => {
        await window.candy.seed.reset()
        setPlan(null)
        setOutcome(null)
        setUndone(null)
        setLog([])
        setShowLog(false)
        setProgress(IDLE)
      }),
    [attempt]
  )

  return {
    progress,
    plan,
    outcome,
    journal,
    undone,
    log,
    showLog,
    dismissLog,
    working,
    error,
    run,
    decide,
    include,
    apply,
    reset,
    abandon,
    undo,
    accept
  }
}
