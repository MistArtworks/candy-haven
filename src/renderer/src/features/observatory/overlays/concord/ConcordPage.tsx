import { useMemo, useState, type ReactNode } from 'react'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay, overlayAddressUrl, overlayAddresses } from '@shared/domain/overlays'
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
  POLL_DURATION_MAX_MS,
  POLL_DURATION_MIN_MS,
  POLL_QUICK_SET,
  RESULT_LINGER_MAX_MS,
  RESULT_LINGER_MIN_MS,
  VOTE_SYNTAXES,
  VOTE_SYNTAX_LABEL,
  displayVoteCommand,
  isDeadlocked,
  voteInstruction
} from '@shared/domain/concord.constants'
import type { ChatConnectionState } from '@shared/domain/chat.constants'
import { CHAT_STATE_LABEL } from '@shared/domain/chat.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { Slider } from '@renderer/components/primitives/Slider'
import { formatLogTime } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useChatStatus, useConcordActions, useConcordState } from '@renderer/hooks/useConcord'
import { useSettings } from '@renderer/hooks/useSettings'
import { ConcordTally } from './components/ConcordTally'
import { OptionRoster } from './components/OptionRoster'
import styles from './ConcordPage.module.scss'

/**
 * Chat state as a status tone.
 *
 * `idle` maps to `offline` rather than to a fault tone: nothing is listening
 * because nothing needs to be, which is the normal condition of an app that is
 * not running a poll. Showing it in crimson would have the operator trying to
 * fix something that is working correctly.
 */
const CHAT_TONE: Record<ChatConnectionState, StatusTone> = {
  idle: 'offline',
  connecting: 'pending',
  live: 'online',
  retrying: 'warn',
  failed: 'error'
}

/**
 * THE CONCORD — host surface.
 *
 * One overlay out of the OBSERVATORY catalogue. The audience votes in chat and
 * sees the tally through a browser source pointed at this overlay's slug; both
 * surfaces render the same state from the same renderer, so what the operator
 * watches here is what is on the stream.
 *
 * `useOverlayInfo` is imported from the rite's hook rather than duplicated — one
 * overlay server serves the whole catalogue, so there is one thing to report.
 */
