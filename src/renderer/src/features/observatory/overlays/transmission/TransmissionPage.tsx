import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { NowPlayingConfig, NowPlayingState } from '@shared/domain/nowplaying'
import {
  NOW_PLAYING_ACCENTS,
  NOW_PLAYING_ACCENT_LABEL,
  NOW_PLAYING_CANVAS,
  NOW_PLAYING_STYLES,
  NOW_PLAYING_STYLE_LABEL,
  POLL_MAX_SECONDS,
  POLL_MIN_SECONDS,
  createDefaultNowPlayingConfig,
  formatArtists,
  formatTrackTime,
  trackProgressAt
} from '@shared/domain/nowplaying.constants'
import { getOverlay } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import {
  useNowPlaying,
  useNowPlayingActions,
  usePlaybackClock,
  useSpotifySetup
} from '@renderer/hooks/useNowPlaying'
import { NowPlayingFace } from '@renderer/nowplaying/nowplaying-renderer'
import { useCopy } from '@renderer/hooks/useCopy'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { SourceList } from './SourceList'
import styles from './TransmissionPage.module.scss'
import { OverlayBench } from '../../components/OverlayBench'
import { PresentationControls } from '../../components/PresentationControls'
import { kitEntry, kitNumber } from '../../lib/kit'
import { actionsFor, soloDeck, statusFor, useDeckRunner } from '../../lib/deck'
import { PRESENTATION_LIMITS } from '@shared/domain/presentation'

const LINK_TONE: Record<string, StatusTone> = {
  unconfigured: 'offline',
  disconnected: 'pending',
  linking: 'warn',
  connected: 'online',
  error: 'error'
}

/**
 * NOW TRANSMITTING — host surface.
 *
 * Live Spotify playback, presented four ways — and all four at once, as four
 * browser sources with four addresses. One poller and one track; a *source*
 * decides only how it is drawn, so a scene collection can carry a plate in one
 * scene and a disc in another without the operator changing a setting
 * mid-broadcast.
 *
 * The console is also where the account is linked: the authorisation page opens
 * in the operator's own browser rather than in an app window, so they can see
 * the address bar and reach their password manager.
 *
 * On the kit's standing shape: `01` the face as the one focal panel, `02` the
 * controls that run it, then presentation, then the addresses, then setup.
 *
 * **This is the one page in the kit with no BROADCAST panel of its own**, and
 * the absence is deliberate rather than an omission. Every other overlay
 * answers on one or two fixed addresses, so it gets an `AddressList`. This one
 * answers on *as many as the operator has made* — a source is the unit, and
 * `SourceList` already draws each with its address, a copy and a preview.
 * A second panel restating them would be the same list twice.
 */
