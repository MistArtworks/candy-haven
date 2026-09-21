import { useMemo, useState, type ReactNode } from 'react'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay } from '@shared/domain/overlays'
import type { ConcordLayout } from '@shared/domain/concord'
import {
  CONCORD_LAYOUTS,
  CONCORD_LAYOUT_LABEL,
  CONCORD_PRESENTATIONS,
  CONCORD_PRESENTATION_LABEL,
  MAX_EDGE_RESERVE,
  OVERLAY_REFERENCE_WIDTH,
  OVERLAY_THEMES,
  OVERLAY_THEME_LABEL,
  RESULT_LINGER_MAX_MS,
  RESULT_LINGER_MIN_MS,
  displayVoteCommand,
  voteInstruction
} from '@shared/domain/concord.constants'
import { CHAT_STATE_LABEL } from '@shared/domain/chat.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { Slider } from '@renderer/components/primitives/Slider'
import { formatLogTime } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import { useCopy } from '@renderer/hooks/useCopy'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useChatStatus, useConcordActions, useConcordState } from '@renderer/hooks/useConcord'
import { useSettings } from '@renderer/hooks/useSettings'
import { ConcordTally } from './components/ConcordTally'
import { OptionRoster } from './components/OptionRoster'
import { AddressList } from '../../components/AddressList'
import { OverlayBench } from '../../components/OverlayBench'
import { PresentationControls } from '../../components/PresentationControls'
import { addressRowsFor } from '../../lib/addresses'
import { kitEntry, kitNumber } from '../../lib/kit'
import {
  CHAT_TONE,
  actionsFor,
  composerFor,
  dialsFor,
  soloDeck,
  statusFor,
  useCountdownClock,
  useDeckRunner
} from '../../lib/deck'
import styles from './ConcordPage.module.scss'

/**
 * THE CONCORD — host surface.
 *
 * The audience votes in chat and sees the tally through a browser source
 * pointed at this overlay's slug; both surfaces render the same state from the
 * same renderer, so what the operator watches here is what is on the stream.
 *
 * On the kit's standing shape: `01` the tally as the one focal panel, `02` the
 * controls that run it, then the ballot, chat, presentation, the addresses, and
 * the simulator last.
 *
 * **THE QUESTION panel is gone**, and everything it held moved somewhere
 * truer. Its title and question were a second implementation of the desk's two
 * fields; both are now in `02`, from `composerFor`. Its vote syntax and its
 * voting window are decisions taken *per question*, so they are dials on `02`
 * too — see `dialsFor` for the rule. Its command field and its instruction line
 * are about how chat is parsed, so they joined the CHAT panel, where the
 * sentence explaining what a viewer types already lived.
 *
 * The row of quick-set window buttons went with it. It existed because "a
 * slider that has to be dragged to its far left to mean *no timer* hides the
 * most useful option behind a gesture" — which was right about the problem and
 * expensive about the fix, at a second control writing one field. The dial
 * reads `Until closed` at zero instead.
 *
 * `useOverlayInfo` is imported from the rite's hook rather than duplicated —
 * one overlay server serves the whole kit, so there is one thing to report.
 */
