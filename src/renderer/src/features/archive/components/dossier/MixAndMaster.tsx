import { useState, type ReactNode } from 'react'
import type { AudioMark } from '@shared/domain/projects'
import { AUDIO_MARKS, AUDIO_MARK_HINT, AUDIO_MARK_LABEL } from '@shared/domain/projects.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes } from '@renderer/lib/format'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import type { DossierTabProps } from './types'
import styles from './dossier.module.scss'

/**
 * What the project's audio *is*, and which file ships.
 *
 * The only panel in FILES that holds decisions rather than an inventory, which
 * is why it leads the tab and carries the accent. It replaced six scaffold
 * folders that sorted the same files by location: every bounce now stays loose
 * in the project folder and is classified by a mark made here, against the
 * audio the scan already found. Classification by declaration cannot drift out
 * of step with what the operator meant; classification by which directory a
 * file was dragged into always eventually does.
 */
export function MixAndMaster({ project, mutations }: DossierTabProps): ReactNode {
  const [naming, setNaming] = useState<string | null>(null)
  const [finalName, setFinalName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * WIP and MASTER are one mark, not two independent flags.
   *
   * Marking a file as a master takes it out of the WIP list in the same write.
   * Both arrays go together for that reason: a patch carrying only one would
   * leave the other holding a stale copy of the same path, and a file in both
   * lists makes neither worth reading.
   */
  const mark = (path: string, next: AudioMark | null): void => {
    const wips = project.masters.wips.filter((entry) => entry !== path)
    const masters = project.masters.masters.filter((entry) => entry !== path)

    if (next === 'wip') wips.push(path)
    if (next === 'master') masters.push(path)

    mutations.patch.mutate({ id: project.id, patch: { masters: { wips, masters } } })
  }

  const markOf = (path: string): AudioMark | null => {
    if (project.masters.masters.includes(path)) return 'master'
    if (project.masters.wips.includes(path)) return 'wip'
    return null
  }

  const promote = async (): Promise<void> => {
    if (!naming || !finalName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await window.candy.projects.setFinal(project.id, naming, finalName.trim())
      setNaming(null)
      setFinalName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const demote = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.candy.projects.clearFinal(project.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const finalName_ = project.masters.final?.split('\\').pop() ?? null

  return (
    <Panel
      label="Mix and master"
      index="01"
      icon={<ArchiveGlyph name="master" />}
      className={styles.span6}
      focal
    >
      {/*
        The final sits above the list rather than inside it, because it is the
        one file here that is *not* in the project folder — promoting moves it
        out to Release Mastered Tracks. Drawing it as a row among the project's
        own audio would claim it was still there.
      */}
      <div className={styles.stackTight}>
        <span className={styles.sectionLabel}>FINAL MIX &amp; MASTER</span>
        {project.masters.final ? (
          <div className={styles.file} data-chosen>
            <button
              type="button"
              className={styles.fileName}
              title={project.masters.final}
              onClick={() => void window.candy.shell.reveal(project.masters.final as string)}
            >
              {finalName_}
            </button>
            <span className={styles.fileMeta}>RELEASE MASTERED TRACKS</span>
            <button
              type="button"
              className={styles.filePromote}
              disabled={busy}
              onClick={() => void demote()}
            >
              DEMOTE
            </button>
          </div>
        ) : (
          <p className={styles.hint}>
            Nothing chosen. Promoting a file moves it into Release Mastered Tracks under a name you
            type; demoting moves it back.
          </p>
        )}
        {error ? <p className={styles.warn}>{error}</p> : null}
      </div>

      {project.audio.length === 0 ? (
        <p className={styles.empty}>
          No audio outside the Samples folder yet. Bounce a mixdown into the project and rescan,
          then mark it here.
        </p>
      ) : (
        <div className={styles.stackTight}>
          <span className={styles.sectionLabel}>PROJECT AUDIO</span>
          <p className={styles.hint}>
            {AUDIO_MARK_HINT.wip} {AUDIO_MARK_HINT.master}
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
                      disabled={mutations.patch.isPending}
                      onClick={() => mark(file.path, current === entry ? null : entry)}
                    >
                      {AUDIO_MARK_LABEL[entry]}
                    </button>
                  ))}

                  {naming === file.path ? (
                    <span className={styles.finalNaming}>
                      <input
                        className={styles.finalInput}
                        value={finalName}
                        autoFocus
                        placeholder="Name the finished track"
                        onChange={(event) => setFinalName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void promote()
                          if (event.key === 'Escape') setNaming(null)
                        }}
                      />
                      <button
                        type="button"
                        className={styles.filePromote}
                        disabled={busy || finalName.trim().length === 0}
                        onClick={() => void promote()}
                      >
                        MOVE
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.filePromote}
                      disabled={busy || project.masters.final !== null}
                      title={
                        project.masters.final
                          ? 'Demote the current final first'
                          : 'Move this into Release Mastered Tracks as the finished track'
                      }
                      onClick={() => {
                        setNaming(file.path)
                        // Seeded with the filename minus its extension, which is
                        // nearly always most of the answer.
                        setFinalName(file.relativePath.replace(/\.[^.]+$/, ''))
                        setError(null)
                      }}
                    >
                      FINAL
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}
