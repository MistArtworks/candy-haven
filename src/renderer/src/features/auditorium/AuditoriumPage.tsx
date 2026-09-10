import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import {
  AUDIO_EXTENSIONS,
  AUDIO_PRESET,
  AUDIO_PRESET_LIST,
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
import { formatClock } from './lib/format'
import { ZOOM_LEVELS, timeAtFraction, zoomLabel, type ZoomLevel } from './lib/zoom'
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
  // Eight seconds by default: enough of a bar or two to read what is coming
  // without the render becoming a wall of detail.
  const [zoom, setZoom] = useState<ZoomLevel>(8)

  const choose = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Admit a file to the auditorium',
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS] }]
    })
    if (path) await open(path)
  }

  const hasFile = source !== null
  const seekable = hasFile && Number.isFinite(duration) && duration > 0
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
              onClick={() => void window.candy.auditorium.popout(source?.path ?? null)}
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
            The overview invites a click, so the stage takes one and seeks —
            which is what anybody who has used a player expects of a waveform,
            and which the scrub bar below then merely repeats for the renders
            that have no time axis to click on.
          */}
          <div
            className={styles.stageHost}
            onClick={(event) => {
              if (!scrollable || !seekable) return
              const box = event.currentTarget.getBoundingClientRect()
              const fraction = (event.clientX - box.left) / box.width
              seek(timeAtFraction(fraction, position, duration, zoom))
            }}
            data-seekable={scrollable && seekable ? true : undefined}
          >
            <Visualiser
              analyserRef={analyserRef}
              peaksRef={peaksRef}
              elementRef={elementRef}
              preset={preset}
              zoom={zoom}
              playing={playing}
              idle={!hasFile}
              surveying={surveying}
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

            {/* Only the surveyed renders have a time axis to zoom. */}
            <nav
              className={styles.zoom}
              aria-label="Render span"
              data-disabled={!scrollable || undefined}
            >
              {ZOOM_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={styles.zoomStep}
                  data-active={level === zoom || undefined}
                  disabled={!scrollable}
                  onClick={() => setZoom(level)}
                  title={
                    level === 0
                      ? 'The whole file, with the playhead travelling across it'
                      : `${level} seconds across the stage, playhead centred`
                  }
                >
                  {zoomLabel(level)}
                </button>
              ))}
            </nav>

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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void window.candy.shell.reveal(source.path)}
                >
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
