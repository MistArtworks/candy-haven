import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { MusterDestination, MusterState } from '@shared/domain/muster'
import {
  DURATION_MAX_MS,
  DURATION_MIN_MS,
  LINGER_MAX_MS,
  LINGER_MIN_MS,
  MAX_ENTRIES,
  MAX_ENTRY_LENGTH,
  MAX_PROMPT_LENGTH,
  MUSTER_PHASE_LABEL,
  PER_CITIZEN_MAX,
  PER_CITIZEN_MIN,
  createEmptyMusterState,
  fileInstruction
} from '@shared/domain/muster.constants'
import { getOverlay, overlayAddressUrl, overlayAddresses } from '@shared/domain/overlays'
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
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { MusterFace } from '@renderer/muster/muster-renderer'
import styles from './MusterPage.module.scss'

/**
 * THE MUSTER — host surface.
 *
 * The operator puts a question, chat files against it, and the roll is handed
 * on when the call closes. This page is where the call is run: put it, watch
 * it fill, close it, send it.
 *
 * The roll is the focal object rather than the preview, which is a departure
 * from the other overlay pages and the right one — during a call the operator
 * is reading entries and deciding whether to cut one, not admiring the
 * composition. The preview sits beside it.
 */
export function MusterPage(): ReactNode {
  const overlay = getOverlay('muster')
  const server = useOverlayInfo()

  const [state, setState] = useState<MusterState>(createEmptyMusterState)
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [question, setQuestion] = useState('')

  useEffect(() => {
    let alive = true
    void window.candy.muster.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.muster.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  /**
   * Every action funnels through here.
   *
   * One place that reports a refusal, because the service refuses several
   * things on purpose — a call without a channel, an entry onto a full roll,
   * a hand-off of an empty one — and each of those is worth saying rather
   * than swallowing.
   */
  const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    try {
      await action()
      setNotice(null)
    } catch (cause) {
      const failure = cause as Error & { hint?: string | null }
      setNotice(failure.hint ? `${failure.message} ${failure.hint}` : failure.message)
    } finally {
      setBusy((current) => (current === key ? null : current))
    }
  }

  const config = state.config
  const open = state.phase === 'open'

  // Owned locally while being typed into; see `useEchoedText`. Bound straight
  // to the pushed state these would drop characters at speed.
  const [title, setTitle] = useEchoedText(
    config.title,
    (value) => void window.candy.muster.configure({ title: value })
  )
  const [prompt, setPrompt] = useEchoedText(
    config.prompt,
    (value) => void window.candy.muster.configure({ prompt: value })
  )
  const [command, setCommand] = useEchoedText(
    config.command,
    (value) => void window.candy.muster.configure({ command: value })
  )

  const addresses = overlayAddresses(overlay)

  const copy = (slug: string, url: string): void => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug)
      setTimeout(() => setCopied((current) => (current === slug ? null : current)), 1600)
    })
  }

  const handoff = (destination: MusterDestination): void => {
    void run('handoff', async () => {
      const result = await window.candy.muster.handoff({ destination, clear: false })
      setNotice(
        result.dropped > 0
          ? `Sent ${result.sent}. ${result.dropped} did not fit and stayed on the roll.`
          : `Sent ${result.sent}.`
      )
    })
  }

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: 'ctrl+enter',
        label: open ? 'Close the call' : 'Put the call',
        group: 'The Muster',
        whileTyping: true,
        run: () =>
          void run('call', () =>
            open ? window.candy.muster.close() : window.candy.muster.open(question)
          )
      },
      {
        chord: 'ctrl+backspace',
        label: 'Clear the roll',
        group: 'The Muster',
        whileTyping: true,
        disabled: state.phase === 'idle' && state.entries.length === 0,
        run: () => void run('reset', () => window.candy.muster.reset())
      }
    ],
    // `run` is redefined each render and depending on it would rebuild the
    // list every keystroke; the values it closes over are all here.

    [open, question, state.phase, state.entries.length]
  )

  useHotkeys(hotkeys)

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
              tone={open ? 'online' : state.entries.length > 0 ? 'pending' : 'offline'}
              label={MUSTER_PHASE_LABEL[state.phase]}
              pulse={open}
            />
          </div>
        }
      />

      {notice ? (
        <div className={styles.notice} role="alert">
          <span>{notice}</span>
          <button type="button" className={styles.dismiss} onClick={() => setNotice(null)}>
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
        {/*
          The roll is the focal object, not the preview. During a call the
          operator is reading entries and deciding whether to cut one.
        */}
        <Panel
          label="The roll"
          index="01"
          focal
          className={styles.rollPanel}
          aside={
            <span className={styles.count}>
              {state.entries.length} / {config.maxEntries} · {state.citizens} citizen
              {state.citizens === 1 ? '' : 's'}
              {state.turnedAway > 0 ? ` · ${state.turnedAway} turned away` : ''}
            </span>
          }
        >
          <div className={styles.roll}>
            <div className={styles.callRow}>
              <TextInput
                label="Put the question"
                value={question}
                onChange={setQuestion}
                maxLength={MAX_PROMPT_LENGTH}
                placeholder={config.prompt}
                className={styles.callField}
                disabled={open}
              />
              <Button
                variant="primary"
                busy={busy === 'call'}
                onClick={() =>
                  void run('call', () =>
                    open ? window.candy.muster.close() : window.candy.muster.open(question)
                  )
                }
              >
                {open ? 'Close the call' : 'Put the call'}
              </Button>
              <Button
                disabled={state.phase === 'idle' && state.entries.length === 0}
                busy={busy === 'reset'}
                onClick={() => void run('reset', () => window.candy.muster.reset())}
              >
                Clear
              </Button>
            </div>

            {open ? (
              <p className={styles.hint}>
                Chat files with <code className={styles.inline}>!{config.command} anything</code>.{' '}
                {/* Whether the call is timed is a property of the state, not
                    of the clock — asking the clock during render is impure and
                    would also be the wrong question. */}
                {state.closesAt === null
                  ? 'The call stays open until you close it.'
                  : 'The clock is running.'}
              </p>
            ) : null}

            {state.entries.length === 0 ? (
              <p className={styles.empty}>
                {open ? 'Nothing filed yet.' : 'No roll. Put a question to start a call.'}
              </p>
            ) : (
              <ol className={styles.entries}>
                {state.entries.map((entry, index) => (
                  <li key={entry.id} className={styles.entry}>
                    <span className={styles.entryIndex}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={styles.entryText}>{entry.text}</span>
                    <span className={styles.entryAuthor}>{entry.author}</span>
                    <button
                      type="button"
                      className={styles.strike}
                      title="Strike this entry from the roll"
                      aria-label={`Strike ${entry.text}`}
                      onClick={() => void run('remove', () => window.candy.muster.remove(entry.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {/*
              The operator filing directly. Useful for seeding a roll before a
              call and for adding something said out loud rather than typed.
            */}
            <div className={styles.addRow}>
              <TextInput
                label="File one yourself"
                value={draft}
                onChange={setDraft}
                maxLength={MAX_ENTRY_LENGTH}
                placeholder="Anything"
                className={styles.callField}
                onEnter={() => {
                  if (!draft.trim()) return
                  void run('add', () => window.candy.muster.add({ text: draft, author: '' }))
                  setDraft('')
                }}
              />
              <Button
                disabled={!draft.trim()}
                busy={busy === 'add'}
                onClick={() => {
                  void run('add', () => window.candy.muster.add({ text: draft, author: '' }))
                  setDraft('')
                }}
              >
                File
              </Button>
            </div>
          </div>
        </Panel>

        <Panel label="Face" index="02" className={styles.facePanel}>
          <FacePreview state={state} />
        </Panel>

        {/*
          The point of the whole department: entries arrive as people and leave
          as options. A roll longer than the destination allows is truncated
          rather than refused, and the count that went is reported back.
        */}
        <Panel label="Hand on" index="03" className={styles.span2}>
          <div className={styles.handoff}>
            <p className={styles.hint}>
              Send the roll to the ring to be drawn from, to the chamber to be voted on, or both — a
              roll can be voted down to a shortlist and the shortlist then drawn. The chamber takes
              ten; the ring takes rather more.
            </p>
            <div className={styles.handoffActions}>
              <Button
                disabled={state.entries.length === 0}
                busy={busy === 'handoff'}
                onClick={() => handoff('selection')}
              >
                To the ring
              </Button>
              <Button
                disabled={state.entries.length === 0}
                busy={busy === 'handoff'}
                onClick={() => handoff('concord')}
              >
                To the chamber
              </Button>
              <Button
                variant="primary"
                disabled={state.entries.length === 0}
                busy={busy === 'handoff'}
                onClick={() => handoff('both')}
              >
                To both
              </Button>
            </div>
            <FieldGrid columns={2}>
              <Field label="On the roll" value={state.entries.length} mono />
              <Field label="Filed by" value={`${state.citizens}`} mono />
            </FieldGrid>
          </div>
        </Panel>

        <Panel label="The call" index="04" className={styles.span2}>
          <div className={styles.config}>
            <TextInput label="Title" value={title} onChange={setTitle} placeholder="THE MUSTER" />
            <TextInput
              label="Standing question"
              value={prompt}
              onChange={setPrompt}
              maxLength={MAX_PROMPT_LENGTH}
              hint="Used when a call is put without one of its own."
            />
            <TextInput
              label="Command"
              value={command}
              onChange={setCommand}
              hint={`Chat files with !${config.command}. ${fileInstruction(config)}`}
            />

            <Slider
              label="Call runs for"
              min={0}
              max={DURATION_MAX_MS}
              step={15_000}
              value={config.durationMs}
              readout={
                config.durationMs === 0
                  ? 'Until closed'
                  : `${Math.round(config.durationMs / 1000)}s`
              }
              onChange={(durationMs) => void window.candy.muster.configure({ durationMs })}
              hint={`Zero means until you close it. Otherwise between ${DURATION_MIN_MS / 1000}s and ${DURATION_MAX_MS / 60_000} minutes.`}
            />

            <Slider
              label="Hold the closed roll"
              min={LINGER_MIN_MS}
              max={LINGER_MAX_MS}
              step={5_000}
              value={config.lingerMs}
              readout={`${Math.round(config.lingerMs / 1000)}s`}
              onChange={(lingerMs) => void window.candy.muster.configure({ lingerMs })}
              hint="How long a closed roll stays on the scene before the overlay returns to rest."
            />

            <Slider
              label="Entries per citizen"
              min={PER_CITIZEN_MIN}
              max={PER_CITIZEN_MAX}
              step={1}
              value={config.perCitizen}
              readout={`${config.perCitizen}`}
              onChange={(perCitizen) => void window.candy.muster.configure({ perCitizen })}
              hint="Duplicates are refused regardless, so one person cannot fill the roll with the same entry."
            />

            <Slider
              label="Roll holds at most"
              min={4}
              max={MAX_ENTRIES}
              step={1}
              value={config.maxEntries}
              readout={`${config.maxEntries}`}
              onChange={(maxEntries) => void window.candy.muster.configure({ maxEntries })}
              hint="A composition limit, not a performance one: more than this cannot be read on a broadcast."
            />
          </div>
        </Panel>

        <Panel label="Presentation" index="05" className={styles.span2}>
          <div className={styles.config}>
            <div className={styles.toggles}>
              <Checkbox
                label="Credit each entry"
                checked={config.showAuthors}
                onChange={(showAuthors) => void window.candy.muster.configure({ showAuthors })}
              />
              <Checkbox
                label="Show the instruction"
                checked={config.showInstruction}
                onChange={(showInstruction) =>
                  void window.candy.muster.configure({ showInstruction })
                }
                hint="An audience cannot file in a syntax nobody told them."
              />
              <Checkbox
                label="Show the count"
                checked={config.showCount}
                onChange={(showCount) => void window.candy.muster.configure({ showCount })}
              />
              <Checkbox
                label="Draw the resonance field"
                checked={config.showField}
                onChange={(showField) => void window.candy.muster.configure({ showField })}
                hint="A node per entry, joined where they are close. Each filing arrives as a flare."
              />
              <Checkbox
                label="Composite over the scene"
                checked={config.transparent}
                onChange={(transparent) => void window.candy.muster.configure({ transparent })}
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
              onChange={(percent) =>
                void window.candy.muster.configure({ reserveRight: percent / 100 })
              }
              hint="Nothing is drawn into this band, so a camera or a chat panel can be composited there."
            />
          </div>
        </Panel>

        <Panel
          label="Broadcast sources"
          index="06"
          className={styles.wide}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.broadcast}>
            <p className={styles.hint}>
              Two addresses off one call: the full scene, and a corner plate showing the question
              and the latest filings. Both can run at once.
            </p>

            {addresses.map((address) => (
              <div key={address.slug} className={styles.address}>
                <div className={styles.addressHead}>
                  <span className={styles.addressLabel}>{address.label}</span>
                  <span className={styles.addressSize}>
                    {address.canvas.width} × {address.canvas.height}
                  </span>
                </div>
                <p className={styles.addressPurpose}>{address.purpose}</p>
                {server.url ? (
                  <>
                    <code className={styles.url}>
                      {overlayAddressUrl(server.url, address.slug)}
                    </code>
                    <div className={styles.addressActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copy(address.slug, overlayAddressUrl(server.url as string, address.slug))
                        }
                      >
                        {copied === address.slug ? 'Copied' : 'Copy address'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void window.candy.shell.openExternal(
                            overlayAddressUrl(server.url as string, address.slug)
                          )
                        }
                      >
                        Preview
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className={styles.hint}>{server.error ?? 'The overlay server is offline.'}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>
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
