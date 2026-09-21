import { useMemo, type ReactNode } from 'react'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { TimerId } from '@shared/domain/timer'
import {
  GRACE_QUICK_SET,
  TIMER_ANIMATIONS,
  TIMER_ANIMATION_LABEL,
  TIMER_KIND,
  TIMER_QUICK_SET,
  formatClock,
  formatDurationLabel
} from '@shared/domain/timer.constants'
import { getOverlay } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Checkbox, SelectInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import { useCopy } from '@renderer/hooks/useCopy'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useTimer, useTimerActions, useTimerFrame } from '@renderer/hooks/useTimers'
import { TimerFacePreview } from './components/TimerFacePreview'
import { AddressList } from '../../components/AddressList'
import { OverlayBench } from '../../components/OverlayBench'
import { PresentationControls } from '../../components/PresentationControls'
import { addressRowsFor } from '../../lib/addresses'
import { kitEntry, kitNumber } from '../../lib/kit'
import {
  actionsFor,
  composerFor,
  dialsFor,
  soloDeck,
  statusFor,
  useDeckRunner
} from '../../lib/deck'
import styles from './TimerPage.module.scss'

export interface TimerPageProps {
  timerId: TimerId
}

/**
 * Host surface for a countdown overlay.
 *
 * One page serves both timers — they differ in defaults and in what happens at
 * zero, not in what the operator does with them. Which one this is comes from
 * the route, and everything on the page keys off it.
 *
 * On the kit's standing shape: `01` the face as the one focal panel, `02` the
 * controls that run it, then the duration, presentation, and the address.
 *
 * The face no longer carries the verbs or the adjust row. They were sitting
 * under the preview on this page and in a separate implementation on the desk,
 * which is why `Start` and `Hold` read differently depending on where you
 * pressed them. `02` is the desk's own bench, reading the same `actionsFor` —
 * and the terminal word is a composer field there, so only CONVENING is offered
 * one, which is the difference between the two clocks stated in the one place
 * where it can be seen.
 */
