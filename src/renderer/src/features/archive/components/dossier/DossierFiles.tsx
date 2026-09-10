import type { ReactNode } from 'react'
import type { MasterPick, MediaFile } from '@shared/domain/projects'
import {
  MASTER_PICKS,
  MASTER_PICK_HINT,
  MASTER_PICK_LABEL
} from '@shared/domain/projects.constants'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes } from '@renderer/lib/format'
import { formatStamp } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

function FileRows({ files }: { files: readonly MediaFile[] }): ReactNode {
  return (
    <div className={styles.fileList}>
      {files.map((file) => (
        <div key={file.path} className={styles.file}>
          <button
            type="button"
            className={styles.fileName}
            title={file.path}
            onClick={() => void window.candy.shell.reveal(file.path)}
          >
            {file.relativePath}
          </button>
          <span className={styles.fileMeta}>{formatBytes(file.sizeBytes)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Everything the scan found in the project folder.
 *
 * Every filename is a button that reveals the file in Explorer — the register
 * is meant to be a way *into* the work, not a read-only inventory of it.
 */
export function DossierFiles({ project, mutations }: DossierTabProps): ReactNode {
  const pick = (kind: MasterPick, path: string | null): void => {
    mutations.patch.mutate({ id: project.id, patch: { masters: { [kind]: path } } })
  }

  return (
    <DossierGrid>
      {/*
        The two picks lead the tab, and carry the accent.

        They are the only *decisions* on this page — everything below is an
        inventory of what the scan found. A final master is also the gate on
        READY, SCHEDULED and RELEASED, so an operator who opens FILES to move a
        project forward should not have to look for it.
      */}
      <Panel label="Mix and master" index="01" className={styles.span6} focal>
        {project.audio.length === 0 ? (
          <p className={styles.empty}>
            No audio outside the Samples folder yet. Bounce a mixdown into the project and rescan,
            then choose it here.
          </p>
        ) : (
          <div className={styles.stack}>
            {MASTER_PICKS.map((kind) => (
              <div key={kind} className={styles.stackTight}>
                <span className={styles.sectionLabel}>{MASTER_PICK_LABEL[kind]}</span>
                <p className={styles.hint}>{MASTER_PICK_HINT[kind]}</p>

                <div className={styles.fileList}>
                  {project.audio.map((file) => {
                    const chosen = project.masters[kind] === file.path
                    return (
                      <div
                        key={file.path}
                        className={styles.file}
                        data-chosen={chosen || undefined}
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

                        {chosen ? (
                          <button
                            type="button"
                            className={styles.filePromote}
                            disabled={mutations.patch.isPending}
                            onClick={() => pick(kind, null)}
                          >
                            CLEAR
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.filePromote}
                            disabled={mutations.patch.isPending}
                            onClick={() => pick(kind, file.path)}
                          >
                            CHOOSE
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        label="Ableton sets"
        index="02"
        className={styles.span3}
        aside={String(project.sets.length)}
      >
        {project.sets.length === 0 ? (
          <p className={styles.empty}>No sets in this folder.</p>
        ) : (
          <div className={styles.fileList}>
            {project.sets.map((set) => (
              <div key={set.path} className={styles.file}>
                <button
                  type="button"
                  className={styles.fileName}
                  title={set.path}
                  onClick={() => void window.candy.shell.reveal(set.path)}
                >
                  {set.fileName}
                </button>

                <span className={styles.fileMeta}>{formatStamp(set.modifiedAt)}</span>
                <span className={styles.fileMeta}>{formatBytes(set.sizeBytes)}</span>

                {/*
                  The primary set is the one whose analysis represents the
                  project. It defaults to the most recently modified, which is
                  almost always right — but a project kept in two arrangements
                  needs the choice to be explicit.
                */}
                {set.isPrimary ? (
                  <span className={styles.filePrimary}>PRIMARY</span>
                ) : (
                  <button
                    type="button"
                    className={styles.filePromote}
                    disabled={mutations.patch.isPending}
                    onClick={() =>
                      mutations.patch.mutate({
                        id: project.id,
                        patch: { primarySetPath: set.path }
                      })
                    }
                  >
                    MAKE PRIMARY
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        label="Backup revisions"
        index="03"
        className={styles.span3}
        aside={String(project.revisions.length)}
      >
        {project.revisions.length === 0 ? (
          <p className={styles.empty}>
            No backups yet. Live writes these into the project&apos;s Backup folder as you save.
          </p>
        ) : (
          <div className={styles.fileList}>
            {project.revisions.map((revision) => (
              <div key={revision.path} className={styles.file}>
                <button
                  type="button"
                  className={styles.fileName}
                  title={revision.path}
                  onClick={() => void window.candy.shell.reveal(revision.path)}
                >
                  {revision.fileName}
                </button>
                <span className={styles.fileMeta}>{formatStamp(revision.modifiedAt)}</span>
                <span className={styles.fileMeta}>{formatBytes(revision.sizeBytes)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        label="Bounces and renders"
        index="04"
        className={styles.span3}
        aside={String(project.audio.length)}
      >
        {project.audio.length === 0 ? (
          <p className={styles.empty}>
            No audio outside the Samples folder. Bounce a mixdown into the project and rescan.
          </p>
        ) : (
          <FileRows files={project.audio} />
        )}
        <p className={styles.hint}>
          Imported samples are counted separately ({project.sampleFileCount}) and left out of this
          list so it stays a list of candidate masters.
        </p>
      </Panel>

      <Panel
        label="Images and video"
        index="05"
        className={styles.span3}
        aside={String(project.images.length + project.videos.length)}
      >
        <div className={styles.stack}>
          <div className={styles.stackTight}>
            <span className={styles.sectionLabel}>Images · {project.images.length}</span>
            {project.images.length === 0 ? (
              <p className={styles.empty}>No images found.</p>
            ) : (
              <FileRows files={project.images} />
            )}
          </div>

          <div className={styles.stackTight}>
            <span className={styles.sectionLabel}>Video · {project.videos.length}</span>
            {project.videos.length === 0 ? (
              <p className={styles.empty}>No video found.</p>
            ) : (
              <FileRows files={project.videos} />
            )}
          </div>
        </div>
      </Panel>

      {project.missingSamples.length > 0 ? (
        <Panel
          label="Missing samples"
          index="06"
          className={styles.span6}
          aside={String(project.missingSamples.length)}
        >
          <p className={styles.warn}>
            These files are referenced by the project&apos;s sets but were not found at the paths
            recorded in them. Live will show them as missing when the set is opened.
          </p>
          <div className={styles.fileList}>
            {project.missingSamples.map((path) => (
              <div key={path} className={styles.file}>
                <span className={styles.fileName} title={path}>
                  {path}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </DossierGrid>
  )
}