export function TransmissionPage(): ReactNode {
  const overlay = getOverlay('transmission')
  const entry = kitEntry('transmission')
  const state = useNowPlaying()
  const setup = useSpotifySetup(state.revision)
  const server = useOverlayInfo()
  const actions = useNowPlayingActions()
  const runner = useDeckRunner()
  const copier = useCopy()

  // Ticks only while a track is running; the face keeps its own clock.
  const clock = usePlaybackClock(state.track?.isPlaying ?? false)

  const [pickedId, setPickedId] = useState<string | null>(null)

  /*
   * The source being edited.
   *
   * Held as an *id* and resolved against the live list rather than held as a
   * copy: the state is pushed from the main process on every change, and a
   * copied source would go stale the moment a setting was written. Falls back
   * to the first, which also covers the id of a source that has just been
   * removed.
   */
  const selected = useMemo(
    () => state.sources.find((source) => source.id === pickedId) ?? state.sources[0] ?? null,
    [state.sources, pickedId]
  )

  const config = selected?.config ?? createDefaultNowPlayingConfig()
  const linked = state.link.state === 'connected'
  const canvas = NOW_PLAYING_CANVAS[config.style]

  const deck = useMemo(
    () => soloDeck({ owner: 'transmission', nowPlaying: state, server }),
    [state, server]
  )

  /** Every presentation control writes to the selected source, and only it. */
  const set = (patch: Partial<NowPlayingConfig>): void => {
    if (selected) void actions.configure(selected.id, patch)
  }

  /*
   * Owned locally while being typed into; see `useEchoedText`.
   *
   * `config` follows whichever source is selected, so picking a different one
   * changes the remote value and the field adopts it — the hook only holds on
   * while an edit of its own is outstanding.
   */
  const [label, setLabel] = useEchoedText(config.label, (value) => set({ label: value }))

  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber('transmission')}
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
              tone={LINK_TONE[state.link.state] ?? 'pending'}
              label={state.link.account ? `Linked · ${state.link.account}` : state.link.message}
              pulse={state.link.state === 'linking'}
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
        <div className={styles.columns}>
          <div className={styles.column}>
            {/* 01 — the face is the single focal object on this page. */}
            <Panel
              label="Face"
              index="01"
              focal

              aside={
                <span className={styles.nowLabel}>
                  {selected ? selected.name : '—'}
                  {state.track ? (state.track.isPlaying ? ' · Playing' : ' · Paused') : ' · Idle'}
                </span>
              }
            >
              <FacePreview state={state} config={config} />
            </Panel>

            {/*
          02 — the desk's own controls, and what they produced.

          The RECORD panel folded in here rather than keeping a slab of its own:
          the track *is* what the link produced, so the verb that establishes the
          link and the reading that proves it worked belong together. Apart, the
          page opened with a panel of four fields that were empty until a
          different panel had been used.
        */}
            <Panel label="The link" index="02">
              <div className={styles.config}>
                <OverlayBench
                  entry={entry}
                  status={statusFor('transmission', deck, 0)}
                  actions={actionsFor('transmission', deck)}
                  composer={null}
                  dials={[]}
                  rows={[]}
                  copier={copier}
                  runner={runner}
                  variant="page"
                />

                {state.track ? (
                  <FieldGrid columns={1}>
                    <Field label="Title" value={state.track.title} />
                    <Field label="Artist" value={formatArtists(state.track.artists) || '—'} />
                    <Field label="Album" value={state.track.album || '—'} />
                    <Field
                      label="Position"
                      value={`${formatTrackTime(trackProgressAt(state.track, clock))} / ${formatTrackTime(state.track.durationMs)}`}
                      mono
                    />
                  </FieldGrid>
                ) : (
                  <p className={styles.hint}>
                    {linked
                      ? 'Nothing is playing. Start something in Spotify and it will appear here within a few seconds.'
                      : 'Link a Spotify account to read live playback.'}
                  </p>
                )}
              </div>
            </Panel>

            {/*
          03 — a one-time chore with an exact string in it: the redirect URI has
          to match the Spotify dashboard entry to the character, and it depends
          on the live server port.
        */}
            <Panel
              label="Spotify setup"
              index="03"

              aside={
                <StatusDot
                  tone={LINK_TONE[state.link.state] ?? 'pending'}
                  label={linked ? 'Linked' : 'Not linked'}
                />
              }
            >
              <div className={styles.setup}>
                <ol className={styles.steps}>
                  <li>
                    <span className={styles.stepIndex}>01</span>
                    <span>
                      Create an app at <code className={styles.inline}>developer.spotify.com</code>{' '}
                      and copy its Client ID.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepIndex}>02</span>
                    <span>
                      Add this exact Redirect URI to that app, then save it there:
                      {setup.redirectUri ? (
                        <>
                          <code className={styles.url}>{setup.redirectUri}</code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copier.copy('redirect', setup.redirectUri as string)}
                          >
                            {copier.failed === 'redirect'
                              ? 'Blocked'
                              : copier.copied === 'redirect'
                                ? 'Copied'
                                : 'Copy redirect URI'}
                          </Button>
                        </>
                      ) : (
                        <span className={styles.warn}> the overlay server is not listening.</span>
                      )}
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepIndex}>03</span>
                    <span>
                      Paste the Client ID into REGULATION, then authorise below.{' '}
                      {setup.hasClientId ? (
                        <span className={styles.ok}>A client id is saved.</span>
                      ) : (
                        <span className={styles.warn}>No client id saved yet.</span>
                      )}
                    </span>
                  </li>
                </ol>

                {/*
              Authorising and unlinking are verbs, so they are on `02` with the
              rest of them. This panel had its own pair, which meant a linked
              account showed two controls for linking — and the desk offered a
              third. `actionsFor` answers for all of them now.
            */}
                {!setup.hasClientId || !setup.redirectUri ? (
                  <p className={styles.warn}>
                    Authorising is blocked until both of the above are in place.
                  </p>
                ) : null}

                {/*
              One poller serves every source, so this is not a per-source
              setting — twenty sources must not mean twenty opinions about how
              often to ask Spotify what is playing.
            */}
                <Slider
                  label="Check Spotify every"
                  min={POLL_MIN_SECONDS}
                  max={POLL_MAX_SECONDS}
                  step={1}
                  value={state.pollSeconds}
                  readout={`${state.pollSeconds}s`}
                  onChange={(seconds) => void actions.setPollSeconds(seconds)}
                  hint="Applies to every source: there is one poller. It sets how fast a track change or a pause shows up, not how smoothly the timeline moves — the playhead is worked out locally between checks, so it glides either way. Nothing is asked at all while neither this page nor a browser source is open."
                />

                <p className={styles.hint}>
                  Read-only access: this reads what is playing and cannot change it. The refresh
                  token is stored encrypted by the OS keystore, never in settings.
                </p>
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            <Panel
              label="Presentation"
              index="04"

              aside={<span className={styles.nowLabel}>{selected?.name ?? '—'}</span>}
            >
              <div className={styles.config}>
                {selected ? (
                  <SourceIdentity
                    key={selected.id}
                    name={selected.name}
                    note={selected.note}
                    slug={selected.slug}
                    busy={actions.pending === 'rename'}
                    onSave={(name, note) => void actions.renameSource(selected.id, name, note)}
                  />
                ) : null}

                <SelectInput
                  label="Style"
                  value={config.style}
                  options={NOW_PLAYING_STYLES.map((style) => ({
                    value: style,
                    label: NOW_PLAYING_STYLE_LABEL[style]
                  }))}
                  onChange={(style) => set({ style })}
                  hint={`Recommended source size: ${canvas.width} × ${canvas.height}.`}
                />

                {/*
              The knobs sit directly beneath the style, because they are read
              relative to it: the style decides what this source looks like and
              these nudge it, so a cranked-up PLATE is still a PLATE.
            */}
                <PresentationControls
                  values={config}
                  onChange={(patch) => set(patch)}
                  onReset={() => set({ scale: 1, typeScale: 1, opacity: 1, coverScale: 1 })}
                  adjusted={
                    config.scale !== 1 ||
                    config.typeScale !== 1 ||
                    config.opacity !== 1 ||
                    config.coverScale !== 1
                  }
                >
                  <Slider
                    label="Cover size"
                    value={config.coverScale}
                    min={PRESENTATION_LIMITS.scale.min}
                    max={PRESENTATION_LIMITS.scale.max}
                    step={PRESENTATION_LIMITS.scale.step}
                    onChange={(coverScale) => set({ coverScale })}
                    readout={`${config.coverScale.toFixed(2)}×`}
                    hint="The artwork alone. Clamped so it cannot crowd out the title."
                    width="full"
                    disabled={!config.showCover}
                  />
                </PresentationControls>

                <SelectInput
                  label="Accent"
                  value={config.accent}
                  options={NOW_PLAYING_ACCENTS.map((accent) => ({
                    value: accent,
                    label: NOW_PLAYING_ACCENT_LABEL[accent]
                  }))}
                  onChange={(accent) => set({ accent })}
                  hint="Carries the timeline and the label."
                />

                {/*
              Only when it means something. A colour well sitting under a GOLD
              accent invites the operator to set a value that will not be drawn.
            */}
                {config.accent === 'custom' ? (
                  <label className={styles.accentRow}>
                    <span
                      className={styles.accentChip}
                      style={{ background: config.accentHex }}
                      aria-hidden="true"
                    />
                    <span className={styles.accentLabel}>Custom colour</span>
                    <span className={styles.accentHex}>{config.accentHex}</span>
                    <input
                      type="color"
                      aria-label="Custom accent colour"
                      value={config.accentHex}
                      onChange={(event) => set({ accentHex: event.target.value })}
                    />
                  </label>
                ) : null}

                <TextInput
                  label="Label"
                  value={label}
                  onChange={setLabel}
                  placeholder="NOW TRANSMITTING"
                />

                {/*
              Nine switches, in two groups rather than one run.
              What is *drawn* and how it *behaves* are two questions, and a
              single stack of nine meant reading all nine to answer either.
            */}
                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>What is drawn</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Show the label"
                      checked={config.showLabel}
                      onChange={(showLabel) => set({ showLabel })}
                    />
                    <Checkbox
                      label="Show cover art"
                      checked={config.showCover}
                      onChange={(showCover) => set({ showCover })}
                    />
                    <Checkbox
                      label="Show the album"
                      checked={config.showAlbum}
                      onChange={(showAlbum) => set({ showAlbum })}
                    />
                    <Checkbox
                      label="Show the timeline"
                      checked={config.showTimeline}
                      onChange={(showTimeline) => set({ showTimeline })}
                    />
                    <Checkbox
                      label="Explicit badge"
                      checked={config.showExplicit}
                      onChange={(showExplicit) => set({ showExplicit })}
                    />
                  </div>
                </div>

                <div className={styles.switchGroup}>
                  <span className={styles.switchLabel}>How it behaves</span>
                  <div className={styles.toggles}>
                    <Checkbox
                      label="Count time remaining"
                      checked={config.showRemaining}
                      onChange={(showRemaining) => set({ showRemaining })}
                      hint="Rather than the track length."
                    />
                    <Checkbox
                      label="Scroll long titles"
                      checked={config.marquee}
                      onChange={(marquee) => set({ marquee })}
                      hint="Off truncates with an ellipsis instead."
                    />
                    <Checkbox
                      label="Turn the record"
                      checked={config.spinCover}
                      onChange={(spinCover) => set({ spinCover })}
                      hint="DISC style only. Stops when playback pauses."
                    />
                    <Checkbox
                      label="Hide when nothing is playing"
                      checked={config.hideWhenIdle}
                      onChange={(hideWhenIdle) => set({ hideWhenIdle })}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            {/*
          05 — this page's BROADCAST panel, and it is the source list.

          Every other overlay in the kit answers on one or two fixed addresses
          and gets an `AddressList`. This one answers on as many as the operator
          has made, so the *source* is the unit: each row carries its own
          address, a copy and a preview. A separate address panel beneath this
          drew the same URLs a second time, for whichever source happened to be
          selected.
        */}
            <Panel
              label="Broadcast sources"
              index="05"

              aside={
                <StatusDot
                  tone={server.running ? 'online' : 'error'}
                  label={
                    server.running
                      ? `${state.sources.length} source${state.sources.length === 1 ? '' : 's'}`
                      : 'Server offline'
                  }
                />
              }
            >
              <div className={styles.broadcast}>
                <p className={styles.hint}>
                  The four presentations, as four browser sources — each with its own address and
                  its own settings. Add all of them to OBS and point each scene at whichever shape
                  suits its layout; they draw the same live playback, so switching scenes changes
                  the shape and nothing else. Tick <strong>Transparent</strong> on each: this
                  overlay never paints a background.
                </p>

                <SourceList
                  sources={state.sources}
                  selectedId={selected?.id ?? null}
                  onSelect={setPickedId}
                  onAdd={(presetId, name) => void actions.addSource({ presetId, name })}
                  onRemove={(id) => void actions.removeSource(id)}
                  serverUrl={server.url}
                  onCopy={copier.copy}
                  copied={copier.copied}
                  failed={copier.failed}
                  busy={actions.pending === 'add' || actions.pending === 'remove'}
                />

                {!server.running ? (
                  <p className={styles.warn}>
                    {server.error ??
                      'The overlay server is not listening, so there is no address yet.'}
                  </p>
                ) : null}

                <FieldGrid columns={3}>
                  <Field label="Selected" value={selected?.name ?? '—'} />
                  <Field label="Canvas" value={`${canvas.width} × ${canvas.height}`} mono />
                  <Field label="Poll" value={`${state.pollSeconds}s`} mono />
                </FieldGrid>
              </div>
            </Panel>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * The source's name and note, committed rather than written per keystroke.
 *
 * Every other control on this page writes straight through, which is right for
 * a checkbox and wrong for a text field: a rename publishes to the broadcast
 * and persists, and doing that on each character would write "M", "Me", "Mel"…
 * The draft is local and SAVE commits it.
 *
 * Keyed on the source id by the caller, so selecting a different source
 * remounts this and the draft cannot leak from one source to the next.
 */