export function TimerPage({ timerId }: TimerPageProps): ReactNode {
  const overlay = getOverlay(timerId)
  const entry = kitEntry(timerId)
  const kind = TIMER_KIND[timerId]

  const state = useTimer(timerId)
  const frame = useTimerFrame(state)
  const server = useOverlayInfo()
  const runner = useDeckRunner()
  const copier = useCopy()

  /*
   * Still held for the quick-set and adjust rows below, and for the keyboard.
   *
   * The chords stay on this hook rather than on the bench's actions: `extend`
   * adjusts the *duration*, so `Ctrl`+`↑` works on a stopped clock as well as a
   * running one, while the bench only offers ±1 min while something is actually
   * counting — see `actionsFor`. Binding the chord to a verb that comes and
   * goes would make the chord come and go with it.
   */
  const actions = useTimerActions()

  const running = state.phase === 'running'
  const spent = frame.phase === 'elapsed'

  const deck = useMemo(
    () => soloDeck({ owner: timerId, timer: { id: timerId, state, frame }, server }),
    [timerId, state, frame, server]
  )

  const status = statusFor(timerId, deck, 0)

  /*
   * A countdown is run live, so it is run from the keyboard.
   *
   * Space holds and resumes because that is what a space bar does to a clock
   * everywhere else. The chords are scoped to this page and this timer — the
   * two countdowns share a component, so registering here means whichever one
   * is open is the one that answers, and the cheatsheet names it.
   */
  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: ' ',
        label: running ? 'Hold the clock' : 'Start the clock',
        group: overlay.label,
        run: () => void actions.toggle(timerId)
      },
      {
        chord: 'ctrl+enter',
        label: 'Restart from the top',
        group: overlay.label,
        whileTyping: true,
        run: () => void actions.restart(timerId)
      },
      /*
       * Clearing is off `Ctrl+Backspace`. See the muster's note and
       * `ownedByTheField`: that chord is delete-the-previous-word in every text
       * field, and it was bound here to wipe the board with `whileTyping` set.
       * Destructive actions do not reach for that flag.
       */
      {
        chord: 'ctrl+shift+x',
        label: 'Clear the clock',
        group: overlay.label,
        run: () => void actions.reset(timerId)
      },
      {
        chord: 'ctrl+arrowup',
        label: 'Add a minute',
        group: overlay.label,
        whileTyping: true,
        run: () => void actions.extend(timerId, 60_000)
      },
      {
        chord: 'ctrl+arrowdown',
        label: 'Take a minute off',
        group: overlay.label,
        whileTyping: true,
        run: () => void actions.extend(timerId, -60_000)
      }
    ],
    [actions, overlay.label, running, timerId]
  )

  useHotkeys(hotkeys)

  // The readout mirrors the face: grace counts its own budget down, so the
  // console never shows a stopped clock while time is still being spent.
  const readout =
    frame.phase === 'grace' ? formatClock(frame.graceRemainingMs) : formatClock(frame.remainingMs)

  const phaseLabel: Record<typeof frame.phase, string> = {
    idle: 'Standing by',
    running: 'Running',
    paused: 'Held',
    grace: 'In grace',
    elapsed: 'Spent'
  }

  const failure = runner.error ?? actions.error
  const dismiss = (): void => {
    runner.dismiss()
    actions.dismissError()
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber(timerId)}
        label={overlay.label}
        kind={overlay.role}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              ← The desk
            </Link>
            <StatusDot
              tone={
                frame.phase === 'grace' || spent
                  ? 'error'
                  : running
                    ? 'online'
                    : state.phase === 'paused'
                      ? 'warn'
                      : 'pending'
              }
              label={phaseLabel[frame.phase]}
              pulse={running}
            />
          </div>
        }
      />

      {failure || runner.report ? (
        <div
          className={failure ? styles.notice : styles.report}
          role={failure ? 'alert' : 'status'}
        >
          <span>{failure ?? runner.report}</span>
          <button type="button" className={styles.dismiss} onClick={dismiss}>
            Dismiss
          </button>
        </div>
      ) : null}

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <div className={styles.columns}>
          <div className={styles.column}>
            {/* 01 — the face is the single focal object on this page. */}
            <Panel
              label="Face"
              index="01"
              focal

              aside={<span className={styles.clock}>{readout}</span>}
            >
              <div className={styles.faceBody}>
                <TimerFacePreview state={state} />
              </div>
            </Panel>

            {/* 02 — the desk's own controls, on the overlay's page. */}
            <Panel label="Run the clock" index="02">
              <OverlayBench
                entry={entry}
                status={status}
                actions={actionsFor(timerId, deck)}
                composer={composerFor(timerId, deck)}
                dials={dialsFor(timerId, deck)}
                rows={[]}
                copier={copier}
                runner={runner}
                variant="page"
              />
            </Panel>

            {/*
          03 — the fuller way at the same two numbers the bench dials.
          Both write `config.durationMs` and `config.graceMs`, so they cannot
          disagree; what this adds is the named presets and a finer adjustment
          than ±1 minute. The bench keeps the coarse pair because that is the
          one reached for mid-break, from the desk, with an audience waiting.
        */}
            <Panel label="Duration" index="03">
              <div className={styles.config}>
                <div className={styles.quickGroup}>
                  <span className={styles.quickLabel}>Set to</span>
                  <div className={styles.quick}>
                    {TIMER_QUICK_SET.map((seconds) => (
                      <Button
                        key={seconds}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void actions.configure(timerId, { durationMs: seconds * 1_000 })
                        }
                      >
                        {formatDurationLabel(seconds * 1_000)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/*
              Adjusting the duration rather than the clock, so this works
              mid-run — handing yourself another two minutes is the common case
              for a break that has overrun.
            */}
                <div className={styles.quickGroup}>
                  <span className={styles.quickLabel}>Adjust</span>
                  <div className={styles.quick}>
                    {[-60_000, -30_000, 30_000, 60_000, 300_000].map((delta) => (
                      <Button
                        key={delta}
                        size="sm"
                        variant="ghost"
                        busy={actions.pending === `extend:${delta}`}
                        onClick={() => void actions.extend(timerId, delta)}
                      >
                        {delta > 0
                          ? `+${delta / 60_000 >= 1 ? `${delta / 60_000}m` : `${delta / 1000}s`}`
                          : `−${Math.abs(delta) / 60_000 >= 1 ? `${Math.abs(delta) / 60_000}m` : `${Math.abs(delta) / 1000}s`}`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/*
              Grace is a second budget beginning the instant the first is spent,
              and only an interval has one — see `createDefaultTimerConfig`: it
              is for work that runs over, and counting a room in does not. So
              CONVENING gets no grace presets here and no grace dial on `02`.
            */}
                {kind === 'interval' ? (
                  <div className={styles.quickGroup}>
                    <span className={styles.quickLabel}>Grace past zero</span>
                    <div className={styles.quick}>
                      {GRACE_QUICK_SET.map((seconds) => (
                        <Button
                          key={seconds}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void actions.configure(timerId, { graceMs: seconds * 1_000 })
                          }
                        >
                          {formatDurationLabel(seconds * 1_000)}
                        </Button>
                      ))}
                    </div>
                    <p className={styles.hint}>
                      Counted down in crimson past zero, so overrunning looks like overrunning
                      rather than like a clock that stopped. None ends the timer at 00:00.
                    </p>
                  </div>
                ) : null}

                <FieldGrid columns={2}>
                  <Field label="Set" value={formatClock(state.config.durationMs)} mono />
                  <Field label="Grace" value={formatDurationLabel(state.config.graceMs)} mono />
                </FieldGrid>
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            <Panel label="Presentation" index="04">
              <div className={styles.config}>
                <PresentationControls
                  values={state.config}
                  onChange={(patch) => void actions.configure(timerId, patch)}
                  onReset={() =>
                    void actions.configure(timerId, { scale: 1, typeScale: 1, opacity: 1 })
                  }
                  adjusted={
                    state.config.scale !== 1 ||
                    state.config.typeScale !== 1 ||
                    state.config.opacity !== 1
                  }
                />

                <SelectInput
                  label="Countdown face"
                  value={state.config.animation}
                  options={TIMER_ANIMATIONS.map((animation) => ({
                    value: animation,
                    label: TIMER_ANIMATION_LABEL[animation]
                  }))}
                  onChange={(animation) => void actions.configure(timerId, { animation })}
                  hint="Presentations of the same clock. The overlay is always transparent."
                />

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>What is drawn</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Show the label"
                      checked={state.config.showLabel}
                      onChange={(showLabel) => void actions.configure(timerId, { showLabel })}
                    />
                    <Checkbox
                      label="Blink when spent"
                      checked={state.config.blinkOnElapsed}
                      onChange={(blinkOnElapsed) =>
                        void actions.configure(timerId, { blinkOnElapsed })
                      }
                      hint={
                        kind === 'convene'
                          ? 'A convening has arrived rather than run out, so this is usually off for it.'
                          : undefined
                      }
                    />
                  </div>
                </div>

                {/*
              Two kinds of noise, and they are deliberately two settings: the
              cues are three chimes at moments that matter, the clock is a bed
              that plays for the whole duration. Turning the chimes off does not
              silence the clock, and it is not meant to.
            */}
                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>Sound, in the console only</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Audio cues"
                      checked={state.config.sound}
                      onChange={(sound) => void actions.configure(timerId, { sound })}
                      hint={
                        kind === 'convene'
                          ? 'Off by default — nothing should warn an audience it is nearly time. The impact when this reaches zero needs it on.'
                          : 'One minute out, final call at ten seconds, and once when spent. Never on the broadcast.'
                      }
                    />
                    <Checkbox
                      label="Ticking clock"
                      checked={state.config.tick}
                      onChange={(tick) => void actions.configure(timerId, { tick })}
                      hint="A clock under the countdown for as long as it runs."
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              label="Broadcast"
              index="05"

              aside={
                <StatusDot
                  tone={server.running ? 'online' : 'error'}
                  label={server.running ? 'Serving' : 'Offline'}
                />
              }
            >
              <div className={styles.broadcast}>
                <p className={styles.hint}>
                  Tick <strong>Transparent</strong> on the OBS source — this overlay never paints a
                  background, so it drops onto any scene.
                </p>

                <AddressList
                  rows={addressRowsFor(overlay, server.url)}
                  copied={copier.copied}
                  failed={copier.failed}
                  onCopy={copier.copy}
                  offline={server.error ?? 'The overlay server is not listening.'}
                />
              </div>
            </Panel>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
