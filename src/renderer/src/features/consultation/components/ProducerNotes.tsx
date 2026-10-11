import type { ReactNode } from 'react'
import { chainIsEmpty, formatSpan, type Note } from '@shared/consult/engine'
import { stagesIn } from '../lib/track'
import styles from '../Consultation.module.scss'

/**
 * A producer's notes, in order along the track, under the waveform as the
 * website's page has them: pressing one plays from it, and a section with
 * tools on it shows them beside, in the tools panel.
 */
export function ProducerNotes({
  notes,
  active,
  onPlay,
  onTools
}: {
  /** In order along the track. */
  notes: readonly Note[]
  active: string | null
  onPlay: (note: Note) => void
  /** A section's tools, shown in the tools panel. */
  onTools: (note: Note) => void
}): ReactNode {
  if (notes.length === 0) {
    return <p className={styles.empty}>No notes: only tools.</p>
  }
  return (
    <ol className={styles.notes}>
      {notes.map((note) => {
        const tools = note.chain && !chainIsEmpty(note.chain) ? stagesIn(note.chain).length : 0
        return (
          <li key={note.id} className={styles.noteRow}>
            <button
              type="button"
              className={styles.note}
              data-active={note.id === active || undefined}
              onClick={() => onPlay(note)}
            >
              <span className={styles.noteWhen}>{formatSpan(note.at, note.end)}</span>
              <span className={styles.noteText} data-quiet={!note.text || undefined}>
                {note.text || 'Tools only.'}
              </span>
            </button>
            {tools ? (
              <button type="button" className={styles.noteTools} onClick={() => onTools(note)}>
                Tools · {tools} →
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