export function ConcordPage(): ReactNode {
  const overlay = getOverlay('concord')
  const entry = kitEntry('concord')

  const state = useConcordState()
  const chat = useChatStatus()
  const server = useOverlayInfo()
  const settings = useSettings()

  const runner = useDeckRunner()
  const copier = useCopy()

  /*
   * Still held, because `OptionRoster` writes through it — adding, reordering
   * and cutting an option. Its `configure` carries the presentation writes
   * below, which are not verbs and have no busy state worth drawing.
   */
  const actions = useConcordActions()

  /**
   * Which address the preview is showing.
   *
   * Local state, not config: both addresses are live at once, so there is
   * nothing to persist — this only decides which one the operator is looking at.
   */
  const [preview, setPreview] = useState<ConcordLayout>('full')

  const open = state.phase === 'open'
  const casting = state.phase === 'casting'
  const locked = open || casting

  const testMode = settings?.workspace.testMode ?? false
  const configured = (settings?.integrations.twitchChannel ?? '').trim().length > 0

  const deck = useMemo(
    () =>
      soloDeck({
        owner: 'concord',
        concord: state,
        server,
        settings,
        chatReady: configured || testMode
      }),
    [state, server, settings, configured, testMode]
  )

  // Ticks only while a timed poll is running, for the `01:12 left` in the
  // status line the bench draws.
  const now = useCountdownClock(open && state.closesAt !== null)
  const status = statusFor('concord', deck, now)
  const verbs = actionsFor('concord', deck)

  const [command, setCommand] = useEchoedText(
    state.config.command,
    (value) => void actions.configure({ command: value })
  )

  /*
   * Putting the question, and closing it, without reaching for the mouse.
   *
   * Bound to the same `DeckAction`s the buttons in `02` run, found by key
   * rather than calling the service a second way — so a chord cannot do what a
   * click is refused, and the refusal is the service's own. The cheatsheet
   * greys them rather than hiding them, which keeps the list in one order
   * however the poll is going.
   */
  const hotkeys = useMemo<Hotkey[]>(() => {
    const put = verbs.find((verb) => verb.key === 'concord:open')
    const close = verbs.find((verb) => verb.key === 'concord:close')
    const clear = verbs.find((verb) => verb.key === 'concord:reset')

    return [
      {
        chord: 'ctrl+enter',
        label: 'Put the question',
        group: 'The Concord',
        whileTyping: true,
        disabled: !put || Boolean(put.refusal),
        run: () => {
          if (put) void runner.run(put)
        }
      },
      {
        chord: 'ctrl+shift+enter',
        label: 'Close the chamber',
        group: 'The Concord',
        whileTyping: true,
        disabled: !close,
        run: () => {
          if (close) void runner.run(close)
        }
      },
      /*
       * Clearing is off `Ctrl+Backspace`. See the muster's note and
       * `ownedByTheField`: that chord is delete-the-previous-word in every text
       * field, and it was bound here to wipe the board with `whileTyping` set.
       * Destructive actions do not reach for that flag.
       */
      {
        chord: 'ctrl+shift+x',
        label: 'Clear the ballot',
        group: 'The Concord',
        disabled: !clear,
        run: () => {
          if (clear) void runner.run(clear)
        }
      }
    ]
  }, [verbs, runner])

  useHotkeys(hotkeys)

  const failure = runner.error ?? actions.error
  const dismiss = (): void => {
    runner.dismiss()
    actions.dismissError()
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber('concord')}
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
              tone={CHAT_TONE[chat.state]}
              label={
                chat.state === 'live' ? `Attending #${chat.channel}` : CHAT_STATE_LABEL[chat.state]
              }
              pulse={open}
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

      {/*
        Two different messages, because they are two different situations.

        No channel configured is a *blocked* state: the poll cannot be opened at
        all, because one that silently counts nothing costs the operator the
        moment they ask an audience to vote. Configured but not yet attending is
        a *warning*: the connection is claimed while this page is open and
        usually lands within a second, so blocking on it would be wrong.
      */}
      {!configured && !testMode ? (
        <div className={styles.blocked} role="alert">
          <span>
            No Twitch channel is set, so a poll cannot be opened — nothing would be counted. Set one
            in <Link to="/regulation">REGULATION</Link>, or enable test mode there to rehearse with
            the simulator.
          </span>
        </div>
      ) : chat.state !== 'live' && !locked && state.options.length >= 2 ? (
        <div className={styles.warning} role="status">
          <span>
            {testMode && !configured
              ? 'Test mode: no channel configured, so votes must come from the simulator.'
              : `Chat is not attending yet, so nothing is being counted. ${chat.error ?? ''}`}
          </span>
          {configured ? (
            <Button
              size="sm"
              variant="ghost"
              busy={actions.pending === 'chat'}
              onClick={() => void actions.reconnectChat()}
            >
              Reattempt
            </Button>
          ) : null}
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
            {/*
          01 — the tally is the single focal object on this page, per the brief.
          It holds no verbs any more: they live at `02` with the fields they are
          pressed against, which is their position on every page in the kit.
        */}
            <Panel
              label={state.config.title || 'The Concord'}
              index="01"
              focal

              aside={
                casting ? (
                  <span className={styles.asideLive}>Casting lots</span>
                ) : open ? (
                  <span className={styles.asideLive}>
                    {state.voters} {state.voters === 1 ? 'vote' : 'votes'}
                  </span>
                ) : state.result ? (
                  <span className={styles.asideResult}>{state.result.label}</span>
                ) : (
                  <span className={styles.count}>{state.options.length} on the ballot</span>
                )
              }
            >
              <div className={styles.tallyBody}>
                {/*
              Both addresses are live simultaneously, so this picks which one is
              being *looked at* rather than changing anything about the poll.
            */}
                <div className={styles.presetRow} role="group" aria-label="Preview layout">
                  {CONCORD_LAYOUTS.map((layout) => (
                    <button
                      key={layout}
                      type="button"
                      className={styles.preset}
                      data-active={preview === layout || undefined}
                      aria-pressed={preview === layout}
                      onClick={() => setPreview(layout)}
                    >
                      {CONCORD_LAYOUT_LABEL[layout].split(' — ')[0]}
                    </button>
                  ))}
                </div>

                <ConcordTally state={state} layout={preview} compact />

                {state.result ? (
                  <p className={styles.verdict}>
                    <span className={styles.verdictLabel}>
                      {state.result.decidedByCasting ? 'Settled by lot' : 'Carried'}
                    </span>
                    <span className={styles.verdictValue}>{state.result.label}</span>
                    <span className={styles.verdictMeta}>
                      {state.result.tally} of {state.result.total} votes from {state.result.voters}{' '}
                      {state.result.voters === 1 ? 'citizen' : 'citizens'} at{' '}
                      {formatLogTime(state.result.at)}
                      {state.result.tiedWith.length > 0
                        ? ` — tied with ${state.result.tiedWith.join(', ')}`
                        : ''}
                    </span>
                  </p>
                ) : state.phase === 'resolved' ? (
                  // Nobody voted. Said plainly rather than dressed up as a result.
                  <p className={styles.verdict}>
                    <span className={styles.verdictMeta}>The chamber did not speak.</span>
                  </p>
                ) : null}
              </div>
            </Panel>

            {/* 02 — the desk's own controls, on the overlay's page. */}
            <Panel label="Run the vote" index="02">
              <OverlayBench
                entry={entry}
                status={status}
                actions={verbs}
                composer={composerFor('concord', deck)}
                dials={dialsFor('concord', deck)}
                rows={[]}
                copier={copier}
                runner={runner}
                variant="page"
              />
            </Panel>

            {/*
          04 — the connection, and how what arrives on it is read.
          The command field is here rather than with the question because it is
          a parsing setting, and the sentence saying what a viewer types was
          already on this panel.
        */}
            <Panel
              label="Chat"
              index="04"

              aside={
                <StatusDot tone={CHAT_TONE[chat.state]} label={CHAT_STATE_LABEL[chat.state]} />
              }
            >
              <div className={styles.config}>
                <p className={styles.hint}>
                  Chat is read anonymously — there is nothing to authorise and no token stored. Set
                  the channel in <Link to="/regulation">REGULATION</Link>.
                </p>

                <FieldGrid columns={2}>
                  <Field label="Channel" value={chat.channel ?? '—'} mono />
                  <Field label="Messages seen" value={chat.messages} mono />
                  <Field
                    label="Last message"
                    value={chat.lastMessageAt ? formatLogTime(chat.lastMessageAt) : '—'}
                    mono
                  />
                  <Field label="Attempts" value={chat.failures} mono />
                </FieldGrid>

                {chat.error ? <p className={styles.warnText}>{chat.error}</p> : null}

                <Button
                  size="sm"
                  variant="ghost"
                  busy={actions.pending === 'chat'}
                  onClick={() => void actions.reconnectChat()}
                >
                  Reattempt
                </Button>

                {state.config.voteSyntax !== 'bare' ? (
                  <TextInput
                    label="Command"
                    value={command}
                    onChange={setCommand}
                    disabled={locked}
                    placeholder="!vote"
                    hint="Another bot's command is never counted as a vote."
                  />
                ) : null}

                <p className={styles.hint}>
                  Viewers vote with{' '}
                  <code className={styles.inline}>{state.options[0]?.token ?? '1'}</code>
                  {state.config.voteSyntax !== 'bare' ? (
                    <>
                      {' '}
                      or{' '}
                      <code className={styles.inline}>
                        {displayVoteCommand(state.config.command)} {state.options[0]?.token ?? '1'}
                      </code>
                    </>
                  ) : null}
                  . A message naming two options is discarded rather than guessed.
                </p>

                <p className={styles.instruction}>{voteInstruction(state.config)}</p>
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
                  Two addresses, one poll. Add either as a Browser source — or both, in different
                  scenes, and they stay in step.
                </p>

                <AddressList
                  rows={addressRowsFor(overlay, server.url)}
                  copied={copier.copied}
                  failed={copier.failed}
                  onCopy={copier.copy}
                  offline={server.error ?? 'The overlay server is not listening.'}
                />

                <FieldGrid columns={2}>
                  <Field label="Port" value={server.port ?? '—'} mono />
                  <Field label="Attached" value={server.clients} mono />
                </FieldGrid>
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            {/*
          03 — composition. Reordering a ballot and cutting an option are the
          things deliberately not on the bench: they need a list, not one line.
        */}
            <Panel label="Ballot" index="03">
              <OptionRoster state={state} actions={actions} />
            </Panel>

            {/*
          05 — everything here changes how the overlay looks and nothing here
          changes how a vote is counted. All of it is a fixed choice within the
          locked palette rather than free-form styling — there is deliberately
          no colour picker.
        */}
            <Panel label="Presentation" index="05">
              <div className={styles.config}>
                <PresentationControls
                  values={state.config}
                  onChange={(patch) => void actions.configure(patch)}
                  onReset={() => void actions.configure({ scale: 1, typeScale: 1, opacity: 1 })}
                  adjusted={
                    state.config.scale !== 1 ||
                    state.config.typeScale !== 1 ||
                    state.config.opacity !== 1
                  }
                />

                <SelectInput
                  label="Presentation"
                  value={state.config.presentation}
                  options={CONCORD_PRESENTATIONS.map((presentation) => ({
                    value: presentation,
                    label: CONCORD_PRESENTATION_LABEL[presentation]
                  }))}
                  onChange={(presentation) => void actions.configure({ presentation })}
                  hint="Applies to both addresses. Options are told apart by engraving and length, never by colour — THE COUNCIL wants more room than the widget has."
                />

                <SelectInput
                  label="Preset"
                  value={state.config.theme}
                  options={OVERLAY_THEMES.map((theme) => ({
                    value: theme,
                    label: OVERLAY_THEME_LABEL[theme]
                  }))}
                  onChange={(theme) => void actions.configure({ theme })}
                  hint="Five materials, three arrangements. Crimson stays on the focal point in all of them."
                />

                {/*
              There is no "appear and withdraw" any more. The source used to be
              absent between polls, on the reasoning that a widget living
              permanently in a scene should not show an empty ballot — but the
              rest of the kit holds its resting state, and an overlay that
              vanishes reads as a broken source rather than as an idle one.
            */}
                <Slider
                  label="Hold the result"
                  min={RESULT_LINGER_MIN_MS}
                  max={RESULT_LINGER_MAX_MS}
                  step={1_000}
                  value={state.config.resultLingerMs}
                  readout={`${Math.round(state.config.resultLingerMs / 1000)}s`}
                  onChange={(resultLingerMs) => void actions.configure({ resultLingerMs })}
                  hint="How long the settled result stays up before the chamber returns to rest."
                />

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>What is drawn</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Masthead"
                      checked={state.config.showMasthead}
                      onChange={(showMasthead) => void actions.configure({ showMasthead })}
                    />
                    <Checkbox
                      label="Resonance field"
                      checked={state.config.showField}
                      onChange={(showField) => void actions.configure({ showField })}
                      hint="Tightens and brightens with the rate votes are arriving."
                    />
                    <Checkbox
                      label="Numerals on the ballot"
                      checked={state.config.showTokens}
                      onChange={(showTokens) => void actions.configure({ showTokens })}
                      hint="Hiding these leaves the audience nothing to type."
                    />
                    <Checkbox
                      label="Percentages"
                      checked={state.config.showPercentages}
                      onChange={(showPercentages) => void actions.configure({ showPercentages })}
                    />
                    <Checkbox
                      label="Voter count"
                      checked={state.config.showVoterCount}
                      onChange={(showVoterCount) => void actions.configure({ showVoterCount })}
                    />
                    <Checkbox
                      label="Voting instruction"
                      checked={state.config.showInstruction}
                      onChange={(showInstruction) => void actions.configure({ showInstruction })}
                    />
                    <Checkbox
                      label="Connection readout"
                      checked={state.config.showStatus}
                      onChange={(showStatus) => void actions.configure({ showStatus })}
                    />
                  </div>
                </div>

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>Layout and sound</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Composite over the scene"
                      checked={state.config.transparent}
                      onChange={(transparent) => void actions.configure({ transparent })}
                      hint="Drops the backdrop so the tally sits over your capture. Tick Transparent on the OBS source too."
                    />
                    <Checkbox
                      label="Audio cues"
                      checked={state.config.sound}
                      onChange={(sound) => void actions.configure({ sound })}
                      hint="Final call, and a chime if the chamber deadlocks. Console only — the broadcast stays silent."
                    />
                  </div>

                  <Slider
                    label="Reserve right edge"
                    min={0}
                    max={Math.round(MAX_EDGE_RESERVE * 100)}
                    step={1}
                    value={Math.round(state.config.reserveRight * 100)}
                    readout={`${Math.round(state.config.reserveRight * 100)}% · ${Math.round(
                      state.config.reserveRight * OVERLAY_REFERENCE_WIDTH
                    )}px`}
                    onChange={(percent) => void actions.configure({ reserveRight: percent / 100 })}
                    hint={`Dead space for chat and camera — nothing is drawn there. Pixels quoted at ${OVERLAY_REFERENCE_WIDTH}px wide.`}
                  />
                </div>
              </div>
            </Panel>

            <Panel
              label="Record"
              index="07"

              aside={
                state.history.length > 0 ? (
                  <button
                    type="button"
                    className={styles.dismiss}
                    onClick={() => void actions.clearHistory()}
                  >
                    Purge
                  </button>
                ) : null
              }
            >
              {state.history.length === 0 ? (
                <p className={styles.empty}>No questions on record.</p>
              ) : (
                <ol className={styles.history}>
                  {state.history.map((item) => (
                    <li key={`${item.optionId}-${item.at}`} className={styles.historyRow}>
                      <span className={styles.historyTime}>{formatLogTime(item.at)}</span>
                      <span className={styles.historyLabel} title={item.label}>
                        {item.label}
                      </span>
                      <span className={styles.historyOdds}>
                        {item.tally} / {item.total}
                        {item.decidedByCasting ? ` · lot of ${item.tiedWith.length + 1}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>

        {/*
          Last, as on every page in the kit, so every index above it is a
          literal. It was `07` with the record renumbering itself beneath it
          whenever rehearsal mode was switched on in REGULATION.

          Rehearsal scaffolding, and the only way to exercise this feature
          without an audience. Shown when test mode is on rather than only in
          development, so a packaged console can be rehearsed against before a
          stream — which is exactly when it matters.
        */}
        {testMode ? (
          <Panel label="Simulator" index="08" className={styles.span6}>
            <div className={styles.simulator}>
              <p className={styles.hint}>
                Injects synthetic votes through the real parser and the real counting path — not
                straight into the ledger, or it would prove nothing.
              </p>
              <div className={styles.simulatorRow}>
                {[25, 250, 1000].map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant="ghost"
                    disabled={!open}
                    busy={actions.pending === 'simulate'}
                    onClick={() => void actions.simulate(count)}
                  >
                    +{count}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!open}
                  busy={actions.pending === 'simulate'}
                  onClick={() => void actions.simulate(300, true)}
                >
                  300 from a third as many voters
                </Button>
              </div>
              <p className={styles.hint}>
                The last button reuses ids, so votes change rather than accumulate — the total
                should move while the voter count holds.
              </p>
              {!open ? <p className={styles.empty}>Put the question first.</p> : null}
            </div>
          </Panel>
        ) : null}
      </motion.div>
    </div>
  )
}
