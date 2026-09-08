import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  NOW_PLAYING_ACCENTS,
  NOW_PLAYING_CANVAS,
  NOW_PLAYING_STYLES,
  NOW_PLAYING_STYLE_LABEL,
  POLL_MAX_SECONDS,
  POLL_MIN_SECONDS,
  formatArtists,
  formatTrackTime,
  trackProgressAt
} from '@shared/domain/nowplaying.constants'
import { getOverlay, overlaySourceUrl } from '@shared/domain/overlays'
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
import styles from './TransmissionPage.module.scss'

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
 * Live Spotify playback, presented four ways. The console is also where the
 * account is linked: the authorisation page opens in the operator's own
 * browser rather than in an app window, so they can see the address bar and
 * reach their password manager.
 */
export function TransmissionPage(): ReactNode {
  const overlay = getOverlay('transmission')
  const state = useNowPlaying()
  const setup = useSpotifySetup(state.revision)
  const server = useOverlayInfo()
  const actions = useNowPlayingActions()

  // Ticks only while a track is running; the face keeps its own clock.
  const clock = usePlaybackClock(state.track?.isPlaying ?? false)

  const [copied, setCopied] = useState<string | null>(null)
  const sourceUrl = server.url ? overlaySourceUrl(server.url, overlay) : null
  const linked = state.link.state === 'connected'
  const canvas = NOW_PLAYING_CANVAS[state.config.style]

  const copy = (key: string, value: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
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
              tone={LINK_TONE[state.link.state] ?? 'pending'}
              label={state.link.account ? `Linked · ${state.link.account}` : state.link.message}
              pulse={state.link.state === 'linking'}
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
          aside={
            state.track ? (
              <span className={styles.nowLabel}>
                {state.track.isPlaying ? 'Playing' : 'Paused'}
              </span>
            ) : (
              <span className={styles.idleLabel}>Idle</span>
            )
          }
        >
          <FacePreview state={state} />
        </Panel>

        <Panel label="Record" index="02" className={styles.span2}>
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
        </Panel>

        {/*
          Setup is its own panel because it is a one-time chore with an exact
          string in it — the redirect URI has to match the dashboard entry to
          the character, and it depends on the live server port.
        */}
        <Panel
          label="Spotify link"
          index="03"
          className={styles.span2}
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
                  Create an app at <code className={styles.inline}>developer.spotify.com</code> and
                  copy its Client ID.
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
                        onClick={() => copy('redirect', setup.redirectUri as string)}
                      >
                        {copied === 'redirect' ? 'Copied' : 'Copy redirect URI'}
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

            <div className={styles.setupActions}>
              <Button
                variant="primary"
                disabled={!setup.hasClientId || !setup.redirectUri}
                busy={actions.pending === 'link'}
                onClick={() => void actions.link()}
              >
                {linked ? 'Re-authorise' : 'Authorise Spotify'}
              </Button>
              <Button
                variant="danger"
                disabled={state.link.state === 'unconfigured'}
                busy={actions.pending === 'unlink'}
                onClick={() => void actions.unlink()}
              >
                Unlink
              </Button>
            </div>

            <p className={styles.hint}>
              Read-only access: this reads what is playing and cannot change it. The refresh token
              is stored encrypted by the OS keystore, never in settings.
            </p>
          </div>
        </Panel>

        <Panel label="Presentation" index="04" className={styles.span2}>
          <div className={styles.config}>
            <SelectInput
              label="Style"
              value={state.config.style}
              options={NOW_PLAYING_STYLES.map((style) => ({
                value: style,
                label: NOW_PLAYING_STYLE_LABEL[style]
              }))}
              onChange={(style) => void actions.configure({ style })}
              hint={`Recommended source size: ${canvas.width} × ${canvas.height}.`}
            />

            <SelectInput
              label="Accent"
              value={state.config.accent}
              options={NOW_PLAYING_ACCENTS.map((accent) => ({
                value: accent,
                label: accent.toUpperCase()
              }))}
              onChange={(accent) => void actions.configure({ accent })}
              hint="Carries the timeline and the label. Both are inside the locked palette."
            />

            <TextInput
              label="Label"
              value={state.config.label}
              onChange={(label) => void actions.configure({ label })}
              placeholder="NOW TRANSMITTING"
            />

            <div className={styles.toggles}>
              <Checkbox
                label="Show the label"
                checked={state.config.showLabel}
                onChange={(showLabel) => void actions.configure({ showLabel })}
              />
              <Checkbox
                label="Show cover art"
                checked={state.config.showCover}
                onChange={(showCover) => void actions.configure({ showCover })}
              />
              <Checkbox
                label="Show the album"
                checked={state.config.showAlbum}
                onChange={(showAlbum) => void actions.configure({ showAlbum })}
              />
              <Checkbox
                label="Show the timeline"
                checked={state.config.showTimeline}
                onChange={(showTimeline) => void actions.configure({ showTimeline })}
              />
              <Checkbox
                label="Count time remaining"
                checked={state.config.showRemaining}
                onChange={(showRemaining) => void actions.configure({ showRemaining })}
                hint="Rather than the track length."
              />
              <Checkbox
                label="Explicit badge"
                checked={state.config.showExplicit}
                onChange={(showExplicit) => void actions.configure({ showExplicit })}
              />
              <Checkbox
                label="Scroll long titles"
                checked={state.config.marquee}
                onChange={(marquee) => void actions.configure({ marquee })}
                hint="Off truncates with an ellipsis instead."
              />
              <Checkbox
                label="Turn the record"
                checked={state.config.spinCover}
                onChange={(spinCover) => void actions.configure({ spinCover })}
                hint="DISC style only. Stops when playback pauses."
              />
              <Checkbox
                label="Hide when nothing is playing"
                checked={state.config.hideWhenIdle}
                onChange={(hideWhenIdle) => void actions.configure({ hideWhenIdle })}
              />
            </div>

            <Slider
              label="Poll interval"
              min={POLL_MIN_SECONDS}
              max={POLL_MAX_SECONDS}
              step={1}
              value={state.config.pollSeconds}
              readout={`${state.config.pollSeconds}s`}
              onChange={(pollSeconds) => void actions.configure({ pollSeconds })}
              hint="The timeline is interpolated between polls, so a slower interval still moves smoothly. Polling stops entirely when nothing is watching."
            />
          </div>
        </Panel>

        <Panel
          label="Broadcast source"
          index="05"
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
                  Add a Browser source in OBS at this address. Width {canvas.width}, height{' '}
                  {canvas.height}, and tick <strong>Transparent</strong> — this overlay never paints
                  a background.
                </p>
                <code className={styles.url}>{sourceUrl}</code>
                <div className={styles.broadcastActions}>
                  <Button size="sm" variant="ghost" onClick={() => copy('source', sourceUrl)}>
                    {copied === 'source' ? 'Copied' : 'Copy address'}
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
              <Field label="Style" value={state.config.style.toUpperCase()} mono />
              <Field label="Poll" value={`${state.config.pollSeconds}s`} mono />
            </FieldGrid>
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}

/**
 * React mount for the shared face.
 *
 * Drawn on a chequered plate: the overlay is transparent, and previewing it on
 * a flat dark panel would misrepresent how it composites onto a scene.
 */
function FacePreview({ state }: { state: ReturnType<typeof useNowPlaying> }): ReactNode {
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
    faceRef.current?.setState(state)
  }, [state])

  // The preview keeps the aspect of the recommended source for the chosen
  // style, so what is on screen is what OBS will show.
  const canvas = NOW_PLAYING_CANVAS[state.config.style]

  return (
    <div className={styles.stage} style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}