function SourceIdentity({
  name,
  note,
  slug,
  busy,
  onSave
}: {
  name: string
  note: string
  slug: string
  busy: boolean
  onSave: (name: string, note: string) => void
}): ReactNode {
  const [draftName, setDraftName] = useState(name)
  const [draftNote, setDraftNote] = useState(note)

  const dirty = draftName.trim() !== name || draftNote.trim() !== note

  return (
    <div className={styles.identityBlock}>
      <TextInput label="Name" value={draftName} onChange={setDraftName} />
      <TextInput
        label="Note"
        value={draftNote}
        onChange={setDraftNote}
        placeholder="What this source is for"
      />

      <div className={styles.identityFoot}>
        {/*
          Stated rather than implied. The address is what was pasted into OBS,
          and a rename that repointed it would break a scene silently — so it is
          shown here, beside the name, where the operator is renaming.
        */}
        <span className={styles.identitySlug}>
          Address stays <code className={styles.inline}>?source={slug}</code>
        </span>
        <Button
          size="sm"
          disabled={!dirty}
          busy={busy}
          onClick={() => onSave(draftName, draftNote)}
        >
          Save name
        </Button>
      </div>
    </div>
  )
}

/**
 * React mount for the shared face.
 *
 * Drawn on a chequered plate: the overlay is transparent, and previewing it on
 * a flat dark panel would misrepresent how it composites onto a scene.
 *
 * State and config arrive separately, because that is now how the face works —
 * one live playback, and whichever source's presentation is selected.
 */
function FacePreview({
  state,
  config
}: {
  state: NowPlayingState
  config: NowPlayingConfig
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<NowPlayingFace | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    const face = new NowPlayingFace(element, { compact: true, motion: animationsEnabled })
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
    faceRef.current?.setConfig(config)
  }, [config])

  useEffect(() => {
    faceRef.current?.setState(state)
  }, [state])

  // The preview keeps the aspect of the recommended source for the chosen
  // style, so what is on screen is what OBS will show.
  const canvas = NOW_PLAYING_CANVAS[config.style]

  return (
    <div className={styles.stage} style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}
