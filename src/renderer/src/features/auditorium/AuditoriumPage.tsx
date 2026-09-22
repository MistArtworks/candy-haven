import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import {
  AUDIO_EXTENSIONS,
  AUDIO_PRESET,
  AUDIO_PRESET_LIST,
  AUDIO_PRESETS,
  type AudioPreset
} from '@shared/domain/auditorium'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Slider } from '@renderer/components/primitives/Slider'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { formatBytes, truncatePath } from '@renderer/lib/format'
import { usePlayback } from '@renderer/app/providers/playback'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { formatClock } from './lib/format'
import * as shell from '@renderer/lib/shell'
import { DEFAULT_SPAN, clampSpan, fullSpan, isFullSpan, spanLabel, zoomBy } from './lib/zoom'
import { Visualiser } from './components/Visualiser'
import styles from './AuditoriumPage.module.scss'

/**
 * AUDITORIUM — the listening room.
 *
 * One file at a time, played and rendered visible. There is no library here on
 * purpose: the ARCHIVE catalogues audio, and a second register of the same
 * material would immediately disagree with it. This department answers one
 * question, which is what a file sounds like.
 *
 * The stage is the single focal object the brief allows per view, so everything
 * around it — transport, presets, the file's own particulars — is drawn plain.
 */
