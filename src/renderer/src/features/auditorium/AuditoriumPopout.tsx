import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AUDIO_EXTENSIONS,
  AUDIO_PRESET,
  AUDIO_PRESET_LIST,
  type AudioPreset
} from '@shared/domain/auditorium'
import { Sigil } from '@renderer/components/sigil/Sigil'
import { useAudioEngine } from './lib/useAudioEngine'
import { Visualiser } from './components/Visualiser'
import { formatClock } from './lib/format'
import { DEFAULT_SPAN, clampSpan, fullSpan, isFullSpan, spanLabel, zoomBy } from './lib/zoom'
import styles from './AuditoriumPopout.module.scss'

export interface AuditoriumPopoutProps {
  /** A file handed over by the window that opened this one. */
  file: string | null
  /** Seconds to resume from, and whether to start sounding. */
  at: number | null
  playing: boolean
}

/**
 * The listening room, detached.
 *
 * Deliberately not the department page in a smaller window. A popout exists to
 * sit in a corner of a second screen while the operator works in something
 * else, so it is all stage and one row of chrome: no page header, no epigraph,
 * no panels — those are furniture for a department you are *visiting*, and this
 * is one you are leaving open.
 *
 * It is an independent player. Its own element, its own audio graph, its own
 * transport; the console keeps playing or not on its own. The alternative —
 * one engine driving two windows — means routing audio state through the main
 * process at frame rate, which is a great deal of machinery to make two
 * windows agree about a thing either of them can simply do.
 *
 * ## The handover
 *
 * Independent does not mean amnesiac. Detaching a player at 0:20 while it is
 * sounding and having it arrive at 0:00 and silent is the one reading of that
 * gesture nobody intends, so the position and the playing state travel in the
 * query string with the file — see `readPopoutIntent`.
 *
 * It is a **one-shot**, not a sync. After arrival the two transports are
 * independent again and agree only on which file is open.
 */
export function AuditoriumPopout({ file, at, playing: resume }: AuditoriumPopoutProps): ReactNode {
  const {
    elementRef,
    analyserRef,
    peaksRef,
    source,
    loading,
    surveying,
    error,
    playing,
    position,
    duration,
    volume,
    open,
    toggle,
    seek,
    setVolume
  } = useAudioEngine()

  const [preset, setPreset] = useState<AudioPreset>('waveform')
  const [zoom, setZoom] = useState(DEFAULT_SPAN)
  const [pinned, setPinned] = useState(true)

  // The handover file, opened once on arrival. Keyed on the path so a popout
  // reopened with a different file picks the new one up.
  useEffect(() => {
    if (file) void open(file)
  }, [file, open])

  /*
   * Resuming where the console left off, once and only once.
   *
   * Deferred until `duration` is a real number, because `seek` refuses while
   * it is not — the element has the blob but has not read its metadata yet, so
   * a seek fired straight after `open` resolves is silently dropped and the
   * handover looks broken. Watching `duration` is watching for exactly the
   * moment seeking becomes possible.
   *
   * The ref is what makes it one-shot. Without it, pausing at 0:05 in this
   * window would re-run the effect on the next `duration` change and throw the
   * operator back to the handover point, which is a player that fights being
   * used.
   */
  const handedOver = useRef(false)
  useEffect(() => {
    if (handedOver.current) return
    if (!file || (at === null && !resume)) return
    if (!Number.isFinite(duration) || duration <= 0) return

    handedOver.current = true
    if (at !== null) seek(at)
    // `toggle` starts a paused element; the popout arrives paused because
    // `open` loads without playing.
    if (resume) toggle()
  }, [file, at, resume, duration, seek, toggle])

  const choose = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Admit a file to the auditorium',
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS] }]
    })
    if (path) await open(path)
  }

  const hasFile = source !== null
  const seekable = hasFile && Number.isFinite(duration) && duration > 0
  const progress = seekable ? position / duration : 0
  const scrollable = preset === 'waveform'
  const span = clampSpan(zoom, duration)

  return (
    <div className={styles.popout}>
      {/* The whole bar is the drag region; the controls opt back out. */}
      <header className={styles.bar}>
        <span className={styles.mark} aria-hidden="true">
          <Sigil size={16} weight={2.4} />
        </span>

        <span className={styles.title} title={source?.path ?? undefined}>
          {source?.name ?? 'AUDITORIUM'}
        </span>

        <nav className={styles.presets} aria-label="Render presets">
          {AUDIO_PRESET_LIST.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.preset}
              data-active={entry.id === preset || undefined}
              title={entry.purpose}
              onClick={() => setPreset(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className={styles.barActions}>
          <button type="button" className={styles.barButton} onClick={() => void choose()}>
            {loading ? 'READING' : 'ADMIT'}
          </button>
          <button
            type="button"
            className={styles.barButton}
            data-on={pinned || undefined}
            title={pinned ? 'Unpin from the front' : 'Pin in front of other windows'}
            onClick={() => {
              // The settled state comes back from the window, not from the
              // click: a window manager that refuses the request should not
              // leave the control claiming otherwise.
              void window.candy.auditorium.pin(!pinned).then(setPinned)
            }}
          >
            PIN
          </button>
          <button
            type="button"
            className={styles.barButton}
            onClick={() => void window.candy.popout.minimize()}
            aria-label="Minimise"
          >
            —
          </button>
          <button
            type="button"
            className={`${styles.barButton} ${styles.close}`}
            onClick={() => void window.candy.popout.close()}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      <audio ref={elementRef} preload="metadata" hidden />

      <div className={styles.stageHost} data-seekable={scrollable && seekable ? true : undefined}>
        <Visualiser
          analyserRef={analyserRef}
          peaksRef={peaksRef}
          elementRef={elementRef}
          preset={preset}
          zoom={span}
          playing={playing}
          idle={!hasFile}
          surveying={surveying}
          onSeek={scrollable && seekable ? seek : undefined}
          onZoom={
            scrollable && seekable
              ? (deltaY) => setZoom((current) => zoomBy(current, deltaY, duration))
              : undefined
          }
        />
      </div>

      {error ? (
        <p className={styles.fault} role="alert">
          {error}
        </p>
      ) : null}

      <footer className={styles.transport}>
        <button
          type="button"
          className={styles.play}
          onClick={toggle}
          disabled={!hasFile}
          aria-label={playing ? 'Hold' : 'Sound'}
        >
          {playing ? '■' : '▶'}
        </button>

        <span className={styles.clock}>{formatClock(position)}</span>

        <button
          type="button"
          className={styles.scrub}
          disabled={!seekable}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            seek(((event.clientX - box.left) / box.width) * duration)
          }}
          aria-label="Seek"
        >
          <span className={styles.scrubFill} style={{ width: `${progress * 100}%` }} />
        </button>

        <span className={styles.clock}>{formatClock(duration)}</span>

        {/* Scroll over the render to zoom; this reports where that has got to
            and takes a click to fit the whole file. */}
        <button
          type="button"
          className={styles.span}
          disabled={!scrollable || !seekable}
          onClick={() => setZoom(isFullSpan(span, duration) ? DEFAULT_SPAN : fullSpan(duration))}
          title="Scroll over the render to zoom. Click to fit the whole file."
        >
          {spanLabel(span, duration)}
        </button>

        <label className={styles.level}>
          <span className={styles.levelLabel}>LVL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Level"
          />
        </label>

        <span className={styles.presetNote}>{AUDIO_PRESET[preset].purpose}</span>
      </footer>
    </div>
  )
}
