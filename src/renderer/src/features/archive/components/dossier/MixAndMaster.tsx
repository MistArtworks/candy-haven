import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AudioMark } from '@shared/domain/projects'
import {
  AUDIO_MARKS,
  AUDIO_MARK_HINT,
  AUDIO_MARK_LABEL,
  AUDIO_MARK_STAGE,
  getStage
} from '@shared/domain/projects.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes } from '@renderer/lib/format'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { FinalMasterMenu } from './FinalMasterMenu'
import type { ProjectRecord } from '@shared/domain/projects'
import type { useProjectMutations } from '@renderer/hooks/useProjects'
import styles from './dossier.module.scss'

/**
 * What the project's audio *is*, marked at the stage that produced it.
 *
 * Every bounce stays loose in the project folder; what gives one meaning is a
 * mark made here, against the audio the scan already found. This replaced six
 * scaffold folders that sorted the same files by location — classification by
 * declaration cannot drift out of step with what the operator meant, where
 * classification by which directory a file was dragged into always eventually
 * does.
 *
 * It sits on OVERVIEW rather than FILES, and only from the MIX stage onward.
 * On FILES it was correct and unfindable: an operator at the MASTER stage
 * looking for where to name their master was on OVERVIEW, looking at the
 * pipeline, and the answer was a tab away. Here the question the panel asks
 * changes as the work moves — at MIX, which of these is a mixdown; at MASTER,
 * which of these is mastered — so being in the pipeline's own tab is the point
 * rather than a convenience.
 *
 * The marks are exclusive. A file is a WIP, a mix, a master, or unmarked;
 * something claiming to be two of those makes all three lists worth less.
 */
export interface MixAndMasterProps {
  project: ProjectRecord
  mutations: ReturnType<typeof useProjectMutations>
  /**
   * Right-click verbs on the shipped file, raised rather than handled here.
   *
   * Both end in a dialog or a refusal, and OVERVIEW already owns the one
   * dialog and the one error surface the dossier has. A second copy of either
   * living in this panel would mean two places a failed swap could appear.
   */
  onSwap: () => void
  onUnlink: () => void
}

