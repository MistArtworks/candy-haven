import { useState, type ReactNode } from 'react'
import type { ProjectSummary } from '@shared/domain/projects'
import type { DeliverableKind, ReleaseSummary } from '@shared/domain/releases'
import {
  DELIVERABLE_HINT,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABEL
} from '@shared/domain/releases.constants'
import type { VolumeSummary } from '@shared/domain/volumes'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { formatIsoDate } from '@renderer/lib/format'
import { isPlayableAudio, usePlayback } from '@renderer/app/providers/playback'
import { PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import { TileGrid, type Tile } from '../tiles/TileGrid'
import styles from './ReleaseBoard.module.scss'

export interface ReleaseBoardProps {
  releases: readonly ReleaseSummary[]
  /** Projects that could be raised for release, for the picker. */
  projects: readonly ProjectSummary[]
  volumes: readonly VolumeSummary[]
  /** The release currently open, from the URL. */
  openId: string | null
  onOpen: (id: string | null) => void
  busy: boolean
  error: string | null
  onRaise: (subjectKind: 'project' | 'volume', subjectId: string) => void
  onSetDate: (id: string, date: string | null) => void
  onAttach: (id: string, kind: DeliverableKind, sourcePath: string | null) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
}

/**
 * RELEASES — what is going out, and the files that go with it.
 *
 * Tiles until one is opened, then a single record. Deliberately the smallest
 * surface in the department: a release in this build carries a title, a date
 * and three files, and nothing else. Distribution metadata is not modelled at
 * all yet — it is waiting on the scheduling system that replaces TRANSMISSIONS
 * — and a form full of disabled ISRC fields would promise something this build
 * cannot do.
 */
export function ReleaseBoard({
  releases,
  projects,
  volumes,
  openId,
  onOpen,
  busy,
  error,
  onRaise,
  onSetDate,
  onAttach,
  onRemove,
  onReveal
}: ReleaseBoardProps): ReactNode {
  const [raising, setRaising] = useState(false)
  const open = releases.find((release) => release.id === openId) ?? null

  if (open) {
    return (
      <ReleaseRecord
        release={open}
        busy={busy}
        error={error}
        onBack={() => onOpen(null)}
        onSetDate={onSetDate}
        onAttach={onAttach}
        onRemove={onRemove}
        onReveal={onReveal}
      />
    )
  }

  if (raising) {
    return (
      <RaisePicker
        projects={projects}
        volumes={volumes}
        releases={releases}
        busy={busy}
        error={error}
        onCancel={() => setRaising(false)}
        onRaise={(kind, id) => {
          setRaising(false)
          onRaise(kind, id)
        }}
      />
    )
  }

  const tiles: Tile[] = releases.map((release) => ({
    id: release.id,
    mark: 'release',
    name: release.title,
    detail: describe(release),
    title: release.path
  }))

  return (
    <div className={styles.board}>
      {releases.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing is going out yet.</p>
          <p className={styles.emptyHint}>
            Raising a release creates a folder for it and copies the finished files in. The project
            itself stays filed under its genre — nothing is moved off the shelf.
          </p>
        </div>
      ) : null}

      <TileGrid
        tiles={tiles}
        onOpen={(id) => onOpen(id)}
        adds={[{ label: 'Raise a release', mark: 'add', onClick: () => setRaising(true) }]}
      />
    </div>
  )
}

/** The tile's second line: date if there is one, otherwise what is still owed. */
function describe(release: ReleaseSummary): string {
  const parts = [
    release.releaseDate ? formatIsoDate(release.releaseDate) : 'No date',
    `${release.attached}/3 files`
  ]
  if (release.orphaned) parts.push('SUBJECT GONE')
  return parts.join(' · ')
}

// ------------------------------------------------------------------- record