export function AuditoriumPage(): ReactNode {
  const section = getSection('auditorium')
  /*
   * The console's shared transport, not an engine of this page's own.
   *
   * The department page and the bar at the foot of the console are two views of
   * one player: admitting a file here and then leaving for the ARCHIVE has to
   * keep it playing, and coming back has to show it still playing. See
   * app/providers/PlaybackProvider.tsx.
   *
   * Destructured on arrival rather than kept as one object, because the engine
   * hands back refs alongside its state and a property read on an object that
   * holds refs is indistinguishable, to the compiler's lint rule, from reading
   * `.current` during render.
   */
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
  } = usePlayback()
  const [preset, setPreset] = useState<AudioPreset>('waveform')
  /*
   * How many seconds of file the render shows, continuously.
   *
   * Held raw and clamped at the point of use rather than corrected when a file
   * changes. A thirty-second window is meaningless on a ten-second file, but
   * *forcing* it down to ten and leaving it there means admitting a short file
   * in the middle of a session permanently narrows the operator's view — they
   * set thirty, and something they were only checking took it away. Clamping on
   * read keeps the setting intact and shows what can be shown.
   */
  const [zoom, setZoom] = useState(DEFAULT_SPAN)

  const choose = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Admit a file to the auditorium',
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS] }]
    })
    if (path) await open(path)
  }

  const hasFile = source !== null
  const seekable = hasFile && Number.isFinite(duration) && duration > 0
  /** The window actually drawn: never tighter than the file, never wider. */
  const span = clampSpan(zoom, duration)

  /*
   * The listening room's chords.
   *
   * `Space` for the transport, which is what every player on this desktop does
   * and what the hands already reach for. Deliberately **not** `whileTyping` —
   * it is the one binding here a text field would genuinely want, and this page
   * has no fields worth guarding, so the default is correct and cheap.
   *
   * Seeking is on `Ctrl`+arrows rather than bare arrows for the same reason the
   * page transition uses `Ctrl`+digits: a bare arrow is how a keyboard user
   * moves focus, and stealing it would make the department unnavigable.
   */
  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: ' ',
        label: playing ? 'Hold' : 'Play',
        group: 'Auditorium',
        disabled: !hasFile,
        run: () => toggle()
      },
      {
        chord: 'ctrl+o',
        label: 'Admit a file',
        group: 'Auditorium',
        whileTyping: true,
        run: () => void choose()
      },
      {
        chord: 'ctrl+arrowleft',
        label: 'Back five seconds',
        group: 'Auditorium',
        whileTyping: true,
        disabled: !seekable,
        run: () => seek(Math.max(0, position - 5))
      },
      {
        chord: 'ctrl+arrowright',
        label: 'Forward five seconds',
        group: 'Auditorium',
        whileTyping: true,
        disabled: !seekable,
        run: () => seek(Math.min(duration, position + 5))
      },
      {
        chord: 'ctrl+home',
        label: 'Back to the top',
        group: 'Auditorium',
        whileTyping: true,
        disabled: !seekable,
        run: () => seek(0)
      },
      /*
       * Zoom, for the hands that are not on a wheel.
       *
       * The render zooms by scrolling over it, which is the right gesture and
       * the only one most operators will use. It is also unreachable from a
       * keyboard and from a trackpad in the middle of a drag, so the same
       * movement is bound here: `Ctrl` and the vertical arrows, matching the
       * horizontal pair that already seek.
       */
      {
        chord: 'ctrl+arrowup',
        label: 'Closer',
        group: 'Auditorium',
        whileTyping: true,
        disabled: !seekable,
        run: () => setZoom((current) => zoomBy(current, -240, duration))
      },
      {
        chord: 'ctrl+arrowdown',
        label: 'Wider',
        group: 'Auditorium',
        whileTyping: true,
        disabled: !seekable,
        run: () => setZoom((current) => zoomBy(current, 240, duration))
      },
      ...AUDIO_PRESETS.map((entry, index) => ({
        chord: `alt+${index + 1}`,
        label: AUDIO_PRESET[entry].label,
        group: 'Auditorium renders',
        run: () => setPreset(entry)
      }))
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasFile, playing, seekable, position, duration]
  )

  useHotkeys(hotkeys)

  // Only the surveyed envelope carries a time axis, so it is the only render a
  // click on can mean a position. The live ones have no past to point at.
  const scrollable = preset === 'waveform'
  const progress = seekable ? position / duration : 0

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="auditorium"
        actions={
          <div className={styles.headActions}>
            <StatusDot
              tone={playing ? 'online' : hasFile ? 'pending' : 'offline'}
              label={playing ? 'SOUNDING' : hasFile ? 'HELD' : 'NO FILE'}
              pulse={playing}
            />
            <Button
              size="sm"
              variant="ghost"
              // Hands over the position and stops here — see `MiniPlayer`.
              onClick={() => {
                void window.candy.auditorium.popout(source?.path ?? null, position, playing)
                if (playing) toggle()
              }}
            >
              Pop out
            </Button>
            <Button size="sm" busy={loading} onClick={() => void choose()}>
              {hasFile ? 'Admit another' : 'Admit a file'}
            </Button>
          </div>
        }
      />

      {error ? (
        <p className={styles.fault} role="alert">
          {error}
        </p>
      ) : null}

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label={AUDIO_PRESET[preset].label}
          index="01"
          aside={AUDIO_PRESET[preset].purpose.toUpperCase()}
          focal
          flush
          className={styles.stagePanel}
        >
          {/*
            The render invites a press, and it takes one itself.

            It used to be handled here, by a click on this wrapper, mapped
            through `timeAtFraction`. That worked while the stage had one time
            axis on it. It now has two — the window across the band and the
            whole file along the strip beneath it — and only the thing that drew
            them knows where the boundary between them is, so the handling went
            with the drawing. This wrapper keeps the cursor and nothing else.
          */}
          <div
            className={styles.stageHost}
            data-seekable={scrollable && seekable ? true : undefined}
          >
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

          {/* The transport sits inside the stage rather than under it: the
              operator's hand and the thing it is driving should not be two
              separate objects on the page. */}
          <div className={styles.transport}>
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
              // A click anywhere on the bar seeks there. A range input would
              // need its thumb restyled into something that is not a thumb, and
              // the bar is the readout as well as the control.
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                seek(((event.clientX - box.left) / box.width) * duration)
              }}
              aria-label="Seek"
            >
              <span className={styles.scrubFill} style={{ width: `${progress * 100}%` }} />
              <span className={styles.scrubHead} style={{ left: `${progress * 100}%` }} />
            </button>

            <span className={styles.clock}>{formatClock(duration)}</span>

            {/*
              The span: a readout, not a row of keys.

              Five fixed steps stood here — 4, 8, 16, 30 seconds and ALL — and
              they were replaced rather than added to, because the step you want
              is always between two of the ones on offer. The wheel over the
              render is the control now; this says where it has got to, and
              takes a click to fit the whole file and another to come back.
              Still greyed out wholesale on the live renders, which have no time
              axis to zoom: a control that vanishes when you change preset reads
              as a bug, one that greys out reads as a rule.
            */}
            <button
              type="button"
              className={styles.span}
              disabled={!scrollable || !seekable}
              onClick={() =>
                setZoom(isFullSpan(span, duration) ? DEFAULT_SPAN : fullSpan(duration))
              }
              title="Scroll over the render to zoom, or Ctrl and the up and down arrows. Click to fit the whole file."
            >
              <span className={styles.spanLabel}>SPAN</span>
              <span className={styles.spanValue}>{spanLabel(span, duration)}</span>
            </button>

            {/*
              `full`, inside a fixed-width wrapper, rather than `inline`.
              The inline variant's track is a hard 200px — sized for
              REGULATION's control column — and it overhangs anything narrower
              than that. Filling a wrapper this row controls is the only way to
              put this fader in a transport without editing the primitive out
              from under the department that variant exists for.
            */}
            <Slider
              label="Level"
              width="full"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              readout={`${Math.round(volume * 100)}%`}
              onChange={setVolume}
              className={styles.level}
            />
          </div>
        </Panel>

        <Panel label="Preset" index="02" className={styles.presets}>
          <nav className={styles.presetRail} aria-label="Render presets">
            {AUDIO_PRESET_LIST.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={styles.presetItem}
                data-active={entry.id === preset || undefined}
                aria-current={entry.id === preset ? 'true' : undefined}
                onClick={() => setPreset(entry.id)}
              >
                <span className={styles.presetIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.presetBody}>
                  <span className={styles.presetLabel}>{entry.label}</span>
                  <span className={styles.presetPurpose}>{entry.purpose}</span>
                </span>
              </button>
            ))}
          </nav>

          <p className={styles.presetDetail}>{AUDIO_PRESET[preset].detail}</p>
        </Panel>

        <Panel label="Admitted" index="03" className={styles.particulars}>
          {hasFile && source ? (
            <>
              <p className={styles.fileName} title={source.path}>
                {source.name}
              </p>
              <FieldGrid columns={2}>
                <Field label="Format" value={source.extension.toUpperCase()} mono />
                <Field label="Size" value={formatBytes(source.size)} mono />
                <Field
                  label="Length"
                  value={surveying ? 'SURVEYING' : formatClock(duration)}
                  mono
                />
                <Field label="Position" value={`${Math.round(progress * 100)}%`} mono />
              </FieldGrid>
              <Field label="Filed at" value={truncatePath(source.path, 52)} mono selectable />
              <div className={styles.particularActions}>
                <Button size="sm" variant="ghost" onClick={() => shell.reveal(source.path)}>
                  Reveal on disk
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyLine}>THE ROOM IS EMPTY.</p>
              <p className={styles.emptyHint}>
                Admit a file to hear it. Nothing is catalogued here — the room reads what it is
                given and keeps no record of it.
              </p>
            </div>
          )}
        </Panel>
      </motion.div>
    </div>
  )
}
