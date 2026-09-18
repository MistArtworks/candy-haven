import { useState, type ReactNode } from 'react'
import type { ProjectRecord } from '@shared/domain/projects'
import { getStage } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes } from '@renderer/lib/format'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import styles from './dossier.module.scss'

export interface FinalMasterProps {
  project: ProjectRecord
  busy: boolean
  /** Names the bounce, or clears it with null. */
  onChoose: (path: string | null) => void
}

/**
 * Which bounce is the finished master.
 *
 * ## What this is, and what it replaced
 *
 * MIX AND MASTER stood here before: three buckets the operator sorted every
 * bounce into — WIP, mix, master — and then a promotion that **moved** the
 * chosen file out of the project folder into `Release Mastered Tracks` under a
 * name they typed.
 *
 * This asks one question instead of four, and answers it without touching the
 * disk. Which file is the finished master? The rest of the folder is left
 * exactly as Ableton left it, and the file stays beside the set that made it —
 * which is what makes the ARCHIVE able to point at the source rather than at a
 * copy in another directory.
 *
 * ## Why it appears at TRACK READY and not before
 *
 * Because there is nothing to answer before then. At MIX the finished bounce
 * does not exist; asking would be a panel that is empty on every project in
 * the department, which is the clutter the dossier has been cut back twice to
 * avoid.
 *
 * ## Why it is on OVERVIEW
 *
 * It is the operator's own statement about the work — the same kind of mark as
 * a tag, a note or the stage, and the tab those live on. It is emphatically
 * not something the scanner read off disk, and no rescan will overwrite it.
 *
 * The RELEASED stage is gated on it (`requiresMaster`), so the panel says so
 * while it is unanswered rather than letting the operator discover it by
 * pressing a stage button that refuses.
 */
export function FinalMaster({ project, busy, onChoose }: FinalMasterProps): ReactNode {
  const [picking, setPicking] = useState(false)

  const chosen = project.masters.final
  /*
   * The pick resolved against the scanned inventory.
   *
   * Absent for a legacy final: the old workflow moved the file into
   * `Release Mastered Tracks`, so it is a real file at a real path the project
   * no longer lists. The path is still true and REVEAL still works, so it is
   * drawn with a note rather than treated as broken.
   */
  const known = chosen ? (project.audio.find((file) => file.path === chosen) ?? null) : null
  const fileName = chosen ? (chosen.split(/[\\/]/).pop() ?? chosen) : null

  return (
    <Panel
      label="Final master"
      index="02"
      icon={<ArchiveGlyph name="master" />}
      className={styles.span6}
      aside={chosen ? undefined : getStage('released').label + ' needs this'}
    >
      {chosen ? (
        <div className={styles.finalRow}>
          <button
            type="button"
            className={styles.finalFile}
            title={`${chosen} — click to show in Explorer`}
            onClick={() => void window.candy.shell.reveal(chosen)}
          >
            ♪ {fileName}
          </button>

          {known ? (
            <span className={styles.finalSize}>{formatBytes(known.sizeBytes)}</span>
          ) : (
            /*
             * Said plainly rather than hidden. A final chosen under the old
             * workflow sits outside the project, and an operator wondering why
             * it is not in the list below deserves the reason.
             */
            <span className={styles.finalElsewhere}>
              Outside the project folder — chosen before masters were kept in place
            </span>
          )}

          <span className={styles.finalActions}>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPicking(!picking)}>
              {picking ? 'Cancel' : 'Change'}
            </Button>
            {/*
              Clearing is refused at RELEASED by the service. Hidden rather
              than live-and-refusing: the stage strip above is where that is
              corrected, and a control whose only outcome is an explanation
              teaches less than its absence.
            */}
            {!getStage(project.stage).requiresMaster ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChoose(null)}>
                Clear
              </Button>
            ) : null}
          </span>
        </div>
      ) : (
        <div className={styles.finalRow}>
          <p className={styles.finalEmpty}>
            No final master named. {getStage('released').label} needs one — it is the file that
            actually goes out, and the catalogue records it against the release.
          </p>
          <Button size="sm" disabled={busy} onClick={() => setPicking(!picking)}>
            {picking ? 'Cancel' : 'Choose'}
          </Button>
        </div>
      )}

      {picking ? (
        project.audio.length === 0 ? (
          /*
           * Two states that look identical and mean different things, so the
           * sentence names the likely one: bouncing a master and forgetting to
           * rescan is the ordinary way to arrive here.
           */
          <p className={styles.finalHint}>
            No audio in this project outside its Samples folder. Bounce the master in and rescan the
            ARCHIVE, then choose it here.
          </p>
        ) : (
          <div className={styles.finalList}>
            {project.audio.map((file) => {
              const on = file.path === chosen
              return (
                <button
                  key={file.path}
                  type="button"
                  className={styles.finalOption}
                  data-on={on || undefined}
                  aria-pressed={on}
                  disabled={busy}
                  title={file.path}
                  onClick={() => {
                    onChoose(file.path)
                    setPicking(false)
                  }}
                >
                  <span className={styles.finalOptionName}>{file.fileName}</span>
                  <span className={styles.finalOptionSize}>{formatBytes(file.sizeBytes)}</span>
                  {/*
                    The folder-relative path, not the absolute one. Two bounces
                    called `master.wav` in different sub-folders are otherwise
                    indistinguishable, and the absolute path is mostly the same
                    prefix repeated down the column.
                  */}
                  {file.relativePath !== file.fileName ? (
                    <span className={styles.finalOptionWhere}>{file.relativePath}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )
      ) : null}
    </Panel>
  )
}
