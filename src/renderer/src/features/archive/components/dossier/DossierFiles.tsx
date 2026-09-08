import type { ReactNode } from 'react'
import type { MediaFile } from '@shared/domain/projects'
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
  return (
    <DossierGrid>
      <Panel
        label="Ableton sets"
        index="01"
        className={styles.span3}
        aside={String(project.sets.length)}
        focal
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
        index="02"
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
        index="03"
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
        index="04"
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
          index="05"
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
