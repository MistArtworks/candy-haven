import { useMemo, useState, type ReactNode } from 'react'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { TimerId } from '@shared/domain/timer'
import {
  GRACE_MAX_MS,
  GRACE_QUICK_SET,
  TIMER_ANIMATIONS,
  TIMER_ANIMATION_LABEL,
  TIMER_KIND,
  TIMER_MAX_MS,
  TIMER_MIN_MS,
  TIMER_QUICK_SET,
  formatClock,
  formatDurationLabel
} from '@shared/domain/timer.constants'
import { getOverlay, overlaySourceUrl } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useTimer, useTimerActions, useTimerFrame } from '@renderer/hooks/useTimers'
import { TimerFacePreview } from './components/TimerFacePreview'
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
 */
export function TimerPage({ timerId }: TimerPageProps): ReactNode {
  const overlay = getOverlay(timerId)
  const kind = TIMER_KIND[timerId]
  const state = useTimer(timerId)
  const frame = useTimerFrame(state)
  const server = useOverlayInfo()
  const actions = useTimerActions()

  const [copied, setCopied] = useState(false)

  const sourceUrl = server.url ? overlaySourceUrl(server.url, overlay) : null
  const running = state.phase === 'running'
  const spent = frame.phase === 'elapsed'

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
      {
        chord: 'ctrl+backspace',
        label: 'Clear the clock',
        group: overlay.label,
        whileTyping: true,
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

  const copyUrl = (): void => {
    if (!sourceUrl) return
    void navigator.clipboard.writeText(sourceUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

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

  return (
    <div className={styles.page}>
      <PageHeader
        index={overlay.order + 1}
        label={overlay.label}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              Catalogue
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

      {actions.error ? (
        <div className={styles.notice} role="alert">
          <span>{actions.error}</span>
          <button type="button" className={styles.dismiss} onClick={actions.dismissError}>
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
        {/* The face is the single focal object on this page. */}
        <Panel
          label="Face"
          index="01"
          focal
          className={styles.facePanel}
          aside={<span className={styles.clock}>{readout}</span>}
        >
          <div className={styles.faceBody}>
            <TimerFacePreview state={state} />

            <div className={styles.controls}>
              <Button
                variant="primary"
                busy={actions.pending === 'toggle'}
                onClick={() => void actions.toggle(timerId)}
              >
                {running ? 'Hold' : state.phase === 'paused' ? 'Resume' : 'Start'}
              </Button>
              <Button
                variant="ghost"
                busy={actions.pending === 'restart'}
                onClick={() => void actions.restart(timerId)}
              >
                Restart
              </Button>
              <Button
                variant="danger"
                disabled={state.phase === 'idle'}
                busy={actions.pending === 'reset'}
                onClick={() => void actions.reset(timerId)}
              >
                Reset
              </Button>
            </div>

            {/*
              Adjusting the duration rather than the clock, so this works mid-run
              — handing yourself another two minutes is the common case for a
              break that has overrun.
            */}
            <div className={styles.adjust}>
              <span className={styles.adjustLabel}>Adjust</span>
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
        </Panel>

        <Panel label="Duration" index="02" className={styles.span2}>
          <div className={styles.config}>
            <Slider
              label="Time set"
              min={TIMER_MIN_MS}
              max={TIMER_MAX_MS}
              step={15_000}
              value={state.config.durationMs}
              readout={formatClock(state.config.durationMs)}
              onChange={(durationMs) => void actions.configure(timerId, { durationMs })}
              hint="Takes effect immediately, including mid-run."
            />

            <div className={styles.quick}>
              {TIMER_QUICK_SET.map((seconds) => (
                <Button
                  key={seconds}
                  size="sm"
                  variant="ghost"
                  onClick={() => void actions.configure(timerId, { durationMs: seconds * 1_000 })}
                >
                  {formatDurationLabel(seconds * 1_000)}
                </Button>
              ))}
            </div>

            {/*
              Grace is a second budget beginning the instant the first is spent.
              The readout crosses into crimson and counts it down, so overrunning
              looks like overrunning rather than like a clock that stopped.
            */}
            <Slider
              label="Grace time"
              min={0}
              max={GRACE_MAX_MS}
              step={15_000}
              value={state.config.graceMs}
              readout={formatDurationLabel(state.config.graceMs)}
              onChange={(graceMs) => void actions.configure(timerId, { graceMs })}
              hint="Counted down in crimson past zero. None ends the timer at 00:00."
            />

            <div className={styles.quick}>
              {GRACE_QUICK_SET.map((seconds) => (
                <Button
                  key={seconds}
                  size="sm"
                  variant="ghost"
                  onClick={() => void actions.configure(timerId, { graceMs: seconds * 1_000 })}
                >
                  {formatDurationLabel(seconds * 1_000)}
                </Button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel label="Presentation" index="03" className={styles.span2}>
          <div className={styles.config}>
            <SelectInput
              label="Countdown animation"
              value={state.config.animation}
              options={TIMER_ANIMATIONS.map((animation) => ({
                value: animation,
                label: TIMER_ANIMATION_LABEL[animation]
              }))}
              onChange={(animation) => void actions.configure(timerId, { animation })}
              hint="Four presentations of the same clock. The overlay is always transparent."
            />

            <TextInput
              label="Label"
              value={state.config.label}
              onChange={(label) => void actions.configure(timerId, { label })}
              placeholder="INTERVAL"
            />

            <TextInput
              label="Terminal word"
              value={state.config.terminalWord}
              onChange={(terminalWord) => void actions.configure(timerId, { terminalWord })}
              hint={
                kind === 'convene'
                  ? 'Shown in place of the clock when the countdown resolves.'
                  : 'Only used when the countdown resolves to a word rather than blinking.'
              }
            />

            <div className={styles.toggles}>
              <Checkbox
                label="Show the label"
                checked={state.config.showLabel}
                onChange={(showLabel) => void actions.configure(timerId, { showLabel })}
              />
              <Checkbox
                label="Blink when spent"
                checked={state.config.blinkOnElapsed}
                onChange={(blinkOnElapsed) => void actions.configure(timerId, { blinkOnElapsed })}
              />
              <Checkbox
                label="Audio cues in the console"
                checked={state.config.sound}
                onChange={(sound) => void actions.configure(timerId, { sound })}
                hint={
                  kind === 'convene'
                    ? 'Off by default — nothing should warn an audience it is nearly time.'
                    : 'One minute out, final call at ten seconds, and once when spent. Console only, never on the broadcast.'
                }
              />
            </div>
          </div>
        </Panel>

        <Panel
          label="Broadcast source"
          index="04"
          className={styles.span2}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.broadcast}>
            {sourceUrl ? (
              <>
                <p className={styles.hint}>
                  Add a Browser source in OBS at this address. Width {overlay.canvas.width}, height{' '}
                  {overlay.canvas.height}, and tick <strong>Transparent</strong> — this overlay
                  never paints a background, so it drops onto any scene.
                </p>
                <code className={styles.url}>{sourceUrl}</code>
                <div className={styles.broadcastActions}>
                  <Button size="sm" variant="ghost" onClick={copyUrl}>
                    {copied ? 'Copied' : 'Copy address'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void window.candy.shell.openExternal(sourceUrl)}
                  >
                    Preview
                  </Button>
                </div>
              </>
            ) : (
              <p className={styles.hint}>
                {server.error ?? 'The overlay server is not listening.'}
              </p>
            )}

            <FieldGrid columns={2}>
              <Field label="Set" value={formatClock(state.config.durationMs)} mono />
              <Field label="Grace" value={formatDurationLabel(state.config.graceMs)} mono />
            </FieldGrid>
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
