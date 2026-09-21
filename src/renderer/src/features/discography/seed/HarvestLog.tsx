import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { SeedLogEntry, SeedPlan, SeedProgress } from '@shared/domain/seed'
import { SEED_PHASE_LABEL } from '@shared/domain/seed'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { Meter } from '@renderer/components/primitives/Meter'
import styles from './HarvestLog.module.scss'

/**
 * The harvest, narrating itself. Temporary — deleted with the seeder.
 *
 * ## Why this is a modal and not a line in the page
 *
 * A harvest is two minutes of somebody else's computers being asked
 * questions, and a progress bar says only that it has not finished. The
 * operator watching it is not waiting — they are deciding whether to trust
 * what comes out, and that judgement needs the working: which service was
 * asked, for what, what it said, and what that means for the next step.
 *
 * It is also the only diagnostic there is. When TIDAL rate-limits or a
 * channel handle resolves to somebody else's account, the line that says so
 * is the difference between a fixable run and a mysterious one.
 *
 * ## It is a gate, not a spinner
 *
 * The modal does not close itself. When the harvest finishes it turns into
 * the first of the two confirmations: **Continue to the proposal**, which
 * only then reveals the review screen, which in turn has its own write
 * button. Two deliberate presses stand between reading a public API and
 * changing the catalogue.
 *
 * ## Not `Dialog`
 *
 * `Dialog`'s cancel is labelled `Cancel` and its scrim dismisses on click.
 * Both are wrong here: the harvest keeps running in the main process either
 * way, so a button that reads as "stop" and a scrim that fires on a stray
 * click would each be saying something untrue about a two-minute job.
 */

/** A source name to the colour it is drawn in — one per rung of the pipeline. */
const TONE: Record<string, string> = {
  spotify: styles.spine,
  apple: styles.exact,
  deezer: styles.exact,
  tidal: styles.exact,
  stores: styles.exact,
  youtube: styles.fuzzy,
  soundcloud: styles.fuzzy,
  jev: styles.oracle,
  plan: styles.plan,
  write: styles.plan,
  undo: styles.plan,
  seeder: styles.plan
}

function stamp(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface HarvestLogProps {
  log: readonly SeedLogEntry[]
  progress: SeedProgress
  /** Set once the harvest has produced one. Enables Continue. */
  plan: SeedPlan | null
  running: boolean
  error: string
  onContinue: () => void
  onDiscard: () => void
}

export function HarvestLog({
  log,
  progress,
  plan,
  running,
  error,
  onContinue,
  onDiscard
}: HarvestLogProps): ReactNode {
  const pane = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  /*
   * Follows the tail, unless the operator has scrolled up.
   *
   * Reading back through what a source returned is the main thing anybody
   * does with this pane, and a log that yanked itself to the bottom every
   * hundred milliseconds would make that impossible. Scrolling back turns
   * following off; returning to the bottom turns it on again.
   */
  useEffect(() => {
    if (!follow || !pane.current) return
    pane.current.scrollTop = pane.current.scrollHeight
  }, [log, follow])

  const done = !running && plan !== null
  const failed = progress.phase === 'failed' || error !== ''
  const bar = progress.total > 0 ? progress.done / progress.total : null

  return (
    <Portal>
      <div className={styles.scrim}>
        <motion.div
          className={styles.slab}
          role="dialog"
          aria-modal="true"
          aria-label="Harvest"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.head}>
            <span className={styles.title}>
              {failed ? 'THE HARVEST STOPPED' : done ? 'HARVEST COMPLETE' : 'HARVESTING'}
            </span>
            <span className={styles.phase}>{SEED_PHASE_LABEL[progress.phase]}</span>
          </header>

          <div className={styles.meter}>
            <Meter
              value={failed ? 0 : done ? 1 : bar}
              label={
                failed
                  ? 'stopped'
                  : done
                    ? 'nothing has been written'
                    : progress.note || 'working'
              }
              readout={progress.total > 0 ? `${progress.done} / ${progress.total}` : ''}
              tone={failed ? 'error' : done ? 'gold' : 'accent'}
            />
          </div>

          <div
            className={styles.pane}
            ref={pane}
            onScroll={(event) => {
              const el = event.currentTarget
              setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
            }}
          >
            {log.map((entry, index) => (
              <div
                key={`${entry.at}-${index}`}
                className={`${styles.line} ${styles[entry.level] ?? ''}`}
              >
                <span className={styles.at}>{stamp(entry.at)}</span>
                <span className={`${styles.source} ${TONE[entry.source] ?? ''}`}>
                  {entry.source}
                </span>
                <span className={styles.mark}>{MARK[entry.level]}</span>
                <span className={styles.text}>{entry.text}</span>
              </div>
            ))}
            {log.length === 0 ? <p className={styles.empty}>Waiting for the first call…</p> : null}
          </div>

          {!follow ? (
            <button
              type="button"
              className={styles.resume}
              onClick={() => {
                setFollow(true)
                if (pane.current) pane.current.scrollTop = pane.current.scrollHeight
              }}
            >
              Jump to the latest
            </button>
          ) : null}

          {failed ? <p className={styles.error}>{error || progress.error}</p> : null}

          <footer className={styles.foot}>
            <p className={styles.footnote}>
              {done
                ? 'Nothing has been written. Continue to read the proposal in full.'
                : failed
                  ? 'Nothing was written. The account above says where it stopped.'
                  : 'Reading six public services. Nothing is written by this step.'}
            </p>
            <div className={styles.actions}>
              <Button size="sm" onClick={onDiscard} disabled={running}>
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={onContinue} disabled={!done} busy={running}>
                {done
                  ? `Continue — ${plan.summary.records} records to review`
                  : running
                    ? 'Harvesting…'
                    : 'Continue'}
              </Button>
            </div>
          </footer>
        </motion.div>
      </div>
    </Portal>
  )
}

/** One glyph per level, so the eye can sort the pane without reading it. */
const MARK: Record<string, string> = {
  step: '::',
  request: '->',
  response: '<-',
  note: ' •',
  warn: ' !',
  error: ' ×'
}
