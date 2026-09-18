import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { getSection } from '@shared/domain/navigation'
import { usePlayback } from '@renderer/app/providers/playback'
import { formatClock } from '@renderer/features/auditorium/lib/format'
import { Sigil } from '@renderer/components/sigil/Sigil'
import styles from './MiniPlayer.module.scss'

/**
 * The transport bar.
 *
 * Console chrome, like the title bar and the rail: drawn by the layout, outside
 * the animated page wrapper, and reading the one transport the whole
 * application shares. Something admitted in AUDITORIUM, or played from a
 * release in the ARCHIVE, keeps playing while the operator works anywhere else
 * — and this is where they can still reach it.
 *
 * Absent until there is something to say. A permanent empty player bar is a
 * strip of furniture at the bottom of every page advertising that nothing is
 * happening, and this console has a rail full of live readouts already.
 *
 * There is no queue, so there are no skip controls. A next-track button with
 * nothing to go to is worse than no button, and a queue is a real feature —
 * an ordered list, persisted, with a source — rather than two arrows.
 *
 * ## It publishes its own height
 *
 * This bar sits *above* modals by rule — see `$z` — because the controls for a
 * sound started from inside a sheet cannot be behind that sheet. The
 * consequence is that every overlay has to know how much room the bar is
 * taking, or it centres partly underneath it.
 *
 * So the bar marks the document element with `data-transport` while it exists,
 * and the theme turns that into `--ch-transport-height` for `overlay-field()`
 * to read. On the root and not on the shell, because overlays are portalled to
 * `document.body`: a variable set inside the shell inherits *down* to the page,
 * never sideways to a body-level portal.
 *
 * **An attribute rather than a measured height.** Reading `offsetHeight` back
 * in an effect also works, and makes the correct value depend on when that
 * effect runs relative to the bar mounting. This way the number exists once,
 * as the `$transport-height` token the bar is sized from, and JavaScript only
 * reports the one thing CSS cannot know: whether the bar is there at all.
 */
export function MiniPlayer(): ReactNode {
  const { source, playing, position, duration, volume, toggle, seek, setVolume } = usePlayback()
  const navigate = useNavigate()

  /*
   * Marked while the bar exists, cleared when it does not.
   *
   * Keyed on `source`, because that is what decides whether the bar is
   * rendered at all. The cleanup runs on unmount too, so tearing the console
   * down cannot leave every overlay padding itself for a bar that has gone.
   */
  useEffect(() => {
    const root = document.documentElement
    if (!source) {
      root.removeAttribute('data-transport')
      return
    }

    root.setAttribute('data-transport', '')
    return () => root.removeAttribute('data-transport')
  }, [source])

  const seekable = source !== null && Number.isFinite(duration) && duration > 0
  const progress = seekable ? position / duration : 0

  return (
    <AnimatePresence>
      {source ? (
        <motion.aside
          className={styles.bar}
          aria-label="Transport"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            type="button"
            className={styles.play}
            onClick={toggle}
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
            <span className={styles.scrubHead} style={{ left: `${progress * 100}%` }} />
          </button>

          <span className={styles.clock}>{formatClock(duration)}</span>

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

          {/* The subject, at the end of the row and doubling as the way back to
              the department that owns it — the same move the reference makes. */}
          <button
            type="button"
            className={styles.subject}
            onClick={() => navigate(getSection('auditorium').path)}
            title="Open the auditorium"
          >
            <span className={styles.mark} aria-hidden="true">
              <Sigil size={18} weight={2.2} />
            </span>
            <span className={styles.subjectBody}>
              <span className={styles.subjectName}>{source.name}</span>
              <span className={styles.subjectWhere}>AUDITORIUM</span>
            </span>
          </button>

          <button
            type="button"
            className={styles.detach}
            /*
              Hands the transport over rather than starting a second one.
              The position and the playing state travel with the file, and
              this window stops — otherwise the same track sounds twice, a
              few milliseconds apart, which is worse than either window
              having it alone.
            */
            onClick={() => {
              void window.candy.auditorium.popout(source.path, position, playing)
              if (playing) toggle()
            }}
            title="Play in its own window"
          >
            POP OUT
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
