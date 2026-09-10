import type { ReactNode } from 'react'
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
 */
export function MiniPlayer(): ReactNode {
  const { source, playing, position, duration, volume, toggle, seek, setVolume } = usePlayback()
  const navigate = useNavigate()

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
            onClick={() => void window.candy.auditorium.popout(source.path)}
            title="Play in its own window"
          >
            POP OUT
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