function ReleaseRecord({
  release,
  busy,
  error,
  onBack,
  onSetDate,
  onAttach,
  onRemove,
  onReveal
}: {
  release: ReleaseSummary
  busy: boolean
  error: string | null
  onBack: () => void
  onSetDate: (id: string, date: string | null) => void
  onAttach: (id: string, kind: DeliverableKind, sourcePath: string | null) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
}): ReactNode {
  const [date, setDate] = useState(release.releaseDate ?? '')
  const playback = usePlayback()

  const choose = async (kind: DeliverableKind): Promise<void> => {
    const filters =
      kind === 'master'
        ? [{ name: 'Audio', extensions: ['wav', 'aif', 'aiff', 'flac', 'mp3'] }]
        : kind === 'cover'
          ? [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff'] }]
          : [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm'] }]

    const selected = await window.candy.shell.selectFile({
      title: `Select the ${DELIVERABLE_LABEL[kind].toLowerCase()}`,
      filters
    })
    if (selected) onAttach(release.id, kind, selected)
  }

  return (
    <div className={styles.record}>
      <header className={styles.recordHead}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← All releases
        </button>
        <h3 className={styles.recordTitle}>{release.title}</h3>
        <button
          type="button"
          className={styles.recordPath}
          title={`Open ${release.path}`}
          onClick={() => onReveal(release.path)}
        >
          {release.path}
        </button>
      </header>

      {release.orphaned ? (
        <p className={styles.warn} role="alert">
          The {release.subjectKind} this release was raised for is no longer in the register. The
          record and its folder are kept — a release that actually happened is still a fact.
        </p>
      ) : null}

      <FieldGrid columns={3}>
        <Field label="Subject" value={release.subjectName} />
        <Field label="Category" value={PROJECT_CATEGORY_LABEL[release.category]} />
        <Field label="Tracks" value={release.trackCount || '—'} mono />
      </FieldGrid>

      <div className={styles.dateRow}>
        <TextInput
          label="Release date"
          value={date}
          onChange={setDate}
          placeholder="2026-11-14"
          mono
          maxLength={10}
          hint="YYYY-MM-DD. Leave empty while the date is undecided."
        />
        <Button
          size="sm"
          busy={busy}
          onClick={() => onSetDate(release.id, date.trim() === '' ? null : date.trim())}
        >
          Save
        </Button>
      </div>

      <div className={styles.deliverables}>
        {DELIVERABLE_KINDS.map((kind) => {
          const deliverable = release[kind]
          return (
            <div key={kind} className={styles.deliverable}>
              <div className={styles.deliverableHead}>
                <span className={styles.deliverableLabel}>{DELIVERABLE_LABEL[kind]}</span>
                <span className={styles.deliverableHint}>{DELIVERABLE_HINT[kind]}</span>
              </div>

              {deliverable.copiedPath ? (
                <button
                  type="button"
                  className={styles.deliverableFile}
                  title={deliverable.copiedPath}
                  onClick={() => onReveal(deliverable.copiedPath as string)}
                >
                  {fileName(deliverable.copiedPath)}
                </button>
              ) : (
                <span className={styles.deliverableEmpty}>Not attached</span>
              )}

              <div className={styles.deliverableActions}>
                {/*
                  Offered only where the file is one the room can open, which
                  is what keeps a play button from appearing beside a cover
                  image. It hands the path to the console's shared transport,
                  so the master keeps playing while the operator carries on
                  working here — see app/providers/PlaybackProvider.tsx.
                */}
                {isPlayableAudio(deliverable.copiedPath) ? (
                  <Button
                    size="sm"
                    onClick={() => void playback.open(deliverable.copiedPath as string)}
                  >
                    Play
                  </Button>
                ) : null}
                <Button size="sm" busy={busy} onClick={() => void choose(kind)}>
                  {deliverable.copiedPath ? 'Replace' : 'Attach'}
                </Button>
                {deliverable.copiedPath ? (
                  <Button size="sm" onClick={() => onAttach(release.id, kind, null)}>
                    Detach
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <footer className={styles.recordFoot}>
        {/*
          Not marked danger and worded plainly, because it is not destructive:
          the folder and everything copied into it stay exactly where they are.
          Only the app stops tracking it.
        */}
        <span className={styles.footNote}>The release folder is left on disk.</span>
        <Button size="sm" onClick={() => onRemove(release.id)}>
          Drop this release
        </Button>
      </footer>
    </div>
  )
}

// ------------------------------------------------------------------- raising

function RaisePicker({
  projects,
  volumes,
  releases,
  busy,
  error,
  onCancel,
  onRaise
}: {
  projects: readonly ProjectSummary[]
  volumes: readonly VolumeSummary[]
  releases: readonly ReleaseSummary[]
  busy: boolean
  error: string | null
  onCancel: () => void
  onRaise: (kind: 'project' | 'volume', id: string) => void
}): ReactNode {
  const raised = new Set(releases.map((release) => release.subjectId))

  /*
   * Only standalone projects are offered.
   *
   * A track that belongs to a volume ships as part of that volume, not on its
   * own, so listing it here would let the operator raise nine releases for one
   * album without noticing.
   */
  const candidates = projects.filter(
    (project) => project.volumeId === null && !raised.has(project.id)
  )
  const albums = volumes.filter((volume) => !raised.has(volume.id))

  return (
    <div className={styles.record}>
      <header className={styles.recordHead}>
        <button type="button" className={styles.back} onClick={onCancel}>
          ← All releases
        </button>
        <h3 className={styles.recordTitle}>Raise a release</h3>
      </header>

      <div className={styles.pickerGroup}>
        <span className={styles.pickerLabel}>Volumes</span>
        {albums.length === 0 ? (
          <p className={styles.emptyHint}>Every volume has already been raised.</p>
        ) : (
          <div className={styles.pickerList}>
            {albums.map((volume) => (
              <button
                key={volume.id}
                type="button"
                className={styles.pickerItem}
                disabled={busy}
                onClick={() => onRaise('volume', volume.id)}
              >
                <span>{volume.title}</span>
                <span className={styles.pickerMeta}>
                  {volume.trackCount} track{volume.trackCount === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.pickerGroup}>
        <span className={styles.pickerLabel}>Standalone projects</span>
        {candidates.length === 0 ? (
          <p className={styles.emptyHint}>
            Nothing standalone left to raise. Tracks that belong to a volume ship with it.
          </p>
        ) : (
          <div className={styles.pickerList}>
            {candidates.map((project) => (
              <button
                key={project.id}
                type="button"
                className={styles.pickerItem}
                disabled={busy}
                onClick={() => onRaise('project', project.id)}
              >
                <span>{project.name}</span>
                <span className={styles.pickerMeta}>
                  {project.hasFinalMaster ? 'MASTERED' : 'No final master'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
