import type { ReactNode } from 'react'
import { useProject } from '@renderer/hooks/useProjects'
import { Button } from '@renderer/components/primitives/Button'
import { formatBytes } from '@renderer/lib/format'
import styles from './TrackList.module.scss'

export interface MasterPickerProps {
  /** The project the track is linked to. Never null — the caller gates on it. */
  projectId: string
  /** The path currently chosen, so it can be marked and cleared. */
  chosen: string | null
  busy: boolean
  onChoose: (path: string | null) => void
  onCancel: () => void
}

/**
 * Which of a project's bounces shipped as this track.
 *
 * ## Where the candidates come from
 *
 * `project.audio` — every audio file in the project folder **except** the
 * imported samples, which the scanner counts separately for exactly this
 * reason. That list was already described in the dossier as "a list of
 * candidate masters"; this is the first thing that actually treats it as one.
 *
 * Fetched on demand rather than shipped with the registry. A tracklist draws
 * at most sixty rows and the operator picks a master for one of them at a
 * time, so carrying every linked project's whole inventory across the IPC
 * boundary to draw a catalogue would be a great deal of rope for a list
 * nobody has opened.
 *
 * ## What choosing one does, and does not do
 *
 * It records the path. **Nothing moves.** The old arrangement promoted a
 * bounce into `Release Mastered Tracks`, which took the audio away from the
 * session that made it — so "where is the source" became a harder question
 * rather than an easier one. Referencing it in place is what lets the
 * ARCHIVE's dossier point straight at the file.
 */
export function MasterPicker({
  projectId,
  chosen,
  busy,
  onChoose,
  onCancel
}: MasterPickerProps): ReactNode {
  const { data: project, isLoading } = useProject(projectId)

  return (
    <div className={styles.masterPicker}>
      {isLoading ? (
        <p className={styles.masterHint}>Reading the project’s bounces…</p>
      ) : !project ? (
        <p className={styles.masterHint}>
          That project could not be read, so its bounces cannot be listed.
        </p>
      ) : project.audio.length === 0 ? (
        /*
         * An honest empty state rather than an empty select.
         *
         * "No bounces" and "the scan has not seen them yet" look identical on
         * screen and mean different things, so the sentence names the second
         * as the likely cause — bouncing a mixdown and forgetting to rescan is
         * the ordinary way to arrive here.
         */
        <p className={styles.masterHint}>
          No audio in <strong>{project.name}</strong> outside its Samples folder. Bounce the master
          into the project and rescan the ARCHIVE.
        </p>
      ) : (
        <div className={styles.masterList}>
          {project.audio.map((file) => {
            const on = chosen === file.path
            return (
              <button
                key={file.path}
                type="button"
                className={styles.masterOption}
                data-on={on || undefined}
                aria-pressed={on}
                disabled={busy}
                title={file.path}
                onClick={() => onChoose(on ? null : file.path)}
              >
                <span className={styles.masterName}>{file.fileName}</span>
                <span className={styles.masterSize}>{formatBytes(file.sizeBytes)}</span>
                {/*
                  The folder-relative path, not the absolute one.
                  Two bounces called `master.wav` in different sub-folders are
                  otherwise indistinguishable in this list, and the absolute
                  path is mostly the same prefix repeated down the column.
                */}
                {file.relativePath !== file.fileName ? (
                  <span className={styles.masterWhere}>{file.relativePath}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <div className={styles.masterActions}>
        {chosen ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChoose(null)}>
            Clear the master
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Done
        </Button>
      </div>
    </div>
  )
}
