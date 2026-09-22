import { useState, type ReactNode } from 'react'
import type { MediaFile, ProjectRecord } from '@shared/domain/projects'
import { getStage } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes } from '@renderer/lib/format'
import { isPlayableAudio, usePlayback } from '@renderer/app/providers/playback'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { ArchiveIcon } from '../icons/ArchiveIcon'
import styles from './dossier.module.scss'
import * as shell from '@renderer/lib/shell'

export interface FinalMasterProps {
  project: ProjectRecord
  busy: boolean
  /** Names the bounce, or clears it with null. */
  onChoose: (path: string | null) => void
}

/** The file's extension, uppercased, for the tile's second line. */
function formatOf(file: MediaFile): string {
  const dot = file.fileName.lastIndexOf('.')
  return dot > 0 ? file.fileName.slice(dot + 1).toUpperCase() : 'AUDIO'
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
 * ## The grid *is* the panel
 *
 * The candidates are drawn as tiles, always, using the ARCHIVE's own `audio`
 * mark so the picker reads as part of the same department as the shelf grid
 * behind it. A bounce is an object being chosen between, which is what the
 * tile grid is for everywhere else here.
 *
 * There was a CHOOSE button in front of them for one revision, and it was
 * wrong: the panel has exactly one job, so a press whose only outcome is
 * revealing that job is a step with nothing on the other side of it. The
 * bounces are what the panel is *about*, so they are what it draws.
 *
 * ## Auditioning before choosing
 *
 * Each tile carries a play control, because the question while choosing is
 * "which one is this" and four renders of one track do not answer it by their
 * filenames.
 *
 * It plays through **the console's shared transport** — `usePlayback` — so the
 * controls are the transport bar that slides up at the bottom of the window,
 * with its clock, scrub and volume. Nothing is rebuilt here.
 *
 * That is the arrangement the shell was already built for rather than a
 * shortcut: `MiniPlayer`'s own note says it exists so that "something admitted
 * in AUDITORIUM, or played from a release in the ARCHIVE, keeps playing while
 * the operator works anywhere else", and `isPlayableAudio` exists to decide
 * "whether to *offer* playback beside a file elsewhere in the console". A
 * transport local to this panel was written first and thrown away: it gave the
 * operator two sets of controls that could both be sounding, and it stopped
 * when the dossier closed, which is the opposite of what the shared one is for.
 *
 * Playing is deliberately **not** selecting. They are drawn as two controls
 * and tracked as two states: the gold border says which file the operator has
 * chosen, the play control says which one is currently audible, and
 * auditioning a second file must not quietly move the choice. The play button
 * stops propagation to keep them apart.
 *
 * Selecting a tile still does **not** commit. It takes a gold border, and a
 * separate SET AS FINAL MASTER press writes it. That split earns its keep
 * where the CHOOSE press did not: this is the one field in the dossier the
 * RELEASED stage is gated on, so a stray click on the wrong tile must not be
 * able to change what the project claims shipped. Every other field here
 * writes immediately, because every other field is cheap to correct.
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
  /**
   * The tile the operator has clicked, before they commit it.
   *
   * Null means "no opinion yet", which resolves to whatever is already the
   * final master — so the grid shows the current answer with no effect keeping
   * the two in step. Deriving beats syncing here: the record changes underneath
   * this component whenever a rescan lands, and a copy held in state would then
   * be selecting a file that is no longer there.
   */
  const [staged, setStaged] = useState<string | null>(null)
  const playback = usePlayback()

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
  const fileName = chosen ? (chosen.split(/[/\\]/).pop() ?? chosen) : null

  /*
   * What the grid draws as selected.
   *
   * A staged path that is no longer among the bounces is discarded rather than
   * drawn — the rescan case, where the operator picks a file and then deletes
   * it in Explorer. Falling back to the committed pick keeps the panel honest
   * about what it can actually set.
   */
  const stagedExists = staged !== null && project.audio.some((file) => file.path === staged)
  const selected = stagedExists ? staged : chosen
  const changed = selected !== null && selected !== chosen

  /*
   * Committing does **not** stop the audio.
   *
   * A local preview was silenced here, on the reasoning that the question had
   * been answered. That was right for a transport this panel owned and is
   * wrong for the shared one: the operator may well be listening to the master
   * they have just set while they carry on filling in the record, and a
   * console-wide transport that stopped because an unrelated field was written
   * would be the surprising half of the two behaviours.
   */
  const commit = (path: string): void => {
    onChoose(path)
    setStaged(null)
  }

  return (
    <Panel
      label="Final master"
      index="02"
      icon={<ArchiveGlyph name="master" />}
      className={styles.span6}
      aside={chosen ? undefined : `${getStage('released').label} needs this`}
    >
      {chosen ? (
        <div className={styles.finalRow}>
          <button
            type="button"
            className={styles.finalFile}
            title={`${chosen} — click to show in Explorer`}
            onClick={() => shell.reveal(chosen)}
          >
            ♪ {fileName}
          </button>

          {known ? (
            <span className={styles.finalSize}>{formatBytes(known.sizeBytes)}</span>
          ) : (
            /*
             * Said plainly rather than hidden. A final chosen under the old
             * workflow sits outside the project, and an operator wondering why
             * it is not in the grid below deserves the reason.
             */
            <span className={styles.finalElsewhere}>
              Outside the project folder — chosen before masters were kept in place
            </span>
          )}

          {/*
            Clearing is refused at RELEASED by the service. Hidden rather than
            live-and-refusing: the stage strip above is where that is
            corrected, and a control whose only outcome is an explanation
            teaches less than its absence.
          */}
          {!getStage(project.stage).requiresMaster ? (
            <span className={styles.finalActions}>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChoose(null)}>
                Clear
              </Button>
            </span>
          ) : null}
        </div>
      ) : (
        <div className={styles.finalRow}>
          <p className={styles.finalEmpty}>
            No final master named. {getStage('released').label} needs one — it is the file that
            actually goes out, and the catalogue records it against the release.
          </p>
        </div>
      )}

      {project.audio.length === 0 ? (
        /*
         * Two states that look identical and mean different things, so the
         * sentence names the likely one: bouncing a master and forgetting to
         * rescan is the ordinary way to arrive here.
         */
        <p className={styles.finalHint}>
          No audio in this project outside its Samples folder. Bounce the master in and rescan the
          ARCHIVE, then it can be chosen here.
        </p>
      ) : (
        <div className={styles.finalPicker}>
          <div className={styles.finalTiles} role="radiogroup" aria-label="The project's bounces">
            {project.audio.map((file) => {
              const on = file.path === selected
              const current = playback.source?.path === file.path
              const sounding = current && playback.playing
              const fetching = current && playback.loading

              /*
                A wrapper, because the play control has to be a real `button`
                and a button cannot be nested inside one. Keeping the tile a
                button rather than a div with a role is worth the extra
                element: it gets keyboard activation, focus and `aria-checked`
                from the platform instead of from hand-written handlers.
              */
              return (
                <div key={file.path} className={styles.finalTileWrap}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={styles.finalTile}
                    data-on={on || undefined}
                    data-sounding={sounding || undefined}
                    disabled={busy}
                    title={file.path}
                    onClick={() => setStaged(file.path)}
                    // Committing on a double click too, because a grid of
                    // objects has taught the operator that two clicks means
                    // "go" everywhere else in this department.
                    onDoubleClick={() => commit(file.path)}
                  >
                    <ArchiveIcon mark="audio" className={styles.finalTileIcon} />
                    <span className={styles.finalTileName}>{file.fileName}</span>
                    <span className={styles.finalTileMeta}>
                      {formatOf(file)} · {formatBytes(file.sizeBytes)}
                    </span>
                    {/*
                      The folder-relative path, only when it is not simply the
                      file sitting in the project root. Two bounces called
                      `master.wav` in different sub-folders are otherwise
                      identical tiles.
                    */}
                    {file.relativePath !== file.fileName ? (
                      <span className={styles.finalTileWhere}>{file.relativePath}</span>
                    ) : null}
                  </button>

                  {isPlayableAudio(file.path) ? (
                    <button
                      type="button"
                      className={styles.finalPlay}
                      data-on={sounding || undefined}
                      disabled={busy}
                      aria-label={sounding ? `Hold ${file.fileName}` : `Sound ${file.fileName}`}
                      title={
                        sounding ? 'Hold' : 'Sound this bounce — controls sit in the transport'
                      }
                      // Kept off the tile's own click, so listening to a file
                      // does not choose it.
                      //
                      // Already loaded means toggle rather than reopen: reopening
                      // re-reads the whole file over IPC and restarts it from
                      // zero, which is not what a second press on a sounding
                      // track means anywhere else.
                      onClick={(event) => {
                        event.stopPropagation()
                        if (current) playback.toggle()
                        else void playback.open(file.path)
                      }}
                    >
                      {fetching ? '···' : sounding ? '■' : '▶'}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          {playback.error ? (
            <p className={styles.finalPlayError} role="alert">
              {playback.error}
            </p>
          ) : null}

          <div className={styles.finalCommit}>
            {/*
              Named after what it does rather than "Save": the sentence the
              operator is completing is "this file is the final master", and
              the button is the verb in it.

              A grey line beside it explained the disabled states — "pick a
              bounce above", "that is already the final master". It is gone.
              The gold tile says which file is selected and the button says
              whether there is anything to do about it, so the sentence was
              narrating what the operator could already see.
            */}
            <Button
              size="md"
              variant="primary"
              disabled={busy || !changed}
              onClick={() => {
                if (selected !== null) commit(selected)
              }}
            >
              Set as final master
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
