import type { ReactNode } from 'react'
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
}

export function MixAndMaster({ project, mutations }: MixAndMasterProps): ReactNode {
  const stage = getStage(project.stage)

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
          <div className={styles.file} data-chosen>
            <button
              type="button"
              className={styles.fileName}
              title={project.masters.final}
              onClick={() => void window.candy.shell.reveal(project.masters.final as string)}
            >
              {finalName}
            </button>
            <span className={styles.fileMeta}>RELEASE MASTERED TRACKS</span>
          </div>
        </div>
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
                >
                  <button
                    type="button"
                    className={styles.fileName}
                    title={file.path}
                    onClick={() => void window.candy.shell.reveal(file.path)}
                  >
                    {file.relativePath}
                  </button>
                  <span className={styles.fileMeta}>{formatBytes(file.sizeBytes)}</span>

                  {AUDIO_MARKS.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      className={styles.filePromote}
                      data-on={current === entry || undefined}
                      // The mark this stage is for leads, so the common action
                      // is the one the eye lands on first.
                      data-stage={AUDIO_MARK_STAGE[entry] === project.stage || undefined}
                      disabled={mutations.patch.isPending}
                      onClick={() => mark(file.path, current === entry ? null : entry)}
                    >
                      {AUDIO_MARK_LABEL[entry]}
                    </button>
                  ))}
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