export function MixAndMaster({
  project,
  mutations,
  onSwap,
  onUnlink
}: MixAndMasterProps): ReactNode {
  const stage = getStage(project.stage)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const markOf = (path: string): AudioMark | null => {
    if (project.masters.masters.includes(path)) return 'master'
    if (project.masters.mixes.includes(path)) return 'mix'
    if (project.masters.wips.includes(path)) return 'wip'
    return null
  }

  /*
   * All three arrays are sent together on every change.
   *
   * A patch carrying only the bucket being added to would leave the others
   * holding a stale copy of the same path, which is how a file ends up in two
   * lists. Removing from all three and adding to one is the whole operation.
   */
  const mark = (path: string, next: AudioMark | null): void => {
    const without = {
      wips: project.masters.wips.filter((entry) => entry !== path),
      mixes: project.masters.mixes.filter((entry) => entry !== path),
      masters: project.masters.masters.filter((entry) => entry !== path)
    }

    if (next === 'wip') without.wips.push(path)
    if (next === 'mix') without.mixes.push(path)
    if (next === 'master') without.masters.push(path)

    mutations.patch.mutate({ id: project.id, patch: { masters: without } })
  }

  const finalName = project.masters.final?.split('\\').pop() ?? null

  /*
   * Hands the file to the listening room rather than to Explorer.
   *
   * Revealing a bounce answered "where is it", which the operator already
   * knows — they are looking at the project. The question they actually have
   * while marking is "which one is this", and the only way to answer that is
   * to hear it.
   *
   * Two calls because the popout may or may not exist. `popout` opens it with
   * the file in the URL, or focuses the one already open without changing what
   * it plays; `announce` broadcasts the path, which the audio engine in every
   * window listens for and loads. Together they mean "play this" whichever
   * state the room was in — and a second file replaces the first rather than
   * opening a second window.
   */
  const play = async (path: string): Promise<void> => {
    await window.candy.auditorium.popout(path)
    await window.candy.auditorium.announce(path)
  }

  /*
   * One click reveals, two play — which needs the first to wait for the second.
   *
   * A double click fires two `click` events before `dblclick`, so a reveal
   * wired straight to `onClick` would open Explorer *and then* the listening
   * room on every double click. The single-click action is therefore deferred
   * by the system's double-click interval and cancelled if the second click
   * arrives.
   *
   * 250ms rather than a shorter guess: Windows' default is 500ms and the
   * platform offers no way to read it here, so this is a compromise between
   * feeling responsive and not firing under a deliberate double click. The
   * cost of being wrong is an Explorer window, not a lost action.
   */
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPending = (): void => {
    if (pending.current === null) return
    clearTimeout(pending.current)
    pending.current = null
  }

  // A timer that outlives the panel would reveal a folder for a dossier the
  // operator has already closed.
  useEffect(() => cancelPending, [])

  const onSingleClick = (path: string): void => {
    cancelPending()
    pending.current = setTimeout(() => {
      pending.current = null
      void window.candy.shell.reveal(path)
    }, 250)
  }

  const onDoubleClick = (path: string): void => {
    cancelPending()
    void play(path)
  }

  return (
    <Panel
      label="Mix and master"
      index="02"
      icon={<ArchiveGlyph name="master" />}
      className={styles.span6}
    >
      {project.masters.final ? (
        /*
         * The shipped file, which is the one thing here that is *not* in the
         * project folder — promoting moved it to Release Mastered Tracks.
         * Drawing it among the project's own audio would claim it was still
         * there.
         */
        <div className={styles.stackTight}>
          <span className={styles.sectionLabel}>FINAL MIX &amp; MASTER</span>
          {/*
            Plays on double click like every other row here. It was the one row
            that still revealed in Explorer, which made the gesture mean two
            different things in one panel — and this is the file the operator
            is most likely to want to hear, being the one that ships.
          */}
          <div
            className={styles.file}
            data-chosen
            data-playable
            onClick={() => onSingleClick(project.masters.final as string)}
            onDoubleClick={() => onDoubleClick(project.masters.final as string)}
            // The only route to changing a final once it is set. Shipping is a
            // side effect of reaching TRACK READY and re-entering that stage
            // passes straight through, so without this a corrected mix has
            // nowhere to go.
            onContextMenu={(event) => {
              event.preventDefault()
              cancelPending()
              setMenu({ x: event.clientX, y: event.clientY })
            }}
            title={`${project.masters.final} — click to show, double-click to play, right-click for options`}
          >
            <span className={styles.fileName}>{finalName}</span>
            <span className={styles.fileMeta}>RELEASE MASTERED TRACKS</span>
          </div>
        </div>
      ) : null}

      {menu && project.masters.final ? (
        <FinalMasterMenu
          name={finalName ?? 'Final mix and master'}
          x={menu.x}
          y={menu.y}
          canSwap={project.masters.mixes.length + project.masters.masters.length > 0}
          stepsBack={getStage(project.stage).requiresMaster === true}
          onPlay={() => void play(project.masters.final as string)}
          onReveal={() => void window.candy.shell.reveal(project.masters.final as string)}
          onSwap={onSwap}
          onUnlink={onUnlink}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {project.audio.length === 0 ? (
        <p className={styles.empty}>
          No audio outside the Samples folder yet. Bounce a mixdown into the project and rescan,
          then mark it here.
        </p>
      ) : (
        <div className={styles.stackTight}>
          {/*
            The hint names the mark this stage is for. The other two stay
            available — work does not always advance linearly, and a master
            bounced early should be markable without pretending the stage has
            moved.
          */}
          <p className={styles.hint}>
            {AUDIO_MARKS.filter((entry) => AUDIO_MARK_STAGE[entry] === project.stage)
              .map((entry) => `${AUDIO_MARK_LABEL[entry]}: ${AUDIO_MARK_HINT[entry]}`)
              .join(' ') ||
              'Mark what each bounce is. The final is chosen from your mixes and masters.'}
          </p>

          <div className={styles.fileList}>
            {project.audio.map((file) => {
              const current = markOf(file.path)

              return (
                <div
                  key={file.path}
                  className={styles.file}
                  data-chosen={current !== null || undefined}
                  // Double rather than single: marking is the reason to be in
                  // this list, and a single click that started playback would
                  // fire every time the operator went for a mark and missed by
                  // a few pixels.
                  data-playable
                  onClick={() => onSingleClick(file.path)}
                  onDoubleClick={() => onDoubleClick(file.path)}
                  title={`${file.path} — click to show, double-click to play`}
                >
                  <span className={styles.fileName}>{file.relativePath}</span>
                  <span className={styles.fileMeta}>{formatBytes(file.sizeBytes)}</span>

                  {/*
                    One control with three cells — the segmented switch
                    REGULATION uses for any exclusive choice. It was three
                    separate outlined buttons per row, which read as three
                    independent toggles rather than one question with three
                    answers, and turned six bounces into eighteen buttons.
                  */}
                  <div
                    className={styles.marks}
                    role="radiogroup"
                    aria-label={`What ${file.relativePath} is`}
                    // The switch sits inside a row that reveals on click and
                    // plays on double click. Without this, marking a bounce
                    // would also open Explorer — and marking twice quickly
                    // would play it.
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    {AUDIO_MARKS.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        role="radio"
                        aria-checked={current === entry}
                        className={styles.mark}
                        data-on={current === entry || undefined}
                        // The mark this stage is for, so the verb wanted right
                        // now is the one the eye finds first.
                        data-stage={AUDIO_MARK_STAGE[entry] === project.stage || undefined}
                        disabled={mutations.patch.isPending}
                        onClick={() => mark(file.path, current === entry ? null : entry)}
                      >
                        {AUDIO_MARK_LABEL[entry]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {project.masters.final === null ? (
            <p className={styles.hint}>
              {stage.label} · the final is chosen when you move to TRACK READY, from the mixes and
              masters marked here.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
