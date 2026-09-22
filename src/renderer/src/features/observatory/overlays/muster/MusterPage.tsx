import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { MusterState } from '@shared/domain/muster'
import {
  LINGER_MAX_MS,
  LINGER_MIN_MS,
  MAX_ENTRIES,
  MUSTER_PHASE_LABEL,
  PER_CITIZEN_MAX,
  PER_CITIZEN_MIN,
  fileInstruction
} from '@shared/domain/muster.constants'
import { getOverlay } from '@shared/domain/overlays'
import { PRESENTATION_LIMITS } from '@shared/domain/presentation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, TextInput } from '@renderer/components/primitives/Input'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { gridVariants } from '@renderer/motion/transitions'
import { useCopy } from '@renderer/hooks/useCopy'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useMusterState } from '@renderer/hooks/useMuster'
import { useSettings } from '@renderer/hooks/useSettings'
import { MusterFace } from '@renderer/muster/muster-renderer'
import { AddressList } from '../../components/AddressList'
import { OverlayBench } from '../../components/OverlayBench'
import { OverlayVerbs } from '../../components/OverlayVerbs'
import { PresentationControls } from '../../components/PresentationControls'
import { addressRowsFor } from '../../lib/addresses'
import { kitEntry, kitNumber } from '../../lib/kit'
import {
  actionsFor,
  composerFor,
  dialsFor,
  soloDeck,
  statusFor,
  useCountdownClock,
  useDeckRunner
} from '../../lib/deck'
import styles from './MusterPage.module.scss'
import { notify } from '@renderer/components/feedback/notify'

/**
 * A configuration write, which nothing waits on.
 *
 * Fifteen call sites on this page set one field of the muster's config and not
 * one of them handled a refusal — so a write that failed left the control on
 * screen showing a value that had never landed, which is worse than the write
 * not being offered.
 */
function configure(patch: Parameters<typeof window.candy.muster.configure>[0]): void {
  void window.candy.muster
    .configure(patch)
    .catch((cause: unknown) => notify.refuse(cause, { label: 'Could not apply that setting' }))
}

/** The same, for the chords that reach the muster without going through the bench. */
function attempt(label: string, action: () => Promise<unknown>): void {
  void action().catch((cause: unknown) => notify.refuse(cause, { label }))
}

/**
 * THE MUSTER — host surface.
 *
 * Laid out on the kit's standing shape, which every overlay page now follows:
 * `01` the live object as the one focal panel, `02` the controls that run it,
 * then that overlay's own composition, then presentation, then the addresses,
 * then the simulator last.
 *
 * Two things follow from that and are worth stating, because both were true of
 * this page before and neither is any more.
 *
 * **The controls in `02` are the desk's.** `OverlayBench` is the same component
 * the OBSERVATORY desk draws, reading the same `actionsFor` / `composerFor` /
 * `dialsFor`. This page used to own a second implementation of the call's title
 * and question — two text fields, two commit paths, two sets of limits, for one
 * setting. There is now one, and a limit gained anywhere is gained everywhere.
 *
 * **The simulator is last, so every index above it is a literal.** It was `06`
 * or `07` depending on whether rehearsal mode was on, and the two panels below
 * it renumbered themselves under a setting in REGULATION.
 *
 * The roll stays the focal object rather than the face, which is a departure
 * from the rest of the kit and the right one: during a call the operator is
 * reading entries and deciding whether to cut one, not judging the composition.
 * The face sits beside it in the same panel.
 */