export function ConcordPage(): ReactNode {
  const overlay = getOverlay('concord')
  const state = useConcordState()
  const chat = useChatStatus()
  const server = useOverlayInfo()
  const actions = useConcordActions()

  const settings = useSettings()
  /**
   * Which address the preview is showing.
   *
   * Local state, not config: both addresses are live at once, so there is
   * nothing to persist — this only decides which one the operator is looking at.
   */
  const [preview, setPreview] = useState<ConcordLayout>('full')
  const [copied, setCopied] = useState<string | null>(null)

  const open = state.phase === 'open'
  const casting = state.phase === 'casting'
  const locked = open || casting

  /*
   * The gate, mirrored from the service.
   *
   * `open()` refuses without a configured channel unless test mode is on, and
   * the button is disabled on the same condition — so the operator is told
   * before they act rather than by an error afterwards. The service keeps the
   * authoritative check; this is only there to make it visible.
   */
  const testMode = settings?.workspace.testMode ?? false
  const configured = (settings?.integrations.twitchChannel ?? '').trim().length > 0
  const canOpen = state.options.length >= 2 && !locked && (configured || testMode)

  /*
   * Putting the question, and closing it, without reaching for the mouse.
   *
   * The same disabled conditions the buttons use, so a chord cannot do what a
   * click is refused — the cheatsheet greys them rather than hiding them, which
   * keeps the list in one order however the poll is going.
   */
  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: 'ctrl+enter',
        label: 'Put the question',
        group: 'The Concord',
        whileTyping: true,
        disabled: !canOpen,
        run: () => void actions.open()
      },
      {
        chord: 'ctrl+shift+enter',
        label: 'Close the chamber',
        group: 'The Concord',
        whileTyping: true,
        disabled: !open,
        run: () => void actions.close()
      },
      {
        chord: 'ctrl+backspace',
        label: 'Clear the ballot',
        group: 'The Concord',
        whileTyping: true,
        disabled: casting || (state.phase === 'idle' && !state.result),
        run: () => void actions.reset()
      }
    ],
    [actions, canOpen, casting, open, state.phase, state.result]
  )

  useHotkeys(hotkeys)

  /*
   * The three text fields, owned locally while they are being typed into.
   *
   * They were controlled straight off the pushed state, which dropped
   * characters at speed — see `useEchoedText` for the mechanism.
   */
  const [title, setTitle] = useEchoedText(
    state.config.title,
    (value) => void actions.configure({ title: value })
  )
  const [prompt, setPrompt] = useEchoedText(
    state.config.prompt,
    (value) => void actions.configure({ prompt: value })
  )
  const [command, setCommand] = useEchoedText(
    state.config.command,
    (value) => void actions.configure({ command: value })
  )

  const addresses = overlayAddresses(overlay)

  const copyUrl = (slug: string, url: string): void => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug)
      setTimeout(() => setCopied((current) => (current === slug ? null : current)), 1600)
    })
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
              tone={CHAT_TONE[chat.state]}
              label={
                chat.state === 'live' ? `Attending #${chat.channel}` : CHAT_STATE_LABEL[chat.state]
              }
              pulse={open}
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
        {/* The tally is the single focal object on this page, per the brief. */}
        <Panel
          label={state.config.title || 'The Concord'}
          index="01"
          focal
          className={styles.tallyPanel}
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
              <span className={styles.asideIdle}>{state.options.length} on the ballot</span>
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

            <div className={styles.controls}>
              <Button
                variant="primary"
                disabled={!canOpen}
                busy={actions.pending === 'open'}
                onClick={() => void actions.open()}
              >
                Put the question
              </Button>
              <Button
                variant="ghost"
                disabled={!open}
                busy={actions.pending === 'close'}
                onClick={() => void actions.close()}
              >
                {isDeadlocked(state.options) && open ? 'Close — will cast lots' : 'Close the vote'}
              </Button>
              <Button
                variant="ghost"
                disabled={casting || (state.phase === 'idle' && !state.result)}
                busy={actions.pending === 'reset'}
                onClick={() => void actions.reset()}
              >
                Clear votes
              </Button>
            </div>

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

        <Panel label="Ballot" index="02" className={styles.span2}>
          <OptionRoster state={state} actions={actions} />
        </Panel>

        <Panel
          label="Chat"
          index="03"
          className={styles.span2}
          aside={<StatusDot tone={CHAT_TONE[chat.state]} label={CHAT_STATE_LABEL[chat.state]} />}
        >
          <div className={styles.broadcast}>
            <p className={styles.hint}>
              Chat is read anonymously — there is nothing to authorise and no token stored. Set the
              channel in <Link to="/regulation">REGULATION</Link>.
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
          </div>
        </Panel>

        <Panel label="The question" index="04" className={styles.span2}>
          <div className={styles.config}>
            <TextInput label="Title" value={title} onChange={setTitle} placeholder="THE CONCORD" />
            <TextInput
              label="Question"
              value={prompt}
              onChange={setPrompt}
              hint="Shown above the ballot on the overlay."
            />

            {/*
              Zero is a real setting, not an unset one, so it gets its own
              control rather than being the bottom of the slider's range — a
              slider that has to be dragged to its far left to mean "no timer"
              hides the most useful option behind a gesture.
            */}
            <div className={styles.presets}>
              <span className={styles.presetLabel}>Voting window</span>
              <div className={styles.presetRow}>
                {POLL_QUICK_SET.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={styles.preset}
                    data-active={state.config.durationMs === seconds * 1000 || undefined}
                    disabled={locked}
                    onClick={() => void actions.configure({ durationMs: seconds * 1000 })}
                  >
                    {seconds === 0 ? 'Manual' : `${seconds}s`}
                  </button>
                ))}
              </div>
            </div>

            {state.config.durationMs > 0 ? (
              <Slider
                label="Window length"
                min={POLL_DURATION_MIN_MS}
                max={POLL_DURATION_MAX_MS}
                step={5_000}
                value={state.config.durationMs}
                disabled={locked}
                readout={`${Math.round(state.config.durationMs / 1000)}s`}
                onChange={(durationMs) => void actions.configure({ durationMs })}
              />
            ) : (
              <p className={styles.hint}>
                No timer — the vote stays open until you close it. The overlay shows no countdown.
              </p>
            )}

            <SelectInput
              label="Vote syntax"
              value={state.config.voteSyntax}
              options={VOTE_SYNTAXES.map((syntax) => ({
                value: syntax,
                label: VOTE_SYNTAX_LABEL[syntax]
              }))}
              onChange={(voteSyntax) => void actions.configure({ voteSyntax })}
              disabled={locked}
              hint="A bare numeral gets far more turnout; the command is unambiguous. Either accepts both."
            />

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

            <p className={styles.instruction}>{voteInstruction(state.config)}</p>
          </div>
        </Panel>

        {/*
          Presentation is split from the question: everything here changes how
          the overlay looks and nothing here changes how a vote is counted. All
          of it is a fixed choice within the locked palette rather than
          free-form styling — there is deliberately no colour picker.
        */}
        <Panel label="Presentation" index="05" className={styles.span2}>
          <div className={styles.config}>
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

            <Checkbox
              label="Composite over the scene"
              checked={state.config.transparent}
              onChange={(transparent) => void actions.configure({ transparent })}
              hint="Drops the backdrop so the tally sits over your capture. Tick Transparent on the OBS source too."
            />

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
              <Checkbox
                label="Audio cues"
                checked={state.config.sound}
                onChange={(sound) => void actions.configure({ sound })}
                hint="Final call, and a chime if the chamber deadlocks. Console only — the broadcast stays silent."
              />
            </div>
          </div>
        </Panel>

        <Panel
          label="Broadcast source"
          index="06"
          className={styles.span2}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.broadcast}>
            {server.url ? (
              <>
                <p className={styles.hint}>
                  Two addresses, one poll. Add either as a Browser source — or both, in different
                  scenes, and they stay in step.
                </p>

                {addresses.map((address) => {
                  const url = overlayAddressUrl(server.url as string, address.slug)
                  return (
                    <div key={address.slug} className={styles.address}>
                      <span className={styles.addressLabel}>{address.label}</span>
                      <span className={styles.addressPurpose}>
                        {address.purpose} · {address.canvas.width}×{address.canvas.height}
                      </span>
                      <code className={styles.url}>{url}</code>
                      <div className={styles.broadcastActions}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyUrl(address.slug, url)}
                        >
                          {copied === address.slug ? 'Copied' : 'Copy address'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void window.candy.shell.openExternal(url)}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  )
                })}

                <p className={styles.hint}>
                  Append <code className={styles.inline}>?transparent=1</code> to either address to
                  composite over your scene instead of on its own backdrop.
                </p>
              </>
            ) : (
              <p className={styles.hint}>
                {server.error ?? 'The overlay server is not listening.'}
              </p>
            )}

            <FieldGrid columns={2}>
              <Field label="Port" value={server.port ?? '—'} mono />
              <Field label="Attached" value={server.clients} mono />
            </FieldGrid>
          </div>
        </Panel>

        {/*
          Rehearsal scaffolding, and the only way to exercise this feature
          without an audience. Shown when test mode is on rather than only in
          development, so a packaged console can be rehearsed against before a
          stream — which is exactly when it matters.
        */}
        {testMode ? (
          <Panel label="Simulator" index="07" className={styles.span2}>
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
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={!open}
                busy={actions.pending === 'simulate'}
                onClick={() => void actions.simulate(300, true)}
              >
                300 from a third as many voters
              </Button>
              <p className={styles.hint}>
                The second button reuses ids, so votes change rather than accumulate — the total
                should move while the voter count holds.
              </p>
              {!open ? <p className={styles.hint}>Put the question first.</p> : null}
            </div>
          </Panel>
        ) : null}

        <Panel
          label="Record"
          index={testMode ? '08' : '07'}
          className={testMode ? styles.span4 : styles.span6}
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
            <p className={styles.hint}>No questions on record.</p>
          ) : (
            <ol className={styles.history}>
              {state.history.map((entry) => (
                <li key={`${entry.optionId}-${entry.at}`} className={styles.historyRow}>
                  <span className={styles.historyTime}>{formatLogTime(entry.at)}</span>
                  <span className={styles.historyLabel} title={entry.label}>
                    {entry.label}
                  </span>
                  <span className={styles.historyOdds}>
                    {entry.tally} / {entry.total}
                    {entry.decidedByCasting ? ` · lot of ${entry.tiedWith.length + 1}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </motion.div>
    </div>
  )
}