export function MusterPage(): ReactNode {
  const overlay = getOverlay('muster')
  const entry = kitEntry('muster')

  const server = useOverlayInfo()
  const settings = useSettings()
  /*
   * Rehearsal, gated on the persisted setting rather than on `is.dev`.
   *
   * The same call the concord makes, and for the same reason: the evening
   * before a stream is exactly when an operator wants to fill a roll and look
   * at it, and by then they are running a packaged build. Gating on the build
   * would put the feature only where it is least needed.
   */
  const testMode = settings?.workspace.testMode ?? false

  const state = useMusterState()
  const runner = useDeckRunner()
  const copier = useCopy()

  const config = state.config
  const open = state.phase === 'open'

  const channel = (settings?.integrations.twitchChannel ?? '').trim()

  /*
   * One overlay's worth of deck. See `soloDeck`: this page must not mount
   * `useOverlayDeck`, which claims the chat socket and starts the Spotify poll
   * for a page that has nothing to do with either.
   */
  const deck = useMemo(
    () =>
      soloDeck({
        owner: 'muster',
        muster: state,
        server,
        settings,
        chatReady: channel.length > 0 || testMode
      }),
    [state, server, settings, channel, testMode]
  )

  // Ticks only while a timed call is running, for the `02:40 left` in the
  // status line. A call with no clock leaves this idle.
  const now = useCountdownClock(open && state.closesAt !== null)
  const status = statusFor('muster', deck, now)

  const actions = actionsFor('muster', deck)
  /*
   * The hand-off gets its own panel here, and the verb row gets the rest.
   *
   * Selected on the key prefix, which `DeckAction.key` documents as fair game
   * for exactly this: the hand-off is the point of the whole department and it
   * carries a real trade-off worth a sentence of prose — the chamber takes ten
   * and the ring takes rather more — which does not fit in a button row. It is
   * still one implementation; this page only lays the same actions out
   * differently from the desk, which has no room for the prose.
   */
  const handoff = actions.filter((action) => action.key.startsWith('muster:handoff'))
  const running = actions.filter((action) => !action.key.startsWith('muster:handoff'))

  const [command, setCommand] = useEchoedText(config.command, (value) =>
    configure({ command: value })
  )

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      /*
       * Put and close are two chords, not one that toggles.
       *
       * `Ctrl+Enter` did both, and it fires while typing — which is right for
       * putting a call, since the question is typed and then put without
       * leaving the field. It is wrong for closing one: the operator is in the
       * entry field mid-call, reaches for a submit-shaped chord, and the call
       * ends. Split, `Ctrl+Enter` can only ever *start* something, and closing
       * takes the deliberate two-modifier chord the concord already uses for
       * exactly this.
       */
      {
        chord: 'ctrl+enter',
        label: 'Put the call',
        group: 'The Muster',
        whileTyping: true,
        disabled: open,
        /*
         * Empty, so the service falls back to the standing question.
         *
         * This chord used to carry a `question` field that lived only on this
         * page, separate from the stored `prompt` the overlay actually draws.
         * That was the duplication: two questions, one broadcast. There is now
         * one field, in `02`, and it is the stored one.
         */
        run: () => attempt('Could not open the call', () => window.candy.muster.open(''))
      },
      {
        chord: 'ctrl+shift+enter',
        label: 'Close the call',
        group: 'The Muster',
        whileTyping: true,
        disabled: !open,
        run: () => attempt('Could not close the call', () => window.candy.muster.close())
      },
      /*
       * Clearing is off `Ctrl+Backspace`, and off the typing path entirely.
       *
       * It was `Ctrl+Backspace` with `whileTyping`, which is
       * delete-the-previous-word in every text field there is — so an operator
       * tidying a word out of an entry they were filing wiped the whole roll,
       * a second or two after typing it. The dispatcher now refuses that chord
       * inside a field regardless, but a destructive action should not be
       * reachable from a field in the first place, so this no longer asks.
       */
      {
        chord: 'ctrl+shift+x',
        label: 'Clear the roll',
        group: 'The Muster',
        disabled: state.phase === 'idle' && state.entries.length === 0,
        run: () => attempt('Could not clear the roll', () => window.candy.muster.reset())
      }
    ],
    [open, state.phase, state.entries.length]
  )

  useHotkeys(hotkeys)

  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber('muster')}
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
              tone={status.tone}
              label={MUSTER_PHASE_LABEL[state.phase]}
              pulse={status.pulse}
            />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        {/*
          01 — the roll and the face, side by side in one panel.
          One panel rather than two so `02` is the controls on every page in the
          kit: the position is meant to be learnable, and a page that put its
          preview there would break that for the one overlay whose focal object
          is a list.
        */}
        <Panel
          label="The roll"
          index="01"
          focal
          className={styles.span6}
          aside={
            <span className={styles.count}>
              {state.entries.length} / {config.maxEntries} · {state.citizens} citizen
              {state.citizens === 1 ? '' : 's'}
              {state.turnedAway > 0 ? ` · ${state.turnedAway} turned away` : ''}
            </span>
          }
        >
          <div className={styles.rollBody}>
            <div className={styles.roll}>
              {open ? (
                <p className={styles.hint}>
                  Chat files with <code className={styles.inline}>!{config.command} anything</code>.{' '}
                  {/* Whether the call is timed is a property of the state, not
                      of the clock — asking the clock during render is impure
                      and would also be the wrong question. */}
                  {state.closesAt === null
                    ? 'The call stays open until you close it.'
                    : 'The clock is running.'}
                </p>
              ) : null}

              {state.entries.length === 0 ? (
                <p className={styles.empty}>
                  {open ? 'Nothing filed yet.' : 'No roll. Put a call to start one.'}
                </p>
              ) : (
                <ol className={styles.entries}>
                  {state.entries.map((item, index) => (
                    <li key={item.id} className={styles.entry}>
                      <span className={styles.entryIndex}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.entryText}>{item.text}</span>
                      <span className={styles.entryAuthor}>{item.author}</span>
                      <button
                        type="button"
                        className={styles.strike}
                        title="Strike this entry from the roll"
                        aria-label={`Strike ${item.text}`}
                        onClick={() =>
                          void runner.run({
                            key: `muster:remove:${item.id}`,
                            label: 'Strike',
                            run: () => window.candy.muster.remove(item.id)
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <FacePreview state={state} />
          </div>
        </Panel>

        <div className={styles.columns}>
          <div className={styles.column}>
            {/* 02 — the desk's own controls, on the overlay's page. */}
            <Panel label="Run the call" index="02">
              <OverlayBench
                entry={entry}
                status={status}
                actions={running}
                composer={composerFor('muster', deck)}
                dials={dialsFor('muster', deck)}
                rows={[]}
                copier={copier}
                runner={runner}
                variant="page"
              />
            </Panel>

            {/*
              04 — what is set once and then printed on the broadcast forever.
              The call's *length* is not here: it changes per call, so it is a dial
              on `02`. See `dialsFor` for that split.
            */}
            <Panel label="The call" index="04">
              <div className={styles.config}>
                <TextInput
                  label="Command"
                  value={command}
                  onChange={setCommand}
                  hint={`Chat files with !${config.command}. ${fileInstruction(config)}`}
                />

                <Slider
                  label="Hold the closed roll"
                  min={LINGER_MIN_MS}
                  max={LINGER_MAX_MS}
                  step={5_000}
                  value={config.lingerMs}
                  readout={`${Math.round(config.lingerMs / 1000)}s`}
                  onChange={(lingerMs) => configure({ lingerMs })}
                  hint="How long a closed roll stays on the scene before the overlay returns to rest."
                />

                <Slider
                  label="Entries per citizen"
                  min={PER_CITIZEN_MIN}
                  max={PER_CITIZEN_MAX}
                  step={1}
                  value={config.perCitizen}
                  readout={`${config.perCitizen}`}
                  onChange={(perCitizen) => configure({ perCitizen })}
                  hint="Duplicates are refused regardless, so one person cannot fill the roll with the same entry."
                />

                <Slider
                  label="Roll holds at most"
                  min={4}
                  max={MAX_ENTRIES}
                  step={1}
                  value={config.maxEntries}
                  readout={`${config.maxEntries}`}
                  onChange={(maxEntries) => configure({ maxEntries })}
                  hint="A composition limit, not a performance one: more than this cannot be read on a broadcast."
                />
              </div>
            </Panel>

            <Panel
              label="Broadcast"
              index="06"

              aside={
                <StatusDot
                  tone={server.running ? 'online' : 'error'}
                  label={server.running ? 'Serving' : 'Offline'}
                />
              }
            >
              <div className={styles.broadcast}>
                <p className={styles.hint}>
                  Two addresses off one call: the full scene, and a corner plate showing the
                  question and the latest filings. Both can run at once.
                </p>

                {/*
                  The shared list, rather than this page's own copy of it.
                  Eight overlay pages had hand-rolled the same markup with the copy
                  handler rewritten each time, and none of them noticed a clipboard
                  write the OS refused — so a blocked copy read as a button that did
                  nothing at all. `useCopy` reports that as `Blocked`.
                */}
                <AddressList
                  rows={addressRowsFor(overlay, server.url)}
                  copied={copier.copied}
                  failed={copier.failed}
                  onCopy={copier.copy}
                  offline={server.error ?? 'The overlay server is offline.'}
                />
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            {/*
              03 — the point of the whole department: entries arrive as people and
              leave as options. A roll longer than the destination allows is
              truncated rather than refused, and the count that went is reported
              back through the runner's notice.
            */}
            <Panel label="Hand on" index="03">
              <div className={styles.handoff}>
                <p className={styles.hint}>
                  Send the roll to the ring to be drawn from, to the chamber to be voted on, or both
                  — a roll can be voted down to a shortlist and the shortlist then drawn. The
                  chamber takes ten; the ring takes rather more.
                </p>

                <OverlayVerbs actions={handoff} runner={runner} />

                {handoff.length === 0 ? (
                  <p className={styles.empty}>Nothing on the roll to hand on yet.</p>
                ) : null}

                <FieldGrid columns={2}>
                  <Field label="On the roll" value={state.entries.length} mono />
                  <Field label="Filed by" value={`${state.citizens}`} mono />
                </FieldGrid>
              </div>
            </Panel>

            <Panel label="Presentation" index="05">
              <div className={styles.config}>
                <PresentationControls
                  values={config}
                  onChange={(patch) => configure(patch)}
                  onReset={() =>
                    configure({
                      scale: 1,
                      typeScale: 1,
                      opacity: 1,
                      instructionScale: 1
                    })
                  }
                  adjusted={
                    config.scale !== 1 ||
                    config.typeScale !== 1 ||
                    config.opacity !== 1 ||
                    config.instructionScale !== 1
                  }
                >
                  <Slider
                    label="Instruction size"
                    value={config.instructionScale}
                    min={0.8}
                    max={2}
                    step={PRESENTATION_LIMITS.typeScale.step}
                    onChange={(instructionScale) => configure({ instructionScale })}
                    readout={`${config.instructionScale.toFixed(2)}×`}
                    hint="The one line with an audience other than you. Worth oversizing."
                    width="full"
                  />
                </PresentationControls>

                {/*
                  Grouped rather than one flat column of five.
                  What is *drawn* and how it is *laid out* are two questions, and a
                  single stack of checkboxes made the operator read all five to
                  find either.
                */}
                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>What is drawn</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Credit each entry"
                      checked={config.showAuthors}
                      onChange={(showAuthors) => configure({ showAuthors })}
                    />
                    <Checkbox
                      label="Show the count"
                      checked={config.showCount}
                      onChange={(showCount) => configure({ showCount })}
                    />
                    <Checkbox
                      label="Draw the resonance field"
                      checked={config.showField}
                      onChange={(showField) => configure({ showField })}
                      hint="A node per entry, joined where they are close. Each filing arrives as a flare."
                    />
                  </div>
                </div>

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>Layout</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Composite over the scene"
                      checked={config.transparent}
                      onChange={(transparent) => configure({ transparent })}
                      hint="Drops the backdrop. Tick Transparent on the OBS source too."
                    />
                  </div>

                  <Slider
                    label="Reserve at the right"
                    min={0}
                    max={60}
                    step={1}
                    value={Math.round(config.reserveRight * 100)}
                    readout={`${Math.round(config.reserveRight * 100)}%`}
                    onChange={(percent) => configure({ reserveRight: percent / 100 })}
                    hint="Nothing is drawn into this band, so a camera or a chat panel can be composited there."
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/*
          Last, and last on every page in the kit, so that the indices above it
          are literals. It was `06` with two panels renumbering themselves
          beneath it whenever rehearsal mode was switched on.
        */}
        {testMode ? (
          <Panel label="Simulator" index="07" className={styles.span6}>
            <div className={styles.simulator}>
              <p className={styles.hint}>
                Files synthetic entries through the real chat command, the real per-citizen ledger
                and the real duplicate rule — not straight onto the roll, or it would prove nothing.
              </p>
              <div className={styles.simulatorRow}>
                {[8, 20, 60].map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant="ghost"
                    disabled={!open}
                    busy={runner.pending === `muster:simulate:${count}`}
                    onClick={() =>
                      void runner.run({
                        key: `muster:simulate:${count}`,
                        label: `+${count}`,
                        run: () => window.candy.muster.simulate(count)
                      })
                    }
                  >
                    +{count}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!open}
                  busy={runner.pending === 'muster:simulate:one'}
                  onClick={() =>
                    void runner.run({
                      key: 'muster:simulate:one',
                      label: '10 from one citizen',
                      run: () => window.candy.muster.simulate(10, true)
                    })
                  }
                >
                  10 from one citizen
                </Button>
              </div>
              <p className={styles.hint}>
                The second files everything as one person, so the roll should stop at the
                per-citizen limit while the messages keep arriving — and the count beside the roll
                should hold at one citizen.
              </p>
              {!open ? <p className={styles.empty}>Put the call first.</p> : null}
            </div>
          </Panel>
        ) : null}
      </motion.div>
    </div>
  )
}

/**
 * The face, live, at the aspect of the full source.
 *
 * The same renderer the browser source uses, so what is judged here is what
 * goes out — the one thing a preview has to get right.
 */
function FacePreview({ state }: { state: MusterState }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<MusterFace | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    const face = new MusterFace(element, { motion: animationsEnabled, layout: 'full' })
    faceRef.current = face
    face.start()

    const observer = new ResizeObserver(() => face.resize())
    observer.observe(element)

    return () => {
      observer.disconnect()
      face.destroy()
      faceRef.current = null
    }
  }, [animationsEnabled])

  useEffect(() => {
    faceRef.current?.setState(state)
  }, [state])

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}
